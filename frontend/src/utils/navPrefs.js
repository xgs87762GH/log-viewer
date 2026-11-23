/**
 * 导航收藏与最近访问 —— 纯函数，无 Vue / DOM / localStorage。
 *
 * 语义分两种，不能混用：
 * - 收藏：用户显式「长期关注」，手动增删，超过上限按**最早添加**淘汰（FIFO）；
 * - 最近：访问记录，命中后置顶，超过上限丢**最久未访问**（LRU）。
 */

export const FAVORITE_LIMIT = 20
export const RECENT_STORE_LIMIT = 8
export const RECENT_SHOW_LIMIT = 5

/** 收藏切换：存在则移除，否则追加；超限丢弃最早添加的 */
export function toggleApp(list, app, limit = FAVORITE_LIMIT) {
  const cur = Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x) : []
  const key = String(app || '').trim()
  if (!key) return cur
  if (cur.includes(key)) return cur.filter((x) => x !== key)
  const next = [...cur, key]
  return next.length > limit ? next.slice(next.length - limit) : next
}

/** 记录访问：同 env+app 去重并置顶，超过上限丢队尾（LRU） */
export function pushRecent(list, env, app, limit = RECENT_STORE_LIMIT) {
  const envKey = String(env || '').trim()
  const appKey = String(app || '').trim()
  const cur = Array.isArray(list) ? list.filter((r) => r && r.env && r.app) : []
  if (!envKey || !appKey) return cur
  const rest = cur.filter((r) => !(r.env === envKey && r.app === appKey))
  return [{ env: envKey, app: appKey, at: Date.now() }, ...rest].slice(0, limit)
}

/** 清洗收藏：丢弃非字符串、去重、保留最后 limit 个 */
export function sanitizeFavorites(raw, limit = FAVORITE_LIMIT) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    const app = typeof item === 'string' ? item.trim() : ''
    if (app && !out.includes(app)) out.push(app)
  }
  return out.length > limit ? out.slice(out.length - limit) : out
}

/** 清洗最近：校验字段、按 env|app 去重、按时间降序、截断 */
export function sanitizeRecents(raw, limit = RECENT_STORE_LIMIT) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const env = String(item.env || '').trim()
    const app = String(item.app || '').trim()
    const at = Number(item.at)
    if (!env || !app || !Number.isFinite(at)) continue
    const key = `${env}|${app}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ env, app, at })
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit)
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / MM-DD */
export function recentLabel(at, now = Date.now()) {
  const ts = Number(at)
  if (!Number.isFinite(ts)) return ''
  const diff = Math.max(0, now - ts)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

/** 服务是否匹配搜索词：module / app / host / hosts 任一包含即可 */
export function matchService(svc, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  if (!svc) return false
  const hosts = Array.isArray(svc.hosts) ? svc.hosts : []
  return [svc.module, svc.app, svc.host, ...hosts]
    .some((v) => String(v || '').toLowerCase().includes(q))
}

/** 收藏行：只保留当前环境存在的应用，保持收藏顺序 */
export function resolveFavoriteRows(apps, byApp) {
  if (!byApp || typeof byApp.get !== 'function') return []
  const out = []
  for (const app of Array.isArray(apps) ? apps : []) {
    const row = byApp.get(app)
    if (row) out.push(row)
  }
  return out
}

/** 最近行：按环境过滤 + 排除已收藏 + 截断展示上限 */
export function resolveRecentRows(recents, env, favoriteSet, byApp, limit = RECENT_SHOW_LIMIT) {
  if (!byApp || typeof byApp.get !== 'function') return []
  const out = []
  for (const item of Array.isArray(recents) ? recents : []) {
    if (!item || item.env !== env) continue
    if (favoriteSet && typeof favoriteSet.has === 'function' && favoriteSet.has(item.app)) continue
    const row = byApp.get(item.app)
    if (!row) continue
    out.push({ ...row, at: item.at })
    if (out.length >= limit) break
  }
  return out
}
