import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBundle, parseBundle, summarizeBundle, bundleFileName,
  ALL_SECTIONS, BACKEND_SECTIONS,
} from '../src/utils/configBundle.js'

const sample = {
  services: { environments: { DEV: { services: [{ host: 'h', app: 'a' }] }, TEST: { services: [] } } },
  access: { enabled: true, statsAllowIps: ['127.0.0.1', '::1'] },
  settings: { theme: 'dark', behavior: { maxLines: 10000 } },
  fileIndex: { version: 1, entries: { 'h|a': { levels: ['INFO'] } } },
  filterHistory: [{ sig: 'i:err', filters: [{ text: 'err', mode: 'include' }] }],
  uiState: { navL1: '0', navL2: '1', drawer: '{"pinned":true}' },
}

test('组装只保留已提供且形状正确的配置段', () => {
  const bundle = buildBundle({ ...sample, settings: null, filterHistory: 'oops' }, {
    version: '1.0.2', exportedAt: '2026-11-06T00:00:00.000Z',
  })
  assert.equal(bundle.app, 'log-viewer')
  assert.equal(bundle.schema, 1)
  assert.deepEqual(Object.keys(bundle.sections).sort(), [
    'access', 'fileIndex', 'services', 'uiState',
  ].sort())
})

test('合法归档可往返解析', () => {
  const parsed = parseBundle(JSON.stringify(buildBundle(sample)))
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.bundle.sections, sample)
})

test('拒绝坏 JSON、错误应用标识与不兼容 schema', () => {
  assert.match(parseBundle('{oops').error, /合法 JSON/)
  assert.match(parseBundle(JSON.stringify({ ...buildBundle(sample), app: 'other' })).error, /不是 Log Viewer/)
  assert.match(parseBundle(JSON.stringify({ ...buildBundle(sample), schema: 99 })).error, /版本不兼容/)
  assert.match(parseBundle(JSON.stringify({ app: 'log-viewer', schema: 1 })).error, /sections/)
})

test('拒绝形状错误的配置段与空归档', () => {
  const bad = buildBundle(sample)
  bad.sections.filterHistory = { not: 'array' }
  assert.match(parseBundle(JSON.stringify(bad)).error, /filterHistory/)
  assert.match(parseBundle(JSON.stringify(buildBundle({}))).error, /没有可导入/)
})

test('导入预览给出每段存在性与覆盖摘要', () => {
  const rows = summarizeBundle({ sections: sample })
  assert.equal(rows.length, ALL_SECTIONS.length)
  assert.ok(rows.every((r) => r.present && r.detail))
  assert.match(rows.find((r) => r.key === 'services').detail, /2 个环境 \/ 1 个服务/)
  assert.match(rows.find((r) => r.key === 'access').detail, /2 个白名单 IP/)
  assert.match(rows.find((r) => r.key === 'filterHistory').detail, /1 条历史/)
  const partial = summarizeBundle({ sections: { settings: sample.settings } })
  assert.equal(partial.find((r) => r.key === 'settings').present, true)
  assert.equal(partial.find((r) => r.key === 'services').present, false)
})

test('后端段固定为 services / access', () => {
  assert.deepEqual(BACKEND_SECTIONS, ['services', 'access'])
})

test('导出文件名含时间戳且为 json', () => {
  const name = bundleFileName(new Date(2026, 10, 6, 14, 30, 5))
  assert.equal(name, 'log-viewer-config-20261106-143005.json')
})
