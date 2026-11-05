/**
 * 日志展示行展平 / 折叠策略 —— 纯函数
 * 依赖：logTextMetrics（视觉行数）
 * 不感知 DOM / 虚拟滚动 / 折叠条样式。
 */

import { LEVEL_ABBR } from '../constants/logLevels'
import { visualLinesOf } from './logTextMetrics'

/** 折叠条占位视觉行数（略高于普通行，便于点按） */
export const FOLD_BAR_VISUAL_LINES = 1.45

function entryVisualLines(entry, lines, visualOf) {
  let n = 0
  for (const row of entry.rows) n += visualOf(row.idx, String(lines[row.idx] ?? ''))
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
    clipped: false,
    entryId,
    visualLines: 1,
    ...extra,
  }
}

function foldBar(entryId, { remain = 0, expanded = false } = {}) {
  return {
    kind: 'fold',
    key: 'f-' + entryId + (expanded ? '-open' : ''),
    entryId,
    remain,
    expanded,
    abbr: '',
    visualLines: FOLD_BAR_VISUAL_LINES,
  }
}

/**
 * 折叠按「视觉行数」判定。
 * 折叠时正文不截断，只限制 visualLines + clipped（UI 限高裁切）。
 */
export function buildViewRows({
  entries,
  lines,
  expandedIds,
  foldEnabled,
  foldMaxLines,
  wordWrap,
  wrapCols,
  visualOf,
}) {
  const cpl = wrapCols || 100
  const limit = Math.max(1, Number(foldMaxLines) || 5)
  const openSet = expandedIds instanceof Set ? expandedIds : new Set(expandedIds || [])
  const opts = { wordWrap: !!wordWrap, wrapCols: cpl }
  // Worker 传入按 (idx, wordWrap, wrapCols) 预计算的表；不传则沿用原逐行计算
  const vl = typeof visualOf === 'function'
    ? (idx, text) => {
        const v = visualOf(idx)
        return Number.isFinite(v) && v > 0 ? v : visualLinesOf(text, opts)
      }
    : (_idx, text) => visualLinesOf(text, opts)
  const out = []

  for (const entry of entries) {
    const totalVis = entryVisualLines(entry, lines, vl)
    const need = foldEnabled && totalVis > limit
    const open = openSet.has(entry.id)

    if (!need || open) {
      entry.rows.forEach((row) => {
        const text = String(lines[row.idx] ?? '')
        out.push(
          lineRow(row, text, entry.id, {
            visualLines: vl(row.idx, text),
          }),
        )
      })
      if (need && open) out.push(foldBar(entry.id, { expanded: true }))
      continue
    }

    let budget = limit
    let shownVis = 0
    for (const row of entry.rows) {
      if (budget <= 0) break
      const text = String(lines[row.idx] ?? '')
      const vis = vl(row.idx, text)
      if (vis <= budget) {
        out.push(lineRow(row, text, entry.id, { visualLines: vis }))
        budget -= vis
        shownVis += vis
      } else {
        out.push(
          lineRow(row, text, entry.id, {
            visualLines: budget,
            clipped: true,
          }),
        )
        shownVis += budget
        budget = 0
      }
    }

    const remain = Math.max(0, totalVis - shownVis)
    if (remain > 0) out.push(foldBar(entry.id, { remain, expanded: false }))
  }
  return out
}
