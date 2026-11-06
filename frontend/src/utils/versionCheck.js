/**
 * 版本检查 —— 纯函数：语义化版本解析 / 比较 / 最新 tag 选取 / 缓存判定。
 * 网络与 localStorage 由 composables/useVersionCheck.js 编排。
 */

const SEMVER = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** 规整为可比较的三段版本串（补零、去 v 前缀、去 build 元数据）；非法返回 '' */
export function normalizeVersion(raw) {
  const m = SEMVER.exec(String(raw ?? '').trim())
  if (!m) return ''
  const core = [m[1], m[2] || '0', m[3] || '0'].map(Number).join('.')
  return `${core}${m[4] ? `-${m[4]}` : ''}`
}

function splitPre(version) {
  const i = version.indexOf('-')
  return i < 0 ? [version, ''] : [version.slice(0, i), version.slice(i + 1)]
}

/** 预发布标识按点分段：数字段小于字母段，逐段比较（简化 semver 规则） */
function comparePrerelease(a, b) {
  const as = a.split('.')
  const bs = b.split('.')
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i += 1) {
    const x = as[i]
    const y = bs[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) return Number(x) > Number(y) ? 1 : -1
    if (xn !== yn) return xn ? -1 : 1
    return x > y ? 1 : -1
  }
  return 0
}

/** a > b 返回 1，a < b 返回 -1，相等返回 0；非法值按最低处理 */
export function compareVersions(a, b) {
  const x = normalizeVersion(a)
  const y = normalizeVersion(b)
  if (!x && !y) return 0
  if (!x) return -1
  if (!y) return 1
  const [xc, xp] = splitPre(x)
  const [yc, yp] = splitPre(y)
  const xn = xc.split('.').map(Number)
  const yn = yc.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    if (xn[i] !== yn[i]) return xn[i] > yn[i] ? 1 : -1
  }
  if (!xp && !yp) return 0
  if (!xp) return 1
  if (!yp) return -1
  return comparePrerelease(xp, yp)
}

/** 从 GitHub /tags 响应中挑出最大的语义化版本；无合法 tag 返回 null */
export function pickLatestTag(tags) {
  let best = null
  for (const item of Array.isArray(tags) ? tags : []) {
    const tag = typeof item === 'string' ? item : item?.name
    const version = normalizeVersion(tag)
    if (!version) continue
    if (!best || compareVersions(version, best.version) > 0) {
      best = { version, tag: String(tag).trim() }
    }
  }
  return best
}

/** 是否存在比当前版本更新的发布 */
export function isUpdateAvailable(current, latest) {
  return compareVersions(latest, current) > 0
}

/** 缓存是否过期；无缓存、时间非法或来自未来一律需要重新检查 */
export function shouldRecheck(checkedAt, now = Date.now(), ttlMs = 0) {
  const at = Number(checkedAt)
  if (!Number.isFinite(at) || at <= 0 || at > now) return true
  return now - at >= ttlMs
}

/** 缓存内容合法性；脏数据按无缓存处理 */
export function parseCheckCache(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!value || typeof value !== 'object') return null
    const latest = normalizeVersion(value.latest)
    const checkedAt = Number(value.checkedAt)
    if (!latest || !Number.isFinite(checkedAt) || checkedAt <= 0) return null
    return { latest, checkedAt }
  } catch {
    return null
  }
}
