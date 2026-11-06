/**
 * 日志工具抽屉状态 —— 纯函数 + 可注入 storage，便于 Node 单测。
 * 只持久化「是否固定」；临时展开不写盘，刷新后回到固定态决定的初始状态。
 */
import { DRAWER_STORAGE_KEY } from '../constants/logSearchTools.js'

export function parseDrawerState(raw) {
  let pinned = false
  try {
    if (raw) pinned = JSON.parse(raw)?.pinned === true
  } catch {
    /* 损坏的本地数据按默认态处理 */
  }
  return { pinned }
}

export function serializeDrawerState(state) {
  return JSON.stringify({ pinned: state?.pinned === true })
}

export function readPinned(storage = globalThis.localStorage) {
  try {
    return parseDrawerState(storage?.getItem?.(DRAWER_STORAGE_KEY)).pinned
  } catch {
    return false
  }
}

export function writePinned(pinned, storage = globalThis.localStorage) {
  const next = pinned === true
  try {
    storage?.setItem?.(DRAWER_STORAGE_KEY, serializeDrawerState({ pinned: next }))
  } catch {
    /* 隐私模式下写入失败不影响本次会话 */
  }
  return next
}

/**
 * 开合推导：固定时始终展开；收起会同时取消固定，避免两种状态互相矛盾。
 * @param {{open:boolean, pinned:boolean}} state
 * @param {'open'|'close'|'toggle'|'pin'|'unpin'} action
 */
export function resolveDrawerState(state, action) {
  const open = state?.open === true
  const pinned = state?.pinned === true
  switch (action) {
    case 'open': return { open: true, pinned }
    case 'close': return { open: false, pinned: false }
    case 'toggle': return open ? { open: false, pinned: false } : { open: true, pinned }
    case 'pin': return { open: true, pinned: true }
    case 'unpin': return { open, pinned: false }
    default: return { open, pinned }
  }
}

/**
 * 未固定的临时抽屉是否应自动缩回。
 * - 固定态永不自动收起；
 * - 切到其它视图时收起（keep-alive 下状态会残留）；
 * - 仍在日志视图时，只有点击落在抽屉外部才收起。
 * @param {{open:boolean, pinned:boolean}} state
 * @param {{view?:string, inside?:boolean}} ctx
 */
export function shouldAutoCollapse(state, { view = 'viewer', inside = true } = {}) {
  if (state?.open !== true || state?.pinned === true) return false
  if (view !== 'viewer') return true
  return inside === false
}
