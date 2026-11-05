/**
 * 主线程侧：大日志走 Worker 常驻数据处理；失败或小数据回退同步路径。
 *
 * 协议：lines 仅在引用变化时用 setLines 发送一次；之后每次交互只发 query。
 * 避免每次过滤都结构化克隆整个 lines、重跑分组正则。
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
/** 已发送给 Worker 的 lines 引用；Worker 重建后必须清空，以便重新 setLines */
let sentLines = null

/** 新 query 发出前，作废旧 Promise（结果即使到达也会被 onmessage 忽略） */
function expirePending() {
  for (const [, slot] of pending) {
    slot.resolve({ viewRows: [], filteredRowCount: 0, expired: true })
  }
  pending.clear()
}

function getWorker() {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    const next = new Worker(new URL('../workers/logProcess.worker.js', import.meta.url), {
      type: 'module',
    })
    next.onmessage = (ev) => {
      const data = ev.data || {}
      const slot = pending.get(data.id)
      if (!slot) return
      pending.delete(data.id)
      if (data.ok) slot.resolve(data)
      else slot.reject(new Error(data.error || 'worker failed'))
    }
    next.onerror = (err) => {
      console.warn('logProcess worker error', err)
      for (const [, slot] of pending) {
        slot.reject(err instanceof Error ? err : new Error('worker error'))
      }
      pending.clear()
      sentLines = null
      worker = null
    }
    worker = next
    sentLines = null
  } catch (e) {
    console.warn('logProcess worker unavailable', e)
    worker = null
    sentLines = null
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
 * @returns {Promise<{ viewRows: any[], filteredRowCount: number, expired?: boolean }>}
 */
export function processLogAsync(args) {
  const lines = args.lines || []
  if (lines.length < WORKER_LINE_THRESHOLD) {
    sentLines = null
    return Promise.resolve(processLogSync(args))
  }
  const w = getWorker()
  if (!w) {
    sentLines = null
    return Promise.resolve(processLogSync(args))
  }

  const id = ++seq
  expirePending()

  if (lines !== sentLines) {
    sentLines = lines
    w.postMessage({ type: 'setLines', lines })
  }

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({
      type: 'query',
      id,
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
