/**
 * useVersionCheck —— 页面加载时检查 GitHub 最新 tag（模块级单例）
 *
 * 版本解析 → utils/versionCheck.js；网络 → utils/apiClient.js
 * 只读公开端点、1 小时缓存、失败静默降级，不发送任何内网信息。
 */
import { reactive } from 'vue'
import { requestJson } from '../utils/apiClient'
import {
  pickLatestTag, isUpdateAvailable, shouldRecheck, parseCheckCache,
} from '../utils/versionCheck'
import { GITHUB_TAGS_API } from '../constants/versionCheck'
import { VERSION_CHECK_KEY } from '../constants/storageKeys'
import { VERSION_CHECK_TTL_MS, VERSION_CHECK_TIMEOUT_MS } from '../constants/timing'
import { APP_VERSION } from '../constants/version'

const state = reactive({
  latest: '',
  status: 'idle', // idle | up-to-date | available | unavailable
  checkedAt: 0,
})

let inflight = null

function readCache() {
  try {
    return parseCheckCache(localStorage.getItem(VERSION_CHECK_KEY))
  } catch {
    return null
  }
}

function writeCache(latest, checkedAt) {
  try {
    localStorage.setItem(VERSION_CHECK_KEY, JSON.stringify({ latest, checkedAt }))
  } catch {
    /* 存储不可用：仅本次会话内有效，不阻断提示 */
  }
}

function apply(latest, checkedAt) {
  state.latest = latest
  state.checkedAt = checkedAt
  state.status = isUpdateAvailable(APP_VERSION, latest) ? 'available' : 'up-to-date'
}

async function fetchLatest() {
  const tags = await requestJson(GITHUB_TAGS_API, {
    timeoutMs: VERSION_CHECK_TIMEOUT_MS,
    cache: 'no-store',
  })
  const best = pickLatestTag(tags)
  if (!best) throw new Error('未找到语义化版本 tag')
  return best.version
}

/** 页面加载时调用；缓存未过期则跳过网络，force 可强制重新检测 */
function check({ force = false } = {}) {
  const cached = readCache()
  if (cached) apply(cached.latest, cached.checkedAt)
  if (!force && cached && !shouldRecheck(cached.checkedAt, Date.now(), VERSION_CHECK_TTL_MS)) {
    return Promise.resolve(state.status)
  }
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const latest = await fetchLatest()
      const at = Date.now()
      apply(latest, at)
      writeCache(latest, at)
    } catch {
      // 内网不通 / 限流 / 超时：静默降级，保留已知结果
      if (!cached) state.status = 'unavailable'
    } finally {
      inflight = null
    }
    return state.status
  })()
  return inflight
}

const instance = Object.assign(state, { check })

let singleton = null
export function useVersionCheck() {
  if (!singleton) singleton = instance
  return singleton
}
