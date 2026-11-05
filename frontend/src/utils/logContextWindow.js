/**
 * 上下文窗口推进 —— 纯函数，不感知 Vue / DOM / 网络。
 *
 * 窗口是闭区间 [start, end]，center 恒在其中。两重边界独立判定：
 *   - 配置上限：单侧累计行数达到 maxLinesPerSide
 *   - 数据边界：fetchLog 只拉了尾部，更早的行根本不在内存里
 * 组件必须同时呈现这两种边界，不能伪造超出已加载范围的日志行。
 */

function clampIndex(n, total) {
  const i = Number(n)
  const safe = Number.isFinite(i) ? Math.trunc(i) : 0
  return Math.min(Math.max(0, safe), Math.max(0, total - 1))
}

/**
 * @returns {{start:number,end:number,center:number,before:number,after:number}}
 * totalLines 为 0 时返回空窗口（end = -1）。
 */
export function createWindow(centerIdx, totalLines, cfg = {}) {
  const total = Math.max(0, Number(totalLines) || 0)
  const center = clampIndex(centerIdx, total)
  const cap = Math.max(0, Number(cfg.maxLinesPerSide) || 0)
  const span = Math.max(0, Math.min(Number(cfg.initialLines) || 0, cap))
  const start = Math.max(0, center - span)
  const end = Math.min(total - 1, center + span)
  return { start, end, center, before: center - start, after: end - center }
}

/**
 * 按方向扩张窗口，一次最多 lazyStep 行，且不超过单侧上限与数据边界。
 * @param {'up'|'down'} dir
 * @returns {{win:object,added:number,atCap:boolean,atDataEdge:boolean,before:number,after:number}}
 */
export function expandWindow(win, dir, cfg = {}, totalLines) {
  const total = Math.max(0, Number(totalLines) || 0)
  const step = Math.max(1, Number(cfg.lazyStep) || 1)
  const cap = Math.max(0, Number(cfg.maxLinesPerSide) || 0)
  const center = clampIndex(win.center, total)
  const next = {
    start: Math.min(Math.max(0, win.start), Math.max(0, total - 1)),
    end: Math.min(Math.max(-1, win.end), total - 1),
    center,
  }
  let added = 0

  if (total > 0 && (dir === 'up' || dir === 'down')) {
    const used = dir === 'up' ? center - next.start : next.end - center
    const room = dir === 'up' ? next.start : total - 1 - next.end
    const want = Math.min(step, Math.max(0, cap - used), Math.max(0, room))
    if (want > 0) {
      if (dir === 'up') next.start -= want
      else next.end += want
      added = want
    }
  }

  const before = Math.max(0, center - next.start)
  const after = Math.max(0, next.end - center)
  return {
    win: { ...next, before, after },
    added,
    atCap: dir === 'up' ? before >= cap : after >= cap,
    atDataEdge: dir === 'up' ? next.start <= 0 : next.end >= total - 1,
    before,
    after,
  }
}
