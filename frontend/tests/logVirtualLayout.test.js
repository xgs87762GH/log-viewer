import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRowLayout,
  clampScrollTop,
  findStartIndex,
  findEndIndex,
} from '../src/utils/logVirtualLayout.js'

test('高度表与偏移按视觉行数累加', () => {
  const layout = buildRowLayout([{ visualLines: 1 }, { visualLines: 2 }, {}], 21)
  assert.deepEqual(layout.heights, [21, 42, 21])
  assert.deepEqual(layout.offsets, [0, 21, 63, 84])
  assert.equal(layout.totalHeight, 84)
})

test('clampScrollTop 把逻辑滚动位置夹到当前内容可滚动区间', () => {
  assert.equal(clampScrollTop(50, 1000, 300), 50)
  assert.equal(clampScrollTop(5000, 1000, 300), 700)
  assert.equal(clampScrollTop(-10, 1000, 300), 0)
  assert.equal(clampScrollTop(10, 0, 0), 0)
  assert.equal(clampScrollTop(Number.NaN, 0, 0), 0)
})

test('夹紧后的滚动位置仍能命中可见行', () => {
  const layout = buildRowLayout(Array.from({ length: 100 }, () => ({ visualLines: 1 })), 21)
  const y = clampScrollTop(99999, layout.totalHeight, 300)
  assert.equal(y, layout.totalHeight - 300)
  assert.ok(findStartIndex(layout.offsets, y) < findEndIndex(layout.offsets, y + 300))
})
