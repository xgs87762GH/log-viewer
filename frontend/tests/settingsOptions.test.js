import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { THEMES } from '../src/constants/themes.js'
import { CONTEXT_CONFIG, CONTEXT_LIMITS } from '../src/constants/logContextConfig.js'
import {
  SETTINGS_SECTIONS,
  colorLabels,
  fontOptions,
  sizeOptions,
} from '../src/constants/settingsOptions.js'

const readSrc = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('分区配置 id 唯一，声明的分区组件都存在', () => {
  const ids = SETTINGS_SECTIONS.map((s) => s.id)
  assert.deepEqual(ids, ['appearance', 'typography', 'behavior', 'config'])
  assert.equal(new Set(ids).size, ids.length)
  for (const s of SETTINGS_SECTIONS) {
    assert.ok(s.label && s.title && s.desc && s.hint && s.icon && s.component, `${s.id} 字段完整`)
    assert.ok(
      existsSync(new URL(`../src/components/settings/${s.component}.vue`, import.meta.url)),
      `${s.component}.vue 分区组件存在`,
    )
  }
})

test('colorLabels 覆盖全部预设色板键', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const key of Object.keys(theme.colors)) {
      assert.ok(colorLabels[key], `${name}.${key} 缺标签`)
    }
  }
  assert.equal(Object.keys(colorLabels).length, Object.keys(THEMES.dark.colors).length)
})

test('fontOptions 与 DEFAULTS 字体一致且无重复项', () => {
  assert.equal(
    fontOptions.ui[0],
    "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
  )
  assert.equal(fontOptions.log[0], "Consolas,'Courier New','Microsoft YaHei',monospace")
  for (const list of Object.values(fontOptions)) {
    assert.ok(list.length >= 2)
    assert.equal(new Set(list).size, list.length)
  }
})

test('sizeOptions 覆盖默认字号 / 行高且取值合法', () => {
  assert.ok(sizeOptions.base.includes('14px'))
  assert.ok(sizeOptions.log.includes('13px'))
  assert.ok(sizeOptions.lh.includes('1.65'))
  for (const [group, list] of Object.entries(sizeOptions)) {
    assert.ok(list.length >= 3, `${group} 选项过少`)
    assert.equal(new Set(list).size, list.length)
    for (const value of list) {
      assert.match(value, group === 'lh' ? /^\d+(\.\d+)?$/ : /^\d+px$/, `${group} ${value}`)
    }
  }
})

test('上下文区间合法，行为分区沿用同一区间源', () => {
  for (const [key, { min, max }] of Object.entries(CONTEXT_LIMITS)) {
    assert.ok(min <= max, `${key} 区间`)
    assert.ok(CONTEXT_CONFIG[key] >= min && CONTEXT_CONFIG[key] <= max, `${key} 默认值`)
  }
  const behavior = readSrc('../src/components/settings/SettingsBehavior.vue')
  for (const key of ['initialLines', 'lazyStep', 'maxLinesPerSide']) {
    assert.ok(behavior.includes(`CONTEXT_LIMITS.${key}.min`), `${key} min 绑定`)
    assert.ok(behavior.includes(`CONTEXT_LIMITS.${key}.max`), `${key} max 绑定`)
  }
})

test('设置页保留草稿提交 / 激活重取语义与视图注册', () => {
  const page = readSrc('../src/components/settings/SettingsPage.vue')
  assert.ok(page.includes('settings.commit(snapshot(draft))'))
  assert.ok(page.includes('onActivated('), '切回页面应重取草稿')
  assert.ok(page.includes('IntersectionObserver'), '分区锚点高亮')
  assert.ok(page.includes('sectionComponents[s.component]'), '分区按常量动态挂载')
  assert.ok(!page.includes("s.id === 'config'"), '不再按 id 硬编码分区分支')
  assert.ok(!page.includes('activeElement.blur()'), '不再使用 DOM 失焦 hack')

  const appearance = readSrc('../src/components/settings/SettingsAppearance.vue')
  assert.ok(appearance.includes('type="button"') && appearance.includes(':aria-pressed'))

  const navigation = readSrc('../src/composables/useNavigation.js')
  assert.ok(navigation.includes("'settings'"), '?view=settings 应被接受')
  const app = readSrc('../src/App.vue')
  assert.ok(app.includes('SettingsPage'))
  assert.ok(!app.includes('SettingsModal'), '弹窗不再常驻挂载')
})
