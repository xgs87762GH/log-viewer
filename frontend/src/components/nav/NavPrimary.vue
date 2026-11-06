<template>
  <aside class="nav-primary" :class="{ collapsed: nav.navL1Collapsed }">
    <header class="hd">
      <span class="logo" title="日志中心" aria-hidden="true"><i /><i /><i /></span>
      <div v-show="!nav.navL1Collapsed" class="brand">
        <span class="title">日志中心</span>
        <span class="ver ui-chip" :title="versionTitle">v{{ APP_VERSION }}</span>
        <a
          v-if="update.status === 'available'"
          class="upd ui-chip ui-chip--warn"
          :href="releaseUrl"
          target="_blank"
          rel="noopener noreferrer"
          :title="`发现新版本 v${update.latest}（当前 v${APP_VERSION}），点击查看 GitHub 标签`"
          :aria-label="`发现新版本 v${update.latest}`"
        >
          <i class="ui-dot ui-dot--warn" aria-hidden="true" /> 有更新 v{{ update.latest }}
        </a>
      </div>
    </header>

    <div class="body">
      <NavViewSwitch :collapsed="nav.navL1Collapsed" />
    </div>

    <footer class="ft">
      <el-tooltip
        :content="nav.navL1Collapsed ? '展开一级导航' : '缩小一级导航'"
        placement="right"
        :show-after="400"
      >
        <button
          type="button"
          class="ui-icon-btn"
          :aria-label="nav.navL1Collapsed ? '展开一级导航' : '缩小一级导航'"
          @click="nav.toggleNavL1()"
        >
          <el-icon><DArrowRight v-if="nav.navL1Collapsed" /><DArrowLeft v-else /></el-icon>
        </button>
      </el-tooltip>
    </footer>
  </aside>
</template>

<script setup>
/**
 * NavPrimary —— 第一栏
 * 收起不做 width 过渡，避免右侧日志区连续 reflow 卡顿。
 * 版本旁的更新提示由 useVersionCheck 在页面加载时检查，失败静默。
 */
import { computed, onMounted } from 'vue'
import { DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import { useNavigation } from '../../composables/useNavigation'
import { useVersionCheck } from '../../composables/useVersionCheck'
import { APP_VERSION } from '../../constants/version'
import { GITHUB_TAGS_PAGE } from '../../constants/versionCheck'
import NavViewSwitch from './NavViewSwitch.vue'

const nav = useNavigation()
const update = useVersionCheck()
const releaseUrl = GITHUB_TAGS_PAGE

const versionTitle = computed(() => {
  if (update.status === 'available') return `当前 v${APP_VERSION}，最新 v${update.latest}`
  if (update.status === 'up-to-date') return `当前 v${APP_VERSION} · 已是最新`
  return `当前 v${APP_VERSION} · 暂未获取到版本信息`
})

/** 窄屏首屏默认收起导航，拓宽主内容区（仅首次，不覆盖用户之后的手动展开） */
onMounted(() => {
  update.check()
  if (typeof window === 'undefined' || !window.matchMedia) return
  if (!window.matchMedia('(max-width: 900px)').matches) return
  if (!nav.navL1Collapsed) nav.toggleNavL1()
  if (nav.view === 'viewer' && !nav.navL2Collapsed) nav.toggleNavL2()
})
</script>

<style scoped>
.nav-primary {
  width: 168px;
  background: var(--grad-glow), var(--s1);
  border-right: 1px solid var(--bd);
  box-shadow: 2px 0 18px color-mix(in srgb, var(--ac) 5%, transparent);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  /* 不用 width transition：日志区很大时动画帧会卡 */
  contain: layout style;
}
.nav-primary.collapsed { width: 64px }

.hd {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--bd);
  min-height: 62px;
}
.hd::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--hi), transparent);
}
.logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  padding: 9px 8px;
  border-radius: 10px;
  background: var(--grad-accent);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--ac) 34%, transparent);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}
.logo i { display: block; width: 100%; height: 2px; border-radius: 2px; background: rgba(255,255,255,.94) }
.logo i:nth-child(2) { width: 72% }
.logo i:nth-child(3) { width: 48% }
.brand { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0 }
.title { font-weight: 750; font-size: 14px; letter-spacing: .01em; color: var(--t1); white-space: nowrap }
.ver {
  align-self: flex-start;
  padding: 1px 7px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--t3);
}
.upd {
  align-self: flex-start;
  gap: 4px;
  padding: 1px 7px;
  font-size: 10px;
  text-decoration: none;
  transition: box-shadow var(--dur) var(--ease);
}
.upd:hover { box-shadow: 0 0 0 2px var(--warn-bg) }
.upd:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px }
.upd .ui-dot { width: 5px; height: 5px; box-shadow: none }
.nav-primary.collapsed .hd { justify-content: center; padding-left: 0; padding-right: 0 }

.body { flex: 1; min-height: 0; overflow: auto; padding: 10px 0 }

.ft {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  border-top: 1px solid var(--bd);
}
</style>
