/**
 * 纯函数文本过滤匹配（主线程 / Worker 共用，无 Vue 依赖）
 */
import { isSqlLine } from './logSqlFilter.js'

export function matchBlobFilters(blob, includes = [], excludes = [], hideSql = false) {
  const lower = String(blob ?? '').toLowerCase()
  for (const ex of excludes) {
    if (ex && lower.includes(String(ex).toLowerCase())) return false
  }
  for (const inc of includes) {
    if (inc && !lower.includes(String(inc).toLowerCase())) return false
  }
  // 快捷过滤：隐藏 SQL 语句行（与文本条件叠加，任一不满足即过滤掉）
  if (hideSql && isSqlLine(blob)) return false
  return true
}

/**
 * 预编译过滤条件：条件只小写化一次，供 Worker 热路径按条目复用。
 * 排除优先短路；包含按词长降序，更稀有的长词先判定。
 * 无条件时返回 null，调用方直接跳过过滤（语义与 matchBlobFilters 等价）。
 * @returns {((lowerBlob: string) => boolean) | null}
 */
export function compileFilters(includes = [], excludes = [], hideSql = false) {
  const norm = (list) =>
    list
      .filter((s) => s != null && String(s) !== '')
      .map((s) => String(s).toLowerCase())
      .sort((a, b) => b.length - a.length)
  const inc = norm(includes)
  const exc = norm(excludes)
  if (!inc.length && !exc.length && !hideSql) return null
  return (lowerBlob) => {
    for (const ex of exc) {
      if (lowerBlob.includes(ex)) return false
    }
    for (const term of inc) {
      if (!lowerBlob.includes(term)) return false
    }
    if (hideSql && isSqlLine(lowerBlob)) return false
    return true
  }
}
