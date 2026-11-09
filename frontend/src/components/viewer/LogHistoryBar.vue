<template>
  <div class="hist-row">
    <el-date-picker
      :model-value="dateFilter"
      type="date"
      size="small"
      class="hist-date"
      placeholder="按日期筛"
      value-format="YYYY-MM-DD"
      clearable
      @update:model-value="(v) => emit('update:dateFilter', v)"
    />
    <el-select
      :model-value="selectedFile"
      size="small"
      class="hist-sel"
      filterable
      placeholder="选择文件（可输入日期检索）"
      :loading="filesLoading"
      @update:model-value="(v) => emit('update:selectedFile', v)"
      @change="(v) => emit('change', v)"
    >
      <el-option
        v-for="f in filteredLogFiles"
        :key="f.name"
        :label="optionLabel(f)"
        :value="f.name"
      >
        <span class="file-opt">
          <span>{{ optionLabel(f) }}</span>
          <el-tag v-if="f.active" size="small" type="success" effect="plain">活跃</el-tag>
        </span>
      </el-option>
    </el-select>
    <el-tooltip content="强制全量扫描目录并更新本地索引" placement="top" :show-after="400">
      <el-button
        size="small"
        type="primary"
        plain
        :icon="Refresh"
        :loading="filesLoading"
        aria-label="重新探测"
        @click="emit('refresh')"
      />
    </el-tooltip>
    <span class="ui-chip">{{ filteredLogFiles.length }}/{{ logFiles.length }} 个文件</span>
    <span v-if="dateFilter && !filteredLogFiles.length" class="hist-cache">该日期无归档</span>
    <span v-if="indexHint" class="hist-cache" :title="indexHint">{{ indexHint }}</span>
    <span v-if="ruleHint" class="ui-chip hist-rule" :title="ruleHint">{{ ruleHint }}</span>
  </div>
</template>

<script setup>
/** 历史文件区：从 LogViewer 顶部搬入抽屉，状态仍由父组件持有 */
import { Refresh } from '@element-plus/icons-vue'

defineProps({
  dateFilter: { type: String, default: '' },
  selectedFile: { type: String, default: '' },
  logFiles: { type: Array, default: () => [] },
  filteredLogFiles: { type: Array, default: () => [] },
  filesLoading: { type: Boolean, default: false },
  indexHint: { type: String, default: '' },
  ruleHint: { type: String, default: '' },
})

const emit = defineEmits([
  'update:dateFilter',
  'update:selectedFile',
  'change',
  'refresh',
])

function optionLabel(f) {
  if (f.active) return `当前（${f.name}）`
  return f.idx != null && f.idx > 0 ? `${f.date} #${f.idx}` : (f.date || f.name)
}
</script>

<style scoped>
.hist-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.hist-date { width: 148px; flex-shrink: 0 }
.hist-sel { width: min(420px, 100%); min-width: 220px; flex: 1 }
.hist-rule { opacity: .85; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.hist-cache { font-size: var(--fs-xs); color: var(--t3); opacity: .8 }
.file-opt { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); width: 100% }
@media (max-width: 900px) {
  .hist-date { width: 132px }
  .hist-sel { min-width: 160px; flex-basis: 100% }
}
</style>
