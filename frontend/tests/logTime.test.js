import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLineTime, parseLineDateTime, lastLineTime } from '../src/utils/logTime.js'

test('从日志行提取时分秒，兼容毫秒与逗号分隔', () => {
  assert.equal(parseLineTime('2026-11-20 21:06:10.274 [INFO] SELECT 1'), '21:06:10')
  assert.equal(parseLineTime('2026-11-20 09:05:07,123 [WARN] x'), '09:05:07')
  assert.equal(parseLineTime('21:06:10 [INFO] no date'), '21:06:10')
  assert.equal(parseLineTime('9:05:07 short hour'), '09:05:07')
})

test('没有时间时返回空串', () => {
  assert.equal(parseLineTime('no time here'), '')
  assert.equal(parseLineTime('2026-11-20 only date'), '')
  assert.equal(parseLineTime(''), '')
  assert.equal(parseLineTime(null), '')
})

test('parseLineDateTime 返回完整日期时间', () => {
  assert.equal(parseLineDateTime('2026-11-20 21:06:10.274 [INFO]'), '2026-11-20 21:06:10')
  assert.equal(parseLineDateTime('2026-11-20T21:06:10'), '2026-11-20 21:06:10')
  assert.equal(parseLineDateTime('nothing'), '')
})

test('lastLineTime 跳过末尾空行与无时间行', () => {
  const lines = [
    '2026-11-20 21:06:08.000 [INFO] a',
    '2026-11-20 21:06:09.500 [INFO] b',
    '\tat com.Foo.bar(Foo.java:1)',
    '',
  ]
  assert.equal(lastLineTime(lines), '21:06:09')
  assert.equal(lastLineTime([]), '')
  assert.equal(lastLineTime(['\tat x', '']), '')
})

test('lastLineTime 只回看有限行，避免全量遍历', () => {
  const lines = ['2026-11-20 01:02:03.000 [INFO] old']
  for (let i = 0; i < 20; i += 1) lines.push('\tat frame ' + i)
  assert.equal(lastLineTime(lines, 5), '')
  assert.equal(lastLineTime(lines, 30), '01:02:03')
})
