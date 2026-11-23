import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FAVORITE_LIMIT,
  RECENT_STORE_LIMIT,
  matchService,
  pushRecent,
  recentLabel,
  resolveFavoriteRows,
  resolveRecentRows,
  sanitizeFavorites,
  sanitizeRecents,
  toggleApp,
} from '../src/utils/navPrefs.js'

test('toggleApp：添加、移除、保持顺序', () => {
  assert.deepEqual(toggleApp([], 'ahp'), ['ahp'])
  assert.deepEqual(toggleApp(['ahp'], 'atomPpc'), ['ahp', 'atomPpc'])
  assert.deepEqual(toggleApp(['ahp', 'atomPpc'], 'ahp'), ['atomPpc'])
  assert.deepEqual(toggleApp(['ahp'], ''), ['ahp'])
  assert.deepEqual(toggleApp(null, 'ahp'), ['ahp'])
})

test('toggleApp：超过上限按最早添加淘汰（FIFO）', () => {
  let list = []
  for (let i = 0; i < FAVORITE_LIMIT + 3; i += 1) list = toggleApp(list, `app${i}`)
  assert.equal(list.length, FAVORITE_LIMIT)
  assert.equal(list[0], 'app3')
  assert.equal(list[list.length - 1], `app${FAVORITE_LIMIT + 2}`)
})

test('pushRecent：同环境同应用去重并置顶', () => {
  let list = pushRecent([], 'PROD', 'ahp')
  list = pushRecent(list, 'PROD', 'atomPpc')
  list = pushRecent(list, 'PROD', 'ahp')
  assert.equal(list.length, 2)
  assert.equal(list[0].app, 'ahp')
  assert.equal(list[1].app, 'atomPpc')
})

test('pushRecent：同应用不同环境是两条记录', () => {
  let list = pushRecent([], 'TEST', 'ahp')
  list = pushRecent(list, 'PROD', 'ahp')
  assert.equal(list.length, 2)
  assert.deepEqual(list.map((r) => r.env), ['PROD', 'TEST'])
})

test('pushRecent：超过存储上限丢弃最久未访问（LRU）', () => {
  let list = []
  for (let i = 0; i < RECENT_STORE_LIMIT + 2; i += 1) list = pushRecent(list, 'PROD', `app${i}`)
  assert.equal(list.length, RECENT_STORE_LIMIT)
  assert.equal(list[0].app, `app${RECENT_STORE_LIMIT + 1}`)
  assert.ok(!list.some((r) => r.app === 'app0'))
})

test('pushRecent：非法参数不写入', () => {
  assert.deepEqual(pushRecent([], '', 'ahp'), [])
  assert.deepEqual(pushRecent([], 'PROD', ''), [])
  assert.deepEqual(pushRecent(null, 'PROD', 'ahp').length, 1)
})

test('sanitizeFavorites：丢弃非字符串、去重、截断', () => {
  assert.deepEqual(sanitizeFavorites(null), [])
  assert.deepEqual(sanitizeFavorites(['ahp', 'ahp', 3, '', 'atomPpc']), ['ahp', 'atomPpc'])
  const many = Array.from({ length: FAVORITE_LIMIT + 5 }, (_, i) => `a${i}`)
  const out = sanitizeFavorites(many)
  assert.equal(out.length, FAVORITE_LIMIT)
  assert.equal(out[0], 'a5')
})

test('sanitizeRecents：字段校验、去重、按时间降序、截断', () => {
  assert.deepEqual(sanitizeRecents(null), [])
  const raw = [
    { env: 'PROD', app: 'ahp', at: 100 },
    { env: 'PROD', app: 'ahp', at: 200 },
    { env: '', app: 'x', at: 300 },
    { env: 'TEST', app: 'y', at: 'bad' },
    { env: 'PRE', app: 'z', at: 50 },
  ]
  const out = sanitizeRecents(raw)
  assert.deepEqual(out.map((r) => `${r.env}|${r.app}`), ['PROD|ahp', 'PRE|z'])
})

test('recentLabel：刚刚 / 分钟 / 小时 / 日期', () => {
  const now = new Date('2026-11-23T15:00:00').getTime()
  assert.equal(recentLabel(now - 30 * 1000, now), '刚刚')
  assert.equal(recentLabel(now - 5 * 60000, now), '5 分钟前')
  assert.equal(recentLabel(now - 3 * 3600000, now), '3 小时前')
  assert.equal(recentLabel(new Date('2026-11-20T10:00:00').getTime(), now), '11-20')
  assert.equal(recentLabel('bad', now), '')
})

test('matchService：module / app / host / hosts 均可匹配', () => {
  const svc = { module: '飞机健康服务', app: 'ahp', host: '10.106.133.22', hosts: ['10.106.133.23'] }
  assert.equal(matchService(svc, ''), true)
  assert.equal(matchService(svc, '飞机'), true)
  assert.equal(matchService(svc, 'AHP'), true)
  assert.equal(matchService(svc, '133.23'), true)
  assert.equal(matchService(svc, 'atomPpc'), false)
  assert.equal(matchService(null, 'x'), false)
})

test('resolveFavoriteRows：只保留当前环境存在的应用并保持顺序', () => {
  const byApp = new Map([
    ['ahp', { svc: { app: 'ahp' }, i: 0 }],
    ['atomPpc', { svc: { app: 'atomPpc' }, i: 1 }],
  ])
  const rows = resolveFavoriteRows(['atomPpc', 'gone', 'ahp'], byApp)
  assert.deepEqual(rows.map((r) => r.svc.app), ['atomPpc', 'ahp'])
  assert.deepEqual(resolveFavoriteRows(['x'], null), [])
})

test('resolveRecentRows：按环境过滤、排除收藏、截断展示数', () => {
  const byApp = new Map([
    ['ahp', { svc: { app: 'ahp' }, i: 0 }],
    ['atomPpc', { svc: { app: 'atomPpc' }, i: 1 }],
    ['other', { svc: { app: 'other' }, i: 2 }],
  ])
  const recents = [
    { env: 'PROD', app: 'ahp', at: 300 },
    { env: 'TEST', app: 'atomPpc', at: 250 },
    { env: 'PROD', app: 'atomPpc', at: 200 },
    { env: 'PROD', app: 'other', at: 100 },
  ]
  const rows = resolveRecentRows(recents, 'PROD', new Set(['ahp']), byApp, 1)
  assert.deepEqual(rows.map((r) => r.svc.app), ['atomPpc'])
  const all = resolveRecentRows(recents, 'PROD', new Set(), byApp, 5)
  assert.deepEqual(all.map((r) => r.svc.app), ['ahp', 'atomPpc', 'other'])
})
