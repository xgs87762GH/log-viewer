<template>
  <div class="panel">
    <div class="env-row">
      <el-select
        :model-value="nav.env"
        size="small"
        class="env-select"
        aria-label="切换环境"
        @update:model-value="onEnvChange"
      >
        <el-option
          v-for="opt in envOptions"
          :key="opt.key"
          :value="opt.key"
          :label="opt.label"
        />
      </el-select>
    </div>

    <div class="search-row">
      <el-icon class="search-icon"><Search /></el-icon>
      <input
        ref="searchRef"
        v-model="query"
        type="text"
        class="search-input"
        placeholder="搜索模块 / IP"
        aria-label="搜索模块"
        autocomplete="off"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="openCurrent"
        @keydown.esc="clearQuery"
      />
      <span v-if="!query" class="search-kbd" aria-hidden="true">/</span>
      <button
        v-else
        type="button"
        class="search-clear"
        aria-label="清空搜索"
        @click="clearQuery"
      >×</button>
    </div>

    <el-scrollbar class="mods-scroll">
      <template v-if="!query">
        <section v-if="favoriteRows.length" class="group">
          <div class="group-hd">收藏 · {{ favoriteRows.length }}</div>
          <NavModuleItem
            v-for="row in favoriteRows"
            :key="'f-' + row.svc.app"
            :row="row"
            :active="nav.selectedIdx === row.i"
            :favorite="true"
            :selected-level="nav.selectedLevel"
            @select="nav.selectEnvService(nav.env, row.i)"
            @open="openRow(row)"
            @open-level="(lv) => nav.openLog(row.i, lv, nav.env, row.ip)"
            @toggle-fav="prefs.toggleFavorite(row.svc.app)"
          />
        </section>

        <section v-if="recentRows.length" class="group">
          <div class="group-hd">最近访问</div>
          <NavModuleItem
            v-for="row in recentRows"
            :key="'r-' + row.svc.app"
            :row="row"
            :active="nav.selectedIdx === row.i"
            :favorite="favoriteSet.has(row.svc.app)"
            :selected-level="nav.selectedLevel"
            :hint="row.hint"
            @select="nav.selectEnvService(nav.env, row.i)"
            @open="openRow(row)"
            @open-level="(lv) => nav.openLog(row.i, lv, nav.env, row.ip)"
            @toggle-fav="prefs.toggleFavorite(row.svc.app)"
          />
        </section>
      </template>

      <section class="group">
        <div class="group-hd">{{ query ? '搜索结果' : '全部服务' }} · {{ listRows.length }}</div>
        <NavModuleItem
          v-for="row in listRows"
          :key="'a-' + row.svc.app"
          :row="row"
          :active="nav.selectedIdx === row.i"
          :favorite="favoriteSet.has(row.svc.app)"
          :selected-level="nav.selectedLevel"
          @select="nav.selectEnvService(nav.env, row.i)"
          @open="openRow(row)"
          @open-level="(lv) => nav.openLog(row.i, lv, nav.env, row.ip)"
          @toggle-fav="prefs.toggleFavorite(row.svc.app)"
        />
        <p v-if="!listRows.length" class="empty">没有匹配的模块，换个关键词或清空搜索。</p>
      </section>
    </el-scrollbar>
  </div>
</template>

<script setup>
/**
 * 二级导航：环境下拉 + 搜索 + 收藏 / 最近访问 / 全部服务。
 * 收藏与最近的规则在 utils/navPrefs，状态在 useNavPrefs，本组件只负责渲染与本地交互。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useLogs } from '../../composables/useLogs'
import { useNavigation } from '../../composables/useNavigation'
import { useNavPrefs } from '../../composables/useNavPrefs'
import {
  RECENT_SHOW_LIMIT,
  matchService,
  recentLabel,
  resolveFavoriteRows,
  resolveRecentRows,
} from '../../utils/navPrefs'
import NavModuleItem from './NavModuleItem.vue'

const logs = useLogs()
const nav = useNavigation()
const prefs = useNavPrefs()

const query = ref('')
const searchRef = ref(null)

/** 一次算好级别与探测状态；i 用于选中判断 */
const rows = computed(() => {
  void logs.indexVersion
  return nav.services.map((svc, i) => {
    const ip = nav.selectedIdx === i ? nav.currentHost : svc.host
    return {
      svc,
      i,
      ip,
      levels: nav.getLevels(svc),
      hasIndex: !!logs.getIndexMeta(ip, svc.app, nav.env),
    }
  })
})

const byApp = computed(() => new Map(rows.value.map((row) => [row.svc.app, row])))

const envOptions = computed(() =>
  nav.envKeys.map((key) => {
    const env = logs.envs[key] || {}
    const name = String(env.label || key).replace(/环境$/, '')
    const count = (env.services || []).length
    return { key, label: `${env.icon || ''} ${name} · ${count}`.trim() }
  }),
)

const favoriteRows = computed(() => resolveFavoriteRows(prefs.favorites.value, byApp.value))
const favoriteSet = computed(() => prefs.favoriteSet.value)

const recentRows = computed(() =>
  resolveRecentRows(
    prefs.recents.value,
    nav.env,
    favoriteSet.value,
    byApp.value,
    RECENT_SHOW_LIMIT,
  ).map((row) => ({ ...row, hint: recentLabel(row.at) })),
)

const listRows = computed(() => rows.value.filter((row) => matchService(row.svc, query.value)))

function onEnvChange(name) {
  query.value = ''
  nav.selectEnv(name)
}

function clearQuery() {
  query.value = ''
}

function openRow(row) {
  const level = row.levels.includes(nav.selectedLevel) ? nav.selectedLevel : row.levels[0]
  if (!level) return
  nav.openLog(row.i, level, nav.env, row.ip)
}

function openCurrent() {
  const target = listRows.value.find((row) => row.i === nav.selectedIdx) || listRows.value[0]
  if (target) openRow(target)
}

function move(delta) {
  const list = listRows.value
  if (!list.length) return
  const current = list.findIndex((row) => row.i === nav.selectedIdx)
  const next = Math.min(list.length - 1, Math.max(0, (current < 0 ? 0 : current) + delta))
  nav.selectEnvService(nav.env, list[next].i)
}

/** 全局 `/` 聚焦搜索，跳过输入框与可编辑区域 */
function onGlobalKey(event) {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  event.preventDefault()
  searchRef.value?.focus()
}

onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
</script>

<style scoped>
.panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px 8px 0;
}

.env-row { padding: 0 2px 8px }
.env-select { width: 100% }
.env-select :deep(.el-select__wrapper) { min-height: 30px; font-size: 12px }

.search-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 2px 8px;
  padding: 0 8px;
  height: 30px;
  border: 1px solid var(--bd);
  border-radius: var(--r-sm);
  background: var(--s2);
  transition: border-color var(--dur) var(--ease);
}
.search-row:focus-within { border-color: var(--ac) }
.search-icon { color: var(--t3); font-size: 13px; flex: none }
.search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--t1);
  font-size: 12px;
}
.search-input::placeholder { color: var(--t3) }
.search-kbd {
  flex: none;
  padding: 0 4px;
  border: 1px solid var(--bd);
  border-radius: 3px;
  font-size: 10px;
  color: var(--t3);
  line-height: 15px;
}
.search-clear {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--s3);
  color: var(--t2);
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
}

.mods-scroll { flex: 1; min-height: 0 }
.group { padding-bottom: 6px }
.group-hd {
  padding: 6px 6px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  color: var(--t3);
}
.empty {
  margin: 12px 6px;
  font-size: var(--fs-xs);
  color: var(--t3);
  line-height: 1.6;
}
</style>
