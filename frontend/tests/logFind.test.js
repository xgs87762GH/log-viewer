import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeFindQuery,
  buildFindMatches,
  stepFindIndex,
  findScrollTop,
} from '../src/utils/logFind.js'

const rows = [
  { kind: 'line', key: 'l-0', idx: 0, no: 1, text: 'INFO start service' },
  { kind: 'fold', key: 'f-1' },
  { kind: 'line', key: 'l-1', idx: 1, no: 2, text: 'WARN Timeout when calling API' },
  { kind: 'line', key: 'l-2', idx: 2, no: 3, text: 'ERROR timeout AGAIN' },
]

test('normalizeFindQuery 去掉首尾空白并容错非字符串', () => {
  assert.equal(normalizeFindQuery('  timeout  '), 'timeout')
  assert.equal(normalizeFindQuery(null), '')
  assert.equal(normalizeFindQuery(undefined), '')
})

test('buildFindMatches 大小写不敏感、跳过折叠行并透传下标与行号', () => {
  assert.deepEqual(buildFindMatches(rows, '  TIMEOUT '), [
    { rowIndex: 2, idx: 1, no: 2 },
    { rowIndex: 3, idx: 2, no: 3 },
  ])
  assert.deepEqual(buildFindMatches(rows, 'service'), [
    { rowIndex: 0, idx: 0, no: 1 },
  ])
})

test('空条件、空数据、命中在折叠占位行时不产生命中', () => {
  assert.deepEqual(buildFindMatches(rows, ''), [])
  assert.deepEqual(buildFindMatches(rows, '   '), [])
  assert.deepEqual(buildFindMatches([], 'timeout'), [])
  assert.deepEqual(buildFindMatches([{ kind: 'fold', key: 'f-0' }], 'fold'), [])
})

test('关键词按字面量处理，正则元字符不抛错', () => {
  const special = [{ kind: 'line', idx: 0, no: 1, text: 'path a.*+?b end' }]
  assert.equal(buildFindMatches(special, '.*+?').length, 1)
  assert.equal(buildFindMatches(special, 'a').length, 1)
  assert.equal(buildFindMatches(special, 'a.b').length, 0)
})

test('stepFindIndex 循环前进/后退并处理非法游标', () => {
  assert.equal(stepFindIndex(-1, 3, 1), 0)
  assert.equal(stepFindIndex(-1, 3, -1), 2)
  assert.equal(stepFindIndex(0, 3, 1), 1)
  assert.equal(stepFindIndex(0, 3, -1), 2)
  assert.equal(stepFindIndex(2, 3, 1), 0)
  assert.equal(stepFindIndex(9, 3, 1), 0)
  assert.equal(stepFindIndex(1, 0, 1), -1)
})

test('findScrollTop 把命中行滚到视口中部并钳制边界', () => {
  const offsets = [0, 22, 44, 66, 88]
  assert.equal(findScrollTop(offsets, 0, 100), 0)
  assert.equal(findScrollTop(offsets, 2, 100), 0)
  assert.equal(findScrollTop(offsets, 3, 100), 16)
  // offsets 比行数多 1；越界索引钳到最后一个有效行（offsets[3] = 66）
  assert.equal(findScrollTop(offsets, 99, 100), 16)
  assert.equal(findScrollTop([], 0, 100), 0)
})
