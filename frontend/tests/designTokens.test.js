import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEMES, LOG_PALETTES } from '../src/constants/themes.js'
import { withAlpha, mixHex } from '../src/utils/color.js'

const readSrc = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const css = readSrc('../src/styles/global.css')
const settings = readSrc('../src/composables/useSettings.js')

const COLOR_KEYS = [
  'bg', 's1', 's2', 'bd', 'bd2', 't1', 't2', 't3', 'ac', 'ac2',
  'info', 'warn', 'err', 'dbg', 'trc',
]
const SURFACE_TOKENS = [
  '--sh-1', '--sh-2', '--sh-3', '--hi', '--grad-surface', '--grad-glow',
  '--ring', '--grad-accent', '--surf-hover', '--surf-active',
]

test('三套主题都有完整色板与日志色板', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const k of COLOR_KEYS) {
      assert.match(theme.colors[k], /^#[0-9a-f]{6}$/i, `${name}.${k}`)
    }
    assert.ok(LOG_PALETTES[name], `${name} 缺日志色板`)
    for (const [k, v] of Object.entries(LOG_PALETTES[name])) {
      assert.match(v, /^#[0-9a-f]{6}$/i, `${name}.log.${k}`)
    }
  }
})

test('三套主题都能派生合法的表面效果', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const c = theme.colors
    const dark = name !== 'light'
    assert.match(withAlpha(c.ac, 0.12), /^rgba\(\d+, \d+, \d+, [\d.]+\)$/, `${name} alpha`)
    assert.match(mixHex(c.ac, c.bg, 0.35), /^#[0-9a-f]{6}$/i, `${name} mix`)
    assert.ok(withAlpha('#000000', dark ? 0.34 : 0.1).includes('rgba('))
  }
})

test('语义 token 同时具备 CSS fallback 与运行时注入', () => {
  for (const t of ['--r-sm', '--r-lg', '--r-xl', '--sp-3', '--dur', '--ease']) {
    assert.ok(css.includes(`${t}:`), `global.css 缺 ${t} fallback`)
  }
  for (const t of SURFACE_TOKENS) {
    assert.ok(css.includes(`${t}:`), `global.css 缺 ${t} fallback`)
    assert.ok(settings.includes(`'${t}'`), `useSettings 未注入 ${t}`)
  }
})

test('Element Plus 圆角 / 阴影 / 过渡已桥接当前主题', () => {
  for (const t of ['--el-border-radius-base', '--el-box-shadow', '--el-transition-duration']) {
    assert.ok(settings.includes(`'${t}'`), `未桥接 ${t}`)
  }
})
