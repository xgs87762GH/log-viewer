<template>
  <section ref="rootRef" class="tools-drawer" :class="{ pinned: tools.drawerPinned.value }" aria-label="日志搜索工具">
    <header class="dw-hd">
      <div class="dw-title">
        <span class="ui-eyebrow">Search tools</span>
        <h2>搜索与过滤</h2>
        <p>过滤隐藏行 · 高亮只染色 · 查找定位并跳转</p>
      </div>
      <div class="dw-chips">
        <span v-if="filterCount" class="ui-chip ui-chip--accent">{{ filterCount }} 个过滤条件</span>
        <span v-if="tools.matches.value.length" class="ui-chip ui-chip--accent">
          查找 {{ tools.matches.value.length }} 处
        </span>
        <span v-if="resultCount != null" class="ui-chip">{{ resultCount }} 行可见</span>
      </div>
      <div class="dw-actions">
        <el-tooltip
          :content="tools.drawerPinned.value ? '取消固定（可收起）' : '固定展开'"
          placement="top"
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
        <el-tooltip v-if="!tools.drawerPinned.value" content="收起工具区" placement="top" :show-after="400">
          <button
            type="button"
            class="ui-icon-btn"
            aria-label="收起工具区"
            @click="tools.closeDrawer()"
          ><el-icon><ArrowUp /></el-icon></button>
        </el-tooltip>
      </div>
    </header>

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
  </section>
</template>

<script setup>
/**
 * 日志工具抽屉：过滤 / 独立高亮 / 查找定位 / 历史文件四个分区。
 * 容器只做布局与开合；历史文件状态仍由 LogViewer 持有（v-model 透传）。
 * 用 v-show 由父级控制显隐，避免收起时重置 LogFilterBar 的编辑草稿。
 */
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Lock, Unlock, ArrowUp } from '@element-plus/icons-vue'
import { useLogSearchTools } from '../../composables/useLogSearchTools'
import { useLogViewFilters } from '../../composables/useLogViewFilters'
import { useNavigation } from '../../composables/useNavigation'
import { shouldAutoCollapse } from '../../utils/toolDrawerState'
import LogFilterBar from './LogFilterBar.vue'
import LogHighlightBar from './LogHighlightBar.vue'
import LogFindBar from './LogFindBar.vue'
import LogHistoryBar from './LogHistoryBar.vue'

defineProps({
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
  return !target.closest('[data-drawer-toggle], .el-popper, .el-overlay')
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
.tools-drawer {
  flex-shrink: 0;
  max-height: min(46vh, 440px);
  overflow-y: auto;
  padding: var(--sp-3) var(--sp-4) var(--sp-4);
  border-bottom: 1px solid var(--bd);
  background: var(--grad-glow), var(--grad-surface), var(--s1);
  box-shadow: var(--sh-1);
}
.tools-drawer.pinned { box-shadow: inset 3px 0 0 var(--ac), var(--sh-1) }
.dw-hd {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-3);
  padding-bottom: var(--sp-3);
  border-bottom: 1px dashed var(--bd);
}
.dw-title h2 {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--t1);
  margin: 2px 0;
}
.dw-title p { font-size: var(--fs-xs); color: var(--t2); opacity: .86 }
.dw-chips { display: flex; flex-wrap: wrap; gap: var(--sp-2) }
.dw-actions { display: flex; gap: var(--sp-2); margin-left: auto }
.dw-actions .ui-icon-btn.on { color: var(--ac); border-color: var(--ac); background: var(--surf-active) }
.dw-rows { display: flex; flex-direction: column; padding-top: var(--sp-2) }
.dw-row {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: start;
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--bd);
}
.dw-row:last-child { border-bottom: 0 }
.dw-label {
  padding-top: 6px;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--t2);
}
.dw-content { min-width: 0 }
@media (max-width: 900px) {
  .tools-drawer { max-height: 54vh; padding: var(--sp-3) }
  .dw-row { grid-template-columns: 1fr; gap: var(--sp-1) }
  .dw-label { padding-top: 0 }
  .dw-actions { margin-left: 0 }
}
</style>
