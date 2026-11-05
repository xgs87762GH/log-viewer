/**
 * 日志条目归并 / 文本过滤 —— 纯函数
 * 供 LogViewer 使用；不依赖 Vue / HTTP。
 */

/**
 * 将行列表归并为「单条日志」：
 * 非续行开新条目；堆栈 / Caused by / 缩进续行归入上一条。
 *
 * @param {string[]} lines
 * @param {{ detectLevel: (s: string) => string, isContinuation: (s: string) => boolean }} ops
 * @returns {Array<{ id: number, rows: Array<{ idx: number, level: string }> }>}
 */
export function groupLogEntries(lines, { detectLevel, isContinuation }) {
  const entries = []
  let cur = null
  const total = lines.length
  for (let i = 0; i < total; i++) {
    const line = lines[i]
    if (!line && i === total - 1) continue
    const text = String(line ?? '')
    const level = detectLevel(text)
    const row = { idx: i, level }
    const cont = isContinuation(text)
    if (!cur || !cont) {
      cur = { id: i, rows: [row] }
      entries.push(cur)
    } else {
      cur.rows.push(row)
    }
  }
  return entries
}

/**
 * 按文本过滤整条日志（续行不拆散）。
 * @param {Array<{ rows: Array<{ idx: number }> }>} entries
 * @param {string[]} lines
 * @param {(blob: string) => boolean} matchFn
 */
export function filterLogEntries(entries, lines, matchFn) {
  if (!matchFn) return entries
  return entries.filter((entry) => {
    const blob = entry.rows.map((row) => String(lines[row.idx] ?? '')).join('\n')
    return matchFn(blob)
  })
}

/**
 * 一次性构建每条日志的小写搜索文本（仅在 lines 变化时执行）。
 * 与 filterLogEntries 的 blob 拼接规则完全一致，内存约一份正文副本。
 * @returns {string[]} 与 entries 同序
 */
export function buildEntrySearchIndex(entries, lines) {
  return entries.map((entry) => {
    const parts = new Array(entry.rows.length)
    for (let j = 0; j < entry.rows.length; j += 1) {
      parts[j] = String(lines[entry.rows[j].idx] ?? '')
    }
    return parts.join('\n').toLowerCase()
  })
}

/** 基于编译 matcher 过滤；matcher 为 null 时原样返回。 */
export function filterEntriesByMatcher(entries, searchIndex, matcher) {
  if (!matcher) return entries
  const out = []
  for (let i = 0; i < entries.length; i += 1) {
    if (matcher(searchIndex[i])) out.push(entries[i])
  }
  return out
}

/** 条目内物理行总数 */
export function countEntryRows(entries) {
  let n = 0
  for (const e of entries) n += e.rows.length
  return n
}
