/**
 * 主线程侧：大日志走 Worker 处理；失败或小数据回退同步路径。
 */

import { detectLevel, isContinuation } from './logParser'
import { groupLogEntries, filterLogEntries, countEntryRows } from './logEntries'
import { buildViewRows } from './logViewRows'
import { matchBlobFilters } from './logFilterMatch'

/** 超过该行数走 Worker */
export const WORKER_LINE_THRESHOLD = 2500

let worker = null
let seq = 0
const pending = new Map()

function getWorker() {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('../workers/logProcess.worker.js', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (ev) => {
      const data = ev.data || {}
      const slot = pending.get(data.id)
      if (!slot) return
      pending.delete(data.id)
      if (data.ok) slot.resolve(data)
      else slot.reject(new Error(data.error || 'worker failed'))
    }
    worker.onerror = (err) => {
      console.warn('logProcess worker error', err)
      for (const [, slot] of pending) {
        slot.reject(err instanceof Error ? err : new Error('worker error'))
      }
      pending.clear()
      worker = null
    }
  } catch (e) {
    console.warn('logProcess worker unavailable', e)
    worker = null
  }
  return worker
}

export function processLogSync({
  lines,
  includeTerms = [],
  excludeTerms = [],
  expandedIds,
  foldEnabled,
  foldMaxLines,
  wordWrap,
  wrapCols,
}) {
  const entries = groupLogEntries(lines, { detectLevel, isContinuation })
  const hasText = includeTerms.length > 0 || excludeTerms.length > 0
  const filtered = hasText
    ? filterLogEntries(entries, lines, (blob) =>
        matchBlobFilters(blob, includeTerms, excludeTerms),
      )
    : entries
  const viewRows = buildViewRows({
    entries: filtered,
    lines,
    expandedIds,
    foldEnabled,
    foldMaxLines,
    wordWrap,
    wrapCols,
  })
  return {
    viewRows,
    filteredRowCount: countEntryRows(filtered),
  }
}

/**
 * @returns {Promise<{ viewRows: any[], filteredRowCount: number }>}
 */
export function processLogAsync(args) {
  const lines = args.lines || []
  if (lines.length < WORKER_LINE_THRESHOLD) {
    return Promise.resolve(processLogSync(args))
  }
  const w = getWorker()
  if (!w) return Promise.resolve(processLogSync(args))

  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({
      id,
      lines,
      includeTerms: args.includeTerms || [],
      excludeTerms: args.excludeTerms || [],
      expandedIds: args.expandedIds instanceof Set
        ? [...args.expandedIds]
        : [...(args.expandedIds || [])],
      foldEnabled: args.foldEnabled,
      foldMaxLines: args.foldMaxLines,
      wordWrap: args.wordWrap,
      wrapCols: args.wrapCols,
    })
  }).catch((e) => {
    console.warn('logProcess worker fallback', e)
    return processLogSync(args)
  })
}
