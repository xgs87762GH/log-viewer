<template>
  <div class="behavior">
    <div class="field">
      <div class="field-label"><span>自动滚动到末尾</span><small>加载完成后定位到最新日志</small></div>
      <el-switch v-model="draft.behavior.autoScroll" aria-label="自动滚动到末尾" />
    </div>
    <div class="field">
      <div class="field-label">
        <span>自动换行</span>
        <small>超长行自动折行；关闭后可横向滚动查看完整内容</small>
      </div>
      <el-switch v-model="draft.behavior.wordWrap" aria-label="自动换行" />
    </div>
    <div class="field">
      <div class="field-label"><span>超行折叠</span><small>仅折叠单条日志的预览，不是整页截断</small></div>
      <el-switch v-model="draft.behavior.foldOverLimit" aria-label="超行折叠" />
    </div>
    <div v-if="draft.behavior.foldOverLimit" class="field">
      <div class="field-label"><span>折叠阈值</span><small>单条日志视觉行数超过 N 行才折叠</small></div>
      <el-input-number
        v-model="draft.behavior.foldMaxLines"
        :min="1" :max="50000" :step="1" controls-position="right" aria-label="折叠阈值"
      />
      <span class="unit">行</span>
    </div>
    <div class="field">
      <div class="field-label"><span>最大行数</span><small>单次展示的日志行上限</small></div>
      <el-input-number
        v-model="draft.behavior.maxLines"
        :min="1000" :max="100000" :step="1000" controls-position="right" aria-label="最大行数"
      />
      <span class="unit">行</span>
    </div>
    <div class="field">
      <div class="field-label"><span>尾部下载</span><small>每次请求文件末尾的大小</small></div>
      <el-input-number
        v-model="draft.behavior.tailMB"
        :min="1" :max="100" :step="1" controls-position="right" aria-label="尾部下载"
      />
      <span class="unit">MB</span>
    </div>

    <p class="group-label">上下文弹窗</p>
    <div class="field">
      <div class="field-label"><span>上下文初始</span><small>打开时中心行前后各取多少行</small></div>
      <el-input-number
        v-model="draft.behavior.contextInitialLines"
        :min="CONTEXT_LIMITS.initialLines.min"
        :max="CONTEXT_LIMITS.initialLines.max"
        :step="1" controls-position="right" aria-label="上下文初始行数"
      />
      <span class="unit">行</span>
    </div>
    <div class="field">
      <div class="field-label"><span>懒加载步长</span><small>滚到边界时每次追加的行数</small></div>
      <el-input-number
        v-model="draft.behavior.contextLazyStep"
        :min="CONTEXT_LIMITS.lazyStep.min"
        :max="CONTEXT_LIMITS.lazyStep.max"
        :step="1" controls-position="right" aria-label="懒加载步长"
      />
      <span class="unit">行 / 次</span>
    </div>
    <div class="field">
      <div class="field-label"><span>单侧上限</span><small>前后各计，达到上限后停止加载</small></div>
      <el-input-number
        v-model="draft.behavior.contextMaxLines"
        :min="CONTEXT_LIMITS.maxLinesPerSide.min"
        :max="CONTEXT_LIMITS.maxLinesPerSide.max"
        :step="5" controls-position="right" aria-label="上下文单侧上限"
      />
      <span class="unit">行</span>
    </div>

    <div class="notes">
      <p><el-icon><InfoFilled /></el-icon>更改仅在点击底部「保存设置」后写入；最大行数 / 尾部下载变化会重新拉取当前日志，上下文参数只影响弹窗。</p>
      <p><el-icon><InfoFilled /></el-icon>尾部下载只请求文件末尾（HTTP Range），不是整文件；状态栏「大小」是远端文件总大小，「已下」才是本次下载量。</p>
    </div>
  </div>
</template>

<script setup>
/** 行为分区：数值区间沿用 CONTEXT_LIMITS，夹紧由页面保存时统一处理 */
import { InfoFilled } from '@element-plus/icons-vue'
import { CONTEXT_LIMITS } from '../../constants/logContextConfig'

defineProps({
  draft: { type: Object, required: true },
})
</script>

<style scoped>
.group-label {
  font-size: var(--fs-sm); font-weight: 700; color: var(--t2);
  margin: var(--sp-5) 0 var(--sp-1);
}
.field {
  display: grid; grid-template-columns: 180px minmax(0, 1fr) auto;
  gap: var(--sp-4); align-items: center;
  padding: var(--sp-3) 0; border-bottom: 1px solid var(--bd);
}
.field:last-of-type { border-bottom: 0 }
.field-label { display: flex; flex-direction: column; gap: 3px; min-width: 0 }
.field-label span { font-size: var(--fs-sm); font-weight: 650; color: var(--t1) }
.field-label small { font-size: var(--fs-xs); color: var(--t3); line-height: 1.5 }
.unit { font-size: var(--fs-sm); color: var(--t3); white-space: nowrap }
.notes {
  display: flex; flex-direction: column; gap: var(--sp-2);
  margin-top: var(--sp-4); padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--bd); border-radius: var(--r);
  background: var(--s2);
}
.notes p {
  display: flex; align-items: flex-start; gap: var(--sp-2);
  font-size: var(--fs-xs); line-height: 1.65; color: var(--t2);
}
.notes .el-icon { color: var(--ac); flex-shrink: 0; margin-top: 2px }
@media (max-width: 900px) {
  .field { grid-template-columns: 1fr auto; gap: var(--sp-2) }
  .field-label { grid-column: 1 / -1 }
}
</style>
