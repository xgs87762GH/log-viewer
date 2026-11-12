import test from 'node:test'
import assert from 'node:assert/strict'
import { isAtTop, isAtBottom } from '../src/utils/logScrollState.js'

test('isAtTop：顶部位置含 2px 容差', () => {
  assert.equal(isAtTop(0), true)
  assert.equal(isAtTop(1), true)
  assert.equal(isAtTop(2), true)
  assert.equal(isAtTop(3), false)
  assert.equal(isAtTop(0, 0), true)
  assert.equal(isAtTop(1, 0), false)
})

test('isAtBottom：按可滚动距离判定底部', () => {
  // totalHeight 1000 - viewport 100 = 可滚动 900
  assert.equal(isAtBottom(900, 100, 1000), true)
  assert.equal(isAtBottom(898, 100, 1000), true)
  assert.equal(isAtBottom(897, 100, 1000), false)
  assert.equal(isAtBottom(0, 100, 1000), false)
})

test('isAtBottom：内容不足一屏时视为已到底', () => {
  assert.equal(isAtBottom(0, 600, 300), true)
  assert.equal(isAtBottom(0, 600, 0), true)
})

test('isAtBottom：自定义容差生效', () => {
  assert.equal(isAtBottom(890, 100, 1000, 10), true)
  assert.equal(isAtBottom(889, 100, 1000, 10), false)
})

test('非法输入安全回退，不抛出异常', () => {
  assert.equal(isAtTop(null), true)
  assert.equal(isAtTop(undefined), false)
  assert.equal(isAtBottom(null, null, null), true)
  assert.equal(isAtBottom(undefined, 100, 1000), false)
  assert.equal(isAtBottom(0, undefined, undefined), true)
})
