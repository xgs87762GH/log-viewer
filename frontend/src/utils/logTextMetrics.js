/**
 * 日志文本度量 —— 显示列宽 / 换行列数 / 视觉行数 / 基准行高
 * 计算与折叠、虚拟列表、Vue 解耦；字体相关读取集中在下方两个 DOM 入口。
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

/** CSS 默认 tab-size；日志容器未另行设置，与 pre-wrap 下的制表位保持一致 */
const TAB_WIDTH = 8

/**
 * 文本显示列宽（ASCII=1，CJK/全角≈2）。
 * 制表符不是 0 宽：它把当前列推进到下一个 tab stop，
 * 否则堆栈缩进 / 制表符分隔的日志会少算行数，被 .ln 的 overflow 裁掉。
 */
export function displayWidth(text) {
  const s = String(text ?? '')
  let w = 0
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)
    w += cp === 0x09 ? TAB_WIDTH - (w % TAB_WIDTH) : charDisplayWidth(cp)
    i += cp > 0xffff ? 2 : 1
  }
  return w
}

/**
 * 按容器宽度估算等宽字体每行「列」数。
 * 宁可少估列数（行高略高），不可多估导致 overflow 裁字。
 * pxPerChar 传入时用实测字符宽，否则回退 fontSize*0.62 的经验值。
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
  // 显式换行符在 pre-wrap 下强制换行，必须逐段累加，否则会少算整行
  let total = 0
  for (const part of s.split('\n')) total += Math.max(1, Math.ceil(displayWidth(part) / cpl))
  return Math.max(1, total)
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

/** 从 CSS 变量读取日志字体度量 */
export function readLogFontMetrics(rootEl = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!rootEl || typeof getComputedStyle !== 'function') {
    return { fontSize: 13, lineHeight: 1.65, fontFamily: '' }
  }
  const root = getComputedStyle(rootEl)
  const fontSize = parseFloat(root.getPropertyValue('--fs-log')) || 13
  const lineHeight = parseFloat(root.getPropertyValue('--lh-log').trim()) || 1.65
  const fontFamily = root.getPropertyValue('--font-log').trim()
  return { fontSize, lineHeight, fontFamily }
}

/**
 * 用与 .ln .tx 一致的字体实测单字符宽度，替代 fontSize*0.62 经验值。
 * 经验值对 Consolas 等窄等宽字体会少估约 15% 列数，进而多算一整行行高。
 * 无 DOM / 测量异常时返回 null，由调用方回退经验值。
 */
export function measureLogCharWidth(fontSize, fontFamily) {
  if (typeof document === 'undefined' || !document.body || !fontFamily) return null
  const probe = document.createElement('span')
  const sample = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_./:- '
  const repeat = 4
  probe.textContent = sample.repeat(repeat)
  probe.style.cssText =
    'position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre;pointer-events:none'
  probe.style.fontSize = `${Number(fontSize) || 13}px`
  probe.style.fontFamily = fontFamily
  document.body.appendChild(probe)
  try {
    const width = probe.getBoundingClientRect().width || probe.offsetWidth
    const ppc = width / (sample.length * repeat)
    return ppc >= 4 && ppc <= 40 ? ppc : null
  } finally {
    probe.remove()
  }
}
