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
        v-for="(row, i) in rows"
        :key="row.svc.app + i"
        class="mod-item"
        :class="{ on: nav.selectedIdx === i }"
        @click="nav.selectEnvService(nav.env, i)"
      >
        <div class="nm">{{ row.svc.module }}</div>
        <div class="ip">{{ row.svc.host }}</div>
        <div v-if="nav.selectedIdx === i" class="lvs" @click.stop>
          <template v-if="row.levels.length">
            <el-tag
              v-for="lv in row.levels"
              :key="lv"
              size="small"
              :type="levelTagType(lv)"
              :effect="nav.selectedLevel === lv ? 'dark' : 'plain'"
              class="lv-tag"
              @click="nav.openLog(i, lv)"
            >{{ lv }}</el-tag>
          </template>
          <span
            v-else-if="row.hasIndex"
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
import { computed } from 'vue'
import { useLogs } from '../../composables/useLogs'
import { useNavigation } from '../../composables/useNavigation'
import { levelTagType } from '../../constants/logLevels'

const logs = useLogs()
const nav = useNavigation()

/** 一次算好级别与探测状态，模板不再重复读索引 */
const rows = computed(() => {
  void logs.indexVersion
  return nav.services.map((svc) => ({
    svc,
    levels: nav.getLevels(svc),
    hasIndex: !!logs.getIndexMeta(svc.host, svc.app, nav.env),
  }))
})

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
  padding: 12px 10px 0;
}
.env-tabs :deep(.el-tabs__header) { margin-bottom: 12px; border-bottom: none }
.env-tabs :deep(.el-tabs__nav) {
  border: 1px solid var(--bd) !important;
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--s2);
}
.env-tabs :deep(.el-tabs__item) {
  padding: 0 10px;
  height: 32px;
  font-size: 12px;
  font-weight: 600;
  color: var(--t2);
  border: none !important;
  transition: all var(--dur) var(--ease);
}
.env-tabs :deep(.el-tabs__item.is-active) {
  color: #fff;
  background: var(--grad-accent);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--ac) 30%, transparent);
}
.env-tabs :deep(.el-tabs__content) { display: none }

.mods-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 10px;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--t3);
}
.mods-scroll { flex: 1; min-height: 0 }

.mod-item {
  position: relative;
  padding: 10px 12px;
  border-radius: var(--r);
  border: 1px solid transparent;
  cursor: pointer;
  margin-bottom: 6px;
  transition: all var(--dur) var(--ease);
}
.mod-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 0;
  border-radius: 0 3px 3px 0;
  background: var(--grad-accent);
  transform: translateY(-50%);
  transition: height var(--dur) var(--ease);
}
.mod-item:hover { background: var(--surf-hover); transform: translateX(2px) }
.mod-item.on {
  background: linear-gradient(100deg, color-mix(in srgb, var(--ac) 13%, transparent), transparent);
  border-color: color-mix(in srgb, var(--ac) 24%, var(--bd));
  box-shadow: var(--sh-1);
}
.mod-item.on::before { height: 22px }
.nm { font-weight: 650; font-size: 13px; color: var(--t1); line-height: 1.3 }
.ip { font-size: var(--fs-xs); color: var(--t3); font-family: var(--font-log); margin-top: 3px }
.lvs { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px }
.lv-tag { cursor: pointer; border-radius: var(--r-pill) }
.lv-empty { font-size: var(--fs-xs); color: var(--t3) }
</style>
