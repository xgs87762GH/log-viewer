import test from 'node:test'
import assert from 'node:assert/strict'
import { matchBlobFilters, compileFilters } from '../src/utils/logFilterMatch.js'
import { buildEntrySearchIndex } from '../src/utils/logEntries.js'

const inc = ['timeout', 'ORDER']
const exc = ['health']

test('compileFilters 与 matchBlobFilters 行为等价', () => {
  const matcher = compileFilters(inc, exc)
  const blobs = [
    'socket timeout while calling ORDER BY id',
    'SOCKET TIMEOUT order by id',
    'GET /actuator/health timeout ORDER',
    'plain line',
    '',
  ]
  for (const blob of blobs) {
    assert.equal(matcher(blob.toLowerCase()), matchBlobFilters(blob, inc, exc), blob)
  }
})

test('包含 AND、排除 OR、大小写不敏感', () => {
  const matcher = compileFilters(['Error', 'timeout'], ['health', 'debug'])
  assert.equal(matcher('error: read TIMEOUT'.toLowerCase()), true)
  assert.equal(matcher('error only'.toLowerCase()), false)
  assert.equal(matcher('error timeout health'.toLowerCase()), false)
  assert.equal(matcher('error timeout debug'.toLowerCase()), false)
})

test('包含条件切换为 OR：任一命中即保留', () => {
  const matcher = compileFilters(['timeout', 'refused'], [], false, 'or')
  assert.equal(matcher('socket timeout'.toLowerCase()), true)
  assert.equal(matcher('connection refused'.toLowerCase()), true)
  assert.equal(matcher('all good'.toLowerCase()), false)
})

test('OR 模式下排除条件仍优先生效', () => {
  const matcher = compileFilters(['timeout', 'refused'], ['health'], false, 'or')
  assert.equal(matcher('timeout /actuator/health'.toLowerCase()), false)
  assert.equal(matcher('timeout ok'.toLowerCase()), true)
})

test('matchBlobFilters 与 compileFilters 在两种模式下等价', () => {
  const blobs = ['a timeout', 'b refused', 'a timeout refused', 'nothing', 'health timeout']
  for (const mode of ['and', 'or']) {
    const matcher = compileFilters(['timeout', 'refused'], ['health'], false, mode)
    for (const blob of blobs) {
      assert.equal(
        matcher(blob.toLowerCase()),
        matchBlobFilters(blob, ['timeout', 'refused'], ['health'], false, mode),
        `${mode}:${blob}`,
      )
    }
  }
})

test('OR 模式下空条件仍返回 null', () => {
  assert.equal(compileFilters([], [], false, 'or'), null)
  assert.equal(compileFilters(['', null], [''], false, 'or'), null)
})

test('空条件返回 null，调用方可直接跳过过滤', () => {
  assert.equal(compileFilters(), null)
  assert.equal(compileFilters(['', null], ['']), null)
  assert.equal(matchBlobFilters('anything'), true)
})

test('buildEntrySearchIndex 与原 blob 拼接等价且已小写化', () => {
  const lines = ['First Line', '  at com.Foo(Foo.java:1)', 'Second LINE']
  const entries = [
    { id: 0, rows: [{ idx: 0 }, { idx: 1 }] },
    { id: 2, rows: [{ idx: 2 }] },
  ]
  const index = buildEntrySearchIndex(entries, lines)
  assert.equal(index[0], 'first line\n  at com.foo(foo.java:1)')
  assert.equal(index[1], 'second line')
  const matcher = compileFilters(['foo'], [])
  assert.equal(matcher(index[0]), true)
  assert.equal(matcher(index[1]), false)
})
