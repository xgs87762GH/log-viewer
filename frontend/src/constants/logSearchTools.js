/**
 * 日志搜索工具区常量 —— 纯配置，不依赖 Vue / DOM。
 * 高亮 class 用白名单常量，避免把用户输入拼进 HTML 属性。
 */

/** 查找输入防抖；高亮只重绘窗口内行，直接生效即可 */
export const FIND_DEBOUNCE_MS = 120

/** 抽屉固定状态持久化 key（与既有 localStorage key 不冲突） */
import { DRAWER_STORAGE_KEY } from './storageKeys.js'
export { DRAWER_STORAGE_KEY }

export const FILTER_HIGHLIGHT_CLASS = 'hit'
export const USER_HIGHLIGHT_CLASS = 'hl'
export const FIND_HIGHLIGHT_CLASS = 'find-hit'

/** 查找条上的快捷键提示文案 */
export const FIND_SHORTCUTS = {
  open: 'Ctrl/⌘ + F',
  next: 'Enter / F3',
  prev: 'Shift + Enter / Shift + F3',
  close: 'Esc',
}
