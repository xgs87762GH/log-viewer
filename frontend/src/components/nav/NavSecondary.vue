<template>
  <aside class="nav-secondary" :class="{ collapsed: nav.navL2Collapsed }">
    <header class="hd">
      <span v-show="!nav.navL2Collapsed" class="hd-title">模块</span>
      <el-button
        :icon="nav.navL2Collapsed ? DArrowRight : DArrowLeft"
        circle
        text
        size="small"
        :title="nav.navL2Collapsed ? '展开二级导航' : '缩小二级导航'"
        @click="nav.toggleNavL2()"
      />
    </header>

    <!-- v-show：保留模块树，避免展开时整树重建卡顿 -->
    <div v-show="!nav.navL2Collapsed" class="body">
      <NavEnvModuleTree />
    </div>
    <div v-show="nav.navL2Collapsed" class="rail" @click="nav.toggleNavL2()">
      <span>环</span><span>境</span><span>·</span><span>模</span><span>块</span>
    </div>
  </aside>
</template>

<script setup>
/**
 * NavSecondary —— 第二栏
 * 收起瞬时变宽；内容用 v-show 隐藏，不销毁组件树。
 */
import { DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import { useNavigation } from '../../composables/useNavigation'
import NavEnvModuleTree from './NavEnvModuleTree.vue'

const nav = useNavigation()
</script>

<style scoped>
.nav-secondary {
  width: 260px;
  background: var(--s1);
  border-right: 1px solid var(--bd);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 0;
  contain: layout style;
}
.nav-secondary.collapsed { width: 40px }

.hd {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--bd);
  min-height: 52px;
}
.hd-title {
  flex: 1;
  font-size: 12px;
  font-weight: 700;
  color: var(--t3);
  letter-spacing: .04em;
}
.nav-secondary.collapsed .hd {
  justify-content: center;
  border-bottom: none;
  padding: 8px 4px;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 0;
  color: var(--t3);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}
.rail:hover { color: var(--el-color-primary) }
</style>
