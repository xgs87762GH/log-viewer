/**
 * 大日志处理 —— Worker 常驻数据 + 命令协议。
 *
 * setLines：仅在 lines 变化时执行一次，重建条目、小写搜索文本（O(n) 一次）。
 * query：只做编译过滤与展平，不再克隆 lines、不再重跑分组正则。
 * 视觉行数按 (wordWrap, wrapCols) 缓存，条件变化时直接复用。
 */
import { detectLevel, isContinuation } from '../utils/logParser'
import {
  groupLogEntries,
  buildEntrySearchIndex,
  filterEntriesByMatcher,
  countEntryRows,
} from '../utils/logEntries'
import { buildViewRows } from '../utils/logViewRows'
import { compileFilters } from '../utils/logFilterMatch'
import { visualLinesOf } from '../utils/logTextMetrics'

let lines = []
let entries = []
let searchIndex = []
let visualCache = null
let visualKey = ''
let ready = false

let latestId = 0
let queuedQuery = null
let flushTimer = 0

function applySetLines(msg) {
  lines = msg.lines || []
  entries = groupLogEntries(lines, { detectLevel, isContinuation })
  searchIndex = buildEntrySearchIndex(entries, lines)
  visualCache = null
  visualKey = ''
  ready = true
}

function ensureVisualCache(wordWrap, wrapCols) {
  const key = `${!!wordWrap}|${wrapCols}`
  if (visualCache && visualKey === key) return
  const opts = { wordWrap: !!wordWrap, wrapCols }
  visualCache = new Array(lines.length)
  for (let i = 0; i < lines.length; i += 1) {
    visualCache[i] = visualLinesOf(String(lines[i] ?? ''), opts)
  }
  visualKey = key
}

function runQuery(msg) {
  if (!ready) throw new Error('worker lines not initialized')
  const {
    includeTerms = [],
    excludeTerms = [],
    expandedIds = [],
    collapsedIds = [],
    foldEnabled = true,
    foldMaxLines = 5,
    wordWrap = true,
    wrapCols = 100,
  } = msg

  const matcher = compileFilters(includeTerms, excludeTerms)
  const filtered = matcher ? filterEntriesByMatcher(entries, searchIndex, matcher) : entries

  ensureVisualCache(wordWrap, wrapCols)
  const viewRows = buildViewRows({
    entries: filtered,
    lines,
    expandedIds,
    collapsedIds,
    foldEnabled,
    foldMaxLines,
    wordWrap,
    wrapCols,
    visualOf: (idx) => visualCache[idx],
  })
  return { viewRows, filteredRowCount: countEntryRows(filtered) }
}

function flushQuery() {
  flushTimer = 0
  const msg = queuedQuery
  queuedQuery = null
  // 连续快速输入只处理最后一条；过期任务不回传，主线程已丢弃对应 pending
  if (!msg || msg.id !== latestId) return
  try {
    self.postMessage({ id: msg.id, ok: true, ...runQuery(msg) })
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: e?.message || String(e) })
  }
}

self.onmessage = (ev) => {
  const msg = ev.data || {}
  if (msg.type === 'setLines') {
    try {
      applySetLines(msg)
    } catch (e) {
      ready = false
      self.postMessage({ id: 0, ok: false, error: e?.message || String(e) })
    }
    return
  }
  if (msg.type === 'query') {
    latestId = msg.id
    queuedQuery = msg
    if (!flushTimer) flushTimer = setTimeout(flushQuery, 0)
  }
}
