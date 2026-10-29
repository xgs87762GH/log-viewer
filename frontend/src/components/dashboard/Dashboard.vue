<template>
  <div class="dashboard">
    <div v-if="!logs.config" class="loading">
      <el-icon class="is-loading" :size="36"><Loading /></el-icon>
      <div>加载配置中…</div>
    </div>

    <template v-else>
      <div class="dash-top">
        <div class="dash-hd">
          <h2>{{ envLabel }}</h2>
          <el-tag type="info" effect="plain" round>{{ nav.services.length }} 个模块</el-tag>
          <el-button
            size="small"
            type="primary"
            plain
            :loading="probing"
            :disabled="!nav.services.length"
            @click="probeEnv"
          >探测级别</el-button>
        </div>
        <el-radio-group :model-value="nav.env" size="small" @change="nav.selectEnv">
          <el-radio-button v-for="key in nav.envKeys" :key="key" :value="key">
            {{ logs.envs[key]?.icon || '' }} {{ logs.envs[key]?.label || key }}
          </el-radio-button>
        </el-radio-group>
      </div>
      <p class="dash-desc">
        选择级别打开日志聚合，或使用外链 / 目录直达 LogIndex。
        打开日志后可在工具栏选择历史日期归档；「探测级别」会串行请求当前环境各服务目录一次（不自动、不轮询）。
      </p>

      <el-row :gutter="16">
        <el-col
          v-for="(svc, i) in nav.services"
          :key="svc.app + i"
          :xs="24" :sm="12" :lg="8"
          class="card-col"
        >
          <el-card shadow="hover" class="svc-card">
            <template #header>
              <div class="card-hd">
                <span class="nm">{{ svc.module }}</span>
                <el-tag size="small" type="info" effect="plain">{{ svc.host }}</el-tag>
              </div>
            </template>
            <div class="card-bd">
              <el-button size="small" tag="a" :href="logs.buildDirUrl(svc.host, svc.app)" target="_blank">
                目录
              </el-button>
              <template v-if="nav.getLevels(svc).length">
                <el-button-group v-for="lv in nav.getLevels(svc)" :key="lv" class="lv-group">
                  <el-button
                    size="small"
                    :type="levelTagType(lv)"
                    plain
                    @click="nav.openLog(i, lv)"
                  >{{ lv }}</el-button>
                  <el-button
                    size="small"
                    tag="a"
                    :href="logs.buildLogUrl(svc.host, svc.app, lv)"
                    target="_blank"
                    :title="'新标签打开 ' + lv"
                  >↗</el-button>
                </el-button-group>
                <el-button size="small" :icon="DocumentCopy" @click="copyUrls(svc)" title="复制全部链接" />
              </template>
              <el-tag
                v-else-if="logs.getIndexMeta(svc.host, svc.app, nav.env)"
                size="small"
                type="warning"
                effect="plain"
              >无业务级别日志</el-tag>
              <el-text v-else size="small" type="info">未探测</el-text>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <div v-if="nav.mro.length" class="mro-sec">
        <h3>MRO 直链（无需账号）</h3>
        <div class="mro-links">
          <el-link
            v-for="m in nav.mro"
            :key="m.label"
            :href="m.url"
            target="_blank"
            type="primary"
            class="mro-a"
          >
            <el-tag size="small" class="mro-tag">{{ m.label }}</el-tag>
            {{ m.url }}
          </el-link>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Loading, DocumentCopy } from '@element-plus/icons-vue'
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

const envLabel = computed(() => {
  const info = nav.currentEnvInfo
  return `${info.icon || ''} ${info.label || nav.env}`.trim()
})

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
  let lastProgressAt = 0
  try {
    const r = await logs.discoverEnvLevels(nav.env, {
      force: true,
      onProgress: ({ done, total }) => {
        const now = Date.now()
        if (done < total && now - lastProgressAt < 800) return
        lastProgressAt = now
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

function copyUrls(svc) {
  const levels = nav.getLevels(svc)
  if (!levels.length) {
    toast.warn('无可复制的级别链接', '请先探测，或该目录无业务日志')
    return
  }
  const urls = levels.map(lv => logs.buildLogUrl(svc.host, svc.app, lv)).join('\n')
  navigator.clipboard?.writeText(urls).then(() => {
    toast.success('已复制全部日志链接')
    access.track(access.ACTION.COPY_LINKS, {
      env: nav.env,
      module: svc.module || '',
      app: svc.app || '',
    })
  })
}
</script>

<style scoped>
.dashboard { flex: 1; overflow-y: auto; padding: 20px 24px; min-height: 0 }
.dash-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.dash-hd { display: flex; align-items: center; gap: 10px }
.dash-hd h2 { margin: 0; font-size: 18px; font-weight: 700 }
.dash-desc { font-size: 13px; color: var(--t3); margin: 0 0 16px }

.card-col { margin-bottom: 16px }
.card-hd { display: flex; align-items: center; gap: 10px }
.nm { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.card-bd { display: flex; flex-wrap: wrap; gap: 8px; align-items: center }
.lv-group { margin-right: 0 }

.mro-sec { margin-top: 8px }
.mro-sec h3 { font-size: 14px; color: var(--t2); margin: 0 0 10px; font-weight: 600 }
.mro-links { display: flex; flex-direction: column; gap: 8px }
.mro-a { justify-content: flex-start; font-size: 13px }
.mro-tag { margin-right: 8px }

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  color: var(--t2);
  gap: 12px;
}
</style>
