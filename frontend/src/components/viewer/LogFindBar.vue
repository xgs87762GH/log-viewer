<template>
  <div class="find-bar">
    <div class="find-box" :class="{ focused }">
      <el-icon class="find-icon" :size="14"><Search /></el-icon>
      <input
        id="log-find-input"
        ref="inputRef"
        v-model="tools.findQuery.value"
        class="find-input"
        type="text"
        placeholder="查找日志内容…"
        aria-label="查找日志内容"
        autocomplete="off"
        @focus="focused = true"
        @blur="focused = false"
        @keydown.enter.prevent="emit('step', $event.shiftKey ? -1 : 1)"
        @keydown.esc.stop.prevent="onEsc"
      />
      <span class="find-count" :class="{ empty: !total }">{{ total ? `${current} / ${total}` : '无匹配' }}</span>
    </div>

    <el-tooltip content="上一处（Shift + Enter / Shift + F3）" placement="top" :show-after="400">
      <button
        type="button"
        class="ui-icon-btn"
        :disabled="!total"
        aria-label="上一处匹配"
        @click="emit('step', -1)"
      ><el-icon><ArrowUp /></el-icon></button>
    </el-tooltip>
    <el-tooltip content="下一处（Enter / F3）" placement="top" :show-after="400">
      <button
        type="button"
        class="ui-icon-btn"
        :disabled="!total"
        aria-label="下一处匹配"
        @click="emit('step', 1)"
      ><el-icon><ArrowDown /></el-icon></button>
    </el-tooltip>
    <el-tooltip content="清空查找" placement="top" :show-after="400">
      <button
        type="button"
        class="ui-icon-btn"
        :disabled="!tools.findQuery.value"
        aria-label="清空查找"
        @click="tools.clearFind()"
      ><el-icon><Close /></el-icon></button>
    </el-tooltip>
    <span class="find-hint">
      {{ FIND_SHORTCUTS.open }} 打开 · {{ FIND_SHORTCUTS.next }} 下一处 · {{ FIND_SHORTCUTS.prev }} 上一处
    </span>
  </div>
</template>

<script setup>
/** 查找定位条：显示 n/N 并把步进交给 LogViewer 做虚拟列表滚动 */
import { computed, ref } from 'vue'
import { Search, ArrowUp, ArrowDown, Close } from '@element-plus/icons-vue'
import { useLogSearchTools } from '../../composables/useLogSearchTools'
import { FIND_SHORTCUTS } from '../../constants/logSearchTools'

const emit = defineEmits(['step'])
const tools = useLogSearchTools()
const inputRef = ref(null)
const focused = ref(false)

const total = computed(() => tools.matches.value.length)
const current = computed(() => (total.value ? tools.findIndex.value + 1 : 0))

function focusInput() {
  inputRef.value?.focus()
  inputRef.value?.select?.()
}

function onEsc() {
  if (tools.findQuery.value) {
    tools.clearFind()
    return
  }
  if (!tools.drawerPinned.value) tools.closeDrawer()
}

defineExpose({ focus: focusInput })
</script>

<style scoped>
.find-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.find-box {
  flex: 1 1 260px;
  min-width: 180px;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  height: 32px;
  padding: 0 var(--sp-2) 0 var(--sp-3);
  border: 1px solid var(--bd);
  border-radius: var(--r-sm);
  background: var(--s1);
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.find-box.focused {
  border-color: var(--ac);
  box-shadow: 0 0 0 3px var(--ring);
}
.find-icon { color: var(--t3); flex-shrink: 0 }
.find-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--t1);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
}
.find-input::placeholder { color: var(--t3) }
.find-count {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--ac);
  white-space: nowrap;
}
.find-count.empty { color: var(--t3); font-weight: 500 }
.find-hint {
  flex: 1 1 100%;
  font-size: var(--fs-xs);
  color: var(--t2);
  opacity: .82;
  line-height: 1.5;
}
@media (max-width: 900px) {
  .find-box { flex-basis: 100% }
}
</style>
