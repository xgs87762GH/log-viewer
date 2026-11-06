import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeVersion, compareVersions, pickLatestTag,
  isUpdateAvailable, shouldRecheck, parseCheckCache,
} from '../src/utils/versionCheck.js'

test('规整版本：去 v 前缀、补零、保留预发布、丢弃 build 元数据', () => {
  assert.equal(normalizeVersion('v1.0.2'), '1.0.2')
  assert.equal(normalizeVersion('  V2  '), '')
  assert.equal(normalizeVersion('v2'), '2.0.0')
  assert.equal(normalizeVersion('1.0'), '1.0.0')
  assert.equal(normalizeVersion('1.0.3-rc.1'), '1.0.3-rc.1')
  assert.equal(normalizeVersion('1.0.2+build.7'), '1.0.2')
  for (const bad of ['', null, undefined, 'nightly', 'v1.x.0', '1.0.2.3', 'http://x']) {
    assert.equal(normalizeVersion(bad), '', `${bad} 应视为非法`)
  }
})

test('语义化比较按数字段，不被字符串序误导', () => {
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1)
  assert.equal(compareVersions('v1.0.2', '1.0.2'), 0)
  assert.equal(compareVersions('1.0', '1.0.0'), 0)
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1)
  assert.equal(compareVersions('1.0.3', '1.0.3'), 0)
})

test('正式版高于同号预发布，预发布按段比较', () => {
  assert.equal(compareVersions('1.0.3', '1.0.3-rc.1'), 1)
  assert.equal(compareVersions('1.0.3-rc.1', '1.0.3-rc.2'), -1)
  assert.equal(compareVersions('1.0.3-rc.10', '1.0.3-rc.2'), 1)
  assert.equal(compareVersions('1.0.3-alpha', '1.0.3-beta'), -1)
  assert.equal(compareVersions('1.0.3-1', '1.0.3-alpha'), -1)
})

test('非法版本按最低处理，不影响合法比较', () => {
  assert.equal(compareVersions('nightly', '1.0.0'), -1)
  assert.equal(compareVersions('1.0.0', 'nightly'), 1)
  assert.equal(compareVersions('bad', 'worse'), 0)
})

test('从乱序 / 脏 tag 列表中选出最大语义化版本', () => {
  const tags = [
    { name: 'v1.0.1' },
    { name: 'v1.0.10' },
    { name: 'nightly' },
    { name: 'v1.0.9' },
    { name: 'v1.0.2-rc.1' },
    null,
    { name: 'v1.0.2' },
  ]
  assert.deepEqual(pickLatestTag(tags), { version: '1.0.10', tag: 'v1.0.10' })
  assert.equal(pickLatestTag(['v1.0.2', 'v1.0.1']).version, '1.0.2')
  assert.deepEqual(pickLatestTag(['v1.0.2', 'v1.0.3-rc.1']), {
    version: '1.0.3-rc.1', tag: 'v1.0.3-rc.1',
  })
  assert.equal(pickLatestTag([]), null)
  assert.equal(pickLatestTag(null), null)
  assert.equal(pickLatestTag([{ name: 'nightly' }]), null)
})

test('更新判定只在严格更高版本时为真', () => {
  assert.equal(isUpdateAvailable('1.0.2', 'v1.0.3'), true)
  assert.equal(isUpdateAvailable('1.0.2', 'v1.0.2'), false)
  assert.equal(isUpdateAvailable('1.0.2', 'v1.0.1'), false)
  assert.equal(isUpdateAvailable('1.0.3', 'v1.0.3-rc.1'), false)
  assert.equal(isUpdateAvailable('1.0.2', 'nightly'), false)
})

test('缓存 TTL 边界与异常时间', () => {
  const now = 1_700_000_000_000
  const ttl = 60 * 60 * 1000
  assert.equal(shouldRecheck(now - ttl + 1, now, ttl), false)
  assert.equal(shouldRecheck(now - ttl, now, ttl), true)
  assert.equal(shouldRecheck(now - ttl - 1, now, ttl), true)
  assert.equal(shouldRecheck(0, now, ttl), true)
  assert.equal(shouldRecheck(now + 1, now, ttl), true)
  assert.equal(shouldRecheck('bad', now, ttl), true)
})

test('缓存脏数据按无缓存处理', () => {
  const now = Date.now()
  assert.deepEqual(parseCheckCache(JSON.stringify({ latest: 'v1.0.3', checkedAt: now })), {
    latest: '1.0.3', checkedAt: now,
  })
  for (const bad of ['{oops', null, '', '{}', '{"latest":"nightly","checkedAt":1}',
    JSON.stringify({ latest: 'v1.0.3', checkedAt: 0 }),
    JSON.stringify({ latest: 'v1.0.3', checkedAt: 'x' }), '[]']) {
    assert.equal(parseCheckCache(bad), null, `${bad} 应无效`)
  }
})
