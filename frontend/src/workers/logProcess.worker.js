/**
 * 大日志分组 / 过滤 / 展平行 —— 在 Worker 中执行，避免主线程卡顿。
 * 高亮仍在主线程窗口内完成。
 */
import { detectLevel, isContinuation } from '../utils/logParser'
import { groupLogEntries, filterLogEntries, countEntryRows } from '../utils/logEntries'
import { buildViewRows } from '../utils/logViewRows'
import { matchBlobFilters } from '../utils/logFilterMatch'

self.onmessage = (ev) => {
  const msg = ev.data || {}
  const {
    id,
    lines = [],
    includeTerms = [],
    excludeTerms = [],
    expandedIds = [],
    foldEnabled = true,
    foldMaxLines = 5,
    wordWrap = true,
    wrapCols = 100,
  } = msg

  try {
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
    self.postMessage({
      id,
      ok: true,
      viewRows,
      filteredRowCount: countEntryRows(filtered),
    })
  } catch (e) {
    self.postMessage({
      id,
      ok: false,
      error: e?.message || String(e),
    })
  }
}
