import test from 'node:test'
import assert from 'node:assert/strict'
import { buildViewRows } from '../src/utils/logViewRows.js'

const lines = [
  '2026-01-01 INFO main line',
  'java.lang.RuntimeException: boom',
  '  at com.Foo.bar(Foo.java:1)',
  '  at com.Foo.baz(Foo.java:2)',
  '  at com.Foo.qux(Foo.java:3)',
  '  at com.Foo.zzz(Foo.java:4)',
]

function entry(id = 'e1', count = lines.length) {
  return {
    id,
    rows: lines.slice(0, count).map((_, i) => ({ idx: i, level: i === 0 ? 'INFO' : '' })),
  }
}

function build(overrides = {}) {
  return buildViewRows({
    entries: [entry()],
    lines,
    expandedIds: new Set(),
    collapsedIds: new Set(),
    foldEnabled: true,
    foldMaxLines: 5,
    wordWrap: false,
    wrapCols: 100,
    ...overrides,
  })
}

test('完整展示时只有首行带折叠入口', () => {
  const rows = build({ foldEnabled: false })
  assert.equal(rows.length, lines.length)
  assert.equal(rows.filter((r) => r.canFold).length, 1)
  assert.equal(rows[0].canFold, true)
  assert.ok(!rows[1].canFold)
  assert.equal(rows[0].clipped, false)
})

test('自动超行折叠：按视觉行数限高预览，remain 为剩余视觉行数', () => {
  const rows = build({ wordWrap: false, foldMaxLines: 3 })
  const fold = rows.find((r) => r.kind === 'fold')
  assert.ok(fold)
  assert.equal(fold.manual, false)
  assert.equal(fold.expanded, false)
  assert.equal(rows.filter((r) => r.kind === 'line').length, 3)
  assert.equal(fold.remain, lines.length - 3)
  // 预览行正文完整，只是限高；未超过预算的行不裁剪
  assert.ok(rows.filter((r) => r.kind === 'line').every((r) => !r.clipped))
})

test('视觉行数恰好等于阈值时不折叠', () => {
  const rows = build({ wordWrap: false, foldMaxLines: lines.length })
  assert.equal(rows.filter((r) => r.kind === 'fold').length, 0)
  assert.equal(rows.filter((r) => r.kind === 'line').length, lines.length)
})

test('单行日志超阈值：限高为阈值的预览 + 折叠条，正文不截断', () => {
  const long = 'x'.repeat(900)
  const rows = build({
    entries: [{ id: 'long', rows: [{ idx: 0, level: 'INFO' }] }],
    lines: [long],
    wordWrap: true,
    wrapCols: 100,
    foldMaxLines: 2,
  })
  const line = rows.find((r) => r.kind === 'line')
  const fold = rows.find((r) => r.kind === 'fold')
  assert.equal(line.visualLines, 2)
  assert.equal(line.clipped, true)
  assert.equal(line.text, long)
  assert.ok(fold.remain > 0)
})

test('手动折叠任意条目：只留首行并生成可展开的折叠条', () => {
  const rows = build({ collapsedIds: new Set(['e1']) })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].kind, 'line')
  assert.equal(rows[0].idx, 0)
  const fold = rows[1]
  assert.equal(fold.kind, 'fold')
  assert.equal(fold.manual, true)
  assert.equal(fold.expanded, false)
})

test('手动折叠单行条目也一定生成折叠条，避免无法展开', () => {
  const rows = build({
    entries: [entry('single', 1)],
    collapsedIds: new Set(['single']),
  })
  assert.equal(rows.length, 2)
  assert.equal(rows[1].kind, 'fold')
  assert.equal(rows[1].manual, true)
})

test('手动折叠优先于自动展开', () => {
  const rows = build({
    expandedIds: new Set(['e1']),
    collapsedIds: new Set(['e1']),
    foldMaxLines: 2,
  })
  assert.equal(rows.length, 2)
  assert.equal(rows[1].manual, true)
})

test('展开自动折叠条目后末尾出现「收起」折叠条', () => {
  const rows = build({ expandedIds: new Set(['e1']), foldMaxLines: 2 })
  assert.equal(rows.filter((r) => r.kind === 'line').length, lines.length)
  const fold = rows.at(-1)
  assert.equal(fold.kind, 'fold')
  assert.equal(fold.expanded, true)
})

test('未开启自动折叠时也能手动折叠', () => {
  const rows = build({ foldEnabled: false, collapsedIds: new Set(['e1']) })
  assert.equal(rows.length, 2)
  assert.equal(rows[1].kind, 'fold')
})
