/**
 * 日志文本查找 —— 纯函数，不感知 Vue / DOM / Worker。
 *
 * 命中集合基于「过滤后可见的 viewRows」：用户看到什么就找什么。
 * 折叠占位行 kind==='fold' 无 idx/text，必须跳过。
 * 关键词按字面量、大小写不敏感比较，不走正则，因此元字符天然安全。
 */

export function normalizeFindQuery(raw) {
  return String(raw ?? '').trim()
}

/**
 * @param {Array<{kind:string, idx?:number, no?:number, text?:string}>} rows viewRows
 * @param {string} rawQuery 查找关键词
 * @returns {Array<{rowIndex:number, idx:number, no:number}>}
 */
export function buildFindMatches(rows, rawQuery) {
  const query = normalizeFindQuery(rawQuery).toLowerCase()
  if (!query || !Array.isArray(rows) || !rows.length) return []
  const out = []
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row || row.kind !== 'line') continue
    const text = String(row.text ?? '')
    if (!text || !text.toLowerCase().includes(query)) continue
    out.push({ rowIndex: i, idx: row.idx, no: row.no })
  }
  return out
}

/** 循环步进；total 为 0 或当前无效时返回 -1 / 首个命中 */
export function stepFindIndex(current, total, delta = 1) {
  const n = Number(total) || 0
  if (n <= 0) return -1
  const step = delta < 0 ? -1 : 1
  const cur = Number.isInteger(current) && current >= 0 && current < n ? current : -1
  if (cur < 0) return step > 0 ? 0 : n - 1
  return (cur + step + n) % n
}

/** 把命中行滚到视口中部；offsets 长度比行数多 1（见 logVirtualLayout） */
export function findScrollTop(offsets, rowIndex, viewportH) {
  if (!Array.isArray(offsets) || offsets.length < 2) return 0
  const i = Math.max(0, Math.min(Number(rowIndex) || 0, offsets.length - 2))
  const top = Number(offsets[i]) || 0
  const half = Math.max(0, (Number(viewportH) || 0) / 2)
  return Math.max(0, top - half)
}
