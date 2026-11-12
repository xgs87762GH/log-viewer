/**
 * 日志展示行展平 / 折叠策略 —— 纯函数
 * 依赖：logTextMetrics（视觉行数）
 * 不感知 DOM / 虚拟滚动 / 折叠条样式。
 */

import { LEVEL_ABBR } from '../constants/logLevels.js'
import { visualLinesOf } from './logTextMetrics.js'

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

function foldBar(entryId, { remain = 0, expanded = false, manual = false } = {}) {
  return {
    kind: 'fold',
    key: 'f-' + entryId + (expanded ? '-open' : ''),
    entryId,
    remain,
    expanded,
    manual,
    abbr: '',
    visualLines: FOLD_BAR_VISUAL_LINES,
  }
}

/**
 * 折叠按「视觉行数」判定：单条日志视觉行数超过阈值才折叠其预览。
 * 只限制该行的 visualLines + clipped（UI 限高预览 + 底部淡出），
 * 正文数据不截断，也不隐藏其它日志行；点折叠条即可展开看全文。
 */
export function buildViewRows({
  entries,
  lines,
  expandedIds,
  collapsedIds,
  foldEnabled,
  foldMaxLines,
  wordWrap,
  wrapCols,
  visualOf,
}) {
  const cpl = wrapCols || 100
  const limit = Math.max(1, Number(foldMaxLines) || 5)
  const openSet = expandedIds instanceof Set ? expandedIds : new Set(expandedIds || [])
  const collapsedSet = collapsedIds instanceof Set ? collapsedIds : new Set(collapsedIds || [])
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
    const manual = collapsedSet.has(entry.id)
    const autoNeed = foldEnabled && totalVis > limit
    const open = openSet.has(entry.id)

    // 手动折叠：把该条日志收成一行预览 + 折叠条，正文数据保留
    if (manual) {
      const first = entry.rows[0]
      if (first) {
        const text = String(lines[first.idx] ?? '')
        const vis = vl(first.idx, text)
        out.push(lineRow(first, text, entry.id, {
          visualLines: Math.min(1, vis),
          clipped: vis > 1,
        }))
      }
      out.push(foldBar(entry.id, {
        remain: Math.max(0, totalVis - 1),
        expanded: false,
        manual: true,
      }))
      continue
    }

    // 自动超行折叠：按视觉行数预算给预览，只限高当前行，正文不截断
    if (autoNeed && !open) {
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
          out.push(lineRow(row, text, entry.id, { visualLines: budget, clipped: true }))
          shownVis += budget
          budget = 0
        }
      }
      const remain = Math.max(0, totalVis - shownVis)
      if (remain > 0) out.push(foldBar(entry.id, { remain, expanded: false }))
      continue
    }

    // 完整展示：首行提供「折叠」入口
    entry.rows.forEach((row, i) => {
      const text = String(lines[row.idx] ?? '')
      out.push(
        lineRow(row, text, entry.id, {
          visualLines: vl(row.idx, text),
          canFold: i === 0,
        }),
      )
    })
    if (autoNeed && open) out.push(foldBar(entry.id, { expanded: true }))
  }
  return out
}
