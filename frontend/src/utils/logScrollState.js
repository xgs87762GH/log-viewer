/**
 * 日志滚动位置判定 —— 纯函数，不感知 DOM / Vue / 虚拟列表。
 * 供状态栏「置顶 / 置底」按钮的禁用态使用；2px 容差覆盖亚像素与取整误差。
 */

/** 是否已到达顶部（含容差） */
export function isAtTop(scrollTop, tolerance = 2) {
  return Number(scrollTop) <= tolerance
}

/**
 * 是否已到达底部（含容差）。
 * 内容不足一屏时可滚动距离为 0，视为同时处于顶部与底部。
 */
export function isAtBottom(scrollTop, viewportH, totalHeight, tolerance = 2) {
  const max = Math.max(0, (Number(totalHeight) || 0) - (Number(viewportH) || 0))
  return Number(scrollTop) >= max - tolerance
}
