/**
 * 本地磁盘缓存状态 —— 只读视图。
 *
 * 后端 /api/cache/status 返回某服务下已缓存的文件与全局用量；
 * 这里只做缓存与去重，不参与请求调度。缓存由 server.py 在转发时写入。
 */
import { ref } from 'vue'
import { requestJson } from '../utils/apiClient'

const files = ref({})
const stats = ref(null)
let seq = 0
let lastKey = ''
let lastAt = 0

/** 同一服务 30 秒内不重复拉取，避免频繁小请求 */
const MIN_INTERVAL_MS = 30_000

/**
 * 刷新某服务的缓存状态。
 * tailBytes 是当前设置的尾部大小：只有同区间才会真正命中，必须按它过滤，
 * 否则用户改了「尾部下载」后旧缓存仍显示「本地」，会误判。
 */
async function refresh(host, app, tailBytes = 0, { force = false } = {}) {
  if (!host || !app) {
    files.value = {}
    return
  }
  const key = `${host}|${app}|${tailBytes}`
  const now = Date.now()
  if (!force && key === lastKey && now - lastAt < MIN_INTERVAL_MS) return
  lastKey = key
  lastAt = now
  const my = ++seq
  try {
    const qs = new URLSearchParams({ host, app })
    const data = await requestJson('/api/cache/status?' + qs.toString())
    if (my !== seq) return
    const map = {}
    for (const item of data.files || []) {
      if (tailBytes && Number(item.tail) !== Number(tailBytes)) continue
      map[item.file] = item
    }
    files.value = map
    stats.value = data.stats || null
  } catch {
    if (my === seq) files.value = {}
  }
}

/** 本地缓存变更后（命中/淘汰）可强制刷新一次 */
function invalidate() {
  lastKey = ''
  lastAt = 0
}

export function useLogCache() {
  return { files, stats, refresh, invalidate }
}
