<template>
  <section
    ref="rootRef"
    class="tools-drawer"
    :class="{ pinned: tools.drawerPinned.value, open }"
    :data-open="open ? 'true' : 'false'"
    :aria-hidden="open ? 'false' : 'true'"
    aria-label="日志搜索工具"
  >
    <header class="dw-hd">
      <div class="dw-title">
        <span class="ui-eyebrow">Search tools</span>
        <h2>搜索与过滤</h2>
        <p>过滤隐藏行 · 高亮只染色 · 查找定位并跳转</p>
      </div>
      <div class="dw-actions">
        <el-tooltip
          :content="tools.drawerPinned.value ? '取消固定（可收起）' : '固定展开'"
          placement="left"
          :show-after="400"
        >
          <button
            type="button"
            class="ui-icon-btn"
            :class="{ on: tools.drawerPinned.value }"
            :aria-label="tools.drawerPinned.value ? '取消固定工具区' : '固定展开工具区'"
            :aria-pressed="tools.drawerPinned.value"
            @click="tools.drawerPinned.value ? tools.unpinDrawer() : tools.pinDrawer()"
          ><el-icon><Unlock v-if="tools.drawerPinned.value" /><Lock v-else /></el-icon></button>
        </el-tooltip>
        <el-tooltip v-if="!tools.drawerPinned.value" content="收起工具区" placement="left" :show-after="400">
          <button
            type="button"
            class="ui-icon-btn"
            aria-label="收起工具区"
            @click="tools.closeDrawer()"
          ><el-icon><ArrowRight /></el-icon></button>
        </el-tooltip>
      </div>
      <div class="dw-chips">
        <span v-if="filterCount" class="ui-chip ui-chip--accent">{{ filterCount }} 个过滤条件</span>
        <span v-if="tools.matches.value.length" class="ui-chip ui-chip--accent">
          查找 {{ tools.matches.value.length }} 处
        </span>
        <span v-if="resultCount != null" class="ui-chip">{{ resultCount }} 行可见</span>
      </div>
    </header>

    <div class="dw-body">
      <div class="dw-rows">
      <div class="dw-row">
        <span class="dw-label">过滤</span>
        <div class="dw-content"><LogFilterBar :result-count="resultCount" /></div>
      </div>
      <div class="dw-row">
        <span class="dw-label">高亮</span>
        <div class="dw-content"><LogHighlightBar /></div>
      </div>
      <div class="dw-row">
        <span class="dw-label">查找</span>
        <div class="dw-content">
          <LogFindBar ref="findBarRef" @step="(delta) => emit('step', delta)" />
        </div>
      </div>
      <div class="dw-row">
        <span class="dw-label">日志文件</span>
        <div class="dw-content">
          <LogHistoryBar
            :date-filter="dateFilter"
            :selected-file="selectedFile"
            :log-files="logFiles"
            :filtered-log-files="filteredLogFiles"
            :files-loading="filesLoading"
            :index-hint="indexHint"
            :rule-hint="ruleHint"
            @update:dateFilter="(v) => emit('update:dateFilter', v)"
            @update:selectedFile="(v) => emit('update:selectedFile', v)"
            @change="(v) => emit('change-file', v)"
            @refresh="emit('refresh-files')"
          />
        </div>
      </div>
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * 日志工具抽屉：过滤 / 独立高亮 / 查找定位 / 历史文件四个分区。
 * 容器只做布局与开合；历史文件状态仍由 LogViewer 持有（v-model 透传）。
 * 常驻渲染 + open 状态类：既保留 LogFilterBar 的编辑草稿，又能做滑入滑出过渡。
 */
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Lock, Unlock, ArrowRight } from '@element-plus/icons-vue'
import { useLogSearchTools } from '../../composables/useLogSearchTools'
import { useLogViewFilters } from '../../composables/useLogViewFilters'
import { useNavigation } from '../../composables/useNavigation'
import { shouldAutoCollapse } from '../../utils/toolDrawerState'
import LogFilterBar from './LogFilterBar.vue'
import LogHighlightBar from './LogHighlightBar.vue'
import LogFindBar from './LogFindBar.vue'
import LogHistoryBar from './LogHistoryBar.vue'

defineProps({
  open: { type: Boolean, default: false },
  dateFilter: { type: String, default: '' },
  selectedFile: { type: String, default: '' },
  logFiles: { type: Array, default: () => [] },
  filteredLogFiles: { type: Array, default: () => [] },
  filesLoading: { type: Boolean, default: false },
  indexHint: { type: String, default: '' },
  ruleHint: { type: String, default: '' },
  resultCount: { type: Number, default: null },
})

const emit = defineEmits([
  'update:dateFilter',
  'update:selectedFile',
  'change-file',
  'refresh-files',
  'step',
])

const tools = useLogSearchTools()
const { textFilters } = useLogViewFilters()
const nav = useNavigation()
const rootRef = ref(null)
const findBarRef = ref(null)
const filterCount = computed(() => textFilters.value.length)

/** 主工具条开关交给自身 toggle；Element Plus 的下拉/日期/弹层 teleport 到 body，不算外部 */
function isOutsideDrawer(target) {
  if (!(target instanceof Element)) return false
  if (rootRef.value?.contains(target)) return false
  // 抽屉开关与状态栏置顶/置底按钮不算外部点击
  return !target.closest('[data-drawer-toggle], [data-scroll-nav], .el-popper, .el-overlay')
}

function collapseIfNeeded({ view = nav.view, inside = true } = {}) {
  if (shouldAutoCollapse(
    { open: tools.drawerOpen.value, pinned: tools.drawerPinned.value },
    { view, inside },
  )) tools.closeDrawer()
}

/** 未固定时点击外部自动缩回；固定态保持常驻 */
function onDocPointerDown(ev) {
  if (nav.view !== 'viewer') return
  collapseIfNeeded({ inside: !isOutsideDrawer(ev.target) })
}

watch(
  () => nav.view,
  (view) => collapseIfNeeded({ view, inside: true }),
)

function focusFind() {
  findBarRef.value?.focus?.()
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown, true))

defineExpose({ focusFind })
</script>

<style scoped>
/* 右侧浮层抽屉：自右向左滑入，覆盖日志区但不遮工具栏与状态条 */
.tools-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  width: min(380px, 92%);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--bd);
  border-radius: var(--r) 0 0 var(--r);
  background: var(--grad-glow), var(--grad-surface), var(--s1);
  box-shadow: var(--sh-2);
  transform: translateX(100%);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    transform var(--dur-slow) var(--ease),
    opacity var(--dur) var(--ease),
    visibility var(--dur-slow);
}
.tools-drawer.open {
  transform: translateX(0);
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
.tools-drawer.pinned { box-shadow: inset 3px 0 0 var(--ac), var(--sh-2) }

/* 头部固定，标题与操作同排，计数芯片独占一行 */
.dw-hd {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-3) var(--sp-2);
  border-bottom: 1px dashed var(--bd);
}
.dw-title { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0 }
.dw-title .ui-eyebrow { display: none }
.dw-title p { display: none }
.dw-title h2 {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--t1);
  margin: 0;
  white-space: nowrap;
}
.dw-chips { display: flex; flex-wrap: wrap; gap: var(--sp-1); width: 100% }
.dw-actions { display: flex; gap: var(--sp-2); margin-left: auto }
.dw-actions .ui-icon-btn.on { color: var(--ac); border-color: var(--ac); background: var(--surf-active) }

/* 内容区独立滚动，四个分区各占一整行 */
.dw-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-3) }
.dw-rows { display: flex; flex-direction: column; gap: var(--sp-3) }
.dw-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp-2);
  min-width: 0;
  padding-bottom: var(--sp-3);
  border-bottom: 1px dashed var(--bd);
}
.dw-row:last-child { border-bottom: 0; padding-bottom: 0 }
.dw-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--t3);
  white-space: nowrap;
}
.dw-content { min-width: 0 }
/* 各分区自带的说明行与重复 label 与外层标签重复，浮层内隐藏 */
.dw-rows :deep(.hl-hint),
.dw-rows :deep(.find-hint),
.dw-rows :deep(.fb-label) { display: none }
/* 「N 行可见」已由头部 chip 展示，隐藏条内重复计数 */
.tools-drawer .dw-rows :deep(.fb-count) { display: none }
/* 索引/规则提示改由 title 承载，避免撑高 */
.tools-drawer .dw-rows :deep(.hist-cache),
.tools-drawer .dw-rows :deep(.hist-rule) { display: none }
.tools-drawer .dw-rows :deep(.hist-date) { width: 148px }
.tools-drawer .dw-rows :deep(.hist-sel) { flex: 1 1 auto; min-width: 0; width: auto }
/* 380px 浮层内让主输入独占一行、操作按钮换行右对齐，避免输入框被挤到极窄 */
.dw-content :deep(.fb-input),
.dw-content :deep(.hl-input) { flex: 1 1 100%; min-width: 0 }
.dw-content :deep(.find-box) { flex: 1 1 100%; min-width: 0 }
.dw-content :deep(.hist-sel) { flex: 1 1 100%; min-width: 0 }
/* 过滤历史面板改为内联展开，避免被 .dw-body 的滚动区裁切 */
.tools-drawer :deep(.fb-panel) {
  position: static;
  margin-top: var(--sp-2);
  max-height: 220px;
  box-shadow: none;
}

@media (max-width: 1200px) {
  .tools-drawer { width: min(340px, 92%) }
}
@media (max-width: 900px) {
  .tools-drawer { width: 92% }
  .dw-body { padding: var(--sp-2) }
  .tools-drawer .dw-rows :deep(.hist-sel) { flex-basis: 100% }
}
</style>
