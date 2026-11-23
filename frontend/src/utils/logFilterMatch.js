/**
 * 纯函数文本过滤匹配（主线程 / Worker 共用，无 Vue 依赖）
 *
 * 语义：
 * - 排除条件（excludes）：任一命中就丢弃（OR）；
 * - 包含条件（includes）：默认全部满足（AND），可切换为任一满足（OR）；
 * - hideSql：隐藏 SQL 语句行，与前两者叠加。
 * 逻辑关系集中在这里，组件与 Worker 不得各自实现。
 */
import { isSqlLine } from './logSqlFilter.js'

function normTerms(list) {
  return (Array.isArray(list) ? list : [])
    .filter((s) => s != null && String(s) !== '')
    .map((s) => String(s).toLowerCase())
}

export function matchBlobFilters(blob, includes = [], excludes = [], hideSql = false, matchMode = 'and') {
  const lower = String(blob ?? '').toLowerCase()
  for (const ex of excludes) {
    if (ex && lower.includes(String(ex).toLowerCase())) return false
  }
  const terms = normTerms(includes)
  if (terms.length) {
    const ok = matchMode === 'or'
      ? terms.some((term) => lower.includes(term))
      : terms.every((term) => lower.includes(term))
    if (!ok) return false
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
export function compileFilters(includes = [], excludes = [], hideSql = false, matchMode = 'and') {
  const sortDesc = (a, b) => b.length - a.length
  const inc = normTerms(includes).sort(sortDesc)
  const exc = normTerms(excludes).sort(sortDesc)
  if (!inc.length && !exc.length && !hideSql) return null
  const useOr = matchMode === 'or'
  return (lowerBlob) => {
    for (const ex of exc) {
      if (lowerBlob.includes(ex)) return false
    }
    if (inc.length) {
      if (useOr) {
        let hit = false
        for (const term of inc) {
          if (lowerBlob.includes(term)) {
            hit = true
            break
          }
        }
        if (!hit) return false
      } else {
        for (const term of inc) {
          if (!lowerBlob.includes(term)) return false
        }
      }
    }
    if (hideSql && isSqlLine(lowerBlob)) return false
    return true
  }
}
