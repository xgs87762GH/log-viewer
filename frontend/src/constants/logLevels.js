/**
 * 日志级别常量 —— 全局单一数据源
 *
 * Sidebar / Dashboard / LogViewer 都从这里读取级别定义，
 * 避免在各组件中重复硬编码 ['INFO','WARN',...] 造成的不一致。
 */

/** 支持的日志级别（顺序即展示顺序） */
export const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'TRACE']

/**
 * 目标级别文件不存在时的回退优先级
 * INFO > DEBUG > WARN > ERROR > TRACE
 */
export const FALLBACK_LEVEL_ORDER = ['INFO', 'DEBUG', 'WARN', 'ERROR', 'TRACE']

/** 级别 → 单字母缩写，用于日志行 CSS 类名（ln-I / ln-W ...） */
export const LEVEL_ABBR = {
  INFO: 'I',
  WARN: 'W',
  ERROR: 'E',
  DEBUG: 'D',
  TRACE: 'T',
}

/**
 * 级别 → 语义色类名后缀（配合 global.css 中的 .lvl-* 复用类）
 * 例如 levelColorClass('INFO') === 'lvl-info'
 */
export function levelColorClass(level) {
  return 'lvl-' + String(level).toLowerCase()
}

/**
 * 级别 → Element Plus Tag type
 * INFO→success, WARN→warning, ERROR→danger, DEBUG→primary, TRACE→info
 */
export function levelTagType(level) {
  const map = {
    INFO: 'success',
    WARN: 'warning',
    ERROR: 'danger',
    DEBUG: 'primary',
    TRACE: 'info',
  }
  return map[level] || 'info'
}

/** 判断给定字符串是否为受支持的级别 */
export function isLevel(value) {
  return LOG_LEVELS.includes(value)
}
