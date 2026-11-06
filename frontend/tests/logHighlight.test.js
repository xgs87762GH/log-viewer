import test from 'node:test'
import assert from 'node:assert/strict'
import { highlightLine, applyTextHighlights } from '../src/utils/logParser.js'
import {
  addHighlightTerm,
  removeHighlightTerm,
} from '../src/utils/highlightTerms.js'
import {
  FILTER_HIGHLIGHT_CLASS,
  USER_HIGHLIGHT_CLASS,
  FIND_HIGHLIGHT_CLASS,
} from '../src/constants/logSearchTools.js'

test('高亮 class 常量与既有 hit 语义保持独立', () => {
  assert.equal(FILTER_HIGHLIGHT_CLASS, 'hit')
  assert.equal(USER_HIGHLIGHT_CLASS, 'hl')
  assert.equal(FIND_HIGHLIGHT_CLASS, 'find-hit')
  const html = highlightLine('hello ERROR world', 'ERROR', ['ERROR'])
  assert.ok(html.includes('<mark class="hit">ERROR</mark>'), html)
})

test('applyTextHighlights 按组输出不同 class，且不破坏已有标签', () => {
  const base = '<span class="ts">2024-01-01</span> hello world timeout'
  const html = applyTextHighlights(base, [
    { terms: ['world'], className: USER_HIGHLIGHT_CLASS },
    { terms: ['timeout'], className: FIND_HIGHLIGHT_CLASS },
  ])
  assert.ok(html.includes('<span class="ts">2024-01-01</span>'), html)
  assert.ok(html.includes('<mark class="hl">world</mark>'), html)
  assert.ok(html.includes('<mark class="find-hit">timeout</mark>'), html)
})

test('已有 mark 不被二次包裹，长词优先于短词', () => {
  const html = applyTextHighlights(
    '<mark class="hit">timeout</mark> and timeout',
    [{ terms: ['timeout', 'time'], className: FIND_HIGHLIGHT_CLASS }],
  )
  assert.ok(html.startsWith('<mark class="hit">timeout</mark>'), html)
  assert.ok(html.includes('<mark class="find-hit">timeout</mark>'), html)
  assert.ok(!html.includes('<mark class="hit"><mark'), html)
})

test('非法 className 被白名单拒绝，关键词含标签按字面量处理', () => {
  const clean = applyTextHighlights('plain text', [
    { terms: ['text'], className: 'bad"onclick="alert(1)' },
  ])
  assert.equal(clean, 'plain text')
  const html = applyTextHighlights('<span>alpha &lt;script&gt; beta</span>', [
    { terms: ['<script>', '<span>'], className: USER_HIGHLIGHT_CLASS },
  ])
  assert.ok(!html.includes('<script'), html)
  assert.ok(!html.includes('onclick'), html)
  assert.ok(html.includes('<span>alpha'), html)
})

test('正则元字符按字面量匹配，恶意关键词不会注入新标签', () => {
  const html = applyTextHighlights('a.*+?b and a.*+?b', [
    { terms: ['.*+?'], className: USER_HIGHLIGHT_CLASS },
  ])
  assert.equal((html.match(/<mark class="hl">/g) || []).length, 2)
  assert.ok(!html.includes('<img'), html)
  assert.ok(!html.includes('onerror'), html)
})

test('空组与空词原样返回', () => {
  const base = '<span class="ts">x</span>'
  assert.equal(applyTextHighlights(base, []), base)
  assert.equal(applyTextHighlights(base, [{ terms: ['  '], className: 'hl' }]), base)
  assert.equal(applyTextHighlights(base), base)
})

test('回车逐条添加：含逗号、空格的词整串保存且大小写不敏感去重', () => {
  let r = addHighlightTerm([], '  a,b  ')
  assert.equal(r.added, true)
  assert.deepEqual(r.terms, ['a,b'])
  r = addHighlightTerm(r.terms, 'a,b')
  assert.equal(r.added, false)
  r = addHighlightTerm(r.terms, 'A,B')
  assert.equal(r.added, false)
  r = addHighlightTerm(r.terms, 'hello world')
  assert.deepEqual(r.terms, ['a,b', 'hello world'])
  assert.deepEqual(removeHighlightTerm(r.terms, 'a,b'), ['hello world'])
  assert.deepEqual(addHighlightTerm([], '   '), { terms: [], added: false })
  assert.deepEqual(addHighlightTerm(null, 'x').terms, ['x'])
})

test('含逗号的高亮词按字面量整串匹配，不会被拆成两个词', () => {
  const html = applyTextHighlights('prefix a,b suffix', [
    { terms: ['a,b'], className: USER_HIGHLIGHT_CLASS },
  ])
  assert.ok(html.includes('<mark class="hl">a,b</mark>'), html)
  assert.ok(!html.includes('<mark class="hl">a</mark>'), html)
})

test('高亮组件不再按逗号分词，改为回车添加词条', async () => {
  const { readFileSync } = await import('node:fs')
  const s = readFileSync(
    new URL('../src/components/viewer/LogHighlightBar.vue', import.meta.url),
    'utf8',
  )
  assert.ok(!s.includes('split(/[,，]/)'))
  assert.ok(s.includes('@keydown.enter.prevent'))
  assert.ok(s.includes('hl-chip'))
})

test('v-html 命中的三类样式必须注册在 global.css', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8')
  assert.ok(css.includes('.ln mark.hl'))
  assert.ok(css.includes('.ln mark.find-hit'))
  assert.ok(css.includes('.ln.ln-find-current'))
  assert.ok(css.includes('.ln mark mark'))
})
