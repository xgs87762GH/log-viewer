<template>
  <div class="filter-bar" :class="{ focused }" @click="focusInput" role="search">
    <label class="fb-label" for="log-filter-input" title="参考 Grafana：包含 / 排除行过滤">过滤</label>

    <el-tag
      v-for="f in textFilters"
      :key="f.id"
      size="small"
      :type="f.mode === 'exclude' ? 'danger' : 'primary'"
      effect="plain"
      closable
      class="fb-chip"
      :class="f.mode"
      @close="removeTextFilter(f.id)"
      @click.stop="toggleFilterMode(f.id)"
      :title="f.mode === 'include' ? '点击切换为排除' : '点击切换为包含'"
    >
      <span class="fb-op">{{ f.mode === 'exclude' ? '≠' : '∋' }}</span>
      {{ f.text }}
    </el-tag>

    <input
      id="log-filter-input"
      ref="inputRef"
      v-model="draft"
      class="fb-input"
      type="text"
      :placeholder="placeholder"
      aria-label="日志文本过滤"
      @keydown.enter.prevent="commit()"
      @keydown.backspace="onBackspace"
      @focus="focused = true"
      @blur="focused = false"
    />

    <div class="fb-actions" @click.stop>
      <el-button
        size="small"
        type="primary"
        plain
        :disabled="!draft.trim()"
        title="添加包含条件（Enter）"
        @click="commit('include')"
      >∋</el-button>
      <el-button
        size="small"
        type="danger"
        plain
        :disabled="!draft.trim()"
        title="添加排除条件（或以 - 开头后 Enter）"
        @click="commit('exclude')"
      >≠</el-button>
      <el-button
        v-if="textFilters.length"
        size="small"
        text
        title="清空全部过滤"
        @click="clearTextFilters"
      >清空</el-button>
    </div>
  </div>
</template>

<script setup>
/**
 * Grafana 风格行过滤条：芯片 = 条件，∋ 包含 / ≠ 排除，Enter 添加。
 */
import { ref, computed } from 'vue'
import { useLogViewFilters } from '../../composables/useLogViewFilters'

const {
  textFilters,
  addTextFilter,
  removeTextFilter,
  clearTextFilters,
  toggleFilterMode,
} = useLogViewFilters()

const draft = ref('')
const focused = ref(false)
const inputRef = ref(null)

const placeholder = computed(() =>
  textFilters.value.length
    ? '继续输入，Enter 添加；-关键字 排除'
    : '过滤正文… Enter 添加；-health 排除；点击芯片可切换包含/排除',
)

function focusInput() {
  inputRef.value?.focus()
}

function commit(forceMode) {
  const raw = draft.value
  if (!addTextFilter(raw, forceMode)) return
  draft.value = ''
}

function onBackspace() {
  if (draft.value) return
  const list = textFilters.value
  if (!list.length) return
  removeTextFilter(list[list.length - 1].id)
}
</script>

<style scoped>
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
  flex: 1;
  min-width: 220px;
  max-width: min(720px, 100%);
  transition: border-color 0.15s;
}
.filter-bar.focused {
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
  cursor: pointer;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fb-chip :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fb-op {
  font-weight: 700;
  opacity: 0.85;
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
.fb-actions .el-button + .el-button {
  margin-left: 0;
}
</style>
