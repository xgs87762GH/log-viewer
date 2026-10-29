<template>
  <el-dialog
    :model-value="settings.state.visible"
    title="网站设置"
    width="560px"
    :close-on-click-modal="false"
    @close="onDismiss"
  >
    <el-scrollbar max-height="62vh">
      <section class="sec">
        <h3>主题预设</h3>
        <div class="theme-grid">
          <div
            v-for="(t, k) in settings.THEMES"
            :key="k"
            class="theme-card"
            :class="{ on: draft.theme === k }"
            @click="pickTheme(k)"
          >
            <div>{{ t.name }}</div>
            <div class="colors">
              <span v-for="c in [t.colors.ac, t.colors.info, t.colors.warn, t.colors.err]" :key="c" :style="{ background: c }" />
            </div>
          </div>
        </div>
      </section>

      <section class="sec">
        <h3>自定义颜色</h3>
        <el-row :gutter="8">
          <el-col v-for="(label, key) in colorLabels" :key="key" :span="12">
            <div class="color-row">
              <el-color-picker
                v-model="draft.colors[key]"
                size="small"
                @change="() => { draft.theme = 'custom' }"
              />
              <span>{{ label }}</span>
              <code>{{ draft.colors[key] }}</code>
            </div>
          </el-col>
        </el-row>
      </section>

      <section class="sec">
        <h3>字体</h3>
        <el-form label-width="72px" size="small">
          <el-form-item label="UI 字体">
            <el-select v-model="draft.fonts.ui">
              <el-option v-for="f in fontOptions.ui" :key="f" :label="f.substring(0, 40)" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="日志字体">
            <el-select v-model="draft.fonts.log">
              <el-option v-for="f in fontOptions.log" :key="f" :label="f.substring(0, 40)" :value="f" />
            </el-select>
          </el-form-item>
        </el-form>
      </section>

      <section class="sec">
        <h3>字号与行高</h3>
        <el-form label-width="72px" size="small">
          <el-form-item label="基础字号">
            <el-radio-group v-model="draft.sizes.base">
              <el-radio-button v-for="s in sizeOptions.base" :key="s" :value="s">{{ s }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="日志字号">
            <el-radio-group v-model="draft.sizes.log">
              <el-radio-button v-for="s in sizeOptions.log" :key="s" :value="s">{{ s }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="日志行高">
            <el-radio-group v-model="draft.sizes.lh">
              <el-radio-button v-for="s in sizeOptions.lh" :key="s" :value="s">{{ s }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </section>

      <section class="sec">
        <h3>行为</h3>
        <el-form label-width="88px" size="small">
          <el-form-item label="自动末尾">
            <el-switch v-model="draft.behavior.autoScroll" />
          </el-form-item>
          <el-form-item label="自动换行">
            <el-switch v-model="draft.behavior.wordWrap" />
            <span class="hint">开启亦走虚拟滚动；超大日志仍建议适当降低「最大行数」。关闭后超长行省略号截断</span>
          </el-form-item>
          <el-form-item label="超行折叠">
            <el-switch v-model="draft.behavior.foldOverLimit" />
            <span class="hint">仅折叠「单条日志」，不是整页截断</span>
          </el-form-item>
          <el-form-item v-if="draft.behavior.foldOverLimit" label="折叠阈值">
            <el-input-number
              v-model="draft.behavior.foldMaxLines"
              :min="1"
              :max="50000"
              :step="1"
              controls-position="right"
            />
            <span class="unit">行（单条物理行数 &gt; N 才折）</span>
          </el-form-item>
          <el-form-item label="最大行数">
            <el-input-number
              v-model="draft.behavior.maxLines"
              :min="1000"
              :max="100000"
              :step="1000"
              controls-position="right"
            />
            <span class="unit">行</span>
          </el-form-item>
          <el-form-item label="尾部下载">
            <el-input-number
              v-model="draft.behavior.tailMB"
              :min="1"
              :max="100"
              :step="1"
              controls-position="right"
            />
            <span class="unit">MB</span>
          </el-form-item>
        </el-form>
        <el-alert
          type="error"
          :closable="false"
          show-icon
          title="点「完成」后才会写入并按新的「最大行数 / 尾部下载」重新拉取当前日志。"
          class="mb"
        />
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="尾部下载只请求文件末尾（HTTP Range），不是整文件。状态栏「大小」是远端文件总大小；「已下」才是本次下载量。"
        />
      </section>
    </el-scrollbar>

    <template #footer>
      <el-button @click="onReset">恢复默认</el-button>
      <el-button @click="onDismiss">取消</el-button>
      <el-button type="primary" @click="onConfirm">完成</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
/**
 * 设置弹窗：编辑草稿，点「完成」才提交。
 * 避免 InputNumber 未失焦时点完成导致数值没写入。
 */
import { reactive, watch } from 'vue'
import { useSettings } from '../../composables/useSettings'

const settings = useSettings()

const draft = reactive({
  theme: 'dark',
  colors: {},
  fonts: {},
  sizes: {},
  behavior: {},
})

function cloneCfg() {
  return JSON.parse(JSON.stringify({
    theme: settings.cfg.theme,
    colors: settings.cfg.colors,
    fonts: settings.cfg.fonts,
    sizes: settings.cfg.sizes,
    behavior: settings.cfg.behavior,
  }))
}

function hydrateDraft() {
  const snap = cloneCfg()
  draft.theme = snap.theme
  Object.assign(draft.colors, snap.colors)
  Object.assign(draft.fonts, snap.fonts)
  Object.assign(draft.sizes, snap.sizes)
  Object.assign(draft.behavior, snap.behavior)
}

watch(
  () => settings.state.visible,
  (vis) => {
    if (vis) hydrateDraft()
  },
)

function pickTheme(k) {
  const t = settings.THEMES[k]
  if (!t) return
  draft.theme = k
  Object.assign(draft.colors, JSON.parse(JSON.stringify(t.colors)))
}

function clampBehavior() {
  const b = draft.behavior
  b.maxLines = Math.min(100000, Math.max(1000, Number(b.maxLines) || 10000))
  b.tailMB = Math.min(100, Math.max(1, Math.round(Number(b.tailMB) || 10)))
  b.foldMaxLines = Math.min(50000, Math.max(1, Number(b.foldMaxLines) || 5))
}

function onConfirm() {
  // 先失焦，确保 InputNumber 内部值刷进 v-model
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
  clampBehavior()
  settings.commit({
    theme: draft.theme,
    colors: JSON.parse(JSON.stringify(draft.colors)),
    fonts: JSON.parse(JSON.stringify(draft.fonts)),
    sizes: JSON.parse(JSON.stringify(draft.sizes)),
    behavior: JSON.parse(JSON.stringify(draft.behavior)),
  })
  settings.state.visible = false
}

function onDismiss() {
  settings.state.visible = false
}

function onReset() {
  const d = JSON.parse(JSON.stringify(settings.DEFAULTS))
  draft.theme = d.theme
  Object.assign(draft.colors, d.colors)
  Object.assign(draft.fonts, d.fonts)
  Object.assign(draft.sizes, d.sizes)
  Object.assign(draft.behavior, d.behavior)
}

const colorLabels = {
  bg: '背景', s1: '侧边栏', s2: '卡片/工具栏', bd: '边框',
  t1: '主文字', t2: '次要文字', ac: '强调色',
  info: 'INFO', warn: 'WARN', err: 'ERROR', dbg: 'DEBUG', trc: 'TRACE',
}
const fontOptions = {
  ui: [
    "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
    "'Microsoft YaHei',sans-serif",
    'system-ui,sans-serif',
  ],
  log: [
    "Consolas,'Courier New','Microsoft YaHei',monospace",
    'Consolas,monospace',
    'monospace',
  ],
}
const sizeOptions = {
  base: ['12px', '13px', '14px', '15px', '16px'],
  log: ['11px', '12px', '13px', '14px', '15px'],
  lh: ['1.4', '1.5', '1.65', '1.8', '2.0'],
}
</script>

<style scoped>
.sec { margin-bottom: 20px }
.sec h3 { font-size: 13px; font-weight: 600; margin: 0 0 10px; color: var(--t1) }
.theme-grid { display: flex; gap: 8px }
.theme-card {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid var(--bd);
  transition: .15s;
}
.theme-card.on { border-color: var(--el-color-primary) }
.theme-card:hover { border-color: var(--bd2) }
.colors { display: flex; gap: 3px; margin-top: 6px }
.colors span { width: 16px; height: 16px; border-radius: 3px; display: inline-block }
.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--s2);
  border-radius: 6px;
  margin-bottom: 8px;
}
.color-row span { font-size: 12px; color: var(--t2); flex: 1 }
.color-row code { font-size: 11px; color: var(--t3) }
.unit { margin-left: 8px; color: var(--t3); font-size: 12px }
.hint { margin-left: 10px; color: var(--t3); font-size: 12px }
.mb { margin-bottom: 8px }
</style>
