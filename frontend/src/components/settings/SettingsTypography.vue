<template>
  <div class="typography">
    <div v-for="f in fontFields" :key="f.key" class="field">
      <div class="field-label">
        <span>{{ f.label }}</span>
        <small>{{ f.hint }}</small>
      </div>
      <el-select v-model="draft.fonts[f.key]" size="small" class="field-control">
        <el-option
          v-for="opt in fontOptions[f.key]"
          :key="opt"
          :label="shortLabel(opt)"
          :value="opt"
        />
      </el-select>
    </div>

    <div v-for="s in sizeFields" :key="s.key" class="field">
      <div class="field-label">
        <span>{{ s.label }}</span>
        <small>{{ s.hint }}</small>
      </div>
      <el-radio-group v-model="draft.sizes[s.key]" size="small">
        <el-radio-button v-for="opt in sizeOptions[s.group]" :key="opt" :value="opt">
          {{ opt }}
        </el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup>
/** 字体分区：受控编辑 draft 的 fonts / sizes 分片，不直接读写 useSettings */
import { fontOptions, sizeOptions } from '../../constants/settingsOptions'

defineProps({
  draft: { type: Object, required: true },
})

const fontFields = [
  { key: 'ui', label: '界面字体', hint: '导航栏、卡片与表单文字' },
  { key: 'log', label: '日志字体', hint: '仅影响日志阅读区，推荐等宽字体' },
]

const sizeFields = [
  { key: 'base', group: 'base', label: '基础字号', hint: '全站正文与控件文字' },
  { key: 'log', group: 'log', label: '日志字号', hint: '日志行文字大小' },
  { key: 'lh', group: 'lh', label: '日志行高', hint: '日志行之间的垂直距离' },
]

function shortLabel(value) {
  const first = value.split(',')[0].replace(/'/g, '')
  return value.includes(',') ? `${first} …` : first
}
</script>

<style scoped>
.field {
  display: grid; grid-template-columns: 180px minmax(0, 1fr);
  gap: var(--sp-4); align-items: center;
  padding: var(--sp-3) 0; border-bottom: 1px solid var(--bd);
}
.field:last-child { border-bottom: 0; padding-bottom: 0 }
.field-label { display: flex; flex-direction: column; gap: 3px; min-width: 0 }
.field-label span { font-size: var(--fs-sm); font-weight: 650; color: var(--t1) }
.field-label small { font-size: var(--fs-xs); color: var(--t3); line-height: 1.5 }
.field-control { max-width: 340px }
@media (max-width: 900px) {
  .field { grid-template-columns: 1fr; gap: var(--sp-2) }
  .field-control { max-width: none }
}
</style>
