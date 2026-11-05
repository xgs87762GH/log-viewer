import { reactive } from 'vue'
import { THEMES, LOG_PALETTES } from '../constants/themes'
import { CONTEXT_CONFIG, clampContextConfig } from '../constants/logContextConfig'
import { mixHex, withAlpha } from '../utils/color'

/**
 * useSettings - 网站配置管理（模块级单例）
 * 主题色板 → constants/themes.js；色运算 → utils/color.js
 * 本模块：cfg 持久化 + 应用到 CSS 变量 / Element Plus。
 */

const STORAGE_KEY = 'log_viewer_settings'

const DEFAULTS = {
  theme: 'dark',
  colors: JSON.parse(JSON.stringify(THEMES.dark.colors)),
  fonts: {
    ui: "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
    log: "Consolas,'Courier New','Microsoft YaHei',monospace",
  },
  sizes: { base: '14px', log: '13px', lh: '1.65' },
  behavior: {
    autoScroll: true,
    maxLines: 10000,
    wordWrap: true,
    tailMB: 10,
    /** 日志预览超行是否折叠（仅影响展示，不丢数据） */
    foldOverLimit: true,
    /** 开启折叠时：单条日志视觉行数超过该值才折叠；折叠为限高预览，正文不截断 */
    foldMaxLines: 5,
    /** 上下文弹窗：初始前后行数 / 每次懒加载步长 / 单侧累计上限 */
    contextInitialLines: CONTEXT_CONFIG.initialLines,
    contextLazyStep: CONTEXT_CONFIG.lazyStep,
    contextMaxLines: CONTEXT_CONFIG.maxLinesPerSide,
  },
}

function deepMerge(base, ext) {
  const result = { ...base }
  for (const k in ext) {
    if (ext[k] && typeof ext[k] === 'object' && !Array.isArray(ext[k])) {
      result[k] = deepMerge(base[k] ?? {}, ext[k])
    } else {
      result[k] = ext[k]
    }
  }
  return result
}

const cfg = reactive(JSON.parse(JSON.stringify(DEFAULTS)))
const state = reactive({ visible: false })

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) Object.assign(cfg, deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), JSON.parse(raw)))
  } catch {}
  // 预设主题始终用代码里的最新色板，避免旧缓存与 Element Plus 映射不一致
  if (THEMES[cfg.theme]) {
    Object.assign(cfg.colors, JSON.parse(JSON.stringify(THEMES[cfg.theme].colors)))
  }
  // 去掉悬停撑开后，旧设置里 wordWrap=false 会导致超长行完全看不见 → 一次性改回默认开
  try {
    const flag = 'log_viewer_wordwrap_on_v1'
    if (!localStorage.getItem(flag)) {
      cfg.behavior.wordWrap = true
      localStorage.setItem(flag, '1')
      save()
    }
  } catch {}
}

/** 模块加载即读本地设置，避免首屏 fetch 仍用默认 tailMB/maxLines */
load()

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {}
}

function apply() {
  const root = document.documentElement
  const style = root.style
  const c = cfg.colors
  const themeKey = THEMES[cfg.theme] ? cfg.theme : 'custom'
  const log = LOG_PALETTES[themeKey] || LOG_PALETTES.dark
  const dark = themeKey !== 'light'

  const level = { info: c.info, warn: c.warn, err: c.err, dbg: c.dbg, trc: c.trc }
  const levelVars = {}
  for (const [k, hex] of Object.entries(level)) {
    levelVars[`--${k}-bg`] = withAlpha(hex, 0.12)
    levelVars[`--${k}-bd`] = withAlpha(hex, 0.28)
  }

  // 主题感知的表面效果：阴影强度、顶边高光、渐变与焦点环按明暗分别派生，
  // 组件只消费语义 token，不再各自写死 rgba / px。
  const surface = dark
    ? {
        '--sh-1': `0 1px 2px ${withAlpha('#000000', 0.4)}, 0 4px 14px ${withAlpha('#000000', 0.22)}`,
        '--sh-2': `0 8px 24px ${withAlpha('#000000', 0.34)}, 0 20px 44px ${withAlpha('#000000', 0.2)}`,
        '--sh-3': `0 24px 64px ${withAlpha('#000000', 0.5)}`,
        '--hi': themeKey === 'warm' ? 'rgba(255,228,190,.09)' : 'rgba(255,255,255,.075)',
        '--grad-surface': `linear-gradient(160deg, ${withAlpha('#ffffff', 0.05)} 0%, ${withAlpha(c.ac, 0.03)} 100%)`,
        '--grad-glow': `radial-gradient(1100px 420px at 12% -12%, ${withAlpha(c.ac, 0.16)}, transparent 70%)`,
        '--ring': withAlpha(c.ac, 0.32),
      }
    : {
        '--sh-1': `0 1px 2px ${withAlpha('#1f2328', 0.06)}, 0 3px 10px ${withAlpha('#1f2328', 0.05)}`,
        '--sh-2': `0 6px 18px ${withAlpha('#1f2328', 0.1)}, 0 16px 36px ${withAlpha('#1f2328', 0.07)}`,
        '--sh-3': `0 20px 56px ${withAlpha('#1f2328', 0.2)}`,
        '--hi': 'rgba(255,255,255,.92)',
        '--grad-surface': `linear-gradient(160deg, ${withAlpha('#ffffff', 0.92)} 0%, ${withAlpha(c.ac, 0.035)} 100%)`,
        '--grad-glow': `radial-gradient(1100px 420px at 12% -12%, ${withAlpha(c.ac, 0.12)}, transparent 70%)`,
        '--ring': withAlpha(c.ac, 0.24),
      }
  surface['--grad-accent'] = `linear-gradient(135deg, ${c.ac}, ${c.ac2})`
  surface['--surf-hover'] = withAlpha(c.ac, 0.07)
  surface['--surf-active'] = withAlpha(c.ac, 0.13)

  const vars = {
    '--bg': c.bg, '--s1': c.s1, '--s2': c.s2, '--bd': c.bd, '--bd2': c.bd2,
    '--t1': c.t1, '--t2': c.t2, '--t3': c.t3,
    '--ac': c.ac, '--ac2': c.ac2,
    '--info': c.info, '--warn': c.warn, '--err': c.err, '--dbg': c.dbg, '--trc': c.trc,
    ...levelVars,
    ...surface,
    '--font-ui': cfg.fonts.ui, '--font-log': cfg.fonts.log,
    '--fs-base': cfg.sizes.base, '--fs-log': cfg.sizes.log, '--lh-log': cfg.sizes.lh,

    // Element Plus：表面 / 文字 / 边框 / 圆角 / 阴影 / 过渡统一接到当前主题
    '--el-color-primary': c.ac,
    '--el-color-primary-dark-2': mixHex(c.ac, '#000000', 0.2),
    '--el-color-primary-light-3': mixHex(c.ac, c.bg, 0.35),
    '--el-color-primary-light-5': mixHex(c.ac, c.bg, 0.55),
    '--el-color-primary-light-7': mixHex(c.ac, c.bg, 0.72),
    '--el-color-primary-light-8': mixHex(c.ac, c.bg, 0.82),
    '--el-color-primary-light-9': mixHex(c.ac, c.bg, 0.9),
    '--el-bg-color': c.s1,
    '--el-bg-color-page': c.bg,
    '--el-bg-color-overlay': c.s2,
    '--el-text-color-primary': c.t1,
    '--el-text-color-regular': c.t2,
    '--el-text-color-secondary': c.t3,
    '--el-text-color-placeholder': c.t3,
    '--el-border-color': c.bd,
    '--el-border-color-light': c.bd2,
    '--el-border-color-lighter': mixHex(c.bd, c.s2, 0.4),
    '--el-border-color-extra-light': mixHex(c.bd, c.s1, 0.5),
    '--el-fill-color': c.s2,
    '--el-fill-color-light': mixHex(c.s2, c.s1, 0.35),
    '--el-fill-color-lighter': mixHex(c.s2, c.s1, 0.55),
    '--el-fill-color-blank': c.s1,
    '--el-fill-color-dark': mixHex(c.s2, '#000000', 0.15),
    '--el-fill-color-darker': mixHex(c.s2, '#000000', 0.25),
    '--el-mask-color': withAlpha('#000000', dark ? 0.55 : 0.4),
    '--el-box-shadow': surface['--sh-3'],
    '--el-box-shadow-light': surface['--sh-2'],
    '--el-box-shadow-lighter': surface['--sh-1'],
    '--el-border-radius-base': '10px',
    '--el-border-radius-small': '7px',
    '--el-border-radius-round': '999px',
    '--el-transition-duration': '.2s',
    '--el-transition-duration-fast': '.12s',

    // 日志区
    '--log-bg': log.bg,
    '--log-fg': log.fg,
    '--log-muted': log.muted,
    '--log-num': log.num,
    '--log-sql-tag': log.sqlTag,
    '--log-sql-kw': log.sqlKw,
    '--log-sql-str': log.sqlStr,
    '--log-res': log.res,
  }

  for (const [k, v] of Object.entries(vars)) style.setProperty(k, v)

  root.classList.toggle('dark', dark)
  root.classList.toggle('theme-warm', themeKey === 'warm')
  root.classList.toggle('theme-dark', themeKey === 'dark')
  root.classList.toggle('theme-light', themeKey === 'light')
  root.dataset.theme = themeKey
}

function setTheme(name) {
  if (THEMES[name]) {
    Object.assign(cfg.colors, JSON.parse(JSON.stringify(THEMES[name].colors)))
    cfg.theme = name
    apply(); save()
  }
}

function setColor(key, value) {
  cfg.colors[key] = value
  cfg.theme = 'custom'
  apply(); save()
}

function setFont(key, value) {
  cfg.fonts[key] = value
  apply(); save()
}

function setSize(key, value) {
  cfg.sizes[key] = value
  apply(); save()
}

function setBehavior(key, value) {
  cfg.behavior[key] = value
  save()
}

/** 拉取日志时统一读取（保证已 load，且数值合法） */
function getFetchLimits() {
  const b = cfg.behavior || {}
  const maxLines = Math.min(100000, Math.max(1000, Number(b.maxLines) || 10000))
  const tailMB = Math.min(100, Math.max(1, Number(b.tailMB) || 10))
  return { maxLines, tailMB, tailBytes: Math.round(tailMB * 1024 * 1024) }
}

function reset() {
  const prevLimits = getFetchLimits()
  Object.assign(cfg, JSON.parse(JSON.stringify(DEFAULTS)))
  apply(); save()
  const nextLimits = getFetchLimits()
  notifyCommit({
    needsReload:
      prevLimits.maxLines !== nextLimits.maxLines ||
      prevLimits.tailMB !== nextLimits.tailMB,
  })
}

function open() {
  state.visible = true
}

function close() {
  state.visible = false
}

const commitListeners = new Set()

function onCommit(fn) {
  commitListeners.add(fn)
  return () => commitListeners.delete(fn)
}

function notifyCommit(meta = {}) {
  for (const fn of commitListeners) {
    try { fn(meta) } catch (e) { console.warn('settings commit listener', e) }
  }
}

function commit(snap) {
  if (!snap) return
  const prevLimits = getFetchLimits()
  if (snap.theme != null) cfg.theme = snap.theme
  if (snap.colors) Object.assign(cfg.colors, snap.colors)
  if (snap.fonts) Object.assign(cfg.fonts, snap.fonts)
  if (snap.sizes) Object.assign(cfg.sizes, snap.sizes)
  if (snap.behavior) Object.assign(cfg.behavior, snap.behavior)
  apply()
  save()
  const nextLimits = getFetchLimits()
  const needsReload =
    prevLimits.maxLines !== nextLimits.maxLines ||
    prevLimits.tailMB !== nextLimits.tailMB
  notifyCommit({ needsReload })
}

/** 上下文弹窗统一读取（旧 localStorage 快照缺字段时由 clamp 兜底） */
function getContextConfig() {
  const b = cfg.behavior || {}
  return clampContextConfig({
    initialLines: b.contextInitialLines,
    lazyStep: b.contextLazyStep,
    maxLinesPerSide: b.contextMaxLines,
  })
}

const instance = {
  cfg, state, THEMES, DEFAULTS,
  load, save, apply, setTheme, setColor, setFont, setSize, setBehavior, getFetchLimits,
  getContextConfig, commit, onCommit, reset, open, close,
}

export function useSettings() {
  return instance
}
