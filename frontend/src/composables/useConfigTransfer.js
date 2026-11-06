/**
 * useConfigTransfer —— 配置导入 / 导出编排（模块单例）
 *
 * 段定义 → utils/configBundle.js（唯一扩展点）
 * 网络 → utils/apiClient.js；文件落盘 → utils/logDownload.js
 * 后端服务配置读写需统计白名单 IP；不可用时降级为仅浏览器侧配置，不阻断导出。
 */

import { requestJson } from '../utils/apiClient'
import {
  buildBundle, bundleFileName, SECTION_DEFS, BACKEND_SECTIONS,
} from '../utils/configBundle'
import { saveChunksAsFile } from '../utils/logDownload'
import { WORDWRAP_FLAG_KEY } from '../constants/storageKeys.js'
import { APP_VERSION } from '../constants/version'
import { useSettings } from './useSettings.js'
import { useNavigation } from './useNavigation.js'
import { useLogSearchTools } from './useLogSearchTools.js'
import { useLogViewFilters } from './useLogViewFilters.js'

const BACKEND_TIMEOUT_MS = 15_000

let instance = null

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** 读本地段：按 descriptor.storage.kind 分派，新增普通 json 段无需改这里 */
function readLocalSection(def) {
  const st = def.storage
  if (st.kind === 'settings') {
    const cfg = useSettings().cfg
    return JSON.parse(JSON.stringify({
      theme: cfg.theme,
      colors: cfg.colors,
      fonts: cfg.fonts,
      sizes: cfg.sizes,
      behavior: cfg.behavior,
    }))
  }
  if (st.kind === 'flags') {
    return Object.fromEntries(
      Object.entries(st.fields).map(([field, key]) => [field, localStorage.getItem(key) || '']),
    )
  }
  if (st.kind === 'json') return readJson(st.key, def.shape === 'array' ? [] : null)
  return null
}

/** 缺字段由默认值补齐，保证 commit 后是完整 cfg */
function withDefaults(snap, defaults) {
  return {
    theme: snap?.theme ?? defaults.theme,
    colors: { ...defaults.colors, ...(snap?.colors || {}) },
    fonts: { ...defaults.fonts, ...(snap?.fonts || {}) },
    sizes: { ...defaults.sizes, ...(snap?.sizes || {}) },
    behavior: { ...defaults.behavior, ...(snap?.behavior || {}) },
  }
}

/** 写本地段：settings 走 commit（内部已 save），其余按声明落 localStorage */
function writeLocalSection(def, value) {
  const st = def.storage
  if (st.kind === 'settings') {
    const api = useSettings()
    api.commit(withDefaults(value, api.DEFAULTS))
    // 旧迁移标志会在 load() 里强制改写 wordWrap，导入现代配置后标记已完成
    writeRaw(WORDWRAP_FLAG_KEY, '1')
    return true
  }
  if (st.kind === 'json') return writeRaw(st.key, JSON.stringify(value))
  if (st.kind === 'flags') {
    let ok = true
    for (const [field, key] of Object.entries(st.fields)) {
      if (value?.[field] == null) continue
      ok = writeRaw(key, String(value[field])) && ok
    }
    return ok
  }
  return false
}

async function fetchBackendSections() {
  const data = await requestJson('/api/config/export', {
    timeoutMs: BACKEND_TIMEOUT_MS,
    cache: 'no-store',
  })
  return { logs: data?.logs ?? null, access: data?.access ?? null }
}

function backendReason(e) {
  if (e?.status === 403) return '当前 IP 不在统计白名单，服务配置不可读写'
  return `后端配置接口不可用：${e?.message || String(e)}`
}

/** 设置页展示白名单是否可用 */
async function probeBackend() {
  try {
    await fetchBackendSections()
    return { ok: true, reason: '' }
  } catch (e) {
    return { ok: false, reason: backendReason(e) }
  }
}

/** @returns {Promise<{filename:string, sections:string[], note:string}>} */
async function exportConfig(selected = [], { now = new Date() } = {}) {
  const want = new Set(selected)
  const sections = {}
  for (const def of SECTION_DEFS) {
    if (def.scope === 'local' && want.has(def.key)) {
      const value = readLocalSection(def)
      if (value != null) sections[def.key] = value
    }
  }

  let note = ''
  if (selected.some((key) => BACKEND_SECTIONS.includes(key))) {
    try {
      const remote = await fetchBackendSections()
      for (const def of SECTION_DEFS) {
        if (def.scope !== 'server' || !want.has(def.key)) continue
        const value = remote[def.serverKey]
        if (value != null) sections[def.key] = value
        else note = '服务端缺少对应配置文件，该段未导出'
      }
    } catch (e) {
      note = backendReason(e)
    }
  }

  const bundle = buildBundle(sections, {
    version: APP_VERSION,
    exportedAt: now.toISOString(),
  })
  const filename = bundleFileName(now)
  const bytes = new TextEncoder().encode(JSON.stringify(bundle, null, 2))
  const release = saveChunksAsFile([bytes], filename)
  release()
  return { filename, sections: Object.keys(bundle.sections), note }
}

/**
 * 逐项写入：本地段按 descriptor 落盘，服务端段汇总为一次 POST。
 * @returns {Promise<{applied:string[], skipped:string[], backups:string[]}>}
 */
async function importConfig(bundle, selected = []) {
  const want = new Set(selected)
  const s = bundle?.sections || {}
  const applied = []
  const skipped = []
  const body = {}

  for (const def of SECTION_DEFS) {
    if (!want.has(def.key) || s[def.key] == null) continue
    if (def.scope === 'server') {
      body[def.serverKey] = s[def.key]
      continue
    }
    if (writeLocalSection(def, s[def.key])) applied.push(def.label)
    else skipped.push(`${def.label}：浏览器本地存储不可写`)
  }

  let backups = []
  if (Object.keys(body).length) {
    try {
      const res = await requestJson('/api/config/import', {
        method: 'POST',
        body,
        timeoutMs: BACKEND_TIMEOUT_MS,
      })
      applied.push(...(res?.written || []))
      backups = res?.backups || []
    } catch (e) {
      skipped.push(`服务配置：${backendReason(e)}`)
    }
  }

  // 本地段已落盘：持有内存副本的 composable 立即重载，导入即生效（无需刷新页面）
  try {
    useNavigation().reload?.()
    useLogSearchTools().reload?.()
    useLogViewFilters().reload?.()
  } catch (e) {
    console.warn('配置重载', e)
  }

  return { applied, skipped, backups }
}

export function useConfigTransfer() {
  if (!instance) {
    instance = { probeBackend, exportConfig, importConfig }
  }
  return instance
}
