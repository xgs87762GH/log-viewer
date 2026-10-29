import { reactive } from 'vue'

/**
 * usePresence —— 会话心跳（在线）
 * sid 存 sessionStorage；页面存活期间定时 ping。
 */

const SID_KEY = 'log_viewer_access_sid'
const state = reactive({
  sid: sessionStorage.getItem(SID_KEY) || '',
  ip: '',
  onlineCount: 0,
  canViewStats: false,
  enabled: true,
  ready: false,
  error: '',
})

let pingTimer = 0

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function get(path) {
  const res = await fetch(path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function start() {
  try {
    const me = await get('/api/access/me')
    state.enabled = me.enabled !== false
    state.ip = me.ip || ''
    state.canViewStats = !!me.canViewStats
    if (!state.enabled) {
      state.ready = true
      return
    }
    const data = await post('/api/access/hello', {
      sid: state.sid || undefined,
      ua: navigator.userAgent,
    })
    state.sid = data.sid
    state.onlineCount = data.onlineCount || 0
    if (data.ip) state.ip = data.ip
    sessionStorage.setItem(SID_KEY, state.sid)
    state.ready = true
    schedulePing()
  } catch (e) {
    state.error = e.message
    state.ready = true
  }
}

function schedulePing() {
  clearInterval(pingTimer)
  pingTimer = window.setInterval(async () => {
    if (!state.sid) return
    try {
      const data = await post('/api/access/ping', { sid: state.sid })
      if (data.sid && data.sid !== state.sid) {
        state.sid = data.sid
        sessionStorage.setItem(SID_KEY, state.sid)
      }
      if (typeof data.onlineCount === 'number') state.onlineCount = data.onlineCount
    } catch {
      /* 忽略单次失败 */
    }
  }, 25000)
}

function stop() {
  clearInterval(pingTimer)
  pingTimer = 0
}

const instance = { state, start, stop }

export function usePresence() {
  return instance
}

/** 在根组件挂载时调用一次 */
export function setupPresenceLifecycle() {
  start()
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', stop)
  }
}
