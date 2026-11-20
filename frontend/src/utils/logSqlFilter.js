/**
 * SQL 行判定 —— 纯函数，主线程与 Worker 共用。
 *
 * 目标：识别被日志框架打印出来的 SQL 语句（MyBatis `Preparing: SELECT ...`、
 * JPA `Hibernate: select ...`、手写 `UPDATE x SET ...` 等），用于「隐藏 SQL」快捷过滤。
 *
 * 只匹配「动词 + 结构」两个条件同时成立，避免把普通英文单词里的 update / delete 误判。
 */

const SQL_VERB = /\b(select|insert|update|delete|merge|truncate)\b/i
const SQL_TAIL = /\b(from|into|set|values|table|where|join)\b/i
/** 太短的行不可能是完整 SQL，直接跳过，减少正则开销 */
const MIN_LENGTH = 12

export function isSqlLine(text) {
  const s = typeof text === 'string' ? text : String(text ?? '')
  if (s.length < MIN_LENGTH) return false
  return SQL_VERB.test(s) && SQL_TAIL.test(s)
}
