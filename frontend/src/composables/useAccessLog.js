import { usePresence } from './usePresence'

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
  // fire-and-forget
  fetch('/api/access/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}

const instance = { track, ACTION }

export function useAccessLog() {
  return instance
}
