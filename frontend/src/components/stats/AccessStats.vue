<template>
  <div class="stats">
    <section class="stats-hero">
      <div class="hero-copy">
        <div class="ui-eyebrow">Access Analytics</div>
        <h1>访问统计</h1>
        <p>记录访问 IP 与操作元数据，不记录日志正文；数据每 30 秒自动刷新。</p>
      </div>
      <div class="hero-side">
        <span class="ui-chip"><el-icon><User /></el-icon> 本机 {{ presence.state.ip || '—' }}</span>
        <el-tooltip content="刷新统计" placement="top" :show-after="400">
          <button
            type="button"
            class="ui-icon-btn"
            :disabled="!presence.state.canViewStats"
            aria-label="刷新统计"
            @click="refresh"
          ><el-icon><Refresh /></el-icon></button>
        </el-tooltip>
      </div>
    </section>

    <div v-if="!presence.state.canViewStats" class="ui-surface access-denied">
      <div class="ui-empty-icon"><el-icon><Lock /></el-icon></div>
      <div class="ui-empty-title">无权查看统计</div>
      <div class="ui-empty-desc">
        当前 IP（{{ presence.state.ip || '未知' }}）不在白名单。请在服务器
        <code>config/access.json</code> 的 <code>statsAllowIps</code> 中添加本机 IP
        （默认仅允许 127.0.0.1 / ::1）。
      </div>
    </div>

    <template v-else>
      <section class="kpi-row" aria-label="访问概览">
        <div class="ui-surface ui-kpi">
          <div class="ui-kpi-icon"><el-icon><User /></el-icon></div>
          <div><div class="ui-kpi-value">{{ summary.onlineCount ?? '—' }}</div><div class="ui-kpi-label">当前在线</div></div>
        </div>
        <div class="ui-surface ui-kpi">
          <div class="ui-kpi-icon ui-kpi-icon--info"><el-icon><Histogram /></el-icon></div>
          <div><div class="ui-kpi-value">{{ summary.events24h ?? '—' }}</div><div class="ui-kpi-label">近 24 小时访问</div></div>
        </div>
        <div class="ui-surface ui-kpi">
          <div class="ui-kpi-icon ui-kpi-icon--trc"><el-icon><DataAnalysis /></el-icon></div>
          <div><div class="ui-kpi-value">{{ summary.eventsTotal ?? '—' }}</div><div class="ui-kpi-label">累计事件</div></div>
        </div>
      </section>

      <section class="tables">
        <div class="ui-surface table-card">
          <header class="table-hd">
            <div class="table-title">
              <el-icon><Clock /></el-icon>
              <h3>在线会话</h3>
              <span class="ui-chip">{{ online.length }}</span>
            </div>
            <button type="button" class="ui-icon-btn" :disabled="loading" aria-label="刷新在线会话" @click="refresh">
              <el-icon><Refresh /></el-icon>
            </button>
          </header>
          <el-table :data="online" size="small" stripe max-height="420" empty-text="暂无在线">
            <el-table-column prop="ip" label="IP" min-width="120" />
            <el-table-column label="进入" min-width="100">
              <template #default="{ row }">{{ fmtTime(row.started_at) }}</template>
            </el-table-column>
            <el-table-column label="最近活跃" min-width="100">
              <template #default="{ row }">{{ fmtTime(row.last_seen) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="ui-surface table-card">
          <header class="table-hd">
            <div class="table-title">
              <el-icon><Document /></el-icon>
              <h3>最近访问</h3>
              <span class="ui-chip">{{ recent.length }}</span>
            </div>
            <button type="button" class="ui-icon-btn" :disabled="loading" aria-label="刷新最近访问" @click="refresh">
              <el-icon><Refresh /></el-icon>
            </button>
          </header>
          <el-table :data="recent" size="small" stripe max-height="420" empty-text="暂无记录">
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ fmtTime(row.ts) }}</template>
            </el-table-column>
            <el-table-column prop="ip" label="IP" width="120" />
            <el-table-column prop="action" label="动作" width="120" />
            <el-table-column prop="env" label="环境" width="70" />
            <el-table-column prop="module" label="模块" min-width="120" show-overflow-tooltip />
            <el-table-column prop="level" label="级别" width="80" />
          </el-table>
        </div>
      </section>
    </template>

    <div class="stats-foot">
      <el-icon><InfoFilled /></el-icon>
      <span>统计页仅白名单 IP 可查看；白名单见 <code>config/access.json</code>。</span>
    </div>
  </div>
</template>

<script setup>
/**
 * AccessStats —— 访问统计页（IP 白名单门禁由后端强制）
 */
import { reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import {
  User, Lock, Histogram, DataAnalysis, Clock, Document, Refresh, InfoFilled,
} from '@element-plus/icons-vue'
import { usePresence } from '../../composables/usePresence'
import { useAccessLog } from '../../composables/useAccessLog'
import { useNavigation } from '../../composables/useNavigation'
import { requestJson, ApiError } from '../../utils/apiClient'

const presence = usePresence()
const access = useAccessLog()
const nav = useNavigation()

const loading = ref(false)
const online = ref([])
const recent = ref([])
const summary = reactive({
  onlineCount: null,
  events24h: null,
  eventsTotal: null,
})

let timer = 0
let refreshAbort = null

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts) * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

async function refresh() {
  if (!presence.state.canViewStats) return
  if (refreshAbort) {
    try { refreshAbort.abort() } catch {}
  }
  const controller = new AbortController()
  refreshAbort = controller
  loading.value = true
  try {
    const [s, o, r] = await Promise.all([
      requestJson('/api/access/summary', { signal: controller.signal }),
      requestJson('/api/access/online', { signal: controller.signal }),
      requestJson('/api/access/recent?limit=100', { signal: controller.signal }),
    ])
    Object.assign(summary, s)
    online.value = o.online || []
    recent.value = r.items || []
    if (typeof o.count === 'number') presence.state.onlineCount = o.count
  } catch (e) {
    if (e?.name === 'AbortError' || e?.code === 20) return
    if (
      (e instanceof ApiError && e.status === 403) ||
      /无权|403/.test(String(e.message || ''))
    ) {
      presence.state.canViewStats = false
    }
  } finally {
    if (refreshAbort === controller) {
      loading.value = false
      refreshAbort = null
    }
  }
}

/** 轮询只打本机 access API，不打 LogIndex；30s 一次足够 */
function startPolling() {
  stopPolling()
  refresh()
  timer = window.setInterval(refresh, 30000)
}

function stopPolling() {
  clearInterval(timer)
  timer = 0
  refreshAbort?.abort()
  refreshAbort = null
}

onMounted(() => {
  access.track(access.ACTION.OPEN_STATS)
})

// 由导航状态驱动：keep-alive 缓存下切走视图时 hook 时机不稳定，直接看当前视图更可靠
watch(
  () => nav.view,
  (view) => {
    if (view === 'stats') startPolling()
    else stopPolling()
  },
  { immediate: true },
)

onUnmounted(stopPolling)
</script>

<style scoped>
.stats {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: var(--sp-5) var(--sp-6) var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.stats-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: 22px 26px;
  border: 1px solid var(--bd);
  border-radius: var(--r-xl);
  background: var(--grad-glow), var(--grad-surface), var(--s1);
  box-shadow: var(--sh-2);
}
.hero-copy h1 {
  margin: 6px 0 6px;
  font-size: 26px;
  font-weight: 760;
  letter-spacing: -.02em;
  background: linear-gradient(100deg, var(--t1) 20%, var(--ac));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero-copy p { margin: 0; font-size: 13px; color: var(--t2) }
.hero-side { display: flex; align-items: center; gap: 10px; margin-left: auto }

.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-3) }
.ui-kpi > div:last-child { min-width: 0 }

.tables {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(420px, 1.4fr);
  gap: var(--sp-4);
  align-items: start;
}
.table-card { padding: var(--sp-4); min-width: 0; overflow: hidden }
.table-hd { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: var(--sp-3) }
.table-title { display: flex; align-items: center; gap: 8px; color: var(--ac) }
.table-title h3 { margin: 0; font-size: 14px; font-weight: 700; color: var(--t1) }

.access-denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: 48px 24px;
  text-align: center;
}
.access-denied code, .stats-foot code {
  font-family: var(--font-log);
  font-size: var(--fs-xs);
  color: var(--ac);
  background: var(--s2);
  padding: 1px 5px;
  border-radius: 4px;
}
.stats-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: var(--fs-sm);
  color: var(--t3);
  border: 1px dashed var(--bd);
  border-radius: var(--r);
}

@media (max-width: 1100px) {
  .tables { grid-template-columns: 1fr }
}
@media (max-width: 900px) {
  .stats { padding: var(--sp-4) var(--sp-3) }
  .hero-side { margin-left: 0 }
}
</style>
