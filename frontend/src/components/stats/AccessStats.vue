<template>
  <div class="stats">
    <div class="hd">
      <h2>访问统计</h2>
      <el-text type="info" size="small">本机识别 IP：{{ presence.state.ip || '—' }}</el-text>
    </div>

    <el-alert
      v-if="!presence.state.canViewStats"
      type="warning"
      show-icon
      :closable="false"
      title="无权查看统计"
      :description="`当前 IP（${presence.state.ip || '未知'}）不在白名单。请在服务器 config/access.json 的 statsAllowIps 中添加本机 IP（默认仅允许 127.0.0.1 / ::1）。`"
      class="mb"
    />

    <template v-else>
      <el-row :gutter="12" class="mb">
        <el-col :span="8">
          <el-card shadow="hover"><div class="metric"><div class="n">{{ summary.onlineCount ?? '—' }}</div><div class="l">当前在线</div></div></el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover"><div class="metric"><div class="n">{{ summary.events24h ?? '—' }}</div><div class="l">近 24 小时访问</div></div></el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover"><div class="metric"><div class="n">{{ summary.eventsTotal ?? '—' }}</div><div class="l">累计事件</div></div></el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :md="10">
          <el-card shadow="never">
            <template #header>
              <div class="card-hd">
                <span>在线会话</span>
                <el-button size="small" text :loading="loading" @click="refresh">刷新</el-button>
              </div>
            </template>
            <el-table :data="online" size="small" stripe max-height="420" empty-text="暂无在线">
              <el-table-column prop="ip" label="IP" min-width="120" />
              <el-table-column label="进入" min-width="100">
                <template #default="{ row }">{{ fmtTime(row.started_at) }}</template>
              </el-table-column>
              <el-table-column label="最近活跃" min-width="100">
                <template #default="{ row }">{{ fmtTime(row.last_seen) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="14">
          <el-card shadow="never">
            <template #header>
              <div class="card-hd">
                <span>最近访问</span>
                <el-button size="small" text :loading="loading" @click="refresh">刷新</el-button>
              </div>
            </template>
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
          </el-card>
        </el-col>
      </el-row>
    </template>

    <el-alert
      class="mt"
      type="info"
      :closable="false"
      show-icon
      title="说明：系统记录访问 IP 与操作元数据（不记录日志正文）。统计页仅白名单 IP 可查看；白名单见 config/access.json。"
    />
  </div>
</template>

<script setup>
/**
 * AccessStats —— 访问统计页（IP 白名单门禁由后端强制）
 */
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import { usePresence } from '../../composables/usePresence'
import { useAccessLog } from '../../composables/useAccessLog'

const presence = usePresence()
const access = useAccessLog()

const loading = ref(false)
const online = ref([])
const recent = ref([])
const summary = reactive({
  onlineCount: null,
  events24h: null,
  eventsTotal: null,
})

let timer = 0

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts) * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

async function fetchJson(path) {
  const res = await fetch(path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function refresh() {
  if (!presence.state.canViewStats) return
  loading.value = true
  try {
    const [s, o, r] = await Promise.all([
      fetchJson('/api/access/summary'),
      fetchJson('/api/access/online'),
      fetchJson('/api/access/recent?limit=100'),
    ])
    Object.assign(summary, s)
    online.value = o.online || []
    recent.value = r.items || []
    if (typeof o.count === 'number') presence.state.onlineCount = o.count
  } catch (e) {
    if (String(e.message || '').includes('无权') || String(e.message || '').includes('403')) {
      presence.state.canViewStats = false
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  access.track(access.ACTION.OPEN_STATS)
  refresh()
  // 仅刷新本机 access API，不打 LogIndex；30s 一次足够
  timer = window.setInterval(refresh, 30000)
})

onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.stats { flex: 1; overflow: auto; padding: 20px 24px; min-height: 0 }
.hd { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px }
.hd h2 { margin: 0; font-size: 18px }
.mb { margin-bottom: 14px }
.mt { margin-top: 16px }
.metric { text-align: center; padding: 8px 0 }
.metric .n { font-size: 28px; font-weight: 700; color: var(--t1); line-height: 1.2 }
.metric .l { font-size: 12px; color: var(--t3); margin-top: 4px }
.card-hd { display: flex; align-items: center; justify-content: space-between }
</style>
