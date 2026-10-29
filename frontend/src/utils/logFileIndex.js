/**
 * 日志文件名索引引擎 —— 持久化 / 按日刷新判定 / 合并
 *
 * 规则唯一来源：constants/logFileRules.js
 * HTTP 与编排：composables/useLogs.js
 *
 * 约定（按模块 host|app）：
 * - 归档几乎不变 → localStorage 持久化
 * - refreshedDay：每次点开只判断「今日是否已刷新」
 * - 合并：历史归档只增不减；活跃文件以新探测为准
 */

import { sortFileList } from '../constants/logFileRules.js'

export const INDEX_STORAGE_KEY = 'log_viewer_file_index_v1'

const listeners = new Set()

export function moduleKey(host, app) {
  return `${host}|${app}`
}

/** 本地日历日 YYYY-MM-DD */
export function localDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function stampRefresh(entry, ts = Date.now()) {
  if (!entry) return entry
  entry.updatedAt = ts
  entry.refreshedDay = localDayKey(ts)
  return entry
}

/** 该模块今日是否还需要软刷新 */
export function shouldSoftRefresh(entry) {
  if (!entry) return true
  const day = entry.refreshedDay || (entry.updatedAt ? localDayKey(entry.updatedAt) : '')
  if (!day) return true
  return day !== localDayKey()
}

function readStore() {
  try {
    const raw = localStorage.getItem(INDEX_STORAGE_KEY)
    if (!raw) return { version: 1, entries: {} }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { version: 1, entries: {} }
    return { version: 1, entries: parsed.entries || {} }
  } catch {
    return { version: 1, entries: {} }
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(store))
  } catch (e) {
    console.warn('persist log file index failed:', e.message)
  }
}

export function loadEntry(key, ruleId) {
  const entry = readStore().entries[key]
  if (!entry || !entry.archives) return null
  if (ruleId && entry.ruleId && entry.ruleId !== ruleId) return null
  const updatedAt = entry.updatedAt || 0
  return {
    levels: entry.levels || [],
    files: entry.files || {},
    archives: entry.archives || {},
    ruleId: entry.ruleId,
    updatedAt,
    refreshedDay: entry.refreshedDay || (updatedAt ? localDayKey(updatedAt) : ''),
    fileCount: entry.fileCount || 0,
  }
}

export function saveEntry(key, entry) {
  if (!entry) return
  const store = readStore()
  store.entries[key] = {
    ruleId: entry.ruleId,
    updatedAt: entry.updatedAt,
    refreshedDay: entry.refreshedDay || localDayKey(entry.updatedAt || Date.now()),
    levels: entry.levels,
    files: entry.files,
    archives: entry.archives,
    fileCount: entry.fileCount || 0,
  }
  writeStore(store)
}

export function removeEntry(key) {
  const store = readStore()
  if (!store.entries[key]) return
  delete store.entries[key]
  writeStore(store)
}

export function countArchiveNames(entry) {
  let n = 0
  for (const lv of entry?.levels || []) {
    for (const f of entry.archives?.[lv] || []) {
      if (!f.active) n += 1
    }
  }
  return n
}

/**
 * 合并索引：历史归档只增不减；活跃 / 同名以 next 为准。
 * @returns {{ entry: object, added: number }}
 */
export function mergeIndexEntries(prev, next) {
  if (!prev) return { entry: next, added: countArchiveNames(next) }
  const levels = [...new Set([...(prev.levels || []), ...(next.levels || [])])]
  const files = { ...(prev.files || {}), ...(next.files || {}) }
  const archives = {}
  let added = 0

  for (const lv of levels) {
    const map = new Map()
    for (const f of prev.archives?.[lv] || []) {
      if (!f.active) map.set(f.name, f)
    }
    for (const f of next.archives?.[lv] || []) {
      if (!map.has(f.name) && !f.active) added += 1
      map.set(f.name, f)
    }
    const list = sortFileList([...map.values()])
    if (list.length) {
      archives[lv] = list
      files[lv] = list[0].name
    }
  }

  const presentLevels = levels.filter((lv) => archives[lv]?.length)
  return {
    entry: stampRefresh(
      {
        levels: presentLevels,
        files,
        archives,
        ruleId: next.ruleId,
        fileCount: Math.max(prev.fileCount || 0, next.fileCount || 0),
      },
      next.updatedAt || Date.now(),
    ),
    added,
  }
}

export function emitIndexUpdate(key, entry, meta = {}) {
  for (const fn of listeners) {
    try {
      fn(key, entry, meta)
    } catch (e) {
      console.warn('index listener error:', e)
    }
  }
}

/** @returns {() => void} unsubscribe */
export function onIndexUpdate(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
