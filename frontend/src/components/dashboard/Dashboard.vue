<template>
  <div class="dashboard">
    <div v-if="!logs.config" class="ui-empty">
      <div class="ui-empty-icon"><el-icon :size="26"><Loading class="is-loading" /></el-icon></div>
      <div class="ui-empty-title">正在加载配置</div>
      <div class="ui-empty-desc">读取环境与模块清单，请稍候…</div>
    </div>

    <template v-else>
      <!-- 顶部品牌区：光晕 + 渐变表面，承载环境切换与批量探测 -->
      <section class="dash-hero">
        <div class="hero-copy">
          <div class="ui-eyebrow">Log Center / 环境概览</div>
          <h1>{{ envLabel }}</h1>
          <p>选择级别打开日志聚合，或直达目录与归档。「探测级别」会并发探测当前环境各服务目录，不自动轮询。</p>
        </div>
        <div class="hero-actions">
          <span class="ui-eyebrow">当前环境</span>
          <div class="env-switch" role="group" aria-label="切换环境">
            <button
              v-for="key in nav.envKeys"
              :key="key"
              type="button"
              class="env-btn"
              :class="{ on: nav.env === key }"
              :aria-pressed="nav.env === key"
              @click="nav.selectEnv(key)"
            >{{ logs.envs[key]?.icon || '' }} {{ logs.envs[key]?.label || key }}</button>
          </div>
          <el-button
            type="primary"
            :icon="Refresh"
            :loading="probing"
            :disabled="!nav.services.length"
            @click="probeEnv"
          >探测级别</el-button>
        </div>
      </section>

      <!-- 概览指标 -->
      <section class="kpi-row" aria-label="环境概览指标">
        <div class="ui-surface ui-kpi">
          <div class="ui-kpi-icon"><el-icon><Monitor /></el-icon></div>
          <div><div class="ui-kpi-value">{{ stats.modules }}</div><div class="ui-kpi-label">模块</div></div>
        </div>
        <div class="ui-surface ui-kpi">
          <div class="ui-kpi-icon ui-kpi-icon--info"><el-icon><Document /></el-icon></div>
          <div><div class="ui-kpi-value">{{ stats.levels }}</div><div class="ui-kpi-label">日志级别</div></div>
        </div>
        <div class="ui-surface ui-kpi">
          <div class="ui-kpi-icon ui-kpi-icon--trc"><el-icon><Files /></el-icon></div>
          <div><div class="ui-kpi-value">{{ stats.probed }}</div><div class="ui-kpi-label">已探测</div></div>
        </div>
        <div class="ui-surface ui-kpi">
          <div class="ui-kpi-icon ui-kpi-icon--warn"><el-icon><Link /></el-icon></div>
          <div><div class="ui-kpi-value">{{ stats.mro }}</div><div class="ui-kpi-label">MRO 直链</div></div>
        </div>
      </section>

      <!-- 检索与布局控制 -->
      <section class="dash-controls ui-surface">
        <el-input
          v-model="search"
          :prefix-icon="Search"
          placeholder="搜索模块 / 应用 / 主机 / 级别"
          clearable
          class="search-input"
          aria-label="搜索模块"
        />
        <div class="ctrl-right">
          <label class="switch-label">
            <el-switch v-model="onlyProbed" size="small" />
            <span>仅已探测</span>
          </label>
          <span class="ui-divider-v" />
          <div class="density" role="group" aria-label="布局密度">
            <el-tooltip content="舒适布局" placement="top" :show-after="400">
              <button
                type="button"
                class="ui-icon-btn"
                :class="{ on: density === 'comfortable' }"
                :aria-pressed="density === 'comfortable'"
                aria-label="舒适布局"
                @click="density = 'comfortable'"
              ><el-icon><Grid /></el-icon></button>
            </el-tooltip>
            <el-tooltip content="紧凑布局" placement="top" :show-after="400">
              <button
                type="button"
                class="ui-icon-btn"
                :class="{ on: density === 'compact' }"
                :aria-pressed="density === 'compact'"
                aria-label="紧凑布局"
                @click="density = 'compact'"
              ><el-icon><Menu /></el-icon></button>
            </el-tooltip>
          </div>
          <span class="ui-chip ui-chip--accent">{{ filteredServices.length }} / {{ stats.modules }}</span>
        </div>
      </section>

      <!-- 模块卡片 -->
      <section class="svc-grid" :class="{ compact: density === 'compact' }" aria-label="模块列表">
        <article
          v-for="item in filteredServices"
          :key="item.svc.app + item.i"
          class="svc-card ui-surface"
        >
          <header class="card-hd">
            <span class="ui-dot" :class="dotClass(item)" />
            <div class="card-title">
              <div class="nm" :title="item.svc.module">{{ item.svc.module }}</div>
              <div class="sub">
                <span class="sub-app" :title="item.svc.app">{{ item.svc.app }}</span>
                <span class="sub-sep" aria-hidden="true">·</span>
                <span class="sub-host" :title="item.svc.host">{{ item.svc.host }}</span>
              </div>
            </div>
            <span class="ui-chip" :class="item.levels.length ? 'ui-chip--accent' : ''">
              {{ item.levels.length }} 级别
            </span>
          </header>

          <div v-if="item.levels.length" class="card-levels">
            <div v-for="lv in item.levels" :key="lv" class="lv-group">
              <button
                type="button"
                class="lv-open"
                :class="`tone-${levelTagType(lv)}`"
                :title="item.levelSizes[lv] ? `打开 ${lv} 日志聚合（当前文件 ${item.levelSizes[lv]}）` : `打开 ${lv} 日志聚合`"
                @click="nav.openLog(item.i, lv)"
              >{{ lv }}<small v-if="item.levelSizes[lv]" class="lv-size">{{ item.levelSizes[lv] }}</small></button>
              <span class="lv-sep" aria-hidden="true" />
              <el-tooltip :content="`新标签打开 ${lv} 日志文件`" placement="top" :show-after="400">
                <a
                  class="lv-act"
                  :href="item.levelUrls[lv]"
                  target="_blank"
                  :aria-label="`新标签打开 ${lv} 日志文件`"
                ><el-icon><Link /></el-icon></a>
              </el-tooltip>
              <el-tooltip content="下载该级别日志文件" placement="top" :show-after="400">
                <button
                  type="button"
                  class="lv-act"
                  :disabled="download.active && download.key !== downloadKey(item.svc, lv)"
                  :aria-label="`下载 ${lv} 日志文件`"
                  @click="downloadLevel(item.svc, lv)"
                ><el-icon><Loading v-if="isDownloading(item.svc, lv)" class="is-loading" /><Download v-else /></el-icon></button>
              </el-tooltip>
            </div>
          </div>
          <div v-else class="card-note" :class="{ 'card-note--warn': item.probed }">
            <el-icon><InfoFilled /></el-icon>
            {{ item.probed ? '该目录无业务级别日志' : '尚未探测，可点右上角「探测级别」' }}
          </div>

          <footer class="card-ft">
            <a class="ft-link" :href="item.dirUrl" target="_blank">
              <el-icon><Folder /></el-icon> 目录
            </a>
            <el-tooltip content="复制全部日志链接" placement="top" :show-after="400">
              <button
                type="button"
                class="ui-icon-btn"
                :disabled="!item.levels.length"
                aria-label="复制全部日志链接"
                @click="copyUrls(item)"
              ><el-icon><DocumentCopy /></el-icon></button>
            </el-tooltip>
          </footer>
        </article>
      </section>

      <div v-if="!filteredServices.length" class="ui-empty">
        <div class="ui-empty-icon"><el-icon><Search /></el-icon></div>
        <div class="ui-empty-title">没有匹配的模块</div>
        <div class="ui-empty-desc">换个关键词，或关闭「仅已探测」筛选后重试。</div>
        <el-button size="small" @click="resetFilters">清除筛选</el-button>
      </div>

      <!-- MRO 直链 -->
      <section v-if="nav.mro.length" class="mro-sec ui-surface">
        <header class="mro-hd">
          <div class="mro-title">
            <el-icon><Link /></el-icon>
            <h3>MRO 直链</h3>
            <span class="ui-chip">{{ nav.mro.length }}</span>
          </div>
          <span class="mro-hint">无需账号 · 悬停查看完整地址</span>
        </header>
        <div class="mro-chips">
          <el-tooltip v-for="m in nav.mro" :key="m.label" :content="m.url" placement="top" :show-after="300">
            <a class="mro-chip" :href="m.url" target="_blank">
              <el-icon><Link /></el-icon>
              <span>{{ m.label }}</span>
              <span class="mro-arrow" aria-hidden="true">↗</span>
            </a>
          </el-tooltip>
        </div>
      </section>
    </template>

    <!-- 下载浮条：与主内容解耦，避免撑动网格 -->
    <Transition name="dl">
      <div v-if="download.active" class="dl-dock" role="status">
        <div class="dl-icon"><el-icon><Download /></el-icon></div>
        <div class="dl-meta">
          <div class="dl-name">正在下载 · {{ download.label }}</div>
          <el-progress :percentage="download.percent" :stroke-width="5" :show-text="false" />
        </div>
        <span class="dl-size">
          {{ fmtBytes(download.received) }}<template v-if="download.total"> / {{ fmtBytes(download.total) }}</template>
        </span>
        <el-tooltip content="取消下载" placement="top" :show-after="300">
          <button type="button" class="ui-icon-btn" aria-label="取消下载" @click="cancelDownload">
            <el-icon><Close /></el-icon>
          </button>
        </el-tooltip>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  Loading, DocumentCopy, Download, Search, Link, Folder, Monitor,
  Document, Files, Refresh, Grid, Menu, InfoFilled, Close,
} from '@element-plus/icons-vue'
import { useLogs } from '../../composables/useLogs'
import { useNavigation } from '../../composables/useNavigation'
import { useToast } from '../../composables/useToast'
import { useAccessLog } from '../../composables/useAccessLog'
import { levelTagType } from '../../constants/logLevels'

const logs = useLogs()
const nav = useNavigation()
const toast = useToast()
const access = useAccessLog()
const probing = ref(false)

const search = ref('')
const onlyProbed = ref(false)
const density = ref('comfortable')

/** 单一下载任务：进度、标签与当前 key 都归仪表盘本地，不进全局 store */
const download = reactive({
  active: false, key: '', label: '', received: 0, total: 0, percent: 0,
})
let downloadAbort = null
let lastProgressAt = 0

const envLabel = computed(() => {
  const info = nav.currentEnvInfo
  return `${info.icon || ''} ${info.label || nav.env}`.trim()
})

/** 一次性算好级别、探测状态与全部直链（显式 envKey），模板只读结果 */
const serviceRows = computed(() => nav.services.map((svc, i) => {
  const envKey = nav.env
  const levels = nav.getLevels(svc)
  const levelUrls = {}
  const levelSizes = {}
  for (const lv of levels) {
    levelUrls[lv] = logs.buildLogUrl(svc.host, svc.app, lv, undefined, envKey)
    levelSizes[lv] = logs.getActiveFileSize(svc.host, svc.app, lv, envKey)
  }
  return {
    svc,
    i,
    levels,
    levelUrls,
    levelSizes,
    dirUrl: logs.buildDirUrl(svc.host, svc.app, envKey),
    probed: !!logs.getIndexMeta(svc.host, svc.app, envKey),
  }
}))

const filteredServices = computed(() => {
  const q = search.value.trim().toLowerCase()
  return serviceRows.value.filter(({ svc, levels, probed }) => {
    if (onlyProbed.value && !probed) return false
    if (!q) return true
    return [svc.module, svc.app, svc.host, levels.join(' ')]
      .some((v) => String(v || '').toLowerCase().includes(q))
  })
})

const stats = computed(() => ({
  modules: serviceRows.value.length,
  levels: serviceRows.value.reduce((n, r) => n + r.levels.length, 0),
  probed: serviceRows.value.filter((r) => r.probed).length,
  mro: nav.mro.length,
}))

function dotClass(item) {
  if (item.levels.length) return 'ui-dot--ok'
  return item.probed ? 'ui-dot--warn' : ''
}

function resetFilters() {
  search.value = ''
  onlyProbed.value = false
}

onMounted(() => {
  access.track(access.ACTION.OPEN_DASHBOARD)
})

async function probeEnv() {
  if (probing.value) return
  const n = nav.services.length
  if (!n) {
    toast.warn('当前环境无模块')
    return
  }
  probing.value = true
  let hintAt = 0
  try {
    const r = await logs.discoverEnvLevels(nav.env, {
      force: true,
      onProgress: ({ done, total }) => {
        const now = Date.now()
        if (done < total && now - hintAt < 800) return
        hintAt = now
        toast.success('探测级别中', `已探测 ${done}/${total}`)
      },
    })
    const failHint = r.fail
      ? `，失败 ${r.fail}` + (r.failed?.length ? `：${r.failed.slice(0, 5).join('、')}${r.failed.length > 5 ? '…' : ''}` : '')
      : ''
    toast.success(
      `探测完成（${nav.env}）`,
      `成功 ${r.ok} / 共 ${r.total}` + failHint,
    )
  } catch (e) {
    toast.error('探测失败', e.message || String(e))
  } finally {
    probing.value = false
  }
}

function copyUrls(item) {
  const urls = Object.values(item.levelUrls).join('\n')
  if (!urls) {
    toast.warn('无可复制的级别链接', '请先探测，或该目录无业务日志')
    return
  }
  navigator.clipboard?.writeText(urls).then(() => {
    toast.success('已复制全部日志链接')
    access.track(access.ACTION.COPY_LINKS, {
      env: nav.env,
      module: item.svc.module || '',
      app: item.svc.app || '',
    })
  })
}

function downloadKey(svc, lv) {
  return `${svc.host}|${svc.app}|${lv}`
}

function isDownloading(svc, lv) {
  return download.active && download.key === downloadKey(svc, lv)
}

function fmtBytes(n) {
  const b = Number(n) || 0
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

async function downloadLevel(svc, lv) {
  if (download.active) return
  const controller = new AbortController()
  downloadAbort = controller
  Object.assign(download, {
    active: true,
    key: downloadKey(svc, lv),
    label: `${svc.module || svc.app} · ${lv}`,
    received: 0,
    total: 0,
    percent: 0,
  })
  lastProgressAt = 0
  try {
    const { filename, size } = await logs.downloadLogFile(svc.host, svc.app, lv, undefined, {
      envKey: nav.env,
      signal: controller.signal,
      onProgress: (received, total) => {
        // 64KB 一片，进度回流很密；节流后再写响应式状态
        const now = Date.now()
        if (now - lastProgressAt < 100) return
        lastProgressAt = now
        download.received = received
        download.total = total
        download.percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
      },
    })
    toast.success('下载完成', `${filename}（${fmtBytes(size)}）`)
    access.track(access.ACTION.DOWNLOAD_LOG, {
      env: nav.env,
      module: svc.module || '',
      app: svc.app || '',
      level: lv,
      detail: filename,
    })
  } catch (e) {
    if (e?.name === 'AbortError') toast.warn('下载已取消')
    else toast.error('下载失败', e?.message || String(e))
  } finally {
    download.active = false
    download.key = ''
    downloadAbort = null
  }
}

function cancelDownload() {
  downloadAbort?.abort()
}

onBeforeUnmount(() => {
  downloadAbort?.abort()
})
</script>

<style scoped>
.dashboard {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: var(--sp-5) var(--sp-6) var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
/* 内容超高时滚动，不能把带 overflow:hidden 的首块压扁导致标题被裁 */
.dashboard > * { flex-shrink: 0 }

/* ── 顶部品牌区 ── */
.dash-hero {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: 26px 28px;
  border: 1px solid var(--bd);
  border-radius: var(--r-xl);
  background: var(--grad-glow), var(--grad-surface), var(--s1);
  box-shadow: var(--sh-2);
}
.dash-hero::after {
  content: '';
  position: absolute;
  right: -80px;
  bottom: -140px;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--ac) 16%, transparent), transparent 70%);
  pointer-events: none;
}
.hero-copy, .hero-actions { position: relative; z-index: 1 }
.hero-copy { max-width: 620px }
.hero-copy h1 {
  margin: 6px 0 8px;
  font-size: 30px;
  font-weight: 760;
  letter-spacing: -.02em;
  line-height: 1.15;
  background: linear-gradient(100deg, var(--t1) 20%, var(--ac));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero-copy p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--t2) }
.hero-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 10px }
.env-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border-radius: var(--r-pill);
  border: 1px solid var(--bd);
  background: color-mix(in srgb, var(--s2) 70%, transparent);
}
.env-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--t2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--r-pill);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--dur) var(--ease);
}
.env-btn:hover { color: var(--t1); background: var(--surf-hover) }
.env-btn.on {
  color: #fff;
  background: var(--grad-accent);
  box-shadow: 0 3px 12px color-mix(in srgb, var(--ac) 32%, transparent);
}

/* ── 概览指标 ── */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-3);
}
.ui-kpi { min-width: 0 }
.ui-kpi > div:last-child { min-width: 0 }

/* ── 检索与布局控制 ── */
.dash-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
}
.search-input { flex: 1 1 280px; max-width: 420px }
.ctrl-right { display: flex; align-items: center; gap: var(--sp-3); margin-left: auto }
.switch-label { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--t2); cursor: pointer; white-space: nowrap }
.density { display: flex; gap: 4px }
.ui-icon-btn.on {
  color: var(--ac);
  border-color: color-mix(in srgb, var(--ac) 42%, var(--bd));
  background: var(--surf-active);
}

/* ── 模块卡片 ── */
.svc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--sp-4);
  align-items: start;
}
.svc-grid.compact { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: var(--sp-3) }
.svc-card {
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.svc-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--sh-2);
  border-color: color-mix(in srgb, var(--ac) 32%, var(--bd));
}
.compact .svc-card { padding: var(--sp-3); gap: var(--sp-2) }
.card-hd { display: flex; align-items: flex-start; gap: 10px }
.card-hd .ui-dot { margin-top: 7px }
.card-title { flex: 1; min-width: 0 }
.nm {
  font-size: 14px;
  font-weight: 700;
  color: var(--t1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 应用名过长时只省略应用名，主机 IP 始终完整可见 */
.sub {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  margin-top: 3px;
  font-size: var(--fs-xs);
  color: var(--t3);
  font-family: var(--font-log);
}
/* 只收缩、不撑开：应用名截断后 IP 紧随其后，不会被顶到卡片最右侧 */
.sub-app {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub-sep { flex: none; opacity: .55 }
/* 无宽度上限：IP 无论多长都完整显示，溢出空间全部由应用名吸收 */
.sub-host {
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--t2);
  font-variant-numeric: tabular-nums;
}
.card-hd .ui-chip { flex: none; white-space: nowrap }
.card-levels { display: flex; flex-wrap: wrap; gap: var(--sp-2) }
/* 每个级别一个分段按钮组：主按钮 + 外链 / 下载，避免散落的小圆按钮 */
.lv-group {
  display: inline-flex;
  align-items: center;
  height: 30px;
  border: 1px solid var(--bd);
  border-radius: var(--r-sm);
  background: var(--s2);
  overflow: hidden;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.lv-group:hover, .lv-group:focus-within {
  border-color: color-mix(in srgb, var(--ac) 42%, var(--bd));
  box-shadow: var(--sh-1);
}
.lv-open {
  height: 100%;
  min-width: 58px;
  padding: 0 11px;
  border: 0;
  background: transparent;
  color: var(--t1);
  font-family: var(--font-log);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: box-shadow var(--dur) var(--ease);
}
.lv-open:hover { box-shadow: inset 0 0 0 999px var(--surf-hover) }
.lv-size { margin-left: 6px; font-size: 10px; font-weight: 500; opacity: .72; letter-spacing: 0 }
.lv-open.tone-success, .lv-open.tone-primary { color: var(--info); background: var(--info-bg) }
.lv-open.tone-warning { color: var(--warn); background: var(--warn-bg) }
.lv-open.tone-danger { color: var(--err); background: var(--err-bg) }
.lv-open.tone-info { color: var(--dbg); background: var(--dbg-bg) }
.lv-sep { width: 1px; height: 16px; flex: none; background: var(--bd) }
.lv-act {
  width: 28px;
  height: 100%;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--t2);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.lv-act:hover { color: var(--ac); background: var(--surf-hover) }
.lv-act:disabled { opacity: .45; cursor: not-allowed }
.compact .lv-group { height: 26px }
.compact .lv-open { min-width: 50px; padding: 0 8px }
.compact .lv-act { width: 24px }
.ui-icon-btn { width: 28px; height: 28px; font-size: 13px }
a.ui-icon-btn { text-decoration: none }
.card-note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--s2);
  border: 1px dashed var(--bd);
  color: var(--t3);
  font-size: var(--fs-sm);
}
.card-note--warn { color: var(--warn); border-color: var(--warn-bd); background: var(--warn-bg) }
.card-ft {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--sp-3);
  border-top: 1px solid var(--bd);
}
.compact .card-ft { padding-top: var(--sp-2) }
.ft-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--t2);
  text-decoration: none;
  transition: color var(--dur) var(--ease);
}
.ft-link:hover { color: var(--ac) }

/* ── MRO ── */
.mro-sec { padding: var(--sp-4) }
.mro-hd { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: var(--sp-3) }
.mro-title { display: flex; align-items: center; gap: 8px; color: var(--ac) }
.mro-title h3 { margin: 0; font-size: 14px; font-weight: 700; color: var(--t1) }
.mro-hint { font-size: var(--fs-xs); color: var(--t3) }
.mro-chips { display: flex; flex-wrap: wrap; gap: var(--sp-2) }
.mro-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--bd);
  background: var(--s2);
  color: var(--t2);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
  transition: all var(--dur) var(--ease);
}
.mro-chip:hover {
  color: var(--ac);
  border-color: color-mix(in srgb, var(--ac) 40%, var(--bd));
  background: var(--surf-hover);
  transform: translateY(-1px);
}
.mro-arrow { opacity: .6; font-size: 12px }

/* ── 下载浮条 ── */
.dl-dock {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: min(420px, calc(100vw - 48px));
  padding: var(--sp-3);
  border-radius: var(--r-lg);
  border: 1px solid color-mix(in srgb, var(--ac) 34%, var(--bd));
  background: var(--grad-surface), var(--s1);
  box-shadow: var(--sh-3);
}
.dl-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  color: var(--ac);
  background: color-mix(in srgb, var(--ac) 14%, transparent);
  font-size: 16px;
}
.dl-meta { flex: 1; min-width: 0 }
.dl-name {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--t1);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dl-size { font-size: var(--fs-xs); color: var(--t3); font-variant-numeric: tabular-nums; white-space: nowrap }
.dl-enter-active, .dl-leave-active { transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease) }
.dl-enter-from, .dl-leave-to { opacity: 0; transform: translateY(12px) }

@media (max-width: 900px) {
  .dashboard { padding: var(--sp-4) var(--sp-3) }
  .dash-hero { padding: var(--sp-4) }
  .hero-copy h1 { font-size: 24px }
  .ctrl-right { width: 100%; margin-left: 0; justify-content: space-between }
  .search-input { max-width: none; flex: 1 1 100% }
}
</style>
