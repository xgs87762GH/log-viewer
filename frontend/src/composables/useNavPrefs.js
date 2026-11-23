/**
 * 导航偏好：收藏（全局按 app）与最近访问（按 环境|app）。
 *
 * 只做状态与持久化，全部规则走 utils/navPrefs 的纯函数；
 * localStorage 不可用或数据损坏时降级为内存，不抛异常。
 */
import { computed, ref } from 'vue'
import { NAV_FAVORITES_KEY, NAV_RECENTS_KEY } from '../constants/storageKeys'
import {
  pushRecent,
  sanitizeFavorites,
  sanitizeRecents,
  toggleApp,
} from '../utils/navPrefs'

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式 / 配额满：静默降级为内存 */
  }
}

const favorites = ref(sanitizeFavorites(readJson(NAV_FAVORITES_KEY)))
const recents = ref(sanitizeRecents(readJson(NAV_RECENTS_KEY)))

const favoriteSet = computed(() => new Set(favorites.value))

function toggleFavorite(app) {
  const next = toggleApp(favorites.value, app)
  favorites.value = next
  writeJson(NAV_FAVORITES_KEY, next)
}

/** 只在用户真正打开日志时调用（由 useNavigation 统一触发） */
function recordRecent(env, app) {
  if (!env || !app) return
  const next = pushRecent(recents.value, env, app)
  recents.value = next
  writeJson(NAV_RECENTS_KEY, next)
}

export function useNavPrefs() {
  return { favorites, recents, favoriteSet, toggleFavorite, recordRecent }
}
