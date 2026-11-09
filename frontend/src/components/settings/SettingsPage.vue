<template>
  <div ref="pageEl" class="settings-page">
    <header class="set-hero ui-surface">
      <div class="hero-copy">
        <span class="ui-eyebrow">Preferences / 偏好设置</span>
        <h1>让日志中心<span class="ui-grad-text">更适合你</span></h1>
        <p>主题、字体与阅读行为集中在这里调整，另可导入导出配置。偏好改动先编辑为草稿，保存后才会应用到全站；离开本页不会写入。</p>
      </div>
      <div class="hero-side">
        <span class="ui-chip" :class="dirty ? 'ui-chip--warn' : 'ui-chip--ok'">
          <i class="ui-dot" :class="dirty ? 'ui-dot--warn' : 'ui-dot--ok'" />
          {{ dirty ? '有未保存的更改' : '设置已同步' }}
        </span>
        <span class="ui-chip ui-chip--accent">{{ themeLabel }}主题</span>
      </div>
    </header>

    <div class="set-body">
      <nav class="set-nav" aria-label="设置分区">
        <p class="nav-caption">分区导航</p>
        <button
          v-for="s in sections"
          :key="s.id"
          type="button"
          class="nav-item"
          :class="{ on: activeSection === s.id }"
          :aria-current="activeSection === s.id ? 'true' : undefined"
          @click="scrollToSection(s.id)"
        >
          <el-icon :size="16"><component :is="sectionIcons[s.icon]" /></el-icon>
          <span class="nav-text">
            <strong>{{ s.label }}</strong>
            <small>{{ s.hint }}</small>
          </span>
        </button>
        <p class="nav-tip">点击分区可快速定位。主题与颜色不会即时预览，保存后统一生效。</p>
      </nav>

      <div class="set-content">
        <section
          v-for="s in sections"
          :id="`settings-${s.id}`"
          :key="s.id"
          class="set-card ui-surface"
        >
          <header class="card-head">
            <span class="card-icon">
              <el-icon :size="18"><component :is="sectionIcons[s.icon]" /></el-icon>
            </span>
            <div class="card-title">
              <h2>{{ s.title }}</h2>
              <p>{{ s.desc }}</p>
            </div>
          </header>
          <div class="card-body">
            <component :is="sectionComponents[s.component]" v-bind="propsFor(s)" />
          </div>
        </section>
      </div>
    </div>

    <footer class="set-bar">
      <div class="bar-note">
        <el-button link @click="onReset">恢复默认</el-button>
        <span>{{ dirty ? '草稿尚未写入，离开本页不会保存' : '当前设置已与本地存储同步' }}</span>
      </div>
      <div class="bar-actions">
        <el-button :disabled="!dirty" @click="onDiscard">放弃更改</el-button>
        <el-button type="primary" :disabled="!dirty" @click="onSave">保存设置</el-button>
      </div>
    </footer>
  </div>
</template>

<script setup>
/**
 * SettingsPage —— 独立设置视图（keep-alive 内）
 * 草稿只在本组件：进入页面时从 settings.cfg 深拷贝一次，切走即丢弃，不误写入。
 * 保存仍走 settings.commit()，保留 apply/save/onCommit(needsReload) 契约。
 */
import {
  reactive, computed, ref, onMounted, onActivated, onDeactivated, onBeforeUnmount, nextTick,
} from 'vue'
import { Brush, EditPen, Operation, Folder } from '@element-plus/icons-vue'
import { useSettings } from '../../composables/useSettings'
import { useToast } from '../../composables/useToast'
import { clampContextConfig } from '../../constants/logContextConfig'
import { SETTINGS_SECTIONS } from '../../constants/settingsOptions'

// 分区组件按文件名自动发现：新增分区只需放一个 Settings*.vue 并在 SETTINGS_SECTIONS 声明
const modules = import.meta.glob(['./Settings*.vue', '!./SettingsPage.vue'], { eager: true })
const sectionComponents = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [
    path.split('/').pop().replace('.vue', ''),
    mod.default,
  ]),
)
const sectionIcons = { Brush, EditPen, Operation, Folder }

const settings = useSettings()
const toast = useToast()
const sections = SETTINGS_SECTIONS

/** 按 SETTINGS_SECTIONS 的 props 声明装配入参，避免把无关属性落到分区根元素 */
function propsFor(section) {
  const props = {}
  if (section.props.draft) props.draft = draft
  if (section.props.themes) props.themes = settings.THEMES
  if (section.props.update) props.onUpdate = onSectionUpdate
  return props
}

const draft = reactive({ theme: 'dark', colors: {}, fonts: {}, sizes: {}, behavior: {} })
const activeSection = ref(sections[0].id)
const pageEl = ref(null)
let observer = null

function snapshot(source) {
  return JSON.parse(JSON.stringify({
    theme: source.theme,
    colors: source.colors,
    fonts: source.fonts,
    sizes: source.sizes,
    behavior: source.behavior,
  }))
}

function copyInto(target, source) {
  target.theme = source.theme
  Object.assign(target.colors, source.colors)
  Object.assign(target.fonts, source.fonts)
  Object.assign(target.sizes, source.sizes)
  Object.assign(target.behavior, source.behavior)
}

function hydrateDraft() {
  copyInto(draft, snapshot(settings.cfg))
}

const dirty = computed(() =>
  JSON.stringify(snapshot(draft)) !== JSON.stringify(snapshot(settings.cfg)))
const themeLabel = computed(() => settings.THEMES[draft.theme]?.name || '自定义')

function pickTheme(key) {
  const theme = settings.THEMES[key]
  if (!theme) return
  draft.theme = key
  Object.assign(draft.colors, JSON.parse(JSON.stringify(theme.colors)))
}

function onSectionUpdate(payload = {}) {
  if (payload.theme) pickTheme(payload.theme)
}

function clampBehavior() {
  const b = draft.behavior
  b.maxLines = Math.min(100000, Math.max(1000, Number(b.maxLines) || 10000))
  b.tailMB = Math.min(100, Math.max(1, Math.round(Number(b.tailMB) || 10)))
  b.foldMaxLines = Math.min(50000, Math.max(1, Number(b.foldMaxLines) || 5))
  const ctx = clampContextConfig({
    initialLines: b.contextInitialLines,
    lazyStep: b.contextLazyStep,
    maxLinesPerSide: b.contextMaxLines,
  })
  b.contextInitialLines = ctx.initialLines
  b.contextLazyStep = ctx.lazyStep
  b.contextMaxLines = ctx.maxLinesPerSide
}

async function onSave() {
  // 让 InputNumber 失焦时的 v-model 更新先落地（无需手动触发 DOM 失焦）
  await nextTick()
  clampBehavior()
  settings.commit(snapshot(draft))
  toast.success('设置已保存', '主题与参数已应用到全站')
}

function onDiscard() {
  hydrateDraft()
  toast.info('已放弃未保存的更改')
}

function onReset() {
  copyInto(draft, snapshot(settings.DEFAULTS))
  toast.info('已恢复默认值', '点击「保存设置」后生效')
}

function scrollToSection(id) {
  activeSection.value = id
  const el = document.getElementById(`settings-${id}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function setupObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (visible.length) {
      activeSection.value = visible[0].target.id.replace('settings-', '')
    }
  }, { root: pageEl.value, rootMargin: '-12% 0px -70% 0px', threshold: 0 })
  for (const s of sections) {
    const el = document.getElementById(`settings-${s.id}`)
    if (el) observer.observe(el)
  }
}

function teardownObserver() {
  observer?.disconnect()
  observer = null
}

// 首次挂载与每次从 keep-alive 激活都重取草稿：切走即丢弃，绝不自动写入
// 订阅 settings 的提交广播：保存或「导入配置」写入 settings 段都会触发，
// 此时把草稿重置为当前 cfg（= 刚导入/保存的值），既立即生效又消除「未保存」误报。
let stopCommit = null
function syncDraftFromCommit() { hydrateDraft() }

onMounted(() => { hydrateDraft(); nextTick(setupObserver) })
onActivated(() => {
  hydrateDraft()
  nextTick(setupObserver)
  if (!stopCommit) stopCommit = settings.onCommit(syncDraftFromCommit)
})
onDeactivated(() => {
  teardownObserver()
  stopCommit?.()
  stopCommit = null
})
onBeforeUnmount(() => {
  teardownObserver()
  stopCommit?.()
  stopCommit = null
})
</script>

<style scoped>
.settings-page {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-6) var(--sp-6);
}
/* 内容超高时整页滚动，不能把首块压扁裁掉标题 */
.settings-page > * { flex-shrink: 0 }

.set-hero {
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: var(--sp-4); padding: var(--sp-5) var(--sp-6);
  border-radius: var(--r-xl); overflow: hidden;
  background: var(--grad-glow), var(--grad-surface), var(--s1);
  box-shadow: var(--sh-2);
}
.set-hero::after {
  content: ''; position: absolute; right: -40px; top: -90px;
  width: 280px; height: 280px; border-radius: 50%;
  background: var(--grad-accent); opacity: .08; pointer-events: none;
}
.hero-copy { position: relative; z-index: 1; min-width: 0 }
.hero-copy h1 {
  font-size: 30px; font-weight: 760; letter-spacing: -.01em;
  margin: 6px 0 var(--sp-2); color: var(--t1);
}
.hero-copy p {
  font-size: var(--fs-sm); color: var(--t2); line-height: 1.7; max-width: 560px;
}
.hero-side {
  position: relative; z-index: 1;
  display: flex; gap: var(--sp-2); flex-wrap: wrap;
}

.set-body {
  display: grid; grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--sp-4); align-items: start;
}
.set-nav {
  position: sticky; top: 0;
  display: flex; flex-direction: column; gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--bd); border-radius: var(--r-lg);
  background: var(--grad-surface), var(--s1); box-shadow: var(--sh-1);
}
.nav-caption {
  font-size: var(--fs-xs); font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: var(--t3); padding: 2px var(--sp-3);
}
.nav-item {
  position: relative; display: flex; align-items: center; gap: var(--sp-3);
  width: 100%; padding: var(--sp-3);
  border: 1px solid transparent; border-radius: var(--r);
  background-color: color-mix(in srgb, var(--ac) 0%, transparent);
  color: var(--t2); font-family: inherit;
  text-align: left; cursor: pointer;
  /* 镂空图标底下的底色过渡会造成明暗插值闪烁，这里离散切换 */
  transition: none;
}
.nav-item::before {
  content: ''; position: absolute; left: 0; top: 22%; height: 56%;
  width: 3px; border-radius: 0 3px 3px 0; background: var(--grad-accent);
  transform: scaleY(0); transition: transform var(--dur) var(--ease);
}
.nav-item:hover { background-color: var(--surf-hover) }
.nav-item.on {
  color: var(--ac); background-color: var(--surf-active);
  border-color: color-mix(in srgb, var(--ac) 24%, transparent);
}
.nav-item.on::before { transform: scaleY(1) }
.nav-item:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px }
.nav-text { display: flex; flex-direction: column; gap: 3px; min-width: 0 }
.nav-text strong { font-size: var(--fs-sm); font-weight: 700 }
.nav-text small { font-size: var(--fs-xs); color: var(--t3); line-height: 1.4 }
.nav-tip {
  margin-top: var(--sp-2); padding-top: var(--sp-3); border-top: 1px solid var(--bd);
  font-size: var(--fs-xs); line-height: 1.6; color: var(--t3);
}

.set-content { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0 }
.set-card { padding: var(--sp-5); border-radius: var(--r-lg); scroll-margin-top: var(--sp-4) }
.card-head {
  display: flex; align-items: center; gap: var(--sp-3);
  padding-bottom: var(--sp-4); margin-bottom: var(--sp-4);
  border-bottom: 1px solid var(--bd);
}
.card-icon {
  width: 38px; height: 38px; flex-shrink: 0;
  display: grid; place-items: center; border-radius: var(--r);
  color: var(--ac); background: color-mix(in srgb, var(--ac) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--ac) 22%, transparent);
  box-shadow: inset 0 1px 0 var(--hi);
}
.card-title h2 { font-size: var(--fs-lg); font-weight: 650; color: var(--t1) }
.card-title p { font-size: var(--fs-xs); color: var(--t3); margin-top: 3px }

.set-bar {
  position: sticky; bottom: 0; z-index: 5;
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--bd); border-radius: var(--r-lg);
  background: var(--grad-surface), var(--s1);
  box-shadow: var(--sh-2);
}
.bar-note {
  display: flex; align-items: center; gap: var(--sp-3);
  font-size: var(--fs-xs); color: var(--t3);
}
.bar-actions { display: flex; gap: var(--sp-2) }

@media (max-width: 900px) {
  .settings-page { padding: var(--sp-4) }
  .set-hero { padding: var(--sp-4) }
  .hero-copy h1 { font-size: var(--fs-xl) }
  .set-body { grid-template-columns: 1fr }
  .set-nav { position: static; flex-direction: row; flex-wrap: wrap; align-items: center }
  .nav-caption, .nav-tip { display: none }
  .nav-item { width: auto; flex: 1 1 140px }
  .nav-item::before { display: none }
  .set-card { padding: var(--sp-4) }
  .set-bar { flex-direction: column; align-items: stretch }
  .bar-actions { justify-content: flex-end }
}
</style>
