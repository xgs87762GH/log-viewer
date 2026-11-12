<template>
  <div class="viewer">
    <div v-if="!nav.currentService" class="ui-empty viewer-empty">
      <div class="ui-empty-icon"><el-icon :size="26"><Document /></el-icon></div>
      <div class="ui-empty-title">尚未选择日志</div>
      <div class="ui-empty-desc">从左侧环境 / 模块树中选择应用和级别，即可开始查看日志。</div>
    </div>

    <template v-else>
      <div class="toolbar">
        <div class="tb-path">
          <span class="path-env">{{ nav.currentEnvInfo.label || nav.env }}</span>
          <span class="path-sep">›</span>
          <span class="path-mod">{{ nav.currentService.module }}</span>
          <span class="path-sep">/</span>
          <span class="path-file">{{ selectedFile || (nav.selectedLevel + '.log') }}</span>
        </div>
        <el-tooltip
          :content="tools.drawerOpen.value ? '收起搜索工具' : '展开搜索工具（Ctrl/⌘ + F）'"
          placement="top"
          :show-after="400"
        >
          <button
            type="button"
            class="tb-tools"
            data-drawer-toggle
            :class="{ on: tools.drawerOpen.value }"
            :aria-expanded="tools.drawerOpen.value"
            aria-label="切换搜索工具区"
            @click="tools.toggleDrawer()"
          >
            <el-icon><Search /></el-icon>
            <span>搜索工具</span>
            <span v-if="toolBadge" class="tb-badge">{{ toolBadge }}</span>
            <el-icon v-if="tools.drawerPinned.value" class="tb-pin"><Lock /></el-icon>
          </button>
        </el-tooltip>
        <div class="ui-toolbar-group tb-actions">
          <el-tooltip :content="wordWrap ? '关闭自动换行' : '开启自动换行'" placement="top" :show-after="400">
            <el-button size="small" :type="wordWrap ? 'primary' : 'default'" @click="toggleWordWrap">换行</el-button>
          </el-tooltip>
          <span class="ui-divider-v" />
          <el-tooltip content="重新加载当前日志" placement="top" :show-after="400">
            <el-button
              size="small"
              :icon="Refresh"
              :loading="loading"
              aria-label="刷新"
              @click="() => loadLog({ skipList: true, force: true })"
            />
          </el-tooltip>
          <el-dropdown trigger="click" @command="onCopyCommand">
            <el-button size="small" :icon="DocumentCopy" title="复制日志" aria-label="复制日志" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="all">复制全部</el-dropdown-item>
                <el-dropdown-item command="filtered" :disabled="!filteredRowCount">复制过滤结果</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="log-region">
      <LogToolsDrawer
        :open="tools.drawerOpen.value"
        ref="drawerRef"
        v-model:date-filter="dateFilter"
        v-model:selected-file="selectedFile"
        :log-files="logFiles"
        :filtered-log-files="filteredLogFiles"
        :files-loading="filesLoading"
        :index-hint="indexHint"
        :rule-hint="ruleHint"
        :result-count="filteredRowCount"
        @change-file="onFileChange"
        @refresh-files="refreshFileList"
        @step="goToFind"
      />

      <div
        ref="logWrapRef"
        class="log-wrap"
        role="log"
        :aria-busy="loading ? 'true' : 'false'"
        :aria-label="ariaLogLabel"
        @scroll="onScroll"
      >
        <div v-if="loading" class="loading-panel">
          <span class="loading-chip">
            <el-icon class="is-loading" :size="18"><Loading /></el-icon>
            <span>加载中…</span>
          </span>
        </div>
        <div v-else-if="error" class="empty-panel">
          <div class="ui-empty">
            <div class="ui-empty-icon ui-empty-icon--err"><el-icon><Document /></el-icon></div>
            <div class="ui-empty-title">加载失败</div>
            <div class="ui-empty-desc">{{ error }}</div>
          </div>
        </div>
        <div v-else-if="!lines.length" class="empty-panel">
          <div class="ui-empty">
            <div class="ui-empty-icon"><el-icon><Document /></el-icon></div>
            <div class="ui-empty-title">暂无日志内容</div>
            <div class="ui-empty-desc">当前文件为空，或尚未拉取到日志正文。</div>
          </div>
        </div>
        <div v-else-if="filteredRowCount === 0" class="empty-panel">
          <div class="ui-empty">
            <div class="ui-empty-icon"><el-icon><Search /></el-icon></div>
            <div class="ui-empty-title">无匹配日志</div>
            <div class="ui-empty-desc">当前过滤条件没有命中任何日志条目。</div>
            <el-button type="primary" size="small" @click="clearFilters">清空过滤</el-button>
          </div>
        </div>
        <div
          v-else
          class="v-viewport"
          :class="{ 'no-wrap': !wordWrap }"
          :style="{ height: totalHeight + 'px' }"
        >
          <div class="v-content" :style="{ transform: `translateY(${offsetY}px)` }">
            <div
              v-for="row in renderedRows"
              :key="row.key"
              :class="rowClass(row)"
              :style="{ height: row.pxH + 'px' }"
              :title="row.kind === 'fold' ? undefined : '双击查看上下文'"
              @dblclick="onRowDblClick(row, $event)"
            >
              <LogFoldBar
                v-if="row.kind === 'fold'"
                :expanded="!!row.expanded"
                :remain="row.remain || 0"
                :manual="!!row.manual"
                @toggle="onFoldToggle(row)"
              />
              <template v-else>
                <span class="no">{{ row.no }}</span>
                <span class="tx" v-html="row.html"></span>
                <button
                  v-if="row.canFold"
                  class="ln-ctx-btn ln-fold-btn"
                  type="button"
                  title="折叠本条日志"
                  aria-label="折叠本条日志"
                  @click.stop="foldEntry(row.entryId)"
                  @dblclick.stop
                >折叠</button>
                <button
                  class="ln-ctx-btn"
                  type="button"
                  title="查看上下文"
                  aria-label="查看上下文"
                  @click.stop="openContext(row)"
                  @dblclick.stop
                >⋯</button>
              </template>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div class="status">
        <span v-if="truncated" class="ui-chip ui-chip--warn">已截断（仅显示尾部）</span>
        <span v-if="lineCapped" class="ui-chip">行数上限 {{ appliedMaxLines }}</span>
        <span class="ui-chip"><b>{{ displayLines }}</b> 行</span>
        <span class="ui-chip" :class="filteredRowCount ? 'ui-chip--accent' : ''"><b>{{ filteredRowCount }}</b> 过滤后</span>
        <span v-if="tools.activeFindQuery.value" class="ui-chip ui-chip--accent ui-find-chip" @click="tools.openDrawer()">
          查找 <b>{{ tools.matches.value.length ? tools.findIndex.value + 1 : 0 }}/{{ tools.matches.value.length }}</b>
        </span>
        <span class="ui-chip"><b>{{ fmtSize(downloadedBytes) }}</b> / {{ appliedTailMB }}MB</span>
        <span class="ui-chip">文件 {{ fmtSize(size) }}</span>
        <span class="status-time"><el-icon><Clock /></el-icon> {{ updateTime }}</span>
        <LogScrollNav
          v-if="!loading && !error && lines.length"
          :at-top="atTop"
          :at-bottom="atBottom"
          @top="scrollToTop"
          @bottom="scrollToBottom"
        />
      </div>

      <LogContextDialog
        v-model="context.open"
        :lines="lines"
        :center-idx="context.centerIdx"
        :include-terms="includeTerms"
        :config="contextConfig"
        :meta="context.meta"
      />
    </template>
  </div>
</template>

<script setup>
/**
 * LogViewer —— 日志预览
 * 折叠语义：单条日志视觉行数超阈值则文章式折叠（限高裁切，不改正文）。
 * 渲染：可变行高虚拟列表（换行开/关统一路径），仅窗口内高亮。
 */
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, onActivated, onDeactivated, nextTick } from 'vue'
import { useLogs } from '../../composables/useLogs'
import { useSettings } from '../../composables/useSettings'
import { useNavigation } from '../../composables/useNavigation'
import { useToast } from '../../composables/useToast'
import { useLogViewFilters } from '../../composables/useLogViewFilters'
import { useLogSearchTools } from '../../composables/useLogSearchTools'
import { FALLBACK_LEVEL_ORDER } from '../../constants/logLevels'
import { FIND_HIGHLIGHT_CLASS, USER_HIGHLIGHT_CLASS } from '../../constants/logSearchTools'
import { highlightLine, applyTextHighlights } from '../../utils/logParser'
import { buildFindMatches, findScrollTop } from '../../utils/logFind'
import { estimateWrapCols, baseRowHeight, readLogFontMetrics, measureLogCharWidth } from '../../utils/logTextMetrics'
import { buildRowLayout, findStartIndex, findEndIndex, clampScrollTop } from '../../utils/logVirtualLayout'
import { processLogAsync, processLogSync } from '../../utils/logProcessClient'
import { filterLogFilesByDate, defaultLogFile } from '../../utils/logFileFilter'
import { isAtTop, isAtBottom } from '../../utils/logScrollState'
import { Loading, Refresh, DocumentCopy, Document, Clock, Search, Lock } from '@element-plus/icons-vue'
import LogToolsDrawer from './LogToolsDrawer.vue'
import LogFoldBar from './LogFoldBar.vue'
import LogContextDialog from './LogContextDialog.vue'
import LogScrollNav from './LogScrollNav.vue'

const logs = useLogs()
const settings = useSettings()
const nav = useNavigation()
const toast = useToast()
const {
  includeTerms,
  excludeTerms,
  clearTextFilters,
  textFilters,
} = useLogViewFilters()
const tools = useLogSearchTools()

const BUFFER = 15

/** 先声明视图数据：watch(findHits) 注册时会立即求值，不能让 viewRows 处于 TDZ */
const viewRows = shallowRef([])
const filteredRowCount = ref(0)

const drawerRef = ref(null)

/** 高亮词条由回车逐条添加（整串保存），与过滤词、查找词三者互不干扰 */
const highlightTerms = computed(() => tools.highlightTerms.value)
/** 查找命中基于过滤后的可见行；折叠占位行不参与 */
const findHits = computed(() => buildFindMatches(viewRows.value, tools.activeFindQuery.value))
const currentHitIdx = computed(() => tools.currentMatch()?.idx ?? -1)
const toolBadge = computed(() =>
  textFilters.value.length +
  highlightTerms.value.length +
  (tools.activeFindQuery.value ? 1 : 0),
)

/** 展开折叠条目后按原始行下标恢复定位 */
let pendingFindIdx = -1

watch(findHits, (list) => {
  tools.setFindMatches(list)
  if (pendingFindIdx < 0) return
  const i = list.findIndex((m) => m.idx === pendingFindIdx)
  pendingFindIdx = -1
  if (i < 0) return
  tools.findIndex.value = i
  scrollToMatch(list[i])
})

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
/** 用户手动折叠的条目；与自动超行折叠（expandedIds）互不干扰 */
const collapsedIds = ref(new Set())

/** 上下文锚点是原始行下标，与过滤后的 viewRows 完全解耦 */
const context = ref({ open: false, centerIdx: 0, meta: {} })
const contextConfig = computed(() => settings.getContextConfig())

let loadSeq = 0
let processSeq = 0
let loadAbort = null
let scrollRaf = 0
let resizeTimer = 0
let resizeObserver = null
let pendingScrollToEnd = false
/** 进入日志（加载/切换）时的置底请求不受「自动滚动到末尾」设置限制 */
let pendingScrollForce = false
let lastBox = { w: 0, h: 0 }
const hlCache = new Map()

const filteredLogFiles = computed(() =>
  filterLogFilesByDate(logFiles.value, dateFilter.value),
)

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

/** keep-alive 缓存时 DOM 脱离文档，宽高为 0；此时测量会污染 wrapCols / viewportH */
function logWrapVisible() {
  const el = logWrapRef.value
  return !!el && el.isConnected !== false && el.clientWidth > 0 && el.clientHeight > 0
}

function refreshWrapCols() {
  const el = logWrapRef.value
  if (!el || el.clientWidth <= 0) return
  const { fontSize, lineHeight, fontFamily } = readLogFontMetrics()
  const pxPerChar = measureLogCharWidth(fontSize, fontFamily)
  wrapCols.value = estimateWrapCols(el.clientWidth, { fontSize, pxPerChar })
  baseRowH.value = baseRowHeight({
    fontSize,
    lineHeight,
    wordWrap: wordWrap.value,
  })
  document.documentElement.style.setProperty('--row-h', baseRowH.value + 'px')
}

/** 侧栏折叠、抽屉开合、窗口缩放都会改变容器尺寸，统一由此重测 */
function onLayoutResize() {
  if (!logWrapVisible()) return
  const el = logWrapRef.value
  if (el.clientWidth === lastBox.w && el.clientHeight === lastBox.h) return
  lastBox = { w: el.clientWidth, h: el.clientHeight }
  measureViewport()
  nextTick(() => {
    if (!logWrapVisible()) return
    scrollTop.value = el.scrollTop
  })
}

function observeLogWrap() {
  const el = logWrapRef.value
  if (resizeObserver || !el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(onLayoutResize)
  resizeObserver.observe(el)
}

function stopObservingLogWrap() {
  resizeObserver?.disconnect()
  resizeObserver = null
}

/** 字体 / 换行变化会改行高，按比例恢复阅读位置；隐藏时留给激活后重测 */
function restoreScrollRatio(ratio) {
  nextTick(() => {
    const el = logWrapRef.value
    if (!logWrapVisible()) return
    el.scrollTop = ratio * el.scrollHeight
    scrollTop.value = el.scrollTop
  })
}

function remeasureAndRestoreScroll() {
  if (!logWrapVisible()) return
  const ratio = totalHeight.value > 0 ? scrollTop.value / totalHeight.value : 0
  measureViewport()
  restoreScrollRatio(ratio)
}

function paintRow(row, ctx, pxH) {
  if (row.kind === 'fold') return { ...row, pxH }
  const cacheKey = row.key + '|' + ctx.cacheKey
  let html = hlCache.get(cacheKey)
  if (html == null) {
    const base = safeHighlight(row.text, row.level, ctx.filterTerms)
    html = applyTextHighlights(base, [
      { terms: ctx.highlightTerms, className: USER_HIGHLIGHT_CLASS },
      { terms: ctx.findTerms, className: FIND_HIGHLIGHT_CLASS },
    ])
    if (hlCache.size > 800) hlCache.clear()
    hlCache.set(cacheKey, html)
  }
  return { ...row, html, pxH }
}

const renderedRows = computed(() => {
  const filterTerms = includeTerms.value
  const hl = highlightTerms.value
  const findTerm = tools.activeFindQuery.value
  const ctx = {
    filterTerms,
    highlightTerms: hl,
    findTerms: findTerm ? [findTerm] : [],
    cacheKey: [...filterTerms, ...hl, findTerm].join('\0'),
  }
  const { heights } = layout.value
  const result = []
  for (let i = startIdx.value; i < endIdx.value; i++) {
    const row = viewRows.value[i]
    if (!row) continue
    result.push(paintRow(row, ctx, heights[i] || baseRowH.value))
  }
  return result
})

function rowClass(row) {
  if (row.kind === 'fold') return ['ln', 'ln-fold']
  return [
    'ln',
    row.abbr ? 'ln-' + row.abbr : '',
    wordWrap.value ? 'wrap' : '',
    row.clipped ? 'clipped' : '',
    row.idx === currentHitIdx.value ? 'ln-find-current' : '',
  ]
}

/** 查找步进：命中行在折叠条目内时先展开，viewRows 重建后按原始 idx 恢复定位 */
function goToFind(delta = 1) {
  if (!tools.matches.value.length) return
  const match = tools.stepFind(delta)
  if (!match) return
  const row = viewRows.value[match.rowIndex]
  if (row?.clipped && row.entryId != null) {
    pendingFindIdx = match.idx
    expandEntry(row.entryId)
    return
  }
  scrollToMatch(match)
}

function scrollToMatch(match) {
  const el = logWrapRef.value
  if (!el) return
  const y = findScrollTop(layout.value.offsets, match.rowIndex, viewportH.value)
  el.scrollTop = y
  scrollTop.value = y
}

/** 自动折叠条：展开 / 收起 */
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

/** 行内「折叠」：折叠任意一条日志，再次点折叠条即可展开 */
function foldEntry(id) {
  const next = new Set(collapsedIds.value)
  next.add(id)
  collapsedIds.value = next
}

function unfoldEntry(id) {
  const next = new Set(collapsedIds.value)
  next.delete(id)
  collapsedIds.value = next
}

function onFoldToggle(row) {
  if (row.expanded) collapseEntry(row.entryId)
  else if (row.manual) unfoldEntry(row.entryId)
  else expandEntry(row.entryId)
}

function clearFilters() {
  clearTextFilters()
}

function openContext(row) {
  if (row.kind === 'fold' || !lines.value.length) return
  context.value = {
    open: true,
    centerIdx: row.idx,
    meta: {
      file: selectedFile.value || '',
      level: nav.selectedLevel,
      env: nav.env,
      module: nav.currentService?.module || '',
    },
  }
}

/**
 * 只有双击日志行才打开上下文；单击不做任何事。
 * 注意：浏览器双击会默认选中词，所以这里不能沿用「有选区就不弹窗」的判断。
 */
function onRowDblClick(row, ev) {
  if (row.kind === 'fold') return
  if (ev?.target?.closest?.('button, a')) return
  const sel = typeof window !== 'undefined' ? window.getSelection?.() : null
  sel?.removeAllRanges?.()
  openContext(row)
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
    if (!el || el.clientWidth <= 0) return
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
  collapsedIds.value = new Set()
  hlCache.clear()
}

const REBUILD_DEBOUNCE_MS = 60
let rebuildTimer = 0

async function rebuildViewRows() {
  const seq = ++processSeq
  const args = {
    lines: lines.value,
    includeTerms: includeTerms.value,
    excludeTerms: excludeTerms.value,
    expandedIds: expandedIds.value,
    collapsedIds: collapsedIds.value,
    foldEnabled: foldEnabled.value,
    foldMaxLines: foldMaxLines.value,
    wordWrap: wordWrap.value,
    wrapCols: wrapCols.value,
  }
  try {
    const result = await processLogAsync(args)
    if (seq !== processSeq || result.expired) return
    viewRows.value = result.viewRows
    filteredRowCount.value = result.filteredRowCount
    // paintRow 缓存键已含关键词，无需每次重建清空；lines 变化时 resetViewData 会清
  } catch (e) {
    if (seq !== processSeq) return
    const result = processLogSync(args)
    viewRows.value = result.viewRows
    filteredRowCount.value = result.filteredRowCount
  }
}

/** 条件 / 折叠 / 换行变化走防抖；lines 由 loadLog 显式重建，避免重复 query */
function scheduleRebuild() {
  clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(rebuildViewRows, REBUILD_DEBOUNCE_MS)
}

watch(
  [includeTerms, excludeTerms, expandedIds, collapsedIds, foldEnabled, foldMaxLines, wordWrap, wrapCols],
  () => {
    scheduleRebuild()
  },
  { deep: false },
)

/**
 * 确保历史文件列表就绪（唯一入口）。
 */
async function ensureFileList({ force = false, keepSelection = false, hydrate = true, signal } = {}) {
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
      signal,
    })
    applyFileList(files, keepSelection || (!force && hydrate))
    refreshIndexHint()
    return files
  } catch (e) {
    if (logs.isAbortError?.(e)) return logFiles.value
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
  selectedFile.value = defaultLogFile(files, dateFilter.value) || prev || ''
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
  if (!name) {
    selectedFile.value = defaultLogFile(logFiles.value, dateFilter.value)
  }
  nav.setRouteFile(selectedFile.value)
  loadLog({ skipList: true, force: true })
}

async function loadLog({ skipList = false, force = false } = {}) {
  const svc = nav.currentService
  if (!svc) return
  const seq = ++loadSeq
  if (loadAbort) {
    try { loadAbort.abort() } catch {}
  }
  const controller = new AbortController()
  loadAbort = controller

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
        signal: controller.signal,
      })
    } catch (e) {
      if (!logs.isAbortError?.(e)) console.warn('pre-discover failed:', e.message)
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
      ensureFileList({
        force: false,
        keepSelection: true,
        hydrate: true,
        signal: controller.signal,
      }).catch(() => {})
    }

    const filename = selectedFile.value || nav.routeFile || undefined
    const data = await logs.fetchLog(svc.host, svc.app, requestedLevel, filename, {
      force,
      envKey: nav.env,
      signal: controller.signal,
    })
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
    if (seq === loadSeq) {
      loading.value = false
      loadAbort = null
    }
  }
  if (seq !== loadSeq) return
  await nextTick()
  await rebuildViewRows()
  measureViewport()
  // 加载/切换日志后默认定位到最新一行
  scrollToEnd(true)
}

function measureViewport() {
  if (!logWrapVisible()) return
  const el = logWrapRef.value
  lastBox = { w: el.clientWidth, h: el.clientHeight }
  viewportH.value = el.clientHeight
  refreshWrapCols()
}

const atTop = computed(() => isAtTop(scrollTop.value))
const atBottom = computed(() => isAtBottom(scrollTop.value, viewportH.value, totalHeight.value))

/** 置顶 / 置底：一次性平滑滚动，不受「自动滚动到末尾」设置影响 */
function scrollToTop() {
  const el = logWrapRef.value
  if (!el) return
  el.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToBottom() {
  const el = logWrapRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}

/**
 * 滚到末尾。
 * force=true：进入日志（刷新、点击服务/级别/文件）时无条件置底；
 * 默认只在「自动滚动到末尾」开启时跟随后续新增。
 */
function scrollToEnd(force = false) {
  if (!force && !autoScroll.value) return
  if (!logWrapVisible()) {
    pendingScrollToEnd = true
    if (force) pendingScrollForce = true
    return
  }
  pendingScrollToEnd = false
  pendingScrollForce = false
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = logWrapRef.value
      if (!logWrapVisible()) {
        pendingScrollToEnd = true
        if (force) pendingScrollForce = true
        return
      }
      el.scrollTop = el.scrollHeight
      scrollTop.value = el.scrollTop
    })
  })
}

function toggleWordWrap() {
  const next = !wordWrap.value
  settings.setBehavior('wordWrap', next)
  nextTick(remeasureAndRestoreScroll)
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
    parts.push(row.text)
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
  () => [settings.cfg.sizes.log, settings.cfg.sizes.lh, settings.cfg.fonts.log],
  () => nextTick(remeasureAndRestoreScroll),
)

watch(dateFilter, (d) => {
  const list = filteredLogFiles.value
  if (!list.length) return
  // 选定日期：切到该日期最新归档（列表首项）；清空日期：保留仍在列表中的选择
  const target = d ? list[0].name : ''
  if (!d && list.some((f) => f.name === selectedFile.value)) return
  if (selectedFile.value === target) return
  selectedFile.value = target || list[0].name
  nav.setRouteFile(selectedFile.value)
  loadLog({ skipList: true, force: true })
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

/** keep-alive 下组件不卸载，快捷键需确认当前仍处于日志视图，避免干扰其它视图 */
function onGlobalKeydown(e) {
  if (nav.view !== 'viewer' || !nav.currentService) return
  const target = e.target
  const inEditable = target?.tagName === 'INPUT'
    || target?.tagName === 'TEXTAREA'
    || target?.isContentEditable === true
  if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'f') {
    e.preventDefault()
    tools.openDrawer()
    nextTick(() => drawerRef.value?.focusFind?.())
    return
  }
  if (e.key === 'F3') {
    e.preventDefault()
    tools.openDrawer()
    goToFind(e.shiftKey ? -1 : 1)
    return
  }
  if (e.key === 'Escape' && !tools.drawerPinned.value && tools.drawerOpen.value && !inEditable) {
    tools.closeDrawer()
  }
}

onMounted(() => {
  autoScroll.value = settings.cfg.behavior.autoScroll !== false
  measureViewport()
  observeLogWrap()
  onWinResize = () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(remeasureAndRestoreScroll, 120)
  }
  window.addEventListener('resize', onWinResize)
  window.addEventListener('keydown', onGlobalKeydown)
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

/** keep-alive 切回：DOM 重新挂回文档后重测宽高，并把逻辑滚动位置写回 DOM */
onActivated(() => {
  nextTick(() => {
    observeLogWrap()
    if (!logWrapVisible()) return
    measureViewport()
    const el = logWrapRef.value
    el.scrollTop = clampScrollTop(scrollTop.value, el.scrollHeight, el.clientHeight)
    scrollTop.value = el.scrollTop
    if (pendingScrollToEnd) {
      const force = pendingScrollForce
      pendingScrollToEnd = false
      pendingScrollForce = false
      scrollToEnd(force)
    }
  })
})

onDeactivated(() => {
  stopObservingLogWrap()
})

onUnmounted(() => {
  loadAbort?.abort()
  loadAbort = null
  stopObservingLogWrap()
  if (unsubIndex) unsubIndex()
  if (unsubSettings) unsubSettings()
  if (onWinResize) window.removeEventListener('resize', onWinResize)
  window.removeEventListener('keydown', onGlobalKeydown)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  clearTimeout(resizeTimer)
  clearTimeout(rebuildTimer)
})
</script>

<style scoped>
.viewer { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden }
.viewer-empty { flex: 1; justify-content: center }
/* 日志区定位容器：右侧抽屉与日志滚动区共享同一层，抽屉不遮工具栏/状态条 */
.log-region {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--bd);
  background: var(--grad-surface), var(--s1);
  flex-shrink: 0;
}
.tb-path {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 200px;
  min-width: 160px;
  font-family: var(--font-log);
  font-size: 12px;
  color: var(--t3);
  overflow: hidden;
  white-space: nowrap;
}
.path-env { color: var(--ac); font-weight: 700; flex-shrink: 0 }
.path-sep { color: var(--bd2); flex-shrink: 0 }
.path-mod { color: var(--t2); font-weight: 600; overflow: hidden; text-overflow: ellipsis }
.path-file { color: var(--t1); font-weight: 600; overflow: hidden; text-overflow: ellipsis }
.tb-actions { flex-shrink: 0 }
.tb-tools {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: 28px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--bd);
  border-radius: var(--r-sm);
  background: var(--s2);
  color: var(--t2);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.tb-tools:hover { color: var(--t1); border-color: color-mix(in srgb, var(--ac) 42%, var(--bd)) }
.tb-tools.on { color: var(--ac); border-color: var(--ac); background: var(--surf-active) }
.tb-badge {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--r-pill);
  background: var(--ac);
  color: var(--bg);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  text-align: center;
}
.tb-pin { color: var(--t3) }
.ui-find-chip { cursor: pointer }
.ui-find-chip:hover { filter: brightness(1.08) }

.loading-panel {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg, #0f1117) 68%, transparent);
  backdrop-filter: blur(4px);
}
.loading-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: var(--r-pill);
  border: 1px solid var(--bd);
  background: var(--grad-surface), var(--s1);
  box-shadow: var(--sh-2);
  color: var(--t1);
  font-size: 13px;
  font-weight: 600;
}
.empty-panel {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.ui-empty-icon--err { color: var(--err); background: var(--err-bg); border-color: var(--err-bd) }

.v-viewport { position: relative; width: 100% }
.v-viewport.no-wrap { width: max-content; min-width: 100% }
.v-content { position: absolute; top: 0; left: 0; width: 100% }
.v-viewport.no-wrap .v-content { width: max-content; min-width: 100% }
.ln-fold {
  display: flex;
  width: 100% !important;
  min-width: 100%;
  border-left-color: transparent;
  background: transparent !important;
  padding: 2px 0;
  overflow: visible;
}
.ln-fold:hover { background: transparent !important }
/* 折叠入口与上下文入口并排：绝对定位不撑开行高，hover 才出现 */
.ln-fold-btn {
  right: 30px;
  width: auto;
  min-width: 34px;
  padding: 0 6px;
  font-size: 11px;
}
.ln-fold-btn:hover { color: var(--ac); border-color: var(--ac) }

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 7px 14px;
  border-top: 1px solid var(--bd);
  background: var(--grad-surface), var(--s1);
  flex-shrink: 0;
}
.status .ui-chip b { color: var(--t1); font-variant-numeric: tabular-nums }
.status-time {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-xs);
  color: var(--t3);
  white-space: nowrap;
}

@media (max-width: 900px) {
  .toolbar { padding: 8px 10px }
  .tb-path { flex: 1 1 100%; min-width: 0 }
  .tb-actions { margin-left: auto }
  .status-time { margin-left: 0 }
}
</style>
