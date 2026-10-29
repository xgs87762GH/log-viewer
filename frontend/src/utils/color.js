/**
 * 颜色工具 —— 纯函数（无 DOM）
 */

function parseHex(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')
}

/** t=0 → a，t=1 → b */
export function mixHex(a, b, t) {
  const A = parseHex(a)
  const B = parseHex(b)
  if (!A || !B) return a
  return toHex({
    r: A.r + (B.r - A.r) * t,
    g: A.g + (B.g - A.g) * t,
    b: A.b + (B.b - A.b) * t,
  })
}

export function withAlpha(hex, aa) {
  const c = parseHex(hex)
  if (!c) return hex
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${aa})`
}
