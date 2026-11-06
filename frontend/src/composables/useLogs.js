import { reactive, computed } from 'vue'
import { LOG_LEVELS, FALLBACK_LEVEL_ORDER } from '../constants/logLevels'
import {
  resolveLogFileRule,
  matchLevelFiles,
  formatActiveName,
} from '../constants/logFileRules'
import { extractLogFilesFromDirHtml } from '../utils/dirListing'
import { downloadLogFile as streamDownload } from '../utils/logDownload'
import { buildDownloadName } from '../utils/downloadName'
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
  onStoreInvalidate,
} from '../utils/logFileIndex'
import {
  requestRaw,
  releaseResponse,
  requestText,
  requestJson,
  throwHttpError,
  isAbortError as isAbortErrorImpl,
} from '../utils/apiClient'
import {
  CONFIG_TIMEOUT_MS,
  DIR_TIMEOUT_MS,
  LOG_TIMEOUT_MS,
  LOG_CACHE_TTL_MS,
  LOG_CACHE_MAX_ENTRIES,
  PROBE_CONCURRENCY,
  PROBE_GAP_MS,
  PROBE_JITTER_MS,
} from '../constants/timing'
import { useSettings } from './useSettings'

/**
 * useLogs - 日志数据编排（模块级单例）
 *
 * 职责：配置、URL、拉正文、目录探测编排。
 * 文件名规则 → constants/logFileRules.js
 * 索引持久化/合并/按日刷新 → utils/logFileIndex.js
 * 网络 I/O → utils/apiClient.js
 */

const state = reactive({
  config: null,
  loading: false,
  error: null,
  /** @type {Record<string, object|null>} */
  levelsCache: {},
  /** 跨标签索引变更时递增，驱动 getLevels / getIndexMeta 的 computed 重算 */
  indexVersion: 0,
})

onStoreInvalidate((keys = []) => {
  state.indexVersion += 1
  const changed = keys.length ? keys : Object.keys(state.levelsCache)
  for (const key of changed) delete state.levelsCache[key]
})

/** 进行中的网络/编排任务：key → { promise, controller, subscribers } */
const inflight = new Map()
let activeLogRequests = 0
let configTask = null

const envs = computed(() => state.config?.environments ?? {})
const envKeys = computed(() => Object.keys(envs.value))

function abortSignalError(reason) {
  if (reason instanceof Error) return reason
  const err = new Error('aborted')
  err.name = 'AbortError'
  return err
}

/** 同键共享一份进行中任务；完成后即时从表中移除 */
function trackInflight(key, makeTask) {
  const hit = inflight.get(key)
  if (hit) return hit
  const controller = new AbortController()
  const task = { key, controller, subscribers: 0, promise: null }
  task.promise = (async () => {
    try {
      return await makeTask(controller.signal)
    } finally {
      if (inflight.get(key) === task) inflight.delete(key)
    }
  })()
  inflight.set(key, task)
  return task
}

/**
 * 每个调用方用自己的 signal 独立脱离（race），只有全部订阅者脱离才中止底层请求。
 * 这样快速切换不会取消仍被其它视图等待的同键请求。
 */
function attachInflight(task, signal) {
  task.subscribers += 1
  let released = false
  let onAbort
  let cancelled = null
  if (signal) {
    cancelled = new Promise((_, reject) => {
      if (signal.aborted) {
        reject(abortSignalError(signal.reason))
        return
      }
      onAbort = () => reject(abortSignalError(signal.reason))
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }
  const release = () => {
    if (released) return
    released = true
    task.subscribers -= 1
    if (onAbort) signal.removeEventListener('abort', onAbort)
    if (task.subscribers <= 0 && inflight.get(task.key) === task) {
      task.controller.abort()
    }
  }
  return { promise: cancelled ? Promise.race([task.promise, cancelled]) : task.promise, release }
}

async function loadConfig() {
  if (state.config) return state.config
  if (configTask) return configTask
  configTask = (async () => {
    try {
      state.config = await requestJson('/config/logs.json', { timeoutMs: CONFIG_TIMEOUT_MS })
      return state.config
    } catch (e) {
      state.error = '加载配置失败: ' + e.message
      console.error('Failed to load config:', e)
      state.config = { baseUrl: '', environments: {} }
      return state.config
    } finally {
      configTask = null
    }
  })()
  return configTask
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

/** 定位服务项（用于 baseUrl / urlStyle 等覆盖） */
function findService(host, app, envKey) {
  const cfg = state.config || {}
  const envs = cfg.environments || {}
  if (envKey && envs[envKey]) {
    return (envs[envKey].services || []).find((s) => s.host === host && s.app === app) || null
  }
  for (const env of Object.values(envs)) {
    const hit = (env.services || []).find((s) => s.host === host && s.app === app)
    if (hit) return hit
  }
  return null
}

/**
 * 解析服务最终 baseUrl。
 * urlStyle: "host-app"（默认）→ {base}/{host}/{app}/
 *           "app"            → {base}/{app}/  （如独立 :5900 容器日志根）
 */
function resolveServiceUrlParts(host, app, envKey) {
  const svc = findService(host, app, envKey)
  const base = String(svc?.baseUrl || state.config?.baseUrl || '').replace(/\/$/, '')
  const style = svc?.urlStyle === 'app' ? 'app' : 'host-app'
  const prefix =
    style === 'app'
      ? (base ? `${base}/${app}` : `/${app}`)
      : (base ? `${base}/${host}/${app}` : `/${host}/${app}`)
  return { base, style, prefix, svc }
}

/** envKey 必填：漏传会静默走 findService 跨环境回退，取错 baseUrl */
function requireEnvKey(envKey, from) {
  if (!envKey) throw new Error(`${from} 必须显式传 envKey（当前环境）`)
}

function buildLogUrl(host, app, level, filename, envKey) {
  requireEnvKey(envKey, 'buildLogUrl')
  const { prefix } = resolveServiceUrlParts(host, app, envKey)
  const key = moduleKey(host, app)
  const name =
    filename ||
    state.levelsCache[key]?.files?.[level] ||
    guessActiveFileName(host, app, level, envKey)
  return `${prefix}/${name}`
}

function buildDirUrl(host, app, envKey) {
  requireEnvKey(envKey, 'buildDirUrl')
  const { prefix } = resolveServiceUrlParts(host, app, envKey)
  return `${prefix}/`
}

/**
 * 整文件下载走独立端点：超时、附件头与错误处理都和 tail 探测不同。
 * envKey 显式传入，避免 findService 跨环境匹配同名 host/app 选错 baseUrl。
 */
function buildDownloadUrl(host, app, level, filename, envKey, displayName) {
  const url = buildLogUrl(host, app, level, filename, envKey)
  const params = new URLSearchParams({ url })
  const name = displayName || url.split('/').pop()
  if (name) params.set('file', name)
  return `/api/download?${params.toString()}`
}

/** 下载名统一为「中文环境标签_项目展示名_级别.log」；后端附件头与前端保存名保持一致 */
function downloadLogFile(host, app, level, filename, opts = {}) {
  const { envKey, ...downloadOpts } = opts
  const svc = findService(host, app, envKey)
  const displayName = buildDownloadName({
    env: state.config?.environments?.[envKey]?.label || envKey,
    module: svc?.module || app,
    level,
  })
  return streamDownload(buildDownloadUrl(host, app, level, filename, envKey, displayName), {
    ...downloadOpts,
    filename: displayName,
  })
}

function hydrateFromStore(key, rule) {
  void state.indexVersion // 让上层 computed 订阅跨标签索引失效
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

function buildEntryFromFiles(dirFiles, host, app, envKey) {
  const rule = getLogFileRule(host, app, envKey)
  const sizeByName = new Map(dirFiles.map((f) => [f.name, f.size]))
  const allNames = dirFiles.map((f) => f.name)
  const levels = []
  const files = {}
  const archives = {}
  for (const lv of LOG_LEVELS) {
    const list = matchLevelFiles(allNames, app, lv, rule).map((f) => ({
      ...f,
      size: sizeByName.get(f.name) || '',
    }))
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

/** 目录页给出的活跃文件大小；未探测或目录未给出时为空串 */
function getActiveFileSize(host, app, level, envKey) {
  const rule = getLogFileRule(host, app, envKey)
  const entry = hydrateFromStore(moduleKey(host, app), rule)
  const list = entry?.archives?.[level] || []
  const active = list.find((f) => f.active) || list.find((f) => f.name === entry?.files?.[level])
  return active?.size || ''
}

async function fetchDirAndBuild(host, app, envKey, { signal } = {}) {
  const dirUrl = buildDirUrl(host, app, envKey)
  const path = '/api/proxy?' + new URLSearchParams({ url: dirUrl }).toString()
  const key = `dir:${envKey}|${moduleKey(host, app)}`
  const task = trackInflight(key, async (taskSignal) => {
    const html = await requestText(path, { signal: taskSignal, timeoutMs: DIR_TIMEOUT_MS })
    return buildEntryFromFiles(extractLogFilesFromDirHtml(html), host, app, envKey)
  })
  const { promise, release } = attachInflight(task, signal)
  try {
    return await promise
  } finally {
    release()
  }
}

function scheduleSoftRefresh(host, app, envKey, key) {
  const task = trackInflight(`soft:${envKey}|${key}`, async (taskSignal) => {
    try {
      const fresh = await fetchDirAndBuild(host, app, envKey, { signal: taskSignal })
      if (!fresh) return null
      const prev = state.levelsCache[key] || loadEntry(key, null)
      const { entry, added } = mergeIndexEntries(prev, fresh)
      state.levelsCache[key] = entry
      saveEntry(key, entry)
      emitIndexUpdate(key, entry, { soft: true, added })
      return { entry, added }
    } catch (e) {
      if (!isAbortErrorImpl(e)) console.warn(`softRefresh failed for ${key}:`, e.message)
      return null
    }
  })
  const { promise, release } = attachInflight(task)
  return promise.finally(release)
}

/**
 * @param {{ force?: boolean, envKey?: string, soft?: boolean, signal?: AbortSignal }} opts
 *   soft：有索引则立刻返回；模块今日未刷新则后台增量合并
 *   force：全量覆盖并记今日已刷新（网络失败时保留旧索引，避免 UI 回退到配置全量级别）
 */
async function discoverLevels(host, app, { force = false, envKey, soft = true, signal } = {}) {
  const key = moduleKey(host, app)
  const rule = getLogFileRule(host, app, envKey)

  if (!force) {
    const cached = hydrateFromStore(key, rule)
    if (cached) {
      if (soft && shouldSoftRefresh(cached)) scheduleSoftRefresh(host, app, envKey, key)
      return cached
    }
  }

  // 同键共享一份编排结果；底层目录请求还会再按 (envKey, host, app) 去重
  const task = trackInflight(`discover:${envKey}|${key}|${force ? 'force' : 'first'}`, async (taskSignal) => {
    // force 不先删缓存：等新结果就绪再替换，探测过程中级别按钮不会闪回配置默认值
    const backup = state.levelsCache[key] || loadEntry(key, null)
    try {
      const entry = await fetchDirAndBuild(host, app, envKey, { signal: taskSignal })
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
      if (!isAbortErrorImpl(e)) console.warn(`discoverLevels failed for ${key}:`, e.message)
      // 网络失败：始终尽量保留旧索引（含 force），避免切 tab 后级别「变回去」
      if (backup) {
        state.levelsCache[key] = backup
        return backup
      }
      return null
    }
  })
  const { promise, release } = attachInflight(task, signal)
  try {
    return await promise
  } finally {
    release()
  }
}

async function listLogFiles(host, app, level, { force = false, envKey, soft = true, signal } = {}) {
  const disc = await discoverLevels(host, app, { force, envKey, soft, signal })
  return disc?.archives?.[level] || []
}

function getDefaultFile(host, app, level) {
  return state.levelsCache[moduleKey(host, app)]?.files?.[level] || null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 有限并发 + 批间抖动；保留 gapMs 与 onProgress(done/total/ok/fail) 签名 */
async function discoverEnvLevels(env, {
  force = true,
  gapMs = PROBE_GAP_MS,
  concurrency = PROBE_CONCURRENCY,
  onProgress,
} = {}) {
  const svcs = getServices(env)
  let ok = 0
  let fail = 0
  let done = 0
  let cursor = 0
  const failed = new Array(svcs.length).fill(null)
  const limit = Math.max(1, Math.min(concurrency, svcs.length || 1))

  const worker = async () => {
    for (;;) {
      const i = cursor
      cursor += 1
      if (i >= svcs.length) return
      const svc = svcs[i]
      if (i >= limit && gapMs > 0) await sleep(gapMs + Math.random() * PROBE_JITTER_MS)
      let r = null
      try {
        r = await discoverLevels(svc.host, svc.app, { force, envKey: env, soft: false })
      } catch {
        /* 单次失败计入 fail，不中断整批探测 */
      }
      if (r?.levels?.length) ok += 1
      else {
        fail += 1
        failed[i] = svc.module || svc.app
      }
      done += 1
      try {
        onProgress?.({ done, total: svcs.length, ok, fail })
      } catch {}
    }
  }

  await Promise.all(Array.from({ length: limit }, worker))
  return { ok, fail, total: svcs.length, failed: failed.filter(Boolean) }
}

/**
 * 展示用级别列表：优先已探测索引（含 localStorage hydrate），未探测才回退配置。
 * 已探测但 levels 为空时返回 []，不再静默退回配置全量（避免「切 tab 又变回去」）。
 */
function getLevels(host, app, configLevels, envKey) {
  void state.indexVersion
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

/** 短期正文缓存；meta 预留 ETag / Last-Modified 供后续条件请求复用 */
const logBodyCache = new Map()

function logCacheKey(host, app, level, filename, maxLines, tailMB, envKey) {
  return `${envKey}|${host}|${app}|${level}|${filename || ''}|${maxLines}|${tailMB}`
}

function readLogCache(cacheKey) {
  const hit = logBodyCache.get(cacheKey)
  if (!hit) return null
  if (Date.now() - hit.at >= LOG_CACHE_TTL_MS) {
    logBodyCache.delete(cacheKey)
    return null
  }
  logBodyCache.delete(cacheKey) // LRU：命中后移到队尾
  logBodyCache.set(cacheKey, hit)
  return hit
}

function writeLogCache(cacheKey, data, meta = null) {
  logBodyCache.delete(cacheKey)
  logBodyCache.set(cacheKey, { data, at: Date.now(), meta })
  while (logBodyCache.size > LOG_CACHE_MAX_ENTRIES) {
    logBodyCache.delete(logBodyCache.keys().next().value)
  }
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
 * @param {{ force?: boolean, envKey?: string, signal?: AbortSignal }} [opts]
 */
async function fetchLog(host, app, level, filename, { force = false, envKey, signal } = {}) {
  const { maxLines, tailMB, tailBytes } = useSettings().getFetchLimits()
  const url = buildLogUrl(host, app, level, filename, envKey)
  const name = url.split('/').pop() || ''
  const cacheKey = logCacheKey(host, app, level, filename || name, maxLines, tailMB, envKey)

  if (!force) {
    const hit = readLogCache(cacheKey)
    if (hit) return { ...hit.data, fromCache: true }
  }
  if (signal?.aborted) {
    const err = new Error('aborted')
    err.name = 'AbortError'
    throw err
  }

  activeLogRequests += 1
  state.loading = true
  state.error = null
  try {
    const task = trackInflight(`log:${cacheKey}`, async (taskSignal) => {
      const params = new URLSearchParams({ url, tail: String(tailBytes) })
      const res = await requestRaw('/api/proxy?' + params.toString(), {
        signal: taskSignal,
        timeoutMs: LOG_TIMEOUT_MS,
      })
      try {
        if (!res.ok) {
          // 404 文案被 LogViewer 的级别回退逻辑匹配，勿改
          if (res.status === 404) {
            throw new Error(`${level} 级别日志文件不存在（服务器无 ${name}）`)
          }
          await throwHttpError(res)
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
          filename: name,
          tailBytes,
          tailMB,
          maxLines,
          lineCapped,
          fromCache: false,
        }
        writeLogCache(cacheKey, data, {
          etag: res.headers.get('ETag') || '',
          lastModified: res.headers.get('Last-Modified') || '',
        })
        return data
      } finally {
        releaseResponse(res)
      }
    })
    const { promise, release } = attachInflight(task, signal)
    try {
      return await promise
    } finally {
      release()
    }
  } catch (e) {
    if (isAbortErrorImpl(e)) {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    state.error = e.message
    throw e
  } finally {
    activeLogRequests -= 1
    state.loading = activeLogRequests > 0
  }
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
  getActiveFileSize,
  buildLogUrl,
  buildDirUrl,
  buildDownloadUrl,
  fetchLog,
  downloadLogFile,
  discoverLevels,
  discoverEnvLevels,
  listLogFiles,
  onLogIndexUpdate: onIndexUpdate,
  getDefaultFile,
  getLevels,
  getIndexMeta,
  clearLevelsCache,
  resolveFallbackLevel,
  isAbortError: isAbortErrorImpl,
})

export function useLogs() {
  return instance
}
