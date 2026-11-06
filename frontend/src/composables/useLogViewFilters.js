import { ref, computed } from 'vue'
import { matchBlobFilters } from '../utils/logFilterMatch'
import {
  FILTER_HISTORY_MAX,
  loadFilterHistory,
  saveFilterHistory,
  upsertFilterHistory,
} from '../utils/filterHistory'

export { matchBlobFilters }

/**
 * LogViewer 正文筛选状态（模块单例）
 * 文本过滤参考 Grafana Explore：include AND / exclude OR。
 * 历史：条件集快照，去重后保留最近 N 条（localStorage）。
 */

/** @type {import('vue').Ref<Array<{ id: string, text: string, mode: 'include'|'exclude' }>>} */
const textFilters = ref([])

/** @type {import('vue').Ref<Array<{ id: string, sig: string, filters: Array, label: string, at: number }>>} */
const filterHistory = ref(loadFilterHistory())

let seq = 0
function nextId() {
  seq += 1
  return `tf-${Date.now().toString(36)}-${seq}`
}

const includeTerms = computed(() =>
  textFilters.value.filter((f) => f.mode === 'include').map((f) => f.text),
)
const excludeTerms = computed(() =>
  textFilters.value.filter((f) => f.mode === 'exclude').map((f) => f.text),
)

/**
 * 解析输入：-关键字 → 排除；"..." 去引号。
 */
function parseFilterInput(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  let mode = 'include'
  let body = s
  if (body.startsWith('-') && body.length > 1) {
    mode = 'exclude'
    body = body.slice(1).trim()
  }
  if (
    (body.startsWith('"') && body.endsWith('"') && body.length >= 2) ||
    (body.startsWith("'") && body.endsWith("'") && body.length >= 2)
  ) {
    body = body.slice(1, -1)
  }
  body = body.trim()
  if (!body) return null
  return { mode, text: body }
}

function rememberCurrentFilters() {
  if (!textFilters.value.length) return
  filterHistory.value = upsertFilterHistory(
    filterHistory.value,
    textFilters.value,
    { max: FILTER_HISTORY_MAX },
  )
  saveFilterHistory(filterHistory.value)
}

function addTextFilter(raw, forceMode) {
  const parsed = parseFilterInput(raw)
  if (!parsed) return false
  const mode = forceMode || parsed.mode
  const text = parsed.text
  const exists = textFilters.value.some(
    (f) => f.mode === mode && f.text.toLowerCase() === text.toLowerCase(),
  )
  if (exists) return false
  textFilters.value = [...textFilters.value, { id: nextId(), text, mode }]
  rememberCurrentFilters()
  return true
}

/**
 * 就地改芯片：改文案 / 模式。文案冲突时返回 false。
 */
function updateTextFilter(id, patch = {}) {
  const idx = textFilters.value.findIndex((f) => f.id === id)
  if (idx < 0) return false
  const cur = textFilters.value[idx]
  let text = cur.text
  let mode = cur.mode
  if (patch.text != null) {
    const parsed = parseFilterInput(patch.text)
    if (!parsed) return false
    text = parsed.text
    if (patch.mode == null && String(patch.text).trim().startsWith('-')) {
      mode = parsed.mode
    }
  }
  if (patch.mode === 'include' || patch.mode === 'exclude') mode = patch.mode
  const clash = textFilters.value.some(
    (f) => f.id !== id && f.mode === mode && f.text.toLowerCase() === text.toLowerCase(),
  )
  if (clash) return false
  const next = textFilters.value.slice()
  next[idx] = { ...cur, text, mode }
  textFilters.value = next
  rememberCurrentFilters()
  return true
}

function removeTextFilter(id) {
  const next = textFilters.value.filter((f) => f.id !== id)
  if (next.length === textFilters.value.length) return
  textFilters.value = next
  if (next.length) rememberCurrentFilters()
}

function clearTextFilters() {
  textFilters.value = []
}

function setTextFilters(list, { recordHistory = true } = {}) {
  const next = []
  const seen = new Set()
  for (const f of list || []) {
    const text = String(f?.text ?? '').trim()
    if (!text) continue
    const mode = f?.mode === 'exclude' ? 'exclude' : 'include'
    const key = `${mode}:${text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push({ id: nextId(), text, mode })
  }
  textFilters.value = next
  if (recordHistory && next.length) rememberCurrentFilters()
}

function toggleFilterMode(id) {
  const cur = textFilters.value.find((f) => f.id === id)
  if (!cur) return false
  return updateTextFilter(id, {
    mode: cur.mode === 'exclude' ? 'include' : 'exclude',
  })
}

function applyHistory(id) {
  const hit = filterHistory.value.find((h) => h.id === id)
  if (!hit) return false
  setTextFilters(hit.filters, { recordHistory: true })
  return true
}

function clearFilterHistory() {
  filterHistory.value = []
  saveFilterHistory([])
}

function matchTextFilters(blob) {
  return matchBlobFilters(blob, includeTerms.value, excludeTerms.value)
}

/** 导入 filterHistory 段后调用：过滤历史从 localStorage 重新读取 */
function reload() {
  filterHistory.value = loadFilterHistory()
}

export function useLogViewFilters() {
  return {
    textFilters,
    includeTerms,
    excludeTerms,
    filterHistory,
    addTextFilter,
    updateTextFilter,
    removeTextFilter,
    clearTextFilters,
    setTextFilters,
    toggleFilterMode,
    applyHistory,
    clearFilterHistory,
    parseFilterInput,
    matchTextFilters,
    matchBlobFilters,
    reload,
  }
}
