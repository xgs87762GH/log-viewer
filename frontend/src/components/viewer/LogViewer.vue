<template>
  <div class="viewer">
    <el-empty v-if="!nav.currentService" description="从左侧选择应用和级别开始查看" />

    <template v-else>
      <div class="toolbar">
        <el-text class="path" truncated>
          {{ nav.currentEnvInfo.label || nav.env }} › {{ nav.currentService.module }} /
          {{ selectedFile || (nav.selectedLevel + '.log') }}
        </el-text>
        <LogFilterBar class="filter-slot" />
        <el-button size="small" :type="wordWrap ? 'primary' : 'default'" @click="toggleWordWrap">换行</el-button>
        <el-button size="small" :type="autoScroll ? 'primary' : 'default'" @click="toggleAutoScroll">末尾</el-button>
        <el-button size="small" :loading="loading" @click="() => loadLog({ skipList: true, force: true })">刷新</el-button>
        <el-dropdown trigger="click" @command="onCopyCommand">
          <el-button size="small">复制</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="all">复制全部</el-dropdown-item>
              <el-dropdown-item command="filtered" :disabled="!filteredRowCount">复制过滤结果</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="hist-bar">
        <el-text size="small" class="hist-label">历史日志</el-text>
        <el-date-picker
          v-model="dateFilter"
          type="date"
          size="small"
          class="hist-date"
          placeholder="按日期筛"
          value-format="YYYY-MM-DD"
          clearable
        />
        <el-select
          v-model="selectedFile"
          size="small"
          class="hist-sel"
          filterable
          placeholder="选择文件（可输入日期检索）"
          :loading="filesLoading"
          @change="onFileChange"
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
        <el-button
          size="small"
          type="primary"
          plain
          :loading="filesLoading"
          title="强制全量扫描目录并更新本地索引"
          @click="refreshFileList"
        >重新探测</el-button>
        <el-tag size="small" type="info" effect="plain">
          {{ filteredLogFiles.length }}/{{ logFiles.length }} 个文件
        </el-tag>
        <el-text size="small" type="info" class="hist-cache">{{ indexHint }}</el-text>
        <el-text v-if="ruleHint" size="small" type="info" class="hist-rule">{{ ruleHint }}</el-text>
      </div>

      <div
        ref="logWrapRef"
        class="log-wrap"
        role="log"
        :aria-busy="loading ? 'true' : 'false'"
        :aria-label="ariaLogLabel"
        @scroll="onScroll"
      >
        <div v-if="loading" class="loading-panel">
          <el-icon class="is-loading" :size="22"><Loading /></el-icon>
          <span>加载中…</span>
        </div>
        <el-result v-else-if="error" icon="warning" :sub-title="error" class="tip-err" />
        <div
          v-else-if="!lines.length"
          class="empty-panel"
        >
          <el-empty description="暂无日志内容" :image-size="72" />
        </div>
        <div
          v-else-if="filteredRowCount === 0"
          class="empty-panel"
        >
          <el-empty description="无匹配日志" :image-size="72">
            <el-button type="primary" size="small" @click="clearFilters">清空过滤</el-button>
          </el-empty>
        </div>
        <div v-else class="v-viewport" :style="{ height: totalHeight + 'px' }">
          <div class="v-content" :style="{ transform: `translateY(${offsetY}px)` }">
            <div
              v-for="row in renderedRows"
              :key="row.key"
              :class="rowClass(row)"
              :style="{ height: row.pxH + 'px' }"
            >
              <template v-if="row.kind === 'fold'">
                <span class="no"></span>
                <span class="tx fold-ctrl">
                  已折叠本条剩余 {{ row.remain }} 行
                  <button
                    type="button"
                    class="fold-btn"
                    :aria-label="'展开折叠的日志条目'"
                    @click="expandEntry(row.entryId)"
                  >展开</button>
                </span>
              </template>
              <template v-else>
                <span class="no">{{ row.no }}</span>
                <span class="tx" v-html="row.html"></span>
                <button
                  v-if="row.canExpand"
                  type="button"
                  class="fold-btn inline"
                  aria-label="展开本条日志"
                  @click="expandEntry(row.entryId)"
                >展开</button>
                <button
                  v-else-if="row.canCollapse"
                  type="button"
                  class="fold-btn inline"
                  aria-label="折叠本条日志"
                  @click="collapseEntry(row.entryId)"
                >折叠</button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="status">
        <el-tag v-if="truncated" type="warning" size="small" effect="plain">已截断（仅显示尾部）</el-tag>
        <el-tag v-if="lineCapped" type="info" size="small" effect="plain">行数已达上限 {{ appliedMaxLines }}</el-tag>
        <el-text size="small" type="info">行: {{ displayLines }}</el-text>
        <el-text size="small" type="info">过滤后: {{ filteredRowCount }}</el-text>
        <el-text size="small" type="info">已下: {{ fmtSize(downloadedBytes) }} / 限 {{ appliedTailMB }}MB</el-text>
        <el-text size="small" type="info">文件: {{ fmtSize(size) }}</el-text>
        <el-text size="small" type="info">更新: {{ updateTime }}</el-text>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * LogViewer —— 日志预览
 * 折叠语义：针对「单条日志」（主行 + 续行/堆栈），超过阈值才折叠该条。
 * 渲染：可变行高虚拟列表（换行开/关统一路径），仅窗口内高亮。
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useLogs } from '../../composables/useLogs'
import { useSettings } from '../../composables/useSettings'
import { useNavigation } from '../../composables/useNavigation'
import { useToast } from '../../composables/useToast'
import { useLogViewFilters } from '../../composables/useLogViewFilters'
import { FALLBACK_LEVEL_ORDER } from '../../constants/logLevels'
import { highlightLine } from '../../utils/logParser'
import {
  buildRowLayout,
  estimateWrapCols,
  findStartIndex,
  findEndIndex,
} from '../../utils/logViewRows'
import { processLogAsync, processLogSync } from '../../utils/logProcessClient'
import { Loading } from '@element-plus/icons-vue'
import LogFilterBar from './LogFilterBar.vue'

const logs = useLogs()
const settings = useSettings()
const nav = useNavigation()
const toast = useToast()
const {
  includeTerms,
  excludeTerms,
  clearTextFilters,
} = useLogViewFilters()

const BUFFER = 15

const logWrapRef = ref(null)
const autoScroll = ref(true)
const scrollTop = ref(0)
const viewportH = ref(600)
const baseRowH = ref(22)

const loading = ref(false)
const error = ref('')
const lines = ref([])
const size = ref(0)
const updateTime = ref('--')
const truncated = ref(false)
const totalLines = ref(0)
const displayLines = ref(0)
const downloadedBytes = ref(0)
const appliedMaxLines = ref(10000)
const appliedTailMB = ref(10)
const lineCapped = ref(false)

const logFiles = ref([])
const selectedFile = ref('')
const filesLoading = ref(false)
const dateFilter = ref('')
const ruleHint = ref('')
const indexHint = ref('索引未建立')

const expandedIds = ref(new Set())

const viewRows = ref([])
const filteredRowCount = ref(0)

let loadSeq = 0
let processSeq = 0
let scrollRaf = 0
let resizeTimer = 0
const hlCache = new Map()

const filteredLogFiles = computed(() => {
  const d = dateFilter.value
  if (!d) return logFiles.value
  return logFiles.value.filter((f) => f.active || f.date === d)
})

const foldEnabled = computed(() => settings.cfg.behavior.foldOverLimit === true)
const foldMaxLines = computed(() => {
  const n = Number(settings.cfg.behavior.foldMaxLines)
  return Number.isFinite(n) ? Math.min(50000, Math.max(1, Math.round(n))) : 5
})

const wrapCols = ref(100)
const wordWrap = computed(() => settings.cfg.behavior.wordWrap === true)

const ariaLogLabel = computed(() => {
  if (loading.value) return '日志加载中'
  if (error.value) return '日志加载失败'
  return `日志内容，共 ${filteredRowCount.value} 行`
})

const layout = computed(() => buildRowLayout(viewRows.value, baseRowH.value))
const totalHeight = computed(() => layout.value.totalHeight)

const startIdx = computed(() => {
  const { offsets } = layout.value
  return Math.max(0, findStartIndex(offsets, scrollTop.value) - BUFFER)
})
const endIdx = computed(() => {
  const { offsets } = layout.value
  const bottom = scrollTop.value + viewportH.value
  return Math.min(viewRows.value.length, findEndIndex(offsets, bottom) + BUFFER)
})
const offsetY = computed(() => layout.value.offsets[startIdx.value] || 0)

function optionLabel(f) {
  if (f.active) return `当前（${f.name}）`
  return f.idx != null && f.idx > 0 ? `${f.date} #${f.idx}` : (f.date || f.name)
}

function fmtRefreshTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

function refreshIndexHint() {
  const svc = nav.currentService
  if (!svc) {
    indexHint.value = '索引未建立'
    return
  }
  const meta = logs.getIndexMeta(svc.host, svc.app, nav.env)
  if (!meta?.updatedAt) {
    indexHint.value = '索引未建立'
    return
  }
  const when = fmtRefreshTime(meta.updatedAt)
  indexHint.value = meta.refreshedToday
    ? `今日已刷新 ${when}`
    : `上次刷新 ${when}（打开将检测）`
}

function readBaseRowH() {
  const root = getComputedStyle(document.documentElement)
  const fs = parseFloat(root.getPropertyValue('--fs-log')) || 13
  const lhRaw = root.getPropertyValue('--lh-log').trim()
  const lh = parseFloat(lhRaw) || 1.65
  if (wordWrap.value) {
    return Math.max(18, Math.round(fs * lh))
  }
  return Math.max(18, Math.round(fs * 1.7))
}

function refreshWrapCols() {
  const el = logWrapRef.value
  if (!el) return
  wrapCols.value = estimateWrapCols(el.clientWidth)
  baseRowH.value = readBaseRowH()
  document.documentElement.style.setProperty('--row-h', baseRowH.value + 'px')
}

function paintRow(row, kw, pxH) {
  if (row.kind === 'fold') return { ...row, pxH }
  const show = row.truncated ? row.text + '…' : row.text
  const kwKey = Array.isArray(kw) ? kw.join('\0') : ''
  const cacheKey = row.key + '|' + kwKey
  let html = hlCache.get(cacheKey)
  if (html == null) {
    html = safeHighlight(show, row.level, kw)
    if (hlCache.size > 800) hlCache.clear()
    hlCache.set(cacheKey, html)
  }
  return { ...row, html, pxH }
}

const renderedRows = computed(() => {
  const kws = includeTerms.value
  const { heights } = layout.value
  const result = []
  for (let i = startIdx.value; i < endIdx.value; i++) {
    const row = viewRows.value[i]
    if (!row) continue
    result.push(paintRow(row, kws, heights[i] || baseRowH.value))
  }
  return result
})

function rowClass(row) {
  if (row.kind === 'fold') return ['ln', 'ln-fold', wordWrap.value ? 'wrap' : '']
  return ['ln', row.abbr ? 'ln-' + row.abbr : '', wordWrap.value ? 'wrap' : '']
}

function expandEntry(id) {
  const next = new Set(expandedIds.value)
  next.add(id)
  expandedIds.value = next
}

function collapseEntry(id) {
  const next = new Set(expandedIds.value)
  next.delete(id)
  expandedIds.value = next
}

function clearFilters() {
  clearTextFilters()
}

function safeHighlight(line, level, kw) {
  try {
    return highlightLine(line, level, kw)
  } catch {
    return String(line ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}

const logKey = computed(() => `${nav.env}|${nav.selectedIdx}|${nav.selectedLevel}`)
const serviceKey = computed(() => `${nav.env}|${nav.selectedIdx}`)

function onScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    const el = logWrapRef.value
    if (!el) return
    scrollTop.value = el.scrollTop
    viewportH.value = el.clientHeight
  })
}

function resetViewData() {
  lines.value = []
  viewRows.value = []
  filteredRowCount.value = 0
  size.value = 0
  truncated.value = false
  totalLines.value = 0
  displayLines.value = 0
  downloadedBytes.value = 0
  lineCapped.value = false
  scrollTop.value = 0
  expandedIds.value = new Set()
  hlCache.clear()
}

async function rebuildViewRows() {
  const seq = ++processSeq
  const args = {
    lines: lines.value,
    includeTerms: includeTerms.value,
    excludeTerms: excludeTerms.value,
    expandedIds: expandedIds.value,
    foldEnabled: foldEnabled.value,
    foldMaxLines: foldMaxLines.value,
    wordWrap: wordWrap.value,
    wrapCols: wrapCols.value,
  }
  try {
    const result = await processLogAsync(args)
    if (seq !== processSeq) return
    viewRows.value = result.viewRows
    filteredRowCount.value = result.filteredRowCount
    hlCache.clear()
  } catch (e) {
    if (seq !== processSeq) return
    const result = processLogSync(args)
    viewRows.value = result.viewRows
    filteredRowCount.value = result.filteredRowCount
  }
}

watch(
  [
    lines,
    includeTerms,
    excludeTerms,
    expandedIds,
    foldEnabled,
    foldMaxLines,
    wordWrap,
    wrapCols,
  ],
  () => {
    rebuildViewRows()
  },
  { deep: false },
)

/**
 * 确保历史文件列表就绪（唯一入口）。
 */
async function ensureFileList({ force = false, keepSelection = false, hydrate = true } = {}) {
  const svc = nav.currentService
  if (!svc) {
    logFiles.value = []
    selectedFile.value = ''
    ruleHint.value = ''
    indexHint.value = '索引未建立'
    return []
  }

  const level = nav.selectedLevel
  ruleHint.value = (() => {
    const r = logs.getLogFileRule(svc.host, svc.app, nav.env)
    return r.desc || r.id || ''
  })()
  refreshIndexHint()

  if (hydrate && !force) {
    const peeked = logs.peekLogFiles(svc.host, svc.app, level, nav.env)
    if (peeked.length) applyFileList(peeked, keepSelection)
    else if (nav.routeFile) selectedFile.value = nav.routeFile
    else if (!selectedFile.value) {
      selectedFile.value = logs.guessActiveFileName(svc.host, svc.app, level, nav.env)
    }
  }

  filesLoading.value = true
  try {
    const files = await logs.listLogFiles(svc.host, svc.app, level, {
      force,
      envKey: nav.env,
      soft: !force,
    })
    applyFileList(files, keepSelection || (!force && hydrate))
    refreshIndexHint()
    return files
  } catch (e) {
    console.warn('listLogFiles failed:', e.message)
    if (!keepSelection && !logFiles.value.length) {
      logFiles.value = []
      selectedFile.value = ''
    }
    return logFiles.value
  } finally {
    filesLoading.value = false
  }
}

function applyFileList(files, keepSelection) {
  logFiles.value = files
  const prev = selectedFile.value
  const prefer = nav.routeFile
  if (prefer && files.some((f) => f.name === prefer)) {
    selectedFile.value = prefer
    return
  }
  if (keepSelection && prev && files.some((f) => f.name === prev)) {
    nav.setRouteFile(prev)
    return
  }
  if (keepSelection && prev && !files.length) return
  selectedFile.value = files[0]?.name || prev || ''
  if (selectedFile.value) nav.setRouteFile(selectedFile.value)
}

async function refreshFileList() {
  const before = new Set(logFiles.value.map((f) => f.name))
  await ensureFileList({ force: true, keepSelection: true, hydrate: false })
  const added = logFiles.value.filter((f) => !before.has(f.name)).length
  if (!logFiles.value.length) {
    toast.success('目录下未发现该级别日志')
  } else if (added > 0) {
    toast.success(`已全量探测：共 ${logFiles.value.length} 个，新增 ${added} 个`)
  } else {
    toast.success(`已全量探测：共 ${logFiles.value.length} 个文件（索引已更新）`)
  }
}

function onFileChange(name) {
  if (!name && logFiles.value[0]) {
    selectedFile.value = logFiles.value[0].name
  }
  nav.setRouteFile(selectedFile.value)
  loadLog({ skipList: true, force: true })
}

async function loadLog({ skipList = false, force = false } = {}) {
  const svc = nav.currentService
  if (!svc) return
  const seq = ++loadSeq

  loading.value = true
  error.value = ''

  let knownLevels = nav.getLevels(svc)
  let hasIndex = !!logs.getIndexMeta(svc.host, svc.app, nav.env)
  if (!hasIndex) {
    try {
      await logs.discoverLevels(svc.host, svc.app, {
        force: true,
        envKey: nav.env,
        soft: false,
      })
    } catch (e) {
      console.warn('pre-discover failed:', e.message)
    }
    if (seq !== loadSeq) return
    knownLevels = nav.getLevels(svc)
    hasIndex = !!logs.getIndexMeta(svc.host, svc.app, nav.env)
  }

  if (hasIndex && Array.isArray(knownLevels) && knownLevels.length === 0) {
    loading.value = false
    error.value = '该应用目录下未发现可用级别日志'
    resetViewData()
    logFiles.value = []
    selectedFile.value = ''
    return
  }
  if (
    knownLevels.length &&
    !knownLevels.includes(nav.selectedLevel) &&
    hasIndex
  ) {
    const prefer = FALLBACK_LEVEL_ORDER.find((lv) => knownLevels.includes(lv)) || knownLevels[0]
    if (prefer && prefer !== nav.selectedLevel) {
      loading.value = false
      nav.setLevel(prefer)
      return
    }
  }

  const requestedLevel = nav.selectedLevel
  resetViewData()
  try {
    if (!skipList) {
      ensureFileList({ force: false, keepSelection: true, hydrate: true }).catch(() => {})
    }

    const filename = selectedFile.value || nav.routeFile || undefined
    const data = await logs.fetchLog(svc.host, svc.app, requestedLevel, filename, { force })
    if (seq !== loadSeq) return
    lines.value = data.lines
    size.value = data.size
    downloadedBytes.value = data.downloadedBytes || 0
    truncated.value = data.truncated || false
    lineCapped.value = data.lineCapped || false
    appliedMaxLines.value = data.maxLines || settings.getFetchLimits().maxLines
    appliedTailMB.value = data.tailMB || settings.getFetchLimits().tailMB
    totalLines.value = data.totalLines || data.lines.length
    displayLines.value = data.displayLines || data.lines.length
    if (data.filename) {
      selectedFile.value = data.filename
      nav.setRouteFile(data.filename)
    }
    updateTime.value = new Date().toLocaleTimeString()
  } catch (e) {
    if (seq !== loadSeq) return
    if (logs.isAbortError?.(e) || e?.name === 'AbortError') return
    const missing = /不存在|HTTP 404/.test(e.message || '')
    const isExplicitArchive =
      selectedFile.value &&
      logFiles.value.some((f) => f.name === selectedFile.value && !f.active)
    if (missing && !isExplicitArchive) {
      const fallback = await logs.resolveFallbackLevel(
        svc.host, svc.app, requestedLevel, svc.levels, nav.env,
      )
      if (seq !== loadSeq) return
      if (fallback) {
        toast.warn(
          `${requestedLevel} 日志不存在`,
          `已自动切换到 ${fallback}（优先级：INFO > DEBUG > WARN > ERROR > TRACE）`,
        )
        nav.setLevel(fallback)
        return
      }
      const after = nav.getLevels(svc)
      if (logs.getIndexMeta(svc.host, svc.app, nav.env) && after.length === 0) {
        error.value = '该应用目录下未发现可用级别日志'
        resetViewData()
        return
      }
    }
    error.value = '加载失败: ' + e.message
    resetViewData()
  } finally {
    if (seq === loadSeq) loading.value = false
  }
  if (seq !== loadSeq) return
  await nextTick()
  await rebuildViewRows()
  measureViewport()
  scrollToEnd()
}

function measureViewport() {
  const el = logWrapRef.value
  if (el) viewportH.value = el.clientHeight
  refreshWrapCols()
}

function scrollToEnd() {
  if (!autoScroll.value) return
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = logWrapRef.value
      if (!el) return
      el.scrollTop = el.scrollHeight
      scrollTop.value = el.scrollTop
    })
  })
}

function toggleAutoScroll() {
  autoScroll.value = !autoScroll.value
  settings.setBehavior('autoScroll', autoScroll.value)
  if (autoScroll.value) scrollToEnd()
}

function toggleWordWrap() {
  const next = !wordWrap.value
  settings.setBehavior('wordWrap', next)
  nextTick(() => {
    const ratio = totalHeight.value > 0 ? scrollTop.value / totalHeight.value : 0
    refreshWrapCols()
    nextTick(() => {
      const el = logWrapRef.value
      if (!el) return
      el.scrollTop = ratio * el.scrollHeight
      scrollTop.value = el.scrollTop
    })
  })
}

function onCopyCommand(cmd) {
  if (cmd === 'filtered') copyFiltered()
  else copyAll()
}

async function writeClipboard(text, okMsg) {
  if (!text) {
    toast.warn('无可复制内容')
    return
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('剪贴板不可用')
    await navigator.clipboard.writeText(text)
    toast.success(okMsg)
  } catch (e) {
    toast.error('复制失败', e?.message || String(e))
  }
}

function copyAll() {
  writeClipboard(lines.value.join('\n'), '已复制全部日志')
}

function copyFiltered() {
  const parts = []
  for (const row of viewRows.value) {
    if (row.kind === 'fold') continue
    parts.push(row.truncated ? row.text + '…' : row.text)
  }
  writeClipboard(parts.join('\n'), '已复制过滤结果')
}

function fmtSize(b) {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}

watch(logKey, () => {
  expandedIds.value = new Set()
  selectedFile.value = ''
  logFiles.value = []
  loadLog()
})

watch(serviceKey, () => {
  dateFilter.value = ''
})

watch(
  () => settings.cfg.behavior.autoScroll,
  (v) => {
    autoScroll.value = v !== false
  },
)

watch(
  () => [settings.cfg.sizes.log, settings.cfg.sizes.lh],
  () => {
    const ratio = totalHeight.value > 0 ? scrollTop.value / totalHeight.value : 0
    refreshWrapCols()
    nextTick(() => {
      const el = logWrapRef.value
      if (!el) return
      el.scrollTop = ratio * el.scrollHeight
      scrollTop.value = el.scrollTop
    })
  },
)

watch(dateFilter, () => {
  const list = filteredLogFiles.value
  if (!list.length) return
  if (!list.some((f) => f.name === selectedFile.value)) {
    selectedFile.value = list[0].name
    nav.setRouteFile(selectedFile.value)
    loadLog({ skipList: true, force: true })
  }
})

watch(
  () => nav.routeFile,
  (file) => {
    if (!file || file === selectedFile.value) return
    if (!logFiles.value.some((f) => f.name === file)) return
    selectedFile.value = file
    loadLog({ skipList: true, force: true })
  },
)

let unsubIndex = null
let unsubSettings = null
let onWinResize = null

onMounted(() => {
  autoScroll.value = settings.cfg.behavior.autoScroll !== false
  measureViewport()
  onWinResize = () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const ratio = totalHeight.value > 0 ? scrollTop.value / totalHeight.value : 0
      refreshWrapCols()
      nextTick(() => {
        const el = logWrapRef.value
        if (!el) return
        el.scrollTop = ratio * el.scrollHeight
        scrollTop.value = el.scrollTop
      })
    }, 120)
  }
  window.addEventListener('resize', onWinResize)
  unsubIndex = logs.onLogIndexUpdate((key, entry, meta) => {
    const svc = nav.currentService
    if (!svc || !entry) return
    if (key !== `${svc.host}|${svc.app}`) return
    const list = entry.archives?.[nav.selectedLevel] || []
    applyFileList(list, true)
    refreshIndexHint()
    // 软刷新静默合并；强制探测由 refreshFileList 自行 toast
    void meta
  })
  unsubSettings = settings.onCommit((meta = {}) => {
    if (meta.needsReload && nav.view === 'viewer' && nav.currentService) {
      toast.success('设置已应用，正在按新限制重新加载…')
      loadLog({ skipList: true, force: true })
    }
  })
  if (nav.currentService) loadLog()
})

onUnmounted(() => {
  if (unsubIndex) unsubIndex()
  if (unsubSettings) unsubSettings()
  if (onWinResize) window.removeEventListener('resize', onWinResize)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  clearTimeout(resizeTimer)
})
</script>

<style scoped>
.viewer { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden }

.toolbar {
  padding: 10px 14px;
  border-bottom: 1px solid var(--bd);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--s1);
  flex-shrink: 0;
}
.path { flex: 1; min-width: 140px; font-family: var(--font-log); font-size: 12.5px }
.filter-slot { flex: 1; min-width: 240px; max-width: min(720px, 100%) }

.hist-bar {
  padding: 8px 14px;
  border-bottom: 1px solid var(--bd);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  background: color-mix(in srgb, var(--el-color-primary) 6%, var(--s1));
  flex-shrink: 0;
}
.hist-label {
  font-weight: 600;
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.hist-date { width: 148px; flex-shrink: 0 }
.hist-sel { width: min(420px, 100%); min-width: 220px; flex: 1 }
.hist-rule { opacity: 0.75; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.file-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.loading-panel {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: color-mix(in srgb, var(--bg, #0f1117) 72%, transparent);
  color: var(--t1);
  font-size: 13.5px;
  font-weight: 500;
  backdrop-filter: blur(2px);
}
.empty-panel {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.tip-err { padding: 40px 16px }

.v-viewport { position: relative; width: 100% }
.v-content { position: absolute; top: 0; left: 0; width: 100% }

.ln-fold {
  border-left-color: var(--warn);
  background: color-mix(in srgb, var(--warn) 8%, transparent);
}
.fold-ctrl { color: var(--warn) !important; font-size: 12px }
.fold-btn {
  margin-left: 8px;
  border: none;
  background: transparent;
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  padding: 0;
}
.fold-btn:hover { text-decoration: underline }
.fold-btn.inline { flex-shrink: 0 }

.status {
  padding: 6px 16px;
  border-top: 1px solid var(--bd);
  display: flex;
  gap: 14px;
  background: var(--s1);
  flex-shrink: 0;
  align-items: center;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .toolbar { padding: 8px 10px }
  .path { flex: 1 1 100%; min-width: 0 }
  .filter-slot { flex: 1 1 100%; max-width: none; min-width: 0 }
  .hist-bar { padding: 6px 10px }
  .hist-date { width: 132px }
  .hist-sel { min-width: 160px }
}
</style>
