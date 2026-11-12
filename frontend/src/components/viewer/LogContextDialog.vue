<template>
  <el-dialog
    :model-value="modelValue"
    class="ctx-dialog"
    modal-class="ctx-modal"
    width="min(1280px, 94vw)"
    top="3vh"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @opened="scrollFocusIntoView"
  >
    <template #header>
      <div class="ctx-hd">
        <span class="ctx-hd-title">{{ dialogMain }}</span>
        <span class="ctx-hd-sub">{{ dialogSub }}</span>
      </div>
    </template>

    <div class="ctx-toolbar">
      <div class="ctx-actions">
        <el-button size="small" :disabled="upBlocked" @click="loadMore('up')">向前加载</el-button>
        <el-button size="small" :disabled="downBlocked" @click="loadMore('down')">向后加载</el-button>
        <el-button size="small" @click="copyContext">复制上下文</el-button>
        <el-button size="small" @click="copyFocus">复制当前行</el-button>
      </div>
      <span class="ctx-hint" :title="hintFull">前后 {{ win.before }} / {{ win.after }} 行</span>
    </div>

    <div ref="bodyRef" class="ctx-body" @scroll="onScroll">
      <div v-if="upHint" class="ctx-edge">{{ upHint }}</div>
      <div
        v-for="item in rows"
        :key="item.idx"
        class="ln ctx-row"
        :class="rowClass(item.idx)"
      >
        <span class="no">{{ item.idx + 1 }}</span>
        <span class="tx" v-html="item.html"></span>
      </div>
      <div v-if="downHint" class="ctx-edge">{{ downHint }}</div>
    </div>
  </el-dialog>
</template>

<script setup>
/**
 * 上下文弹窗（Grafana Loki Show context 风格）—— 只做渲染与本地交互。
 * 数据来自原始 lines，不依赖过滤后的 viewRows：筛选状态下也能看到被隐藏的周边行。
 * 窗口推进由 utils/logContextWindow 纯函数负责，配置由 settings 单点提供。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { highlightLine, detectLevel } from '../../utils/logParser'
import { createWindow, expandWindow } from '../../utils/logContextWindow'
import { clampContextConfig } from '../../constants/logContextConfig'
import { useToast } from '../../composables/useToast'
import { useAccessLog } from '../../composables/useAccessLog'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  lines: { type: Array, default: () => [] },
  centerIdx: { type: Number, default: 0 },
  includeTerms: { type: Array, default: () => [] },
  config: { type: Object, default: () => ({}) },
  meta: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue'])

const toast = useToast()
const access = useAccessLog()
const bodyRef = ref(null)
const cfg = ref(clampContextConfig(props.config))
const win = ref(createWindow(0, 0, cfg.value))
let raf = 0

/** 标题拆两段：文件名为主，级别与行号作副标题，避免长串换行 */
const dialogMain = computed(() => props.meta.file || '日志上下文')
const dialogSub = computed(() => {
  const level = props.meta.level ? `${props.meta.level} · ` : ''
  return `${level}第 ${props.centerIdx + 1} 行`
})
/** 完整窗口参数放进 tooltip，操作条只显示当前前后行数 */
const hintFull = computed(
  () =>
    `初始 ${cfg.value.initialLines} 行 · 每次 ${cfg.value.lazyStep} 行 · 单侧上限 ${cfg.value.maxLinesPerSide} 行（可在设置中调整）`,
)

const rows = computed(() => {
  const out = []
  const end = Math.min(win.value.end, props.lines.length - 1)
  for (let i = Math.max(0, win.value.start); i <= end; i += 1) {
    const text = String(props.lines[i] ?? '')
    out.push({
      idx: i,
      html: highlightLine(text, detectLevel(text), props.includeTerms),
    })
  }
  return out
})

const upBlocked = computed(() =>
  win.value.before >= cfg.value.maxLinesPerSide || win.value.start <= 0,
)
const downBlocked = computed(() =>
  win.value.after >= cfg.value.maxLinesPerSide || win.value.end >= props.lines.length - 1,
)

/** 两重边界分别提示：配置上限 vs 已加载数据边界（后端只拉了尾部） */
const upHint = computed(() => {
  if (win.value.before >= cfg.value.maxLinesPerSide) return `已到单侧上限（${cfg.value.maxLinesPerSide} 行）`
  if (win.value.start <= 0) return '已到已加载范围起点（仅拉取了日志尾部，更早的行未下载）'
  return ''
})
const downHint = computed(() => {
  if (win.value.after >= cfg.value.maxLinesPerSide) return `已到单侧上限（${cfg.value.maxLinesPerSide} 行）`
  if (win.value.end >= props.lines.length - 1) return '已到已加载范围终点'
  return ''
})

function rowClass(idx) {
  if (idx === props.centerIdx) return 'ctx-row-focus'
  return idx < props.centerIdx ? 'ctx-row-before' : 'ctx-row-after'
}

async function loadMore(dir) {
  const el = bodyRef.value
  const prevHeight = el?.scrollHeight || 0
  const prevTop = el?.scrollTop || 0
  const res = expandWindow(win.value, dir, cfg.value, props.lines.length)
  if (!res.added) return
  win.value = res.win
  await nextTick()
  // 向上插入行后补偿滚动位置，保持视觉锚点不跳
  if (dir === 'up' && el) el.scrollTop = prevTop + (el.scrollHeight - prevHeight)
}

function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const el = bodyRef.value
    // 内容不足一屏时无法触发滚动，改由顶部按钮显式加载
    if (!el || el.scrollHeight <= el.clientHeight + 4) return
    if (el.scrollTop <= 2) loadMore('up')
    else if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) loadMore('down')
  })
}

async function copyText(text, okMsg) {
  if (!text) {
    toast.warn('无可复制内容')
    return
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('剪贴板不可用')
    await navigator.clipboard.writeText(text)
    toast.success(okMsg)
  } catch (e) {
    toast.error('复制失败', e?.message || String(e))
  }
}

function copyContext() {
  const start = Math.max(0, win.value.start)
  const end = Math.min(props.lines.length - 1, win.value.end)
  copyText(props.lines.slice(start, end + 1).join('\n'), '已复制上下文')
}

function copyFocus() {
  copyText(String(props.lines[props.centerIdx] ?? ''), '已复制当前行')
}

function scrollFocusIntoView() {
  const el = bodyRef.value
  if (!el) return
  const focus = el.querySelector('.ctx-row-focus')
  if (focus) {
    el.scrollTop = Math.max(0, focus.offsetTop - el.clientHeight / 2 + focus.offsetHeight / 2)
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    cfg.value = clampContextConfig(props.config)
    win.value = createWindow(props.centerIdx, props.lines.length, cfg.value)
    nextTick(scrollFocusIntoView)
    access.track(access.ACTION.SHOW_CONTEXT, {
      env: props.meta.env || '',
      module: props.meta.module || '',
      level: props.meta.level || '',
      detail: `${props.meta.file || ''}#${props.centerIdx + 1}`,
    })
  },
)

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>
