/**
 * useLogSearchTools —— 日志搜索工具区（模块级单例）
 *
 * 与 useLogViewFilters 完全隔离：这里的关键词只负责染色 / 定位，
 * 绝不进入 includeTerms / excludeTerms，也就不会触发 Worker 过滤。
 * 查找匹配表由 LogViewer 基于 viewRows 计算后写入 setFindMatches。
 */
import { ref, watch } from 'vue'
import { FIND_DEBOUNCE_MS } from '../constants/logSearchTools.js'
import {
  readPinned,
  writePinned,
  resolveDrawerState,
} from '../utils/toolDrawerState.js'
import { stepFindIndex } from '../utils/logFind.js'
import {
  addHighlightTerm,
  removeHighlightTerm,
} from '../utils/highlightTerms.js'

/** 回车逐条添加的高亮词，整串保存，只染色不隐藏行 */
const highlightTerms = ref([])
/** 查找框输入；activeFindQuery 为防抖后的生效值 */
const findQuery = ref('')
const activeFindQuery = ref('')
/** @type {import('vue').Ref<Array<{rowIndex:number, idx:number, no:number}>>} */
const matches = ref([])
const findIndex = ref(-1)

const drawerPinned = ref(readPinned())
const drawerOpen = ref(drawerPinned.value)

let debounceTimer = 0
watch(findQuery, (raw) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    activeFindQuery.value = String(raw ?? '').trim()
  }, FIND_DEBOUNCE_MS)
})

function addHighlight(raw) {
  const { terms, added } = addHighlightTerm(highlightTerms.value, raw)
  if (added) highlightTerms.value = terms
  return added
}

function removeHighlight(raw) {
  highlightTerms.value = removeHighlightTerm(highlightTerms.value, raw)
}

function clearHighlights() {
  highlightTerms.value = []
}

function setFindMatches(list) {
  matches.value = Array.isArray(list) ? list : []
  findIndex.value = matches.value.length ? 0 : -1
}

function stepFind(delta = 1) {
  const total = matches.value.length
  const next = stepFindIndex(findIndex.value, total, delta)
  findIndex.value = next
  return next < 0 ? null : matches.value[next]
}

function currentMatch() {
  return findIndex.value < 0 ? null : (matches.value[findIndex.value] || null)
}

function clearFind() {
  clearTimeout(debounceTimer)
  findQuery.value = ''
  activeFindQuery.value = ''
  matches.value = []
  findIndex.value = -1
}

function applyDrawer(action) {
  const next = resolveDrawerState(
    { open: drawerOpen.value, pinned: drawerPinned.value },
    action,
  )
  drawerOpen.value = next.open
  if (next.pinned !== drawerPinned.value) {
    drawerPinned.value = next.pinned
    writePinned(next.pinned)
  }
}

const openDrawer = () => applyDrawer('open')
const closeDrawer = () => applyDrawer('close')
const toggleDrawer = () => applyDrawer('toggle')
const pinDrawer = () => applyDrawer('pin')
const unpinDrawer = () => applyDrawer('unpin')

export function useLogSearchTools() {
  return {
    highlightTerms,
    addHighlight,
    removeHighlight,
    clearHighlights,
    findQuery,
    activeFindQuery,
    matches,
    findIndex,
    drawerOpen,
    drawerPinned,
    setFindMatches,
    stepFind,
    currentMatch,
    clearFind,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    pinDrawer,
    unpinDrawer,
  }
}
