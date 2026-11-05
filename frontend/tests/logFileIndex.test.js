import test from 'node:test'
import assert from 'node:assert/strict'

const storageHandlers = new Set()
globalThis.window = {
  addEventListener(type, fn) { if (type === 'storage') storageHandlers.add(fn) },
  removeEventListener(type, fn) { storageHandlers.delete(fn) },
}

function createStorage() {
  const map = new Map()
  let reads = 0
  return {
    getItem(key) { reads += 1; return map.has(key) ? map.get(key) : null },
    setItem(key, value) { map.set(key, String(value)) },
    removeItem(key) { map.delete(key) },
    clear() { map.clear() },
    get reads() { return reads },
  }
}

/** 每个用例用独立 query 拿到全新模块实例，避免模块级快照串扰 */
async function loadModule(tag) {
  storageHandlers.clear()
  globalThis.localStorage = createStorage()
  const mod = await import(`../src/utils/logFileIndex.js?case=${tag}`)
  return { mod, storage: globalThis.localStorage }
}

function dispatchStorage(key, newValue) {
  for (const fn of storageHandlers) fn({ key, newValue })
}

function sampleEntry(levels = ['INFO']) {
  return {
    ruleId: 'app-level-date-idx',
    updatedAt: 1_700_000_000_000,
    refreshedDay: '2026-01-01',
    levels,
    files: { INFO: 'a_info.log' },
    archives: { INFO: [{ name: 'a_info.log', active: true }] },
    fileCount: 1,
  }
}

test('重复 loadEntry 只读一次 localStorage 并命中 memo', async () => {
  const { mod, storage } = await loadModule('memo')
  mod.saveEntry('h|a', sampleEntry())
  const before = storage.reads
  const a = mod.loadEntry('h|a', 'app-level-date-idx')
  const b = mod.loadEntry('h|a', 'app-level-date-idx')
  assert.equal(storage.reads, before)
  assert.deepEqual(a.levels, ['INFO'])
  assert.notEqual(a, b)
  assert.equal(mod.loadEntry('missing'), null)
  assert.equal(mod.loadEntry('h|a', 'other-rule'), null)
})

test('saveEntry / removeEntry 写时失效并递增 revision', async () => {
  const { mod, storage } = await loadModule('write')
  mod.saveEntry('h|a', sampleEntry(['INFO']))
  assert.deepEqual(mod.loadEntry('h|a').levels, ['INFO'])
  mod.saveEntry('h|a', sampleEntry(['ERROR']))
  assert.deepEqual(mod.loadEntry('h|a').levels, ['ERROR'])
  mod.removeEntry('h|a')
  assert.equal(mod.loadEntry('h|a'), null)
  assert.ok(JSON.parse(storage.getItem(mod.INDEX_STORAGE_KEY)).revision >= 3)
})

test('旧快照缺字段由规范化兜底', async () => {
  const { mod, storage } = await loadModule('legacy')
  storage.setItem(mod.INDEX_STORAGE_KEY, JSON.stringify({
    entries: {
      'h|a': { levels: ['WARN'], files: {}, archives: { WARN: [] }, updatedAt: 1_700_000_000_000 },
    },
  }))
  const entry = mod.loadEntry('h|a')
  assert.deepEqual(entry.levels, ['WARN'])
  assert.equal(entry.refreshedDay, mod.localDayKey(1_700_000_000_000))
  assert.equal(entry.fileCount, 0)
  assert.equal(entry.ruleId, undefined)
})

test('跨标签更高 revision 失效快照并通知订阅方，退订后不再通知', async () => {
  const { mod, storage } = await loadModule('cross-tab')
  mod.saveEntry('h|a', sampleEntry(['INFO']))
  assert.deepEqual(mod.loadEntry('h|a').levels, ['INFO'])

  const events = []
  const off = mod.onStoreInvalidate((keys) => events.push(keys))
  const external = {
    version: 1,
    revision: 42,
    entries: { 'h|a': sampleEntry(['ERROR']) },
  }
  const raw = JSON.stringify(external)
  storage.setItem(mod.INDEX_STORAGE_KEY, raw)
  dispatchStorage(mod.INDEX_STORAGE_KEY, raw)
  assert.equal(events.length, 1)
  assert.ok(events[0].includes('h|a'))
  assert.deepEqual(mod.loadEntry('h|a').levels, ['ERROR'])

  off()
  const newer = JSON.stringify({ ...external, revision: 43, entries: { 'h|a': sampleEntry(['DEBUG']) } })
  storage.setItem(mod.INDEX_STORAGE_KEY, newer)
  dispatchStorage(mod.INDEX_STORAGE_KEY, newer)
  assert.equal(events.length, 1)
  assert.deepEqual(mod.loadEntry('h|a').levels, ['DEBUG'])
})

test('旧 revision 事件不回退本地快照', async () => {
  const { mod, storage } = await loadModule('stale')
  mod.saveEntry('h|a', sampleEntry(['INFO']))
  storage.setItem(mod.INDEX_STORAGE_KEY, JSON.stringify({ version: 1, revision: 0, entries: {} }))
  dispatchStorage(mod.INDEX_STORAGE_KEY, storage.getItem(mod.INDEX_STORAGE_KEY))
  assert.deepEqual(mod.loadEntry('h|a').levels, ['INFO'])
})

test('storage 清空事件使快照与 memo 全部失效', async () => {
  const { mod, storage } = await loadModule('clear')
  mod.saveEntry('h|a', sampleEntry())
  assert.ok(mod.loadEntry('h|a'))
  storage.clear()
  dispatchStorage(null, null)
  assert.equal(mod.loadEntry('h|a'), null)
})
