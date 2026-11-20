import test from 'node:test'
import assert from 'node:assert/strict'
import { getServiceHosts, serviceMatchesHost } from '../src/utils/serviceHosts.js'

test('未配置 hosts 时只返回默认 host', () => {
  assert.deepEqual(getServiceHosts({ host: '10.0.0.1', app: 'a' }), ['10.0.0.1'])
})

test('host 优先，hosts 去重并按配置顺序追加', () => {
  assert.deepEqual(
    getServiceHosts({ host: '10.0.0.1', hosts: ['10.0.0.1', '10.0.0.2', '10.0.0.3'] }),
    ['10.0.0.1', '10.0.0.2', '10.0.0.3'],
  )
  assert.deepEqual(
    getServiceHosts({ host: '10.0.0.2', hosts: ['10.0.0.1', '10.0.0.2'] }),
    ['10.0.0.2', '10.0.0.1'],
  )
})

test('只有 hosts 没有 host 时也能工作，并过滤空白项', () => {
  assert.deepEqual(getServiceHosts({ hosts: [' 10.0.0.2 ', '', '10.0.0.3'] }), ['10.0.0.2', '10.0.0.3'])
  assert.deepEqual(getServiceHosts({}), [])
  assert.deepEqual(getServiceHosts(null), [])
})

test('serviceMatchesHost 覆盖默认主机与 hosts 列表', () => {
  const svc = { host: '10.0.0.1', hosts: ['10.0.0.2'] }
  assert.equal(serviceMatchesHost(svc, '10.0.0.1'), true)
  assert.equal(serviceMatchesHost(svc, '10.0.0.2'), true)
  assert.equal(serviceMatchesHost(svc, '10.0.0.3'), false)
  assert.equal(serviceMatchesHost(svc, ''), false)
  assert.equal(serviceMatchesHost(null, '10.0.0.1'), false)
})
