/**
 * 纯函数文本过滤匹配（主线程 / Worker 共用，无 Vue 依赖）
 */
export function matchBlobFilters(blob, includes = [], excludes = []) {
  const lower = String(blob ?? '').toLowerCase()
  for (const ex of excludes) {
    if (ex && lower.includes(String(ex).toLowerCase())) return false
  }
  for (const inc of includes) {
    if (inc && !lower.includes(String(inc).toLowerCase())) return false
  }
  return true
}
