import test from 'node:test'
import assert from 'node:assert/strict'
import {
  displayWidth,
  estimateWrapCols,
  visualLinesOf,
  readLogFontMetrics,
  measureLogCharWidth,
} from '../src/utils/logTextMetrics.js'

test('无 DOM 环境时字体度量安全回退，字符宽度实测返回 null', () => {
  assert.deepEqual(readLogFontMetrics(null), {
    fontSize: 13,
    lineHeight: 1.65,
    fontFamily: '',
  })
  assert.equal(measureLogCharWidth(13, 'Consolas, monospace'), null)
})

test('实测字符宽度：探针被移除且返回单字符宽度', () => {
  let removed = false
  const probe = {
    style: {},
    textContent: '',
    getBoundingClientRect() { return { width: probe.textContent.length * 7.15 } },
    offsetWidth: 0,
    remove() { removed = true },
  }
  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => probe,
  }
  try {
    assert.ok(Math.abs(measureLogCharWidth(13, 'Consolas, monospace') - 7.15) < 1e-9)
    assert.equal(probe.style.fontFamily, 'Consolas, monospace')
    assert.equal(removed, true)
  } finally {
    delete globalThis.document
  }
})

test('探针测量异常时返回 null，由调用方回退经验值', () => {
  const probe = {
    style: {},
    getBoundingClientRect: () => ({ width: 0 }),
    offsetWidth: 0,
    remove() {},
  }
  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => probe,
  }
  try {
    assert.equal(measureLogCharWidth(13, 'Consolas'), null)
  } finally {
    delete globalThis.document
  }
})

test('实测列宽消除系统性多算一行的行高', () => {
  const line = 'a'.repeat(170)
  const heuristic = estimateWrapCols(732, { fontSize: 13 })
  const measured = estimateWrapCols(732, { fontSize: 13, pxPerChar: 7.15 })
  assert.ok(measured > heuristic)
  assert.equal(visualLinesOf(line, { wordWrap: true, wrapCols: heuristic }), 3)
  assert.equal(visualLinesOf(line, { wordWrap: true, wrapCols: measured }), 2)
})

test('关闭换行时视觉行数恒为 1', () => {
  assert.equal(visualLinesOf('a'.repeat(500), { wordWrap: false, wrapCols: 10 }), 1)
})

test('制表符按 tab stop 计宽，不再当作 0 宽控制字符', () => {
  assert.equal(displayWidth('\t'), 8)
  assert.equal(displayWidth('a\t'), 8)
  assert.equal(displayWidth('abcdefg\t'), 8)
  assert.equal(displayWidth('abcdefgh\t'), 16)
  const opts = { wordWrap: true, wrapCols: 24 }
  const tabs = Array.from({ length: 6 }, () => '\t'.repeat(8) + 'at com.Foo.bar(Foo.java:1)').join('')
  // 含制表符的堆栈缩进不能比同长度普通文本少算行数，否则行高不够会裁字
  assert.ok(visualLinesOf(tabs, opts) > visualLinesOf(tabs.replaceAll('\t', ''), opts))
})

test('显式换行符逐段累加视觉行数', () => {
  const opts = { wordWrap: true, wrapCols: 100 }
  assert.equal(visualLinesOf('a\nb\nc', opts), 3)
  assert.ok(visualLinesOf('a'.repeat(300) + '\n' + 'b'.repeat(300), opts) >= 6)
})
