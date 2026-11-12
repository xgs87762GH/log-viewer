<template>
  <div class="scroll-nav" data-scroll-nav>
    <el-tooltip content="回到顶部" placement="top" :show-after="400">
      <span class="scroll-nav-slot">
        <button
          type="button"
          class="scroll-nav-btn"
          :disabled="atTop"
          aria-label="回到顶部"
          @click="emit('top')"
        ><el-icon><ArrowUp /></el-icon></button>
      </span>
    </el-tooltip>
    <el-tooltip content="跳到底部" placement="top" :show-after="400">
      <span class="scroll-nav-slot">
        <button
          type="button"
          class="scroll-nav-btn"
          :disabled="atBottom"
          aria-label="跳到底部"
          @click="emit('bottom')"
        ><el-icon><ArrowDown /></el-icon></button>
      </span>
    </el-tooltip>
  </div>
</template>

<script setup>
/** 状态栏置顶 / 置底按钮组：只做一次性滚动，不改变「自动滚动到末尾」设置 */
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'

defineProps({
  atTop: { type: Boolean, default: false },
  atBottom: { type: Boolean, default: false },
})

const emit = defineEmits(['top', 'bottom'])
</script>

<style scoped>
.scroll-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}
.scroll-nav-slot { display: inline-flex }
.scroll-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--bd);
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--t2);
  font-size: 12px;
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    background var(--dur) var(--ease),
    transform var(--dur) var(--ease),
    opacity var(--dur) var(--ease);
}
.scroll-nav-btn:hover:not(:disabled) {
  color: var(--ac);
  border-color: var(--ac);
  background: var(--surf-active);
}
.scroll-nav-btn:active:not(:disabled) { transform: translateY(1px) }
.scroll-nav-btn:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px }
.scroll-nav-btn:disabled { opacity: .35; cursor: not-allowed }
</style>
