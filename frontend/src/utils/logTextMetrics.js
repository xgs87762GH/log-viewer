/**
 * 日志文本度量 —— 显示列宽 / 换行列数 / 视觉行数 / 基准行高
 * 纯计算；不感知折叠、虚拟列表、Vue。
 */

/** 东亚宽字符 / 全角按 2 列（简化 EastAsianWidth） */
export function charDisplayWidth(code) {
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return 0
  if (code >= 0x1100 && (
    code <= 0x115f ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  )) {
    return 2
  }
  return 1
}

/** 文本显示列宽（ASCII=1，CJK/全角≈2） */
export function displayWidth(text) {
  const s = String(text ?? '')
  let w = 0
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)
    w += charDisplayWidth(cp)
    i += cp > 0xffff ? 2 : 1
  }
  return w
}

/**
 * 按容器宽度估算等宽字体每行「列」数。
 * 宁可少估列数（行高略高），不可多估导致 overflow 裁字。
 */
export function estimateWrapCols(clientWidth, {
  gutter = 72,
  fontSize = 13,
  pxPerChar,
  min = 40,
} = {}) {
  const ppc = pxPerChar ?? Math.max(7.5, Number(fontSize) * 0.62)
  const w = Math.max(160, (Number(clientWidth) || 0) - gutter)
  return Math.max(min, Math.floor(w / ppc) - 2)
}

/** 文本在当前换行设置下占用的视觉行数 */
export function visualLinesOf(text, { wordWrap, wrapCols }) {
  const s = String(text ?? '')
  if (!wordWrap) return 1
  const cpl = Math.max(20, (wrapCols || 100) - 4)
  return Math.max(1, Math.ceil(displayWidth(s) / cpl))
}

/** 单行基准像素高：开换行用字号×行高；关换行用字号×1.7 */
export function baseRowHeight({ fontSize = 13, lineHeight = 1.65, wordWrap = true } = {}) {
  const fs = Number(fontSize) || 13
  if (wordWrap) {
    const lh = Number(lineHeight) || 1.65
    return Math.max(18, Math.round(fs * lh))
  }
  return Math.max(18, Math.round(fs * 1.7))
}

/** 从 CSS 变量读取日志字体度量（唯一读 DOM 的入口） */
export function readLogFontMetrics(rootEl = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!rootEl || typeof getComputedStyle !== 'function') {
    return { fontSize: 13, lineHeight: 1.65 }
  }
  const root = getComputedStyle(rootEl)
  const fontSize = parseFloat(root.getPropertyValue('--fs-log')) || 13
  const lineHeight = parseFloat(root.getPropertyValue('--lh-log').trim()) || 1.65
  return { fontSize, lineHeight }
}
