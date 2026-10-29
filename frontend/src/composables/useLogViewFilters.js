import { ref, computed } from 'vue'
import { matchBlobFilters } from '../utils/logFilterMatch'

export { matchBlobFilters }

/**
 * LogViewer 正文筛选状态（模块单例）
 * 避免切仪表盘 / 统计卸载 LogViewer 后筛选被重置。
 *
 * 文本过滤参考 Grafana Explore 行过滤：
 *   include — 必须包含（多条件 AND）
 *   exclude — 不得包含（任一命中即剔除）
 *
 * 级别已由日志文件维度区分，此处不再做 INFO/WARN/… 二次过滤。
 */

/** @type {import('vue').Ref<Array<{ id: string, text: string, mode: 'include'|'exclude' }>>} */
const textFilters = ref([])

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
 * 解析输入：以 - 开头（且后面还有内容）→ 排除；否则包含。
 * 支持引号包裹：-"health check" / "order id"
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
  return true
}

function removeTextFilter(id) {
  textFilters.value = textFilters.value.filter((f) => f.id !== id)
}

function clearTextFilters() {
  textFilters.value = []
}

function toggleFilterMode(id) {
  textFilters.value = textFilters.value.map((f) => {
    if (f.id !== id) return f
    return { ...f, mode: f.mode === 'include' ? 'exclude' : 'include' }
  })
}

/**
 * 整条日志（主行+续行）是否通过文本过滤。
 * @param {string} blob 已拼接的正文
 */
function matchTextFilters(blob) {
  return matchBlobFilters(blob, includeTerms.value, excludeTerms.value)
}

export function useLogViewFilters() {
  return {
    textFilters,
    includeTerms,
    excludeTerms,
    addTextFilter,
    removeTextFilter,
    clearTextFilters,
    toggleFilterMode,
    parseFilterInput,
    matchTextFilters,
    matchBlobFilters,
  }
}
