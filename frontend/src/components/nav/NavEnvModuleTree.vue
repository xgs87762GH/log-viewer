<template>
  <div class="panel">
    <el-tabs
      :model-value="nav.env"
      type="card"
      stretch
      class="env-tabs"
      @tab-change="onEnvChange"
    >
      <el-tab-pane
        v-for="key in nav.envKeys"
        :key="key"
        :name="key"
        :label="tabLabel(key)"
      />
    </el-tabs>

    <div class="mods-hd">
      <span>模块</span>
      <el-tag size="small" type="info" effect="plain">{{ nav.services.length }}</el-tag>
    </div>

    <el-scrollbar class="mods-scroll">
      <div
        v-for="(svc, i) in nav.services"
        :key="svc.app + i"
        class="mod-item"
        :class="{ on: nav.selectedIdx === i }"
        @click="nav.selectEnvService(nav.env, i)"
      >
        <div class="nm">{{ svc.module }}</div>
        <div class="ip">{{ svc.host }}</div>
        <div v-if="nav.selectedIdx === i" class="lvs" @click.stop>
          <template v-if="nav.getLevels(svc).length">
            <el-tag
              v-for="lv in nav.getLevels(svc)"
              :key="lv"
              size="small"
              :type="levelTagType(lv)"
              :effect="nav.selectedLevel === lv ? 'dark' : 'plain'"
              class="lv-tag"
              @click="nav.openLog(i, lv)"
            >{{ lv }}</el-tag>
          </template>
          <span
            v-else-if="logs.getIndexMeta(svc.host, svc.app, nav.env)"
            class="lv-empty"
          >无业务级别日志</span>
        </div>
      </div>
      <el-empty v-if="!nav.services.length" description="暂无模块" :image-size="64" />
    </el-scrollbar>
  </div>
</template>

<script setup>
/**
 * NavEnvModuleTree —— 二级导航：环境 ElTabs + 模块列表
 */
import { useLogs } from '../../composables/useLogs'
import { useNavigation } from '../../composables/useNavigation'
import { levelTagType } from '../../constants/logLevels'

const logs = useLogs()
const nav = useNavigation()

function tabLabel(key) {
  const env = logs.envs[key]
  const name = String(env?.label || key).replace(/环境$/, '')
  return `${env?.icon || ''} ${name}`.trim()
}

function onEnvChange(name) {
  nav.selectEnv(name)
}
</script>

<style scoped>
.panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 8px 8px 0;
}
.env-tabs :deep(.el-tabs__header) { margin-bottom: 8px }
.env-tabs :deep(.el-tabs__item) { padding: 0 8px; height: 32px; font-size: 12px }
.env-tabs :deep(.el-tabs__content) { display: none }

.mods-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--t3);
}
.mods-scroll { flex: 1; min-height: 0 }

.mod-item {
  padding: 10px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  margin-bottom: 4px;
  transition: .12s;
}
.mod-item:hover { background: var(--s2) }
.mod-item.on {
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--s2));
  border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
}
.nm { font-weight: 600; font-size: 13px; color: var(--t1); line-height: 1.3 }
.ip { font-size: 11px; color: var(--t3); font-family: var(--font-log); margin-top: 2px }
.lvs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px }
.lv-tag { cursor: pointer }
.lv-empty { font-size: 11px; color: var(--t3) }
</style>
