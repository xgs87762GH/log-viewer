/**
 * 日志展示行展平 / 折叠 —— 纯函数
 * 开闭：折叠策略集中于此；UI 只消费 viewRows。
 */

import { LEVEL_ABBR } from '../constants/logLevels'

/** 按容器宽度估算等宽字体每行字符数 */
export function estimateWrapCols(clientWidth, { gutter = 72, pxPerChar = 7.2, min = 40 } = {}) {
  const w = Math.max(160, (Number(clientWidth) || 0) - gutter)
  return Math.max(min, Math.floor(w / pxPerChar))
}

/** 文本在当前换行设置下占用的视觉行数 */
export function visualLinesOf(text, { wordWrap, wrapCols }) {
  const s = String(text ?? '')
  if (!wordWrap) return 1
  const cpl = wrapCols || 100
  return Math.max(1, Math.ceil(s.length / cpl))
}

function entryVisualLines(entry, lines, opts) {
  let n = 0
  for (const row of entry.rows) {
    n += visualLinesOf(lines[row.idx], opts)
  }
  return n
}

function lineRow(row, text, entryId, extra = {}) {
  return {
    kind: 'line',
    key: 'l-' + row.idx,
    idx: row.idx,
    no: row.idx + 1,
    level: row.level,
    abbr: row.level ? (LEVEL_ABBR[row.level] || '') : '',
    text,
    truncated: false,
    entryId,
    canExpand: false,
    canCollapse: false,
    visualLines: 1,
    ...extra,
  }
}

/**
 * @param {object} args
 * @param {Array} args.entries
 * @param {string[]} args.lines
 * @param {Set|Iterable} args.expandedIds
 * @param {boolean} args.foldEnabled
 * @param {number} args.foldMaxLines
 * @param {boolean} args.wordWrap
 * @param {number} args.wrapCols
 */
export function buildViewRows({
  entries,
  lines,
  expandedIds,
  foldEnabled,
  foldMaxLines,
  wordWrap,
  wrapCols,
}) {
  const cpl = wrapCols || 100
  const limit = foldMaxLines
  const openSet = expandedIds instanceof Set ? expandedIds : new Set(expandedIds || [])
  const opts = { wordWrap: !!wordWrap, wrapCols: cpl }
  const out = []

  for (const entry of entries) {
    const totalVis = entryVisualLines(entry, lines, opts)
    const need = foldEnabled && totalVis > limit
    const open = openSet.has(entry.id)

    if (!need || open) {
      const last = entry.rows.length - 1
      entry.rows.forEach((row, i) => {
        const text = String(lines[row.idx] ?? '')
        out.push(
          lineRow(row, text, entry.id, {
            canCollapse: need && open && i === last,
            visualLines: visualLinesOf(text, opts),
          }),
        )
      })
      continue
    }

    let budget = limit
    let shownVis = 0
    for (const row of entry.rows) {
      if (budget <= 0) break
      const full = String(lines[row.idx] ?? '')
      const vis = visualLinesOf(full, opts)
      if (vis <= budget) {
        out.push(lineRow(row, full, entry.id, { visualLines: vis }))
        budget -= vis
        shownVis += vis
      } else {
        const keepChars = Math.max(1, budget * cpl)
        out.push(
          lineRow(row, full.slice(0, keepChars), entry.id, {
            truncated: true,
            canExpand: entry.rows.length === 1,
            visualLines: budget,
          }),
        )
        shownVis += budget
        budget = 0
      }
    }

    const remain = Math.max(0, totalVis - shownVis)
    if (remain > 0) {
      if (entry.rows.length === 1 && out.length) {
        out[out.length - 1].canExpand = true
      }
      out.push({
        kind: 'fold',
        key: 'f-' + entry.id,
        entryId: entry.id,
        remain,
        abbr: '',
        visualLines: 1,
      })
    }
  }
  return out
}

/**
 * 由 viewRows 构建可变行高布局表（前缀和）。
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
