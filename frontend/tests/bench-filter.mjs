/**
 * 过滤链路性能基准 —— Node 内置运行，无第三方依赖
 *
 *   node frontend/tests/bench-filter.mjs
 *
 * 只覆盖纯函数（分组 / 过滤 / 结构化克隆），不含网络、DOM、Worker 通信与虚拟布局。
 * 用于对比「每次条件变化都全量重分组」与「常驻数据 + 增量查询」两段耗时。
 */
import { performance } from 'node:perf_hooks'
import {
  groupLogEntries,
  filterLogEntries,
  buildEntrySearchIndex,
  filterEntriesByMatcher,
} from '../src/utils/logEntries.js'
import { matchBlobFilters, compileFilters } from '../src/utils/logFilterMatch.js'
import { detectLevel, isContinuation } from '../src/utils/logParser.js'

const LINE_COUNT = 10_000
const ROUNDS = 7
const INCLUDES = ['timeout', 'ORDER']
const EXCLUDES = ['health']

function makeLines(n) {
  const levels = ['INFO', 'WARN', 'ERROR', 'DEBUG']
  const out = []
  for (let i = 0; i < n; i += 1) {
    const lv = levels[i % levels.length]
    let payload
    if (i % 17 === 0) payload = 'java.net.SocketTimeoutException: Read timed out while calling ORDER BY id'
    else if (i % 23 === 0) payload = 'SELECT * FROM orders ORDER BY created_at LIMIT 20'
    else if (i % 31 === 0) payload = 'GET /actuator/health status=200'
    else payload = `request processed in ${i % 90}ms trace=abc-${i}`
    const ts = `2026-11-05 12:${String(i % 60).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}.123`
    out.push(`${ts} [${lv}] [http-nio-8080-exec-${i % 8}] ${payload}`)
    if (i % 11 === 0) out.push('    at com.example.Foo.bar(Foo.java:42)')
  }
  return out.slice(0, n)
}

function bench(label, fn) {
  const times = []
  let result
  for (let r = 0; r < ROUNDS; r += 1) {
    const t0 = performance.now()
    result = fn()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const mid = Math.floor(ROUNDS / 2)
  return {
    label,
    median: +times[mid].toFixed(2),
    min: +times[0].toFixed(2),
    max: +times[ROUNDS - 1].toFixed(2),
    result,
  }
}

const lines = makeLines(LINE_COUNT)
const ops = { detectLevel, isContinuation }

const group = bench('group', () => groupLogEntries(lines, ops))
const entries = group.result
const filter = bench('filter(legacy)', () =>
  filterLogEntries(entries, lines, (blob) => matchBlobFilters(blob, INCLUDES, EXCLUDES)),
)
// 旧实现：每次条件变化都把 group + filter 一起重跑
const full = bench('group+filter(legacy)', () => {
  const es = groupLogEntries(lines, ops)
  return filterLogEntries(es, lines, (blob) => matchBlobFilters(blob, INCLUDES, EXCLUDES))
})

// 新链路：setLines 阶段一次性预计算索引；query 阶段只跑编译过滤
const index = bench('setLines: search index', () => buildEntrySearchIndex(entries, lines))
const searchIndex = index.result
const matcher = compileFilters(INCLUDES, EXCLUDES)
const query = bench('query: compiled filter', () =>
  filterEntriesByMatcher(entries, searchIndex, matcher),
)
if (query.result.length !== filter.result.length) {
  throw new Error(`过滤结果不一致：legacy=${filter.result.length} optimized=${query.result.length}`)
}

// 旧实现每次 postMessage 都克隆整个 lines，回传时再克隆整个 viewRows。
// 这两段往往是「感觉慢」的真实来源，单独量化避免误判纯算法瓶颈。
const cloneLines = bench('clone(lines) → worker', () => structuredClone(lines))
const rowLike = lines.map((text, idx) => ({
  kind: 'line', key: `l-${idx}`, idx, no: idx + 1, level: 'INFO', abbr: 'I',
  text, clipped: false, entryId: idx, visualLines: 1,
}))
const cloneRows = bench('clone(viewRows) → main', () => structuredClone(rowLike))

console.log(`lines=${lines.length} entries=${entries.length} matched=${filter.result.length} rounds=${ROUNDS}`)
for (const r of [group, filter, full, index, query, cloneLines, cloneRows]) {
  console.log(`${r.label.padEnd(24)} median=${String(r.median).padStart(8)}ms  min=${String(r.min).padStart(8)}ms  max=${String(r.max).padStart(8)}ms`)
}
console.log(`query / legacy full = ${(query.median / full.median).toFixed(2)}x`)
