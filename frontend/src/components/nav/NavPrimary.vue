<template>
  <aside class="nav-primary" :class="{ collapsed: nav.navL1Collapsed }">
    <header class="hd">
      <span class="logo" title="日志中心" aria-hidden="true">📋</span>
      <span v-show="!nav.navL1Collapsed" class="title">日志中心</span>
      <span v-show="!nav.navL1Collapsed" class="ver" :title="'v' + APP_VERSION">v{{ APP_VERSION }}</span>
    </header>

    <div class="body">
      <NavViewSwitch :collapsed="nav.navL1Collapsed" />
    </div>

    <footer class="ft">
      <el-tooltip content="设置" placement="right" :show-after="400">
        <el-button :icon="Setting" circle text @click="settings.open()" />
      </el-tooltip>
      <el-tooltip
        :content="nav.navL1Collapsed ? '展开一级导航' : '缩小一级导航'"
        placement="right"
        :show-after="400"
      >
        <el-button
          :icon="nav.navL1Collapsed ? DArrowRight : DArrowLeft"
          circle
          text
          @click="nav.toggleNavL1()"
        />
      </el-tooltip>
    </footer>
  </aside>
</template>

<script setup>
/**
 * NavPrimary —— 第一栏
 * 收起不做 width 过渡，避免右侧日志区连续 reflow 卡顿。
 */
import { onMounted } from 'vue'
import { Setting, DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import { useSettings } from '../../composables/useSettings'
import { useNavigation } from '../../composables/useNavigation'
import { APP_VERSION } from '../../constants/version'
import NavViewSwitch from './NavViewSwitch.vue'

const settings = useSettings()
const nav = useNavigation()

/** 窄屏首屏默认收起导航，拓宽主内容区（仅首次，不覆盖用户之后的手动展开） */
onMounted(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return
  if (!window.matchMedia('(max-width: 900px)').matches) return
  if (!nav.navL1Collapsed) nav.toggleNavL1()
  if (nav.view === 'viewer' && !nav.navL2Collapsed) nav.toggleNavL2()
})
</script>

<style scoped>
.nav-primary {
  width: 160px;
  background: var(--s1);
  border-right: 1px solid var(--bd);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  /* 不用 width transition：日志区很大时动画帧会卡 */
  contain: layout style;
}
.nav-primary.collapsed { width: 64px }

.hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--bd);
  min-height: 52px;
}
.logo { font-size: 18px; line-height: 1; flex-shrink: 0 }
.title { font-weight: 700; font-size: 14px; color: var(--t1); white-space: nowrap }
.ver {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--t3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.nav-primary.collapsed .hd { justify-content: center; padding-left: 0; padding-right: 0 }
.nav-primary.collapsed .ver { display: none }

.body { flex: 1; min-height: 0; overflow: auto; padding: 8px 0 }

.ft {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-top: 1px solid var(--bd);
}
</style>
