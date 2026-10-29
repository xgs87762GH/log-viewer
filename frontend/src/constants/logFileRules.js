/**
 * 日志文件名匹配规则 —— 唯一配置源（高内聚）
 *
 * 审核 / 增删命名约定只改本文件；发现引擎见 composables/useLogs.js。
 *
 * 默认约定（Logback SizeAndTimeBasedRolling，实测 LogIndex 目录）：
 *   活跃: {app}_{level}.log          例 demo-app_info.log
 *   归档: {app}_{level}_{date}_{idx}.log  例 demo-app_info_2026-09-21_0.log
 *
 * 占位符：
 *   {app}   应用名（原样）
 *   {level} 级别小写 info/warn/...
 *   {LEVEL} 级别大写 INFO/WARN/...
 *   {date}  日期（默认 yyyy-MM-dd）
 *   {idx}   滚动序号（默认纯数字）
 *
 * 服务可在 config/logs.json 覆盖（优先级：service > env > root > 本默认）：
 *   "logFile": { "preset": "app-level-date-idx" }
 *   或 "logFile": { "active": "...", "archive": "..." }
 */

/** 日期 / 序号默认片段（写入正则时不再二次转义） */
export const DATE_FRAGMENT = String.raw`\d{4}-\d{2}-\d{2}`
export const IDX_FRAGMENT = String.raw`\d+`

/**
 * @typedef {object} LogFileRule
 * @property {string} id
 * @property {string} [desc]
 * @property {string} active   活跃文件模板
 * @property {string} [archive] 归档模板；省略则只认活跃文件
 * @property {'lower'|'upper'} [levelCase=lower]
 */

/** @type {Record<string, LogFileRule>} */
export const LOG_FILE_PRESETS = {
  /** 主流：app_level.log / app_level_yyyy-MM-dd_i.log */
  'app-level-date-idx': {
    id: 'app-level-date-idx',
    desc: '{app}_{level}.log + {app}_{level}_{date}_{idx}.log',
    active: '{app}_{level}.log',
    archive: '{app}_{level}_{date}_{idx}.log',
    levelCase: 'lower',
  },
  /** 无滚动序号：app_level_yyyy-MM-dd.log */
  'app-level-date': {
    id: 'app-level-date',
    desc: '{app}_{level}.log + {app}_{level}_{date}.log',
    active: '{app}_{level}.log',
    archive: '{app}_{level}_{date}.log',
    levelCase: 'lower',
  },
  /** 仅活跃文件（无归档命名） */
  'app-level': {
    id: 'app-level',
    desc: '仅 {app}_{level}.log',
    active: '{app}_{level}.log',
    levelCase: 'lower',
  },
  /** 级别大写：app_INFO.log */
  'app-LEVEL-date-idx': {
    id: 'app-LEVEL-date-idx',
    desc: '{app}_{LEVEL}.log + 归档',
    active: '{app}_{LEVEL}.log',
    archive: '{app}_{LEVEL}_{date}_{idx}.log',
    levelCase: 'upper',
  },
}

export const DEFAULT_PRESET_ID = 'app-level-date-idx'

/** 转义普通文本，保留模板占位符 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 解析配置对象为规则（preset 或显式 active/archive）。
 * @param {object|string|null|undefined} raw
 * @returns {LogFileRule}
 */
export function resolveLogFileRule(raw) {
  if (!raw) return { ...LOG_FILE_PRESETS[DEFAULT_PRESET_ID] }
  if (typeof raw === 'string') {
    const p = LOG_FILE_PRESETS[raw]
    return p ? { ...p } : { ...LOG_FILE_PRESETS[DEFAULT_PRESET_ID] }
  }
  if (raw.preset && LOG_FILE_PRESETS[raw.preset]) {
    const base = { ...LOG_FILE_PRESETS[raw.preset] }
    if (raw.active) base.active = raw.active
    if (raw.archive !== undefined) base.archive = raw.archive
    if (raw.levelCase) base.levelCase = raw.levelCase
    return base
  }
  if (raw.active) {
    return {
      id: 'custom',
      desc: 'custom',
      active: raw.active,
      archive: raw.archive,
      levelCase: raw.levelCase === 'upper' ? 'upper' : 'lower',
    }
  }
  return { ...LOG_FILE_PRESETS[DEFAULT_PRESET_ID] }
}

/**
 * 将模板编译为严格全名匹配正则（^...$），并记录捕获组名顺序。
 * @returns {{ re: RegExp, groups: string[] } | null}
 */
export function compileTemplate(template, app, level, rule) {
  if (!template) return null
  const lv =
    (rule.levelCase || 'lower') === 'upper'
      ? String(level).toUpperCase()
      : String(level).toLowerCase()

  const groups = []
  let i = 0
  let out = '^'
  const tokenRe = /\{(app|level|LEVEL|date|idx)\}/g
  let m
  while ((m = tokenRe.exec(template)) !== null) {
    out += escapeRe(template.slice(i, m.index))
    const tok = m[1]
    if (tok === 'app') out += escapeRe(app)
    else if (tok === 'level') out += escapeRe(lv)
    else if (tok === 'LEVEL') out += escapeRe(String(level).toUpperCase())
    else if (tok === 'date') {
      out += '(' + DATE_FRAGMENT + ')'
      groups.push('date')
    } else if (tok === 'idx') {
      out += '(' + IDX_FRAGMENT + ')'
      groups.push('idx')
    }
    i = m.index + m[0].length
  }
  out += escapeRe(template.slice(i)) + '$'
  return { re: new RegExp(out), groups }
}

/** 按规则生成活跃文件名（无索引时的回退） */
export function formatActiveName(app, level, rule) {
  const r = rule || resolveLogFileRule(null)
  const lv =
    (r.levelCase || 'lower') === 'upper'
      ? String(level).toUpperCase()
      : String(level).toLowerCase()
  return (r.active || '{app}_{level}.log')
    .replaceAll('{app}', app)
    .replaceAll('{level}', lv)
    .replaceAll('{LEVEL}', String(level).toUpperCase())
}

/** 当前优先，再按 date+idx 新→旧 */
export function sortFileList(list) {
  return list.slice().sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '')
    return (b.idx || 0) - (a.idx || 0)
  })
}

/** @deprecated 请从 utils/dirListing.js 导入；此处再导出以兼容旧引用 */
export { extractLogNamesFromDirHtml } from '../utils/dirListing.js'

/**
 * 按规则匹配某一级别的全部文件。
 * @returns {Array<{ name: string, date: string|null, idx: number|null, active: boolean, label: string }>}
 */
export function matchLevelFiles(fileNames, app, level, rule) {
  const activeM = compileTemplate(rule.active, app, level, rule)
  const archiveM = compileTemplate(rule.archive, app, level, rule)
  const list = []

  for (const name of fileNames) {
    if (activeM && activeM.re.test(name)) {
      list.push({
        name,
        date: null,
        idx: null,
        active: true,
        label: '当前',
      })
      continue
    }
    if (!archiveM) continue
    const m = archiveM.re.exec(name)
    if (!m) continue
    const captured = {}
    archiveM.groups.forEach((g, i) => {
      captured[g] = m[i + 1]
    })
    const date = captured.date || null
    const idx = captured.idx != null ? parseInt(captured.idx, 10) : null
    let label = date || name
    if (date && idx != null && idx > 0) label = `${date} #${idx}`
    else if (date && idx != null && idx === 0) label = date
    list.push({ name, date, idx, active: false, label })
  }

  return sortFileList(list)
}
