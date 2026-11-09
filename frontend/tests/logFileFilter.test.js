import test from 'node:test'
import assert from 'node:assert/strict'
import { filterLogFilesByDate, defaultLogFile } from '../src/utils/logFileFilter.js'

const FILES = [
  { name: 'app_info.log', date: null, idx: null, active: true },
  { name: 'app_info_2026-11-06_0.log', date: '2026-11-06', idx: 0, active: false },
  { name: 'app_info_2026-11-06_1.log', date: '2026-11-06', idx: 1, active: false },
  { name: 'app_info_2026-11-05_2.log', date: '2026-11-05', idx: 2, active: false },
]

test('未选日期时返回完整列表，仍含活跃文件', () => {
  assert.deepEqual(filterLogFilesByDate(FILES, ''), FILES)
  assert.equal(defaultLogFile(FILES, ''), 'app_info.log')
})

test('选定日期后只保留该日期归档，活跃文件与其他日期都被排除', () => {
  assert.deepEqual(
    filterLogFilesByDate(FILES, '2026-11-06').map((f) => f.name),
    ['app_info_2026-11-06_1.log', 'app_info_2026-11-06_0.log'],
  )
})

test('默认打开该日期滚动序号最大（时间最新）的归档，且不受输入顺序影响', () => {
  assert.equal(defaultLogFile(FILES, '2026-11-06'), 'app_info_2026-11-06_1.log')
  assert.equal(defaultLogFile([...FILES].reverse(), '2026-11-06'), 'app_info_2026-11-06_1.log')
})

test('无活跃文件时默认打开列表首项（最新归档）', () => {
  assert.equal(defaultLogFile(FILES.slice(1), ''), 'app_info_2026-11-06_0.log')
})

test('无匹配日期时返回空列表与空默认文件', () => {
  assert.deepEqual(filterLogFilesByDate(FILES, '2026-01-01'), [])
  assert.equal(defaultLogFile(FILES, '2026-01-01'), '')
  assert.equal(defaultLogFile(null, '2026-11-06'), '')
})
