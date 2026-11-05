<template>
  <div class="appearance">
    <p class="group-label">主题预设</p>
    <div class="theme-grid">
      <button
        v-for="(t, k) in themes"
        :key="k"
        type="button"
        class="theme-card"
        :class="{ on: draft.theme === k }"
        :aria-pressed="draft.theme === k"
        @click="emit('update', { theme: k })"
      >
        <span class="theme-name">{{ t.name }}</span>
        <span class="theme-swatches" aria-hidden="true">
          <i v-for="c in swatches(t)" :key="c" :style="{ background: c }" />
        </span>
        <span class="theme-meta">{{ draft.theme === k ? '当前选择' : '点击选用' }}</span>
      </button>
    </div>

    <div class="group-head">
      <p class="group-label">自定义颜色</p>
      <span class="group-hint">调整任意颜色会切换为「自定义」主题</span>
    </div>
    <div class="color-grid">
      <div v-for="(label, key) in colorLabels" :key="key" class="color-row">
        <el-color-picker v-model="draft.colors[key]" size="small" @change="onColorChange" />
        <span class="color-name">{{ label }}</span>
        <code class="color-value">{{ draft.colors[key] }}</code>
      </div>
    </div>
  </div>
</template>

<script setup>
/** 外观分区：主题卡为原生按钮（键盘可达），颜色网格直接编辑草稿分片 */
import { colorLabels } from '../../constants/settingsOptions'

const props = defineProps({
  draft: { type: Object, required: true },
  themes: { type: Object, required: true },
})
const emit = defineEmits(['update'])

function swatches(t) {
  return [t.colors.ac, t.colors.info, t.colors.warn, t.colors.err]
}

function onColorChange() {
  props.draft.theme = 'custom'
  emit('update', { type: 'color' })
}
</script>

<style scoped>
.group-label {
  font-size: var(--fs-sm); font-weight: 700; color: var(--t2);
  letter-spacing: .02em; margin-bottom: var(--sp-3);
}
.group-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--sp-3); margin-top: var(--sp-5);
}
.group-hint { font-size: var(--fs-xs); color: var(--t3) }
.theme-grid {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3);
}
.theme-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--bd); border-radius: var(--r);
  background: var(--grad-surface), var(--s2);
  color: var(--t2); font-family: inherit; text-align: left; cursor: pointer;
  transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease),
              box-shadow var(--dur) var(--ease), color var(--dur) var(--ease);
}
.theme-card:hover { transform: translateY(-2px); border-color: var(--bd2); box-shadow: var(--sh-1); color: var(--t1) }
.theme-card.on {
  border-color: var(--ac); color: var(--ac);
  background: color-mix(in srgb, var(--ac) 10%, var(--s2));
  box-shadow: 0 0 0 3px var(--ring);
}
.theme-card:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px }
.theme-name { font-size: var(--fs-lg); font-weight: 700 }
.theme-swatches { display: flex; gap: 4px }
.theme-swatches i {
  width: 18px; height: 18px; border-radius: var(--r-xs);
  box-shadow: inset 0 1px 0 var(--hi);
}
.theme-meta { font-size: var(--fs-xs); color: var(--t3) }
.color-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--sp-2);
}
.color-row {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: 7px 10px; background: var(--s2);
  border: 1px solid var(--bd); border-radius: var(--r-sm);
  transition: border-color var(--dur) var(--ease);
}
.color-row:hover { border-color: var(--bd2) }
.color-name { flex: 1; font-size: var(--fs-sm); color: var(--t2); white-space: nowrap }
.color-value {
  font-size: var(--fs-xs); color: var(--t3); font-family: var(--font-log);
  white-space: nowrap;
}
@media (max-width: 900px) {
  .theme-grid { grid-template-columns: 1fr }
  .group-head { flex-direction: column; gap: 2px }
}
</style>
