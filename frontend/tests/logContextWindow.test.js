import test from 'node:test'
import assert from 'node:assert/strict'
import { createWindow, expandWindow } from '../src/utils/logContextWindow.js'
import { CONTEXT_CONFIG, clampContextConfig } from '../src/constants/logContextConfig.js'

const cfg = { ...CONTEXT_CONFIG }

test('createWindow 前后各取初始行数并裁剪到数据边界', () => {
  const w = createWindow(100, 1000, cfg)
  assert.deepEqual([w.start, w.end, w.center], [90, 110, 100])
  assert.equal(w.before, 10)
  assert.equal(w.after, 10)
  assert.equal(createWindow(2, 100, cfg).start, 0)
  assert.equal(createWindow(97, 100, cfg).end, 99)
})

test('createWindow 无数据时返回空窗口', () => {
  assert.equal(createWindow(0, 0, cfg).end, -1)
})

test('expandWindow 按步长向上/向下追加', () => {
  const w = createWindow(100, 1000, cfg)
  const down = expandWindow(w, 'down', cfg, 1000)
  assert.equal(down.added, 5)
  assert.equal(down.win.end, 115)
  const up = expandWindow(down.win, 'up', cfg, 1000)
  assert.equal(up.added, 5)
  assert.equal(up.win.start, 85)
})

test('expandWindow 遵守单侧上限', () => {
  const small = { initialLines: 0, lazyStep: 20, maxLinesPerSide: 12 }
  let w = createWindow(100, 1000, small)
  for (let i = 0; i < 5; i += 1) w = expandWindow(w, 'up', small, 1000).win
  assert.equal(w.before, 12)
  const res = expandWindow(w, 'up', small, 1000)
  assert.equal(res.added, 0)
  assert.equal(res.atCap, true)
})

test('expandWindow 到达已加载数据边界时不再追加', () => {
  const head = createWindow(3, 100, cfg)
  const up = expandWindow(head, 'up', cfg, 100)
  assert.equal(up.added, 0)
  assert.equal(up.atDataEdge, true)

  const tail = createWindow(98, 100, cfg)
  const down = expandWindow(tail, 'down', cfg, 100)
  assert.equal(down.added, 0)
  assert.equal(down.win.end, 99)
  assert.equal(down.atDataEdge, true)
})

test('clampContextConfig 兜底非法值与旧快照缺字段', () => {
  assert.deepEqual(clampContextConfig(), cfg)
  assert.deepEqual(
    clampContextConfig({ initialLines: 999, lazyStep: 0, maxLinesPerSide: -1 }),
    { initialLines: 50, lazyStep: 1, maxLinesPerSide: 10 },
  )
})
