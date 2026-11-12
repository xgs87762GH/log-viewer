<template>
  <button
    type="button"
    class="fold-bar"
    :aria-expanded="expanded ? 'true' : 'false'"
    :aria-label="expanded ? '收起本条日志' : (manual ? '展开本条日志' : `展开剩余 ${remain} 行`)"
    @click="$emit('toggle')"
    @dblclick.stop
  >
    <span class="fold-bar-line" aria-hidden="true" />
    <span class="fold-bar-label">
      <span class="fold-bar-chevron" aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
      {{ expanded ? '收起' : (manual ? '展开本条日志' : `展开剩余 ${remain} 行`) }}
    </span>
    <span class="fold-bar-line" aria-hidden="true" />
  </button>
</template>

<script setup>
defineProps({
  expanded: { type: Boolean, default: false },
  remain: { type: Number, default: 0 },
  manual: { type: Boolean, default: false },
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
  border: 1px solid color-mix(in srgb, var(--t3) 22%, transparent);
  border-radius: var(--r-sm);
  cursor: pointer;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--t3) 10%, var(--log-bg)),
    color-mix(in srgb, var(--ac) 8%, var(--log-bg)),
    color-mix(in srgb, var(--t3) 10%, var(--log-bg)));
  color: var(--t2);
  font-size: var(--fs-sm);
  font-weight: 600;
  font-family: var(--font-ui);
  line-height: 1;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
              border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.fold-bar:hover {
  background: color-mix(in srgb, var(--ac) 18%, var(--log-bg));
  border-color: color-mix(in srgb, var(--ac) 40%, transparent);
  color: var(--ac);
  box-shadow: 0 0 0 3px var(--ring);
}
.fold-bar:focus-visible {
  outline: 2px solid var(--ac);
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
