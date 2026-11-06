/**
 * 过滤历史 —— 纯函数持久化 / 去重 / 展示标签
 * 不依赖 Vue；由 useLogViewFilters 编排。
 */

import { FILTER_HISTORY_KEY } from '../constants/storageKeys.js'
export { FILTER_HISTORY_KEY }
export const FILTER_HISTORY_MAX = 15

/** @param {Array<{ text: string, mode: string }>} filters */
export function historySignature(filters) {
  return (filters || [])
    .map((f) => `${f.mode === 'exclude' ? 'e' : 'i'}:${String(f.text || '').toLowerCase()}`)
    .sort()
    .join('\0')
}

/** @param {Array<{ text: string, mode: string }>} filters */
export function formatHistoryLabel(filters) {
  const list = filters || []
  if (!list.length) return '（空过滤）'
  return list
    .map((f) => `${f.mode === 'exclude' ? '≠' : '∋'} ${f.text}`)
    .join(' · ')
}

export function normalizeHistoryFilters(filters) {
  return (filters || [])
    .map((f) => ({
      text: String(f?.text ?? '').trim(),
      mode: f?.mode === 'exclude' ? 'exclude' : 'include',
    }))
    .filter((f) => f.text)
}

/**
 * 将当前条件集插入历史头部；同签名去重；超长截断。
 * @returns {Array} 新历史列表
 */
export function upsertFilterHistory(prev, filters, { max = FILTER_HISTORY_MAX } = {}) {
  const normalized = normalizeHistoryFilters(filters)
  if (!normalized.length) return Array.isArray(prev) ? prev : []
  const sig = historySignature(normalized)
  const rest = (Array.isArray(prev) ? prev : []).filter((h) => h?.sig !== sig)
  const entry = {
    id: `fh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    sig,
    filters: normalized,
    label: formatHistoryLabel(normalized),
    at: Date.now(),
  }
  return [entry, ...rest].slice(0, Math.max(1, max))
}

export function loadFilterHistory(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return []
  try {
    const raw = storage.getItem(FILTER_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((h) => {
        const filters = normalizeHistoryFilters(h?.filters)
        if (!filters.length) return null
        return {
          id: String(h.id || `fh-${Math.random().toString(36).slice(2, 9)}`),
          sig: h.sig || historySignature(filters),
          filters,
          label: h.label || formatHistoryLabel(filters),
          at: Number(h.at) || 0,
        }
      })
      .filter(Boolean)
      .slice(0, FILTER_HISTORY_MAX)
  } catch {
    return []
  }
}

export function saveFilterHistory(list, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return
  try {
    storage.setItem(FILTER_HISTORY_KEY, JSON.stringify(Array.isArray(list) ? list : []))
  } catch { /* quota / private mode */ }
}
