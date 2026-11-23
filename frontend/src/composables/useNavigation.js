import { reactive, computed } from 'vue'
import { LOG_LEVELS } from '../constants/logLevels'
import { useLogs } from './useLogs'
import { useAccessLog } from './useAccessLog'
import { useNavPrefs } from './useNavPrefs'

/**
 * useNavigation —— UI 导航状态（模块级单例）
 *
 * 地址栏同步（无 vue-router）：
 *   ?view=viewer&env=TEST&app=demo-app&host=127.0.0.1&level=INFO&file=...
 * 刷新 / 分享链接可还原；用 app(+host) 定位模块，避免 idx 漂移。
 */

import { NAV_L1_KEY, NAV_L2_KEY } from '../constants/storageKeys.js'
const L1_KEY = NAV_L1_KEY
const L2_KEY = NAV_L2_KEY
const VIEWS = new Set(['dashboard', 'viewer', 'stats', 'settings'])

const state = reactive({
  view: 'dashboard',
  env: 'DEV',
  selectedIdx: 0,
  selectedLevel: 'INFO',
  /** 当前服务下选中的主机（多实例部署时切换）；空表示用服务的默认 host */
  activeHost: '',
  /** 地址栏中的历史文件名（可选） */
  routeFile: '',
  navL1Collapsed: localStorage.getItem(L1_KEY) === '1',
  navL2Collapsed: localStorage.getItem(L2_KEY) === '1',
})

const logs = useLogs()
const access = useAccessLog()
const prefs = useNavPrefs()

const services = computed(() => logs.getServices(state.env))
const currentService = computed(() => services.value[state.selectedIdx])
/** 当前实际请求使用的主机：多实例服务下由用户切换，否则回落默认 host */
const currentHost = computed(() => {
  const svc = currentService.value
  const hosts = logs.getServiceHosts(svc)
  if (state.activeHost && hosts.includes(state.activeHost)) return state.activeHost
  return svc?.host || hosts[0] || ''
})
const mro = computed(() => logs.getMro(state.env))
const currentEnvInfo = computed(() => logs.envs?.[state.env] ?? {})
const envKeys = computed(() => Object.keys(logs.envs || {}))

let urlReady = false
let syncingFromUrl = false
let writeTimer = 0

function getLevels(svc) {
  // 当前服务用活动主机（可能被用户切换过），其它服务用各自默认 host
  const host = svc && svc === currentService.value ? currentHost.value : (svc?.host || '')
  return logs.getLevels(host, svc.app, svc.levels, state.env)
}

function getServicesForEnv(envKey) {
  return logs.getServices(envKey)
}

function persistFlag(key, on) {
  try {
    const write = () => localStorage.setItem(key, on ? '1' : '0')
    if (typeof requestIdleCallback === 'function') requestIdleCallback(write)
    else setTimeout(write, 0)
  } catch {}
}

function findServiceIndex(env, app, host) {
  const list = logs.getServices(env)
  if (!app) return -1
  if (host) {
    const exact = list.findIndex((s) => s.app === app && logs.getServiceHosts(s).includes(host))
    if (exact >= 0) return exact
  }
  return list.findIndex((s) => s.app === app)
}

function buildQuery() {
  const q = new URLSearchParams()
  q.set('view', state.view)
  if (state.env) q.set('env', state.env)
  if (state.view === 'viewer') {
    const svc = logs.getServices(state.env)[state.selectedIdx]
    if (svc) {
      q.set('app', svc.app)
      q.set('host', currentHost.value || svc.host)
      q.set('level', state.selectedLevel)
      if (state.routeFile) q.set('file', state.routeFile)
    } else {
      q.set('level', state.selectedLevel)
    }
  }
  return q
}

function writeUrl() {
  if (!urlReady || syncingFromUrl || typeof history === 'undefined') return
  const qs = buildQuery().toString()
  const next = `${location.pathname}${qs ? `?${qs}` : ''}`
  const cur = `${location.pathname}${location.search}`
  if (next === cur) return
  history.replaceState(null, '', next)
}

function scheduleWriteUrl() {
  if (!urlReady || syncingFromUrl) return
  clearTimeout(writeTimer)
  writeTimer = setTimeout(writeUrl, 0)
}

function applySearchParams(search = location.search) {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  syncingFromUrl = true
  try {
    const view = q.get('view')
    if (VIEWS.has(view)) state.view = view

    const env = q.get('env')
    if (env && (logs.envs?.[env] || Object.keys(logs.envs || {}).includes(env))) {
      state.env = env
    }

    const app = q.get('app')
    const host = q.get('host') || ''
    const idx = findServiceIndex(state.env, app, host)
    if (idx >= 0) {
      state.selectedIdx = idx
      const svc = logs.getServices(state.env)[idx]
      const hosts = logs.getServiceHosts(svc)
      state.activeHost = host && hosts.includes(host) ? host : (svc?.host || '')
    }

    const level = q.get('level')
    if (level && LOG_LEVELS.includes(level)) state.selectedLevel = level

    const file = q.get('file')
    state.routeFile = file || ''
  } finally {
    syncingFromUrl = false
  }
}

/** 配置加载完成后调用一次；之后状态变更自动写回地址栏 */
function initUrlSync() {
  if (urlReady) return
  applySearchParams()
  urlReady = true
  writeUrl()
  window.addEventListener('popstate', () => {
    applySearchParams()
  })
}

function reload() {
  state.navL1Collapsed = localStorage.getItem(L1_KEY) === '1'
  state.navL2Collapsed = localStorage.getItem(L2_KEY) === '1'
}

function setView(view) {
  if (!VIEWS.has(view) || view === state.view) return
  state.view = view
  if (view !== 'viewer') state.routeFile = ''
  scheduleWriteUrl()
}

function toggleNavL1() {
  state.navL1Collapsed = !state.navL1Collapsed
  persistFlag(L1_KEY, state.navL1Collapsed)
}

function toggleNavL2() {
  state.navL2Collapsed = !state.navL2Collapsed
  persistFlag(L2_KEY, state.navL2Collapsed)
}

function selectEnv(env) {
  if (env === state.env) return
  state.env = env
  state.selectedIdx = 0
  state.routeFile = ''
  access.track(access.ACTION.SWITCH_ENV, { env })
  scheduleWriteUrl()
}

function selectService(idx) {
  if (idx === state.selectedIdx) return
  state.selectedIdx = idx
  state.activeHost = logs.getServices(state.env)[idx]?.host || ''
  state.routeFile = ''
  scheduleWriteUrl()
}

function selectEnvService(env, idx) {
  const same = env === state.env && idx === state.selectedIdx
  state.env = env
  state.selectedIdx = idx
  state.activeHost = logs.getServices(env)[idx]?.host || ''
  if (state.view !== 'viewer') state.view = 'viewer'
  if (!same) state.routeFile = ''
  scheduleWriteUrl()
}

/** 打开日志；host 可选，仪表盘的实例卡片用它把选中实例带到日志页 */
function openLog(idx, level, env = state.env, host = '') {
  const svc = logs.getServices(env)[idx]
  state.env = env
  state.selectedIdx = idx
  const hosts = logs.getServiceHosts(svc)
  state.activeHost = host && hosts.includes(host) ? host : (svc?.host || '')
  if (LOG_LEVELS.includes(level)) state.selectedLevel = level
  state.view = 'viewer'
  state.routeFile = ''
  if (svc) {
    access.track(access.ACTION.VIEW_LOG, {
      env,
      module: svc.module || '',
      app: svc.app || '',
      level: state.selectedLevel,
    })
    // 只有真正打开日志才计入「最近访问」，仅选中模块不记录，避免污染
    prefs.recordRecent(env, svc.app)
  }
  scheduleWriteUrl()
}

/** 切换当前服务的主机（多实例部署）；host 必须属于该服务 */
function setHost(host) {
  const svc = currentService.value
  if (!svc) return
  if (!logs.getServiceHosts(svc).includes(host)) return
  if (host === currentHost.value) return
  state.activeHost = host
  state.routeFile = ''
  scheduleWriteUrl()
}

function setLevel(level) {
  if (!LOG_LEVELS.includes(level) || level === state.selectedLevel) return
  state.selectedLevel = level
  state.routeFile = ''
  scheduleWriteUrl()
}

/** 历史文件写入地址栏（LogViewer 选文件后调用） */
function setRouteFile(name) {
  const next = name || ''
  if (next === state.routeFile) return
  state.routeFile = next
  scheduleWriteUrl()
}

const instance = Object.assign(state, {
  services,
  currentService,
  currentHost,
  mro,
  currentEnvInfo,
  envKeys,
  getLevels,
  getServicesForEnv,
  setView,
  toggleNavL1,
  toggleNavL2,
  selectEnv,
  selectService,
  selectEnvService,
  openLog,
  setHost,
  setLevel,
  setRouteFile,
  initUrlSync,
  reload,
})

export function useNavigation() {
  return instance
}
