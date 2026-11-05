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
