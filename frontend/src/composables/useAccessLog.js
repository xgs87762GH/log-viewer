import { usePresence } from './usePresence'
import { requestJson } from '../utils/apiClient'

/**
 * useAccessLog —— 访问埋点（不碰 DOM）
 * track(action, payload) 异步上报，失败静默。
 */

const ACTION = {
  OPEN_DASHBOARD: 'open_dashboard',
  OPEN_STATS: 'open_stats',
  VIEW_LOG: 'view_log',
  SWITCH_ENV: 'switch_env',
  COPY_LINKS: 'copy_links',
  DOWNLOAD_LOG: 'download_log',
  SHOW_CONTEXT: 'show_context',
}

function track(action, payload = {}) {
  const { state } = usePresence()
  if (state.enabled === false) return
  const body = {
    sid: state.sid || undefined,
    action,
    env: payload.env || '',
    module: payload.module || '',
    app: payload.app || '',
    level: payload.level || '',
    detail: payload.detail || '',
  }
  // fire-and-forget：失败静默，不阻塞交互
  requestJson('/api/access/event', { method: 'POST', body }).catch(() => {})
}

const instance = { track, ACTION }

export function useAccessLog() {
  return instance
}
