import { reactive, computed } from 'vue'
import { LOG_LEVELS, FALLBACK_LEVEL_ORDER } from '../constants/logLevels'
import {
  resolveLogFileRule,
  matchLevelFiles,
  formatActiveName,
} from '../constants/logFileRules'
import { extractLogNamesFromDirHtml } from '../utils/dirListing'
import {
  moduleKey,
  shouldSoftRefresh,
  loadEntry,
  saveEntry,
  removeEntry,
  mergeIndexEntries,
  stampRefresh,
  emitIndexUpdate,
  onIndexUpdate,
} from '../utils/logFileIndex'
import { useSettings } from './useSettings'

/**
 * useLogs - 日志数据编排（模块级单例）
 *
 * 职责：配置、URL、拉正文、目录探测编排。
 * 文件名规则 → constants/logFileRules.js
 * 索引持久化/合并/按日刷新 → utils/logFileIndex.js
 */

const state = reactive({
  config: null,
  loading: false,
  error: null,
  /** @type {Record<string, object|null>} */
  levelsCache: {},
})

/** host|app → 进行中的软刷新 */
const softInflight = new Map()

const envs = computed(() => state.config?.environments ?? {})
const envKeys = computed(() => Object.keys(envs.value))

async function loadConfig() {
  if (state.config) return state.config
  try {
    const res = await fetch('/config/logs.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    state.config = await res.json()
    return state.config
  } catch (e) {
    state.error = '加载配置失败: ' + e.message
    console.error('Failed to load config:', e)
    state.config = { baseUrl: '', environments: {} }
    return state.config
  }
}

function getServices(env) {
  return state.config?.environments?.[env]?.services ?? []
}

function getMro(env) {
  return state.config?.environments?.[env]?.mro ?? []
}

function getLogFileRule(host, app, envKey) {
  const cfg = state.config || {}
  const env = envKey
    ? cfg.environments?.[envKey]
    : Object.values(cfg.environments || {}).find((e) =>
        (e.services || []).some((s) => s.host === host && s.app === app),
      )
  const svc = (env?.services || []).find((s) => s.host === host && s.app === app)
  return resolveLogFileRule(svc?.logFile ?? env?.logFile ?? cfg.logFile)
}

function guessActiveFileName(host, app, level, envKey) {
  return formatActiveName(app, level, getLogFileRule(host, app, envKey))
}

function buildLogUrl(host, app, level, filename) {
  const base = String(state.config?.baseUrl || '').replace(/\/$/, '')
  const key = moduleKey(host, app)
  const name =
    filename ||
    state.levelsCache[key]?.files?.[level] ||
    guessActiveFileName(host, app, level)
  if (!base) return `/${host}/${app}/${name}`
  return `${base}/${host}/${app}/${name}`
}

function buildDirUrl(host, app) {
  const base = String(state.config?.baseUrl || '').replace(/\/$/, '')
  if (!base) return `/${host}/${app}/`
  return `${base}/${host}/${app}/`
}

function hydrateFromStore(key, rule) {
  const mem = state.levelsCache[key]
  if (mem && (!rule?.id || !mem.ruleId || mem.ruleId === rule.id)) return mem
  const stored = loadEntry(key, rule?.id)
  if (stored) {
    state.levelsCache[key] = stored
    return stored
  }
  return null
}

function peekLogFiles(host, app, level, envKey) {
  const rule = getLogFileRule(host, app, envKey)
  const entry = hydrateFromStore(moduleKey(host, app), rule)
  return entry?.archives?.[level] || []
}

function getIndexMeta(host, app, envKey) {
  const rule = getLogFileRule(host, app, envKey)
  const entry = hydrateFromStore(moduleKey(host, app), rule)
  if (!entry) return null
  return {
    updatedAt: entry.updatedAt || 0,
    refreshedDay: entry.refreshedDay || '',
    refreshedToday: !shouldSoftRefresh(entry),
  }
}

/** 已探测但无业务级别日志：保留空索引，避免 getLevels 回退配置全量导致级别来回跳 */
function emptyIndexEntry(rule, fileCount = 0) {
  return stampRefresh({
    levels: [],
    files: {},
    archives: {},
    ruleId: rule?.id,
    fileCount: fileCount || 0,
    empty: true,
  })
}

function buildEntryFromNames(allNames, host, app, envKey) {
  const rule = getLogFileRule(host, app, envKey)
  const levels = []
  const files = {}
  const archives = {}
  for (const lv of LOG_LEVELS) {
    const list = matchLevelFiles(allNames, app, lv, rule)
    if (!list.length) continue
    levels.push(lv)
    files[lv] = list[0].name
    archives[lv] = list
  }
  if (!levels.length) return null
  return stampRefresh({
    levels,
    files,
    archives,
    ruleId: rule.id,
    fileCount: allNames.length,
  })
}

async function fetchDirAndBuild(host, app, envKey, { signal } = {}) {
  const dirUrl = buildDirUrl(host, app)
  const res = await fetch('/api/proxy?' + new URLSearchParams({ url: dirUrl }).toString(), {
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  return buildEntryFromNames(extractLogNamesFromDirHtml(html), host, app, envKey)
}

function scheduleSoftRefresh(host, app, envKey, key) {
  if (softInflight.has(key)) return softInflight.get(key)
  const p = (async () => {
    try {
      const fresh = await fetchDirAndBuild(host, app, envKey)
      if (!fresh) return null
      const prev = state.levelsCache[key]
      const { entry, added } = mergeIndexEntries(prev, fresh)
      state.levelsCache[key] = entry
      saveEntry(key, entry)
      emitIndexUpdate(key, entry, { soft: true, added })
      return { entry, added }
    } catch (e) {
      console.warn(`softRefresh failed for ${key}:`, e.message)
      return null
    } finally {
      softInflight.delete(key)
    }
  })()
  softInflight.set(key, p)
  return p
}

/**
 * @param {{ force?: boolean, envKey?: string, soft?: boolean }} opts
 *   soft：有索引则立刻返回；模块今日未刷新则后台增量合并
 *   force：全量覆盖并记今日已刷新（网络失败时保留旧索引，避免 UI 回退到配置全量级别）
 */
async function discoverLevels(host, app, { force = false, envKey, soft = true } = {}) {
  const key = moduleKey(host, app)
  const rule = getLogFileRule(host, app, envKey)

  if (!force) {
    const cached = hydrateFromStore(key, rule)
    if (cached) {
      if (soft && shouldSoftRefresh(cached)) {
        scheduleSoftRefresh(host, app, envKey, key)
      }
      return cached
    }
  }

  // force 不先删缓存：等新结果就绪再替换，探测过程中级别按钮不会闪回配置默认值
  const backup = state.levelsCache[key] || loadEntry(key, null)

  try {
    const entry = await fetchDirAndBuild(host, app, envKey)
    if (entry) {
      state.levelsCache[key] = entry
      saveEntry(key, entry)
      emitIndexUpdate(key, entry, { soft: false, added: 0, force: !!force })
      return entry
    }
    // 目录拉取成功但无匹配文件：force 写入空索引（勿删），防止 UI 回退配置级别来回切换
    if (force) {
      const empty = emptyIndexEntry(rule, 0)
      state.levelsCache[key] = empty
      saveEntry(key, empty)
      emitIndexUpdate(key, empty, { soft: false, added: 0, force: true })
      return empty
    }
    if (backup) {
      state.levelsCache[key] = backup
      return backup
    }
    state.levelsCache[key] = null
    return null
  } catch (e) {
    console.warn(`discoverLevels failed for ${key}:`, e.message)
    // 网络失败：始终尽量保留旧索引（含 force），避免切 tab 后级别「变回去」
    if (backup) {
      state.levelsCache[key] = backup
      return backup
    }
    return null
  }
}

async function listLogFiles(host, app, level, { force = false, envKey, soft = true } = {}) {
  const disc = await discoverLevels(host, app, { force, envKey, soft })
  return disc?.archives?.[level] || []
}

function getDefaultFile(host, app, level) {
  return state.levelsCache[moduleKey(host, app)]?.files?.[level] || null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function discoverEnvLevels(env, { force = true, gapMs = 400, onProgress } = {}) {
  const svcs = getServices(env)
  let ok = 0
  let fail = 0
  const failed = []
  for (let i = 0; i < svcs.length; i += 1) {
    const svc = svcs[i]
    const r = await discoverLevels(svc.host, svc.app, { force, envKey: env, soft: false })
    if (r?.levels?.length) {
      ok += 1
    } else {
      fail += 1
      failed.push(svc.module || svc.app)
    }
    try {
      onProgress?.({ done: i + 1, total: svcs.length, ok, fail })
    } catch {}
    // 串行间隔，降低被 LogIndex 风控误伤概率
    if (gapMs > 0 && i < svcs.length - 1) await sleep(gapMs)
  }
  return { ok, fail, total: svcs.length, failed }
}

/**
 * 展示用级别列表：优先已探测索引（含 localStorage hydrate），未探测才回退配置。
 * 已探测但 levels 为空时返回 []，不再静默退回配置全量（避免「切 tab 又变回去」）。
 */
function getLevels(host, app, configLevels, envKey) {
  const key = moduleKey(host, app)
  const rule = getLogFileRule(host, app, envKey)
  const entry = hydrateFromStore(key, rule)
  if (entry && Array.isArray(entry.levels)) return entry.levels
  return configLevels || LOG_LEVELS
}

function clearLevelsCache(host, app) {
  const key = moduleKey(host, app)
  delete state.levelsCache[key]
  removeEntry(key)
}

async function resolveFallbackLevel(host, app, missingLevel, configLevels, envKey) {
  // 只在「真实探测到的级别」间回退；空目录不得回退到配置全量，否则 INFO↔DEBUG 死循环
  const disc = await discoverLevels(host, app, { force: true, envKey, soft: false })
  const available = disc?.levels?.length ? disc.levels : null
  if (!available) return null

  for (const lv of FALLBACK_LEVEL_ORDER) {
    if (lv !== missingLevel && available.includes(lv)) return lv
  }
  return null
}

let fetchSeq = 0
let fetchAbort = null

/** 短期正文缓存，避免切视图后重复 Range 下载 */
const LOG_CACHE_TTL_MS = 60_000
const logBodyCache = new Map()

function logCacheKey(host, app, level, filename, maxLines, tailMB) {
  return `${host}|${app}|${level}|${filename || ''}|${maxLines}|${tailMB}`
}

function isAbortError(e) {
  return e?.name === 'AbortError' || e?.code === 20
}

/** 从文本末尾取最多 maxLines 行，避免对大尾包做全量 split */
function takeLastLines(text, maxLines) {
  const n = Math.max(1, Number(maxLines) || 10000)
  if (!text) return []
  // 小文本直接 split；大文本从末尾数换行，少分配
  if (text.length < Math.min(n * 120, 2 * 1024 * 1024)) {
    const all = text.split('\n')
    return all.length > n ? all.slice(-n) : all
  }
  let i = text.length
  let found = 0
  while (i > 0 && found < n) {
    const prev = text.lastIndexOf('\n', i - 1)
    if (prev < 0) {
      i = 0
      break
    }
    i = prev
    found += 1
  }
  const start = i === 0 ? 0 : i + 1
  const lines = text.slice(start).split('\n')
  // 双保险：绝不超过 maxLines
  return lines.length > n ? lines.slice(-n) : lines
}

/**
 * @param {string} host
 * @param {string} app
 * @param {string} level
 * @param {string} [filename]
 * @param {{ force?: boolean }} [opts]
 */
async function fetchLog(host, app, level, filename, { force = false } = {}) {
  const seq = ++fetchSeq
  const { maxLines, tailMB, tailBytes } = useSettings().getFetchLimits()
  const url = buildLogUrl(host, app, level, filename)
  const cacheKey = logCacheKey(host, app, level, filename || url.split('/').pop(), maxLines, tailMB)

  if (!force) {
    const hit = logBodyCache.get(cacheKey)
    if (hit && Date.now() - hit.at < LOG_CACHE_TTL_MS) {
      return { ...hit.data, fromCache: true }
    }
  }

  if (fetchAbort) {
    try { fetchAbort.abort() } catch {}
  }
  fetchAbort = new AbortController()
  const { signal } = fetchAbort

  state.loading = true
  state.error = null
  try {
    const params = new URLSearchParams({ url, tail: String(tailBytes) })
    const res = await fetch('/api/proxy?' + params.toString(), { signal })
    if (!res.ok) {
      if (res.status === 404) {
        const fname = url.split('/').pop()
        throw new Error(`${level} 级别日志文件不存在（服务器无 ${fname}）`)
      }
      throw new Error(`HTTP ${res.status}`)
    }
    let text = await res.text()
    const downloadedBytes = text.length
    const truncated = res.headers.get('X-Truncated') === 'true'
    const totalSize = parseInt(res.headers.get('X-Total-Size') || '0', 10)

    if (truncated) {
      const firstNl = text.indexOf('\n')
      if (firstNl > 0) text = text.slice(firstNl + 1)
    }

    const lines = takeLastLines(text, maxLines)
    // 尽早释放大字符串引用（takeLastLines 已切片）
    text = ''
    const lineCapped = downloadedBytes > 0 && lines.length >= maxLines

    const data = {
      lines,
      size: totalSize || downloadedBytes,
      downloadedBytes,
      truncated: truncated || lineCapped,
      totalLines: lines.length,
      displayLines: lines.length,
      filename: url.split('/').pop(),
      tailBytes,
      tailMB,
      maxLines,
      lineCapped,
      fromCache: false,
    }
    logBodyCache.set(cacheKey, { data, at: Date.now() })
    // 控制缓存条目数
    if (logBodyCache.size > 12) {
      const oldest = logBodyCache.keys().next().value
      logBodyCache.delete(oldest)
    }
    return data
  } catch (e) {
    if (isAbortError(e)) {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    if (seq === fetchSeq) state.error = e.message
    throw e
  } finally {
    if (seq === fetchSeq) state.loading = false
  }
}

function clearLogBodyCache() {
  logBodyCache.clear()
}

const instance = Object.assign(state, {
  envs,
  envKeys,
  loadConfig,
  getServices,
  getMro,
  getLogFileRule,
  guessActiveFileName,
  peekLogFiles,
  buildLogUrl,
  buildDirUrl,
  fetchLog,
  clearLogBodyCache,
  discoverLevels,
  discoverEnvLevels,
  listLogFiles,
  onLogIndexUpdate: onIndexUpdate,
  getDefaultFile,
  getLevels,
  getIndexMeta,
  clearLevelsCache,
  resolveFallbackLevel,
  isAbortError,
})

export function useLogs() {
  return instance
}
