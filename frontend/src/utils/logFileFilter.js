/**
 * 历史文件的日期筛选与默认选择 —— 纯函数。
 *
 * 命名约定见 constants/logFileRules.js：Logback 按大小滚动时 {idx} 递增，
 * 同一天里 idx 越大即越晚生成（时间越新），故首项即该日期最新归档。
 * 本地索引可能由旧版本写入，这里显式排序，不依赖传入数组的顺序。
 */

/** 有日期时只保留该日期的归档；无日期时返回完整列表（含活跃文件） */
export function filterLogFilesByDate(files, date) {
  const list = Array.isArray(files) ? files : []
  if (!date) return list
  return list
    .filter((f) => !f.active && f.date === date)
    .sort((a, b) => (b.idx || 0) - (a.idx || 0))
}

/** 当前筛选下默认打开的文件：选了日期→该日期最新归档；未选→活跃文件 */
export function defaultLogFile(files, date) {
  const list = filterLogFilesByDate(files, date)
  if (!date) return list.find((f) => f.active)?.name || list[0]?.name || ''
  return list[0]?.name || ''
}
