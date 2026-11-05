<template>
  <div class="filter-wrap" @keydown.esc.stop="onEsc">
    <div
      class="filter-bar"
      :class="{ focused, open: panelOpen }"
      role="search"
      @click="focusInput"
    >
      <label class="fb-label" for="log-filter-input" title="包含 / 排除行过滤（可编辑芯片 · 历史回填）">过滤</label>

      <el-tag
        v-for="f in textFilters"
        :key="f.id"
        size="small"
        :type="f.mode === 'exclude' ? 'danger' : 'primary'"
        effect="plain"
        closable
        class="fb-chip"
        :class="[f.mode, { editing: editingId === f.id }]"
        @close="onRemove(f.id)"
      >
        <button
          type="button"
          class="fb-op"
          :title="f.mode === 'include' ? '切换为排除' : '切换为包含'"
          @click.stop="toggleFilterMode(f.id)"
        >{{ f.mode === 'exclude' ? '≠' : '∋' }}</button>

        <input
          v-if="editingId === f.id"
          :ref="(el) => setEditRef(f.id, el)"
          v-model="editDraft"
          class="fb-chip-input"
          type="text"
          aria-label="编辑过滤条件"
          @click.stop
          @keydown.enter.prevent="commitEdit"
          @keydown.esc.prevent="cancelEdit"
          @blur="commitEdit"
        />
        <button
          v-else
          type="button"
          class="fb-chip-text"
          :title="'点击编辑：' + f.text"
          @click.stop="startEdit(f)"
        >{{ f.text }}</button>
      </el-tag>

      <input
        id="log-filter-input"
        ref="inputRef"
        v-model="draft"
        class="fb-input"
        type="text"
        :placeholder="placeholder"
        aria-label="日志文本过滤"
        autocomplete="off"
        @keydown.enter.prevent="commit()"
        @keydown.backspace="onBackspace"
        @keydown.down.prevent="onArrow(1)"
        @keydown.up.prevent="onArrow(-1)"
        @focus="onInputFocus"
        @blur="onInputBlur"
        @input="histIndex = -1"
      />

      <div class="fb-actions" @click.stop>
        <el-button
          size="small"
          type="primary"
          plain
          :disabled="!draft.trim()"
          title="添加包含（Enter）"
          @click="commit('include')"
        >∋</el-button>
        <el-button
          size="small"
          type="danger"
          plain
          :disabled="!draft.trim()"
          title="添加排除（或以 - 开头后 Enter）"
          @click="commit('exclude')"
        >≠</el-button>
        <el-button
          size="small"
          text
          :type="panelOpen ? 'primary' : 'default'"
          title="过滤历史"
          @click="togglePanel"
        >历史</el-button>
        <el-button
          v-if="textFilters.length"
          size="small"
          text
          title="清空当前过滤"
          @click="clearTextFilters"
        >清空</el-button>
      </div>
    </div>

    <div
      v-if="panelOpen"
      class="fb-panel"
      role="listbox"
      aria-label="过滤历史"
      @mousedown.prevent
    >
      <div class="fb-panel-hd">
        <span>最近过滤</span>
        <button
          v-if="filterHistory.length"
          type="button"
          class="fb-panel-clear"
          @click="clearFilterHistory"
        >清空历史</button>
      </div>
      <el-empty
        v-if="!filterHistory.length"
        description="暂无历史，添加条件后自动记录"
        :image-size="48"
      />
      <button
        v-for="(h, i) in filterHistory"
        :key="h.id"
        type="button"
        class="fb-hist"
        :class="{ active: i === histIndex }"
        role="option"
        :aria-selected="i === histIndex"
        @click="applyHist(h.id)"
        @mouseenter="histIndex = i"
      >
        <span class="fb-hist-label">{{ h.label }}</span>
        <span class="fb-hist-time">{{ fmtRel(h.at) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * 过滤条：可编辑芯片 + 包含/排除切换 + 去重历史回填
 * 状态：useLogViewFilters；历史算法：utils/filterHistory
 */
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import { useLogViewFilters } from '../../composables/useLogViewFilters'

const {
  textFilters,
  filterHistory,
  addTextFilter,
  updateTextFilter,
  removeTextFilter,
  clearTextFilters,
  toggleFilterMode,
  applyHistory,
  clearFilterHistory,
} = useLogViewFilters()

const draft = ref('')
const focused = ref(false)
const panelOpen = ref(false)
const inputRef = ref(null)
const editingId = ref('')
const editDraft = ref('')
const editRefs = new Map()
const histIndex = ref(-1)
let blurTimer = 0

const placeholder = computed(() => {
  if (textFilters.value.length) return '继续输入 Enter 添加；点击条件可编辑'
  return '过滤正文… Enter 添加；-health 排除；点「历史」快速回填'
})

function setEditRef(id, el) {
  if (el) editRefs.set(id, el)
  else editRefs.delete(id)
}

function focusInput() {
  if (editingId.value) return
  inputRef.value?.focus()
}

function onInputFocus() {
  focused.value = true
  if (!draft.value.trim() && filterHistory.value.length) panelOpen.value = true
}

function onInputBlur() {
  focused.value = false
  clearTimeout(blurTimer)
  blurTimer = window.setTimeout(() => {
    if (!focused.value && editingId.value === '') panelOpen.value = false
  }, 160)
}

function togglePanel() {
  panelOpen.value = !panelOpen.value
  if (panelOpen.value) {
    histIndex.value = filterHistory.value.length ? 0 : -1
    nextTick(() => inputRef.value?.focus())
  }
}

function commit(forceMode) {
  if (histIndex.value >= 0 && panelOpen.value && filterHistory.value[histIndex.value]) {
    applyHist(filterHistory.value[histIndex.value].id)
    return
  }
  const raw = draft.value
  if (!addTextFilter(raw, forceMode)) return
  draft.value = ''
  histIndex.value = -1
}

function onBackspace() {
  if (draft.value) return
  const list = textFilters.value
  if (!list.length) return
  removeTextFilter(list[list.length - 1].id)
}

function onRemove(id) {
  if (editingId.value === id) cancelEdit()
  removeTextFilter(id)
}

function startEdit(f) {
  editingId.value = f.id
  editDraft.value = f.text
  panelOpen.value = false
  nextTick(() => {
    const el = editRefs.get(f.id)
    el?.focus()
    el?.select?.()
  })
}

function commitEdit() {
  const id = editingId.value
  if (!id) return
  const raw = editDraft.value
  if (!String(raw).trim()) {
    cancelEdit()
    return
  }
  if (!updateTextFilter(id, { text: raw })) {
    // 冲突或空：恢复原值，不打断
    cancelEdit()
    return
  }
  editingId.value = ''
  editDraft.value = ''
}

function cancelEdit() {
  editingId.value = ''
  editDraft.value = ''
}

function applyHist(id) {
  if (!applyHistory(id)) return
  draft.value = ''
  panelOpen.value = false
  histIndex.value = -1
  nextTick(() => inputRef.value?.focus())
}

function onArrow(delta) {
  if (!panelOpen.value) {
    if (filterHistory.value.length) panelOpen.value = true
    else return
  }
  const n = filterHistory.value.length
  if (!n) return
  if (histIndex.value < 0) histIndex.value = delta > 0 ? 0 : n - 1
  else histIndex.value = (histIndex.value + delta + n) % n
}

function onEsc() {
  if (editingId.value) {
    cancelEdit()
    return
  }
  if (panelOpen.value) {
    panelOpen.value = false
    histIndex.value = -1
  }
}

function fmtRel(at) {
  if (!at) return ''
  const diff = Date.now() - at
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  try {
    return new Date(at).toLocaleString()
  } catch {
    return ''
  }
}

onBeforeUnmount(() => clearTimeout(blurTimer))
</script>

<style scoped>
.filter-wrap {
  position: relative;
  flex: 1;
  min-width: 220px;
  max-width: min(720px, 100%);
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--bd);
  border-radius: 6px;
  background: var(--s1);
  cursor: text;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.filter-bar.focused,
.filter-bar.open {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 35%, transparent);
}
.fb-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--t3);
  user-select: none;
  flex-shrink: 0;
  cursor: text;
}
.fb-chip {
  max-width: 260px;
  cursor: default;
}
.fb-chip.editing {
  max-width: 320px;
}
.fb-chip :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
}
.fb-op {
  border: none;
  background: transparent;
  color: inherit;
  font-weight: 700;
  opacity: 0.9;
  cursor: pointer;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1;
  font-family: inherit;
  flex-shrink: 0;
}
.fb-op:hover { opacity: 1; text-decoration: underline }
.fb-chip-text {
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 0;
  margin: 0;
  cursor: text;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.fb-chip-text:hover { text-decoration: underline }
.fb-chip-input {
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  min-width: 72px;
  max-width: 220px;
  padding: 0;
  line-height: 1.2;
}
.fb-input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--t1);
  font-size: 13px;
  line-height: 22px;
  padding: 2px 4px;
  font-family: var(--font-ui);
}
.fb-input::placeholder {
  color: var(--t3);
  opacity: 0.85;
}
.fb-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
}
.fb-actions .el-button + .el-button { margin-left: 0 }

.fb-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--bd);
  border-radius: var(--r);
  background: var(--grad-surface), var(--s1);
  box-shadow: var(--sh-2);
  padding: 8px;
}
.fb-panel-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 10px;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--t3);
}
.fb-panel-clear {
  border: none;
  background: transparent;
  color: var(--t3);
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: inherit;
  padding: 2px 6px;
  border-radius: var(--r-xs);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.fb-panel-clear:hover { color: var(--ac); background: var(--surf-hover) }
.fb-op:hover { color: var(--ac); text-decoration: none }
.fb-panel-clear:hover { color: var(--err); }
.fb-hist {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  color: var(--t1);
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 12.5px;
}
.fb-hist:hover,
.fb-hist.active {
  background: color-mix(in srgb, var(--ac) 12%, transparent);
}
.fb-hist-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-log);
}
.fb-hist-time {
  flex-shrink: 0;
  color: var(--t3);
  font-size: 11px;
}
</style>
