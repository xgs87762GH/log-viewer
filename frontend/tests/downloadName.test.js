import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDownloadName } from '../src/utils/downloadName.js'

test('标准命名：中文环境标签 + 中文项目展示名 + 级别', () => {
  assert.equal(
    buildDownloadName({ env: '测试环境', module: '订单服务', level: 'INFO' }),
    '测试环境_订单服务_INFO.log',
  )
  assert.equal(
    buildDownloadName({ env: '开发环境', module: 'ACTIVITI', level: 'WARN' }),
    '开发环境_ACTIVITI_WARN.log',
  )
})

test('配置未写中文 label 时，环境 key 仍可作为段值', () => {
  assert.equal(
    buildDownloadName({ env: 'TEST', module: '订单服务', level: 'INFO' }),
    'TEST_订单服务_INFO.log',
  )
})

test('清洗路径分隔符与 Windows 非法字符', () => {
  assert.equal(
    buildDownloadName({ env: 'DEV/PROD', module: 'a\\b:c*d?e"f<g>h|i', level: 'IN:FO' }),
    'DEV_PROD_a_b_c_d_e_f_g_h_i_IN_FO.log',
  )
})

test('空白与控制字符折叠为单个下划线，首尾不留分隔符', () => {
  assert.equal(
    buildDownloadName({ env: '  DEV  ', module: ' 订单  服务\n ', level: '\tINFO\u0001' }),
    'DEV_订单_服务_INFO.log',
  )
})

test('缺字段按 ENV / APP / LOG 回退', () => {
  assert.equal(buildDownloadName(), 'ENV_APP_LOG.log')
  assert.equal(buildDownloadName({ env: 'DEV', module: '', level: '  ' }), 'DEV_APP_LOG.log')
})

test('超长段截断，整体不超过上限且保留 .log 后缀', () => {
  const name = buildDownloadName({
    env: 'E'.repeat(200),
    module: '项'.repeat(200),
    level: 'L'.repeat(200),
  })
  assert.ok(name.endsWith('.log'))
  assert.ok(name.length <= 120)
})

test('不把上游原文件名拼进结果', () => {
  const name = buildDownloadName({ env: 'DEV', module: '订单服务', level: 'INFO' })
  assert.equal(name, 'DEV_订单服务_INFO.log')
  assert.ok(!name.includes('2026'))
})
