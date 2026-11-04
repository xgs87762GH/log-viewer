/**
 * 虚拟列表布局 —— 由 viewRows.visualLines 生成高度表与区间查找
 * 不感知日志折叠策略 / 文本度量细节。
 */

/**
 * @returns {{ heights: number[], offsets: number[], totalHeight: number }}
 */
export function buildRowLayout(rows, baseRowH) {
  const base = Math.max(16, Number(baseRowH) || 22)
  const n = rows.length
  const heights = new Array(n)
  const offsets = new Array(n + 1)
  offsets[0] = 0
  for (let i = 0; i < n; i++) {
    const vl = Math.max(1, rows[i]?.visualLines || 1)
    heights[i] = vl * base
    offsets[i + 1] = offsets[i] + heights[i]
  }
  return { heights, offsets, totalHeight: offsets[n] }
}

/** 在 offsets 中找最后一个 offsets[i] <= y 的 i */
export function findStartIndex(offsets, y) {
  const n = offsets.length - 1
  if (n <= 0) return 0
  let lo = 0
  let hi = n - 1
  const target = Math.max(0, y)
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= target) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** 找第一个 offsets[i] >= y 的行下标（不含 offsets[n]） */
export function findEndIndex(offsets, y) {
  const n = offsets.length - 1
  if (n <= 0) return 0
  let lo = 0
  let hi = n
  const target = Math.max(0, y)
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] < target) lo = mid + 1
    else hi = mid
  }
  return Math.min(n, lo)
}
