<template>
  <button
    type="button"
    class="fold-bar"
    :aria-expanded="expanded ? 'true' : 'false'"
    :aria-label="expanded ? '收起本条日志' : `展开剩余 ${remain} 行`"
    @click="$emit('toggle')"
  >
    <span class="fold-bar-line" aria-hidden="true" />
    <span class="fold-bar-label">
      <span class="fold-bar-chevron" aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
      {{ expanded ? '收起' : `展开剩余 ${remain} 行` }}
    </span>
    <span class="fold-bar-line" aria-hidden="true" />
  </button>
</template>

<script setup>
defineProps({
  expanded: { type: Boolean, default: false },
  remain: { type: Number, default: 0 },
})
defineEmits(['toggle'])
</script>

<style scoped>
.fold-bar {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: color-mix(in srgb, var(--t3) 14%, var(--log-bg));
  color: var(--t2);
  font-size: 12px;
  font-family: var(--font-ui);
  line-height: 1;
  transition: background 0.15s ease, color 0.15s ease;
}
.fold-bar:hover {
  background: color-mix(in srgb, var(--ac) 16%, var(--log-bg));
  color: var(--ac);
}
.fold-bar:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ac) 55%, transparent);
  outline-offset: 1px;
}
.fold-bar-line {
  flex: 1;
  max-width: 140px;
  height: 1px;
  background: color-mix(in srgb, currentColor 35%, transparent);
}
.fold-bar-label {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  letter-spacing: 0.04em;
  user-select: none;
}
.fold-bar-chevron {
  font-size: 11px;
  opacity: 0.85;
}
</style>
