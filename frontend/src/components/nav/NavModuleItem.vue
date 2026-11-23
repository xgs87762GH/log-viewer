<template>
  <div
    class="mod-item"
    :class="{ on: active }"
    tabindex="0"
    @click="emit('select')"
    @keydown.enter.prevent="emit('open')"
  >
    <div class="mod-row">
      <span class="nm" :title="row.svc.module">{{ row.svc.module }}</span>
      <span v-if="instances > 1" class="inst" :title="`${instances} 个实例`">{{ instances }} 实例</span>
      <button
        type="button"
        class="fav-btn"
        :class="{ on: favorite }"
        :aria-label="favorite ? '取消收藏' : '收藏该应用'"
        :aria-pressed="favorite"
        @click.stop="emit('toggle-fav')"
      >{{ favorite ? '★' : '☆' }}</button>
    </div>
    <div class="mod-sub">
      <span class="ip" :title="row.svc.host">{{ row.ip }}</span>
      <span v-if="hint" class="hint">{{ hint }}</span>
    </div>
    <div v-if="active" class="lvs" @click.stop>
      <template v-if="row.levels.length">
        <el-tag
          v-for="lv in row.levels"
          :key="lv"
          size="small"
          :type="levelTagType(lv)"
          :effect="selectedLevel === lv ? 'dark' : 'plain'"
          class="lv-tag"
          @click="emit('open-level', lv)"
        >{{ lv }}</el-tag>
      </template>
      <span v-else-if="row.hasIndex" class="lv-empty">无业务级别日志</span>
    </div>
  </div>
</template>

<script setup>
/** 单个服务项：名称 / 实例数 / 主机 / 收藏星标 / 展开级别 */
import { computed } from 'vue'
import { levelTagType } from '../../constants/logLevels'
import { useLogs } from '../../composables/useLogs'

const props = defineProps({
  row: { type: Object, required: true },
  active: { type: Boolean, default: false },
  favorite: { type: Boolean, default: false },
  selectedLevel: { type: String, default: '' },
  /** 右侧补充信息（例如「刚刚」） */
  hint: { type: String, default: '' },
})

const emit = defineEmits(['select', 'open', 'open-level', 'toggle-fav'])
const logs = useLogs()
const instances = computed(() => logs.getServiceHosts(props.row.svc).length)
</script>

<style scoped>
.mod-item {
  position: relative;
  padding: 9px 10px;
  border-radius: var(--r);
  border: 1px solid transparent;
  cursor: pointer;
  margin-bottom: 4px;
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
.mod-item:hover { background: var(--surf-hover) }
.mod-item:focus-visible { outline: 2px solid var(--ac); outline-offset: 1px }
.mod-item.on {
  background: linear-gradient(100deg, color-mix(in srgb, var(--ac) 13%, transparent), transparent);
  border-color: color-mix(in srgb, var(--ac) 24%, var(--bd));
  box-shadow: var(--sh-1);
}
.mod-item.on::before { height: 22px }

.mod-row { display: flex; align-items: center; gap: 6px; min-width: 0 }
.nm {
  min-width: 0;
  font-weight: 650;
  font-size: 13px;
  color: var(--t1);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inst {
  flex: none;
  font-size: 10px;
  line-height: 16px;
  padding: 0 5px;
  border-radius: var(--r-pill);
  color: var(--ac);
  border: 1px solid color-mix(in srgb, var(--ac) 35%, transparent);
}
.fav-btn {
  margin-left: auto;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--t3);
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--dur) var(--ease), color var(--dur) var(--ease);
}
.mod-item:hover .fav-btn,
.mod-item.on .fav-btn,
.fav-btn.on { opacity: 1 }
.fav-btn.on { color: var(--warn) }
.fav-btn:hover { color: var(--warn) }

.mod-sub { display: flex; align-items: center; gap: 6px; margin-top: 3px }
.ip {
  min-width: 0;
  font-size: var(--fs-xs);
  color: var(--t3);
  font-family: var(--font-log);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint { flex: none; font-size: 10px; color: var(--t3) }

.lvs { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px }
.lv-tag { cursor: pointer; border-radius: var(--r-pill) }
.lv-empty { font-size: var(--fs-xs); color: var(--t3) }
</style>
