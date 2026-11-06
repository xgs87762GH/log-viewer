import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractLogFilesFromDirHtml,
  extractLogNamesFromDirHtml,
} from '../src/utils/dirListing.js'

const DIR_HTML = `<html>
<head><title>Index of /svc/</title></head>
<body><pre><a href="../">../</a>
<a href="logs/">logs/</a>                      09-May-2024 11:01       -
<a href="app_info.log">app_info.log</a>          06-Nov-2026 16:14     66K
<a href="app_info_2026-11-05_0.log">app_info_2026..&gt;</a> 05-Nov-2026 23:59     97K
<a href="app_warn.log">app_warn.log</a>          06-Nov-2026 16:14    1.2M
<a href="app_debug.log">app_debug.log</a>         06-Nov-2026 16:14       -
<a href="app_error.log">app_error.log</a>         06-Nov-2026 16:14     4096
<a href="app_trace.log">app_trace.log</a>         06-Nov-2026 16:14
<a href="app%20audit.log">app audit.log</a>        06-Nov-2026 16:14     12K
<a href="app_info.log">duplicate</a>              06-Nov-2026 16:14     99K
<a href="readme.txt">readme.txt</a>              06-Nov-2026 16:14      1K
</pre></body></html>`

test('提取 .log 文件名与目录页大小，过滤目录项与非日志文件', () => {
  assert.deepEqual(extractLogFilesFromDirHtml(DIR_HTML), [
    { name: 'app_info.log', size: '66K' },
    { name: 'app_info_2026-11-05_0.log', size: '97K' },
    { name: 'app_warn.log', size: '1.2M' },
    { name: 'app_debug.log', size: '' },
    { name: 'app_error.log', size: '4096B' },
    { name: 'app_trace.log', size: '' },
    { name: 'app audit.log', size: '12K' },
  ])
})

test('重复 href 去重且保留首次出现的大小', () => {
  const files = extractLogFilesFromDirHtml(DIR_HTML)
  assert.equal(files.filter((f) => f.name === 'app_info.log').length, 1)
  assert.equal(files[0].size, '66K')
})

test('日期末尾没有大小时不会被误当成文件大小', () => {
  const trace = extractLogFilesFromDirHtml(DIR_HTML).find((f) => f.name === 'app_trace.log')
  assert.equal(trace.size, '')
})

test('空输入与无链接 HTML 返回空数组', () => {
  assert.deepEqual(extractLogFilesFromDirHtml(''), [])
  assert.deepEqual(extractLogFilesFromDirHtml(null), [])
  assert.deepEqual(extractLogFilesFromDirHtml('<pre>nothing here</pre>'), [])
})

test('兼容接口仍返回去重后的文件名数组', () => {
  assert.deepEqual(extractLogNamesFromDirHtml(DIR_HTML), [
    'app_info.log',
    'app_info_2026-11-05_0.log',
    'app_warn.log',
    'app_debug.log',
    'app_error.log',
    'app_trace.log',
    'app audit.log',
  ])
})

test('连续调用不会因全局正则 lastIndex 丢失结果', () => {
  assert.equal(extractLogFilesFromDirHtml(DIR_HTML).length, 7)
  assert.equal(extractLogFilesFromDirHtml(DIR_HTML).length, 7)
})
