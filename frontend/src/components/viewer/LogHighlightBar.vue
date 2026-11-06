<template>
  <div class="hl-bar">
    <div class="hl-box" :class="{ focused }" @click="focusInput">
      <button
        v-for="term in tools.highlightTerms.value"
        :key="term"
        type="button"
        class="hl-chip"
        :title="`点击移除：${term}`"
        :aria-label="`移除高亮词 ${term}`"
        @click.stop="tools.removeHighlight(term)"
      >
        <span class="hl-dot" aria-hidden="true" />
        <span class="hl-word">{{ term }}</span>
        <el-icon class="hl-x" :size="11" aria-hidden="true"><Close /></el-icon>
      </button>

      <input
        id="log-highlight-input"
        ref="inputRef"
        v-model="draft"
        class="hl-input"
        type="text"
        :placeholder="tools.highlightTerms.value.length ? '继续输入，Enter 添加' : '输入要高亮的文本，Enter 添加…'"
        aria-label="日志文本高亮关键词"
        autocomplete="off"
        @focus="focused = true"
        @blur="focused = false"
        @keydown.enter.prevent="commit"
        @keydown.backspace="onBackspace"
        @keydown.esc.stop.prevent="draft = ''"
      />

      <div class="hl-actions" @click.stop>
        <el-button size="small" type="primary" plain :disabled="!draft.trim()" @click="commit">
          添加
        </el-button>
        <el-tooltip content="清空全部高亮词" placement="top" :show-after="400">
          <button
            type="button"
            class="ui-icon-btn hl-clear"
            :disabled="!tools.highlightTerms.value.length"
            aria-label="清空全部高亮词"
            @click="tools.clearHighlights()"
          ><el-icon><Delete /></el-icon></button>
        </el-tooltip>
      </div>
    </div>
    <span class="hl-hint">
      每条词独立高亮，逗号、空格、引号都按普通字符处理 · 点击词条移除 · 空输入时 Backspace 删末条
    </span>
  </div>
</template>

<script setup>
/**
 * 独立高亮框：回车逐条添加，词条整串保存（不做任何分词）。
 * 与查找定位、过滤条件三者状态完全隔离。
 */
import { ref } from 'vue'
import { Close, Delete } from '@element-plus/icons-vue'
import { useLogSearchTools } from '../../composables/useLogSearchTools'

const tools = useLogSearchTools()
const draft = ref('')
const focused = ref(false)
const inputRef = ref(null)

function focusInput() {
  inputRef.value?.focus()
}

function commit() {
  const raw = draft.value
  if (!String(raw).trim()) return
  tools.addHighlight(raw)
  draft.value = ''
  inputRef.value?.focus()
}

function onBackspace() {
  if (draft.value) return
  const list = tools.highlightTerms.value
  if (!list.length) return
  tools.removeHighlight(list[list.length - 1])
}
</script>

<style scoped>
.hl-bar { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0 }
.hl-box {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-height: 34px;
  padding: 4px var(--sp-2);
  border: 1px solid var(--bd);
  border-radius: var(--r-sm);
  background: var(--s1);
  cursor: text;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.hl-box.focused {
  border-color: var(--trc);
  box-shadow: 0 0 0 3px var(--ring);
}
/* 自绘词条：色点与日志里的 .hl 高亮呼应，不用过滤条的 el-tag */
.hl-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 280px;
  min-width: 0;
  height: 24px;
  padding: 0 7px 0 8px;
  border: 1px solid color-mix(in srgb, var(--trc) 34%, transparent);
  border-radius: var(--r-pill);
  background: color-mix(in srgb, var(--trc) 12%, transparent);
  color: var(--t1);
  font-family: var(--font-log);
  font-size: var(--fs-xs);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.hl-chip:hover {
  border-color: color-mix(in srgb, var(--err) 52%, transparent);
  background: color-mix(in srgb, var(--err) 10%, transparent);
  transform: translateY(-1px);
}
.hl-chip:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px }
.hl-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--trc);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--trc) 18%, transparent);
}
.hl-word { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.hl-x { flex: none; color: var(--t3); font-size: 11px }
.hl-chip:hover .hl-x { color: var(--err) }
.hl-input {
  flex: 1 1 160px;
  min-width: 120px;
  height: 24px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--t1);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
}
.hl-input::placeholder { color: var(--t3) }
.hl-actions { display: flex; align-items: center; gap: var(--sp-1); margin-left: auto; flex-shrink: 0 }
.hl-actions .el-button + .ui-icon-btn { margin-left: 0 }
.hl-hint { font-size: var(--fs-xs); color: var(--t2); opacity: .82; line-height: 1.5 }
@media (max-width: 900px) {
  .hl-input { flex-basis: 100% }
  .hl-chip { max-width: 220px }
}
</style>
