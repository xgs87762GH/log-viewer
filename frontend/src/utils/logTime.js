/**
 * 日志行时间解析 —— 纯函数，不感知 Vue / DOM。
 *
 * 目录页只给到分钟，正文每行通常带秒（有时带毫秒）：
 *   `2026-11-20 21:06:10.274 [INFO] ...`
 * 用最后一行的时间表示「这个文件更新到什么时候」，无需额外请求。
 */

const TIME_RE = /\b(\d{1,2}):(\d{2}):(\d{2})(?:[.,]\d{1,3})?\b/

/** 提取 `HH:MM:SS`；解析不到返回空串 */
export function parseLineTime(text) {
  const m = String(text ?? '').match(TIME_RE)
  if (!m) return ''
  const hh = String(m[1]).padStart(2, '0')
  return `${hh}:${m[2]}:${m[3]}`
}

const DATE_TIME_RE = /\b(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})(?:[.,]\d{1,3})?\b/

/** 提取 `YYYY-MM-DD HH:MM:SS`；解析不到返回空串 */
export function parseLineDateTime(text) {
  const m = String(text ?? '').match(DATE_TIME_RE)
  if (!m) return ''
  const hh = String(m[2]).padStart(2, '0')
  return `${m[1]} ${hh}:${m[3]}:${m[4]}`
}

/**
 * 从末尾若干行里找最后一条能解析出时间的日志行。
 * 只回看 5 行：日志末尾可能有空行或堆栈续行，避免全量遍历。
 */
export function lastLineTime(lines, lookback = 5) {
  const list = Array.isArray(lines) ? lines : []
  const end = list.length - 1
  for (let i = end; i >= 0 && i > end - lookback; i -= 1) {
    const time = parseLineTime(list[i])
    if (time) return time
  }
  return ''
}
