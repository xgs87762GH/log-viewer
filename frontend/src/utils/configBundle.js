/**
 * 配置归档 —— 配置段的唯一定义 + 纯函数（组装 / 校验 / 摘要 / 文件名）。
 * 网络与 localStorage 读写由 composables/useConfigTransfer.js 按这里声明的
 * scope / storage 执行；新增配置段只需在 SECTION_DEFS 加一项。
 *
 * 结构：{ app, schema, version, exportedAt, sections: { ... } }
 * 凭据（.env）永不进归档；access 段含 IP 白名单，导出时单独标注。
 */
import {
  INDEX_STORAGE_KEY,
  FILTER_HISTORY_KEY,
  NAV_L1_KEY,
  NAV_L2_KEY,
  DRAWER_STORAGE_KEY,
} from '../constants/storageKeys.js'

export const BUNDLE_APP = 'log-viewer'
export const BUNDLE_SCHEMA = 1

/**
 * 段描述符：
 *   shape     归档里的类型（object / array）
 *   scope     server = /api/config/* 读写，用 serverKey 映射后端字段；local = localStorage
 *   storage   local 段的读写声明（kind: settings / json / flags）
 *   summarize 导入预览摘要（纯函数，缺省显示 '—'）
 */
export const SECTION_DEFS = [
  {
    key: 'services',
    label: '服务与环境配置',
    hint: 'config/logs.json，含内网地址',
    shape: 'object',
    scope: 'server',
    serverKey: 'logs',
    summarize: (v) => {
      const envs = Object.values(v?.environments || {})
      return `${envs.length} 个环境 / ${envs.reduce((n, e) => n + (e?.services?.length || 0), 0)} 个服务`
    },
  },
  {
    key: 'access',
    label: '访问统计配置',
    hint: 'config/access.json，含 IP 白名单',
    sensitive: true,
    shape: 'object',
    scope: 'server',
    serverKey: 'access',
    summarize: (v) => `${(v?.statsAllowIps || []).length} 个白名单 IP`,
  },
  {
    key: 'settings',
    label: '主题与偏好设置',
    hint: '主题、字体、阅读与加载行为',
    shape: 'object',
    scope: 'local',
    storage: { kind: 'settings' },
    summarize: (v) => `主题 ${v?.theme || '默认'}`,
  },
  {
    key: 'fileIndex',
    label: '日志文件名索引',
    hint: '已探测的归档列表，免重新扫描目录',
    shape: 'object',
    scope: 'local',
    storage: { kind: 'json', key: INDEX_STORAGE_KEY },
    summarize: (v) => `${Object.keys(v?.entries || {}).length} 个模块`,
  },
  {
    key: 'filterHistory',
    label: '过滤条件历史',
    hint: '最近使用的过滤组合',
    shape: 'array',
    scope: 'local',
    storage: { kind: 'json', key: FILTER_HISTORY_KEY },
    summarize: (v) => `${v.length} 条历史`,
  },
  {
    key: 'uiState',
    label: '界面状态',
    hint: '导航折叠、搜索工具抽屉固定态',
    shape: 'object',
    scope: 'local',
    storage: {
      kind: 'flags',
      fields: { navL1: NAV_L1_KEY, navL2: NAV_L2_KEY, drawer: DRAWER_STORAGE_KEY },
    },
    summarize: () => '导航折叠 / 抽屉固定',
  },
]

export const ALL_SECTIONS = SECTION_DEFS.map((s) => s.key)
export const BACKEND_SECTIONS = SECTION_DEFS.filter((s) => s.scope === 'server').map((s) => s.key)
export const LOCAL_SECTIONS = SECTION_DEFS.filter((s) => s.scope === 'local').map((s) => s.key)

function hasShape(def, value) {
  return def.shape === 'array'
    ? Array.isArray(value)
    : typeof value === 'object' && !Array.isArray(value)
}

export function buildBundle(sections = {}, { version = '', exportedAt = '' } = {}) {
  const out = {}
  for (const def of SECTION_DEFS) {
    const value = sections[def.key]
    if (value == null || !hasShape(def, value)) continue
    out[def.key] = value
  }
  return {
    app: BUNDLE_APP,
    schema: BUNDLE_SCHEMA,
    version: String(version || ''),
    exportedAt: exportedAt || new Date().toISOString(),
    sections: out,
  }
}

/** @returns {{ok:true, bundle:object}|{ok:false, error:string}} */
export function parseBundle(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch {
    return { ok: false, error: '文件不是合法 JSON' }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '配置格式不正确' }
  }
  if (raw.app !== BUNDLE_APP) return { ok: false, error: '不是 Log Viewer 配置文件' }
  if (raw.schema !== BUNDLE_SCHEMA) {
    return { ok: false, error: `配置版本不兼容（schema=${raw.schema}）` }
  }
  if (!raw.sections || typeof raw.sections !== 'object' || Array.isArray(raw.sections)) {
    return { ok: false, error: '缺少 sections 配置段' }
  }

  const sections = {}
  for (const def of SECTION_DEFS) {
    const value = raw.sections[def.key]
    if (value == null) continue
    if (!hasShape(def, value)) return { ok: false, error: `配置段 ${def.key} 格式不正确` }
    sections[def.key] = value
  }
  if (!Object.keys(sections).length) return { ok: false, error: '文件中没有可导入的配置段' }

  return {
    ok: true,
    bundle: {
      app: BUNDLE_APP,
      schema: BUNDLE_SCHEMA,
      version: String(raw.version || ''),
      exportedAt: String(raw.exportedAt || ''),
      sections,
    },
  }
}

/** 导入预览：每段是否存在、将覆盖什么；新段忘写 summarize 也不会崩 */
export function summarizeBundle(bundle) {
  const s = bundle?.sections || {}
  return SECTION_DEFS.map((def) => {
    const present = Object.prototype.hasOwnProperty.call(s, def.key)
    return {
      key: def.key,
      label: def.label,
      hint: def.hint,
      backend: def.scope === 'server',
      sensitive: !!def.sensitive,
      present,
      detail: present ? (def.summarize?.(s[def.key]) ?? '—') : '',
    }
  })
}

export function bundleFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = [
    now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()),
    '-', pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds()),
  ].join('')
  return `log-viewer-config-${stamp}.json`
}
