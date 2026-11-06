<template>
  <div class="cfg">
    <div class="cfg-status" :class="{ 'is-warn': !backend.ok }">
      <span class="ui-chip" :class="backend.ok ? 'ui-chip--ok' : 'ui-chip--warn'">
        <i class="ui-dot" :class="backend.ok ? 'ui-dot--ok' : 'ui-dot--warn'" />
        {{ backend.ok ? '服务配置可读写' : '服务配置不可用' }}
      </span>
      <span>{{ backend.ok ? '服务配置来自 config/logs.json 与 config/access.json，写入前会在 backup/ 生成备份。' : backend.reason }}</span>
    </div>

    <p class="cfg-tip">
      导出文件含内网地址与白名单 IP，请妥善保管；代理账号密码（.env）不会进入归档。
    </p>

    <section class="cfg-block">
      <header class="cfg-head">
        <h3>导出配置</h3>
        <span>勾选要打包的内容，生成一个 JSON 文件</span>
      </header>
      <div class="cfg-grid">
        <div v-for="d in defs" :key="d.key" class="cfg-item">
          <el-checkbox v-model="exportFlags[d.key]" :disabled="busy">
            <span class="cfg-label">{{ d.label }}</span>
            <small class="cfg-hint">{{ d.hint }}</small>
          </el-checkbox>
          <span v-if="d.sensitive" class="ui-chip ui-chip--warn">含内网 IP</span>
        </div>
      </div>
      <div class="cfg-actions">
        <el-button type="primary" plain :loading="busy" @click="onExport">导出配置</el-button>
        <span class="cfg-sub">已选 {{ exportCount }} 项</span>
      </div>
    </section>

    <section class="cfg-block">
      <header class="cfg-head">
        <h3>导入配置</h3>
        <span>先预览归档内容，再逐项勾选要覆盖的配置</span>
      </header>
      <div class="cfg-actions">
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="cfg-file"
          aria-label="选择配置文件"
          @change="onFile"
        />
        <el-button :disabled="busy" @click="pickFile">选择配置文件</el-button>
        <span class="cfg-sub">单个 JSON，最大 2 MB；服务端配置写入另限 1 MB</span>
      </div>

      <div v-if="bundle" class="cfg-preview">
        <div class="cfg-meta">
          <span class="ui-chip ui-chip--accent">归档版本 {{ bundle.version || '—' }}</span>
          <span class="cfg-sub">导出于 {{ fmtTime(bundle.exportedAt) }}</span>
        </div>
        <div
          v-for="row in preview"
          :key="row.key"
          class="cfg-row"
          :class="{ off: !row.present }"
        >
          <el-checkbox
            v-model="importFlags[row.key]"
            :disabled="!row.present || busy"
            :aria-label="`导入 ${row.label}`"
          />
          <div class="cfg-row-body">
            <strong>{{ row.label }}</strong>
            <small>{{ row.present ? row.detail : '归档中不包含' }}</small>
          </div>
          <span v-if="row.backend" class="ui-chip">服务端</span>
          <span v-if="row.sensitive && row.present" class="ui-chip ui-chip--warn">敏感</span>
        </div>
        <p class="cfg-warn">导入会覆盖勾选的现有配置；服务配置写入服务端并在 backup/ 生成备份。导入不含账号密码。</p>
        <div class="cfg-actions">
          <el-button type="primary" :disabled="busy || importCount === 0" :loading="busy" @click="onImport">
            确认导入（{{ importCount }} 项）
          </el-button>
          <el-button :disabled="busy" @click="clearPreview">取消</el-button>
        </div>
      </div>

      <div v-if="result" class="cfg-result ui-surface">
        <p><strong>已完成：</strong>{{ result.applied.join('、') || '无' }}</p>
        <p v-if="result.skipped.length" class="cfg-warn">未导入：{{ result.skipped.join('；') }}</p>
        <p v-if="result.backups.length" class="cfg-sub">服务端备份：{{ result.backups.join('、') }}</p>
      </div>
    </section>
  </div>
</template>

<script setup>
/**
 * 配置导入导出分区 —— 独立于设置草稿。
 * 导出直接落盘，导入必须先预览 + 逐项勾选，避免误覆盖。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useConfigTransfer } from '../../composables/useConfigTransfer'
import { useToast } from '../../composables/useToast'
import { SECTION_DEFS, parseBundle, summarizeBundle } from '../../utils/configBundle'

const transfer = useConfigTransfer()
const toast = useToast()
const defs = SECTION_DEFS

const backend = ref({ ok: false, reason: '正在检查权限…' })
const busy = ref(false)
const exportFlags = reactive(Object.fromEntries(defs.map((d) => [d.key, true])))
const importFlags = reactive({})
const fileInput = ref(null)
const bundle = ref(null)
const preview = ref([])
const result = ref(null)

const exportCount = computed(() => Object.values(exportFlags).filter(Boolean).length)
const importCount = computed(() => Object.values(importFlags).filter(Boolean).length)

function fmtTime(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function selected(flags) {
  return Object.keys(flags).filter((k) => flags[k] === true)
}

function pickFile() {
  fileInput.value?.click()
}

async function onFile(e) {
  const input = e.target
  const file = input?.files?.[0]
  if (!file) return
  input.value = ''
  if (file.size > 2 * 1024 * 1024) {
    toast.error('文件过大', '请选择 2 MB 以内的配置归档')
    return
  }
  try {
    const parsed = parseBundle(await file.text())
    if (!parsed.ok) {
      toast.error('无法导入', parsed.error)
      return
    }
    bundle.value = parsed.bundle
    preview.value = summarizeBundle(parsed.bundle)
    for (const key of Object.keys(importFlags)) delete importFlags[key]
    for (const row of preview.value) importFlags[row.key] = row.present
    result.value = null
  } catch (err) {
    toast.error('读取文件失败', err?.message || String(err))
  }
}

function clearPreview() {
  bundle.value = null
  preview.value = []
  for (const key of Object.keys(importFlags)) delete importFlags[key]
}

async function onExport() {
  const keys = selected(exportFlags)
  if (!keys.length) {
    toast.warn('请至少勾选一项配置')
    return
  }
  busy.value = true
  try {
    const res = await transfer.exportConfig(keys)
    if (res.note) toast.warn('配置已导出', res.note)
    else toast.success('配置已导出', `${res.filename}（${res.sections.length} 个配置段）`)
  } catch (err) {
    toast.error('导出失败', err?.message || String(err))
  } finally {
    busy.value = false
  }
}

async function onImport() {
  const keys = selected(importFlags)
  if (!keys.length || !bundle.value) {
    toast.warn('请至少勾选一项配置')
    return
  }
  busy.value = true
  try {
    const res = await transfer.importConfig(bundle.value, keys)
    result.value = res
    if (res.skipped.length) toast.warn('部分配置未导入', res.skipped.join('；'))
    else toast.success('配置已导入', '已写入并立即生效')
  } catch (err) {
    toast.error('导入失败', err?.message || String(err))
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  backend.value = await transfer.probeBackend()
})
</script>

<style scoped>
.cfg { display: flex; flex-direction: column; gap: var(--sp-4) }
.cfg-status {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2);
  padding: var(--sp-3); border: 1px solid var(--bd); border-radius: var(--r-sm);
  background: var(--s2); color: var(--t2); font-size: var(--fs-sm);
}
.cfg-status.is-warn { border-color: color-mix(in srgb, var(--warn) 40%, var(--bd)) }
.cfg-tip { margin: 0; color: var(--t2); font-size: var(--fs-sm); line-height: 1.6 }
.cfg-block {
  padding: var(--sp-4); border: 1px solid var(--bd); border-radius: var(--r);
  background: var(--s1);
}
.cfg-head { display: flex; align-items: baseline; gap: var(--sp-3); margin-bottom: var(--sp-3) }
.cfg-head h3 { margin: 0; font-size: var(--fs-md); color: var(--t1) }
.cfg-head span { color: var(--t3); font-size: var(--fs-xs) }
.cfg-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--sp-2);
}
.cfg-item {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3); border: 1px solid var(--bd); border-radius: var(--r-sm);
  background: var(--s2); min-width: 0;
}
.cfg-label { display: block; color: var(--t1); font-size: var(--fs-sm); font-weight: 600 }
.cfg-hint { display: block; color: var(--t3); font-size: var(--fs-xs); line-height: 1.5 }
.cfg-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-3); margin-top: var(--sp-3) }
.cfg-file { display: none }
.cfg-sub { color: var(--t3); font-size: var(--fs-xs) }
.cfg-preview { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2) }
.cfg-meta { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap }
.cfg-row {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3); border: 1px solid var(--bd); border-radius: var(--r-sm);
  background: var(--s2);
}
.cfg-row.off { opacity: .55 }
.cfg-row-body { flex: 1; min-width: 0 }
.cfg-row-body strong { display: block; color: var(--t1); font-size: var(--fs-sm) }
.cfg-row-body small { display: block; color: var(--t3); font-size: var(--fs-xs) }
.cfg-warn { color: var(--warn); font-size: var(--fs-xs); line-height: 1.6; margin: var(--sp-2) 0 0 }
.cfg-result {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-2);
  margin-top: var(--sp-3); padding: var(--sp-3); border-radius: var(--r-sm);
  font-size: var(--fs-sm); color: var(--t2);
}
.cfg-result p { margin: 0 }
:deep(.el-checkbox) { height: auto; align-items: flex-start }
:deep(.el-checkbox__label) { white-space: normal; line-height: 1.4 }
@media (max-width: 900px) {
  .cfg-grid { grid-template-columns: 1fr }
  .cfg-head { flex-direction: column; gap: 0 }
}
</style>
