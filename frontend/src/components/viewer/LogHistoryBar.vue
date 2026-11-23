<template>
  <div class="hist-row" :title="[dateFilter && !filteredLogFiles.length ? '该日期无归档' : '', indexHint, ruleHint].filter(Boolean).join(' · ') || undefined">
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
          <el-tag v-else-if="cachedFiles[f.name]" size="small" effect="plain" class="opt-cache">本地</el-tag>
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
    <span v-if="cachedCount" class="ui-chip hist-cache-chip" :title="cacheHint">
      本地 {{ cachedCount }} · {{ fmtMB(cacheStats && cacheStats.bytes) }}
    </span>
    <span v-if="dateFilter && !filteredLogFiles.length" class="hist-cache">该日期无归档</span>
    <span v-if="indexHint" class="hist-cache" :title="indexHint">{{ indexHint }}</span>
    <span v-if="ruleHint" class="ui-chip hist-rule" :title="ruleHint">{{ ruleHint }}</span>
  </div>
</template>

<script setup>
/** 历史文件区：从 LogViewer 顶部搬入抽屉，状态仍由父组件持有 */
import { computed } from 'vue'
import { Refresh } from '@element-plus/icons-vue'

const props = defineProps({
  dateFilter: { type: String, default: '' },
  selectedFile: { type: String, default: '' },
  logFiles: { type: Array, default: () => [] },
  /** 已缓存到本地的文件：name -> { tail, size, totalSize, lastAccess } */
  cachedFiles: { type: Object, default: () => ({}) },
  /** 全局缓存用量：{ files, bytes, maxBytes, ... } */
  cacheStats: { type: Object, default: null },
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
  // 时间来自目录页（精确到分钟）；旧索引无 mtime 时回退到文件名里的日期
  const when = f.mtime || f.date || ''
  const base = f.active
    ? `当前（${f.name}）`
    : (f.idx != null && f.idx > 0 ? `${when} #${f.idx}` : (when || f.name))
  // 大小同样来自目录 HTML，仅做展示；目录未给出时为空
  return f.size ? `${base} · ${f.size}` : base
}

function fmtMB(n) {
  const v = Number(n) || 0
  return v >= 1024 ** 3
    ? `${(v / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(v / 1024 ** 2)} MB`
}

/** 当前尾部区间下可命中的文件数（与下拉里的「本地」标记一致） */
const cachedCount = computed(() => Object.keys(props.cachedFiles || {}).length)

/** 缓存用量的完整说明：当前可用数 + 总占用 + 上限（LRU 容量） */
const cacheHint = computed(() => {
  const s = props.cacheStats
  if (!s) return ''
  return `当前尾部大小下可命中 ${cachedCount.value} 个文件；本地缓存共 ${s.files} 个，占用 ${fmtMB(s.bytes)} / 上限 ${fmtMB(s.maxBytes)}（超限按最久未访问淘汰）`
})
</script>

<style scoped>
.opt-cache { margin-left: 6px }
.hist-cache-chip { flex: none }
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
