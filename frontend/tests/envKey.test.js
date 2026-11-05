import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// 项目源码沿用 Vite 的无扩展名 import；Node 原生 ESM 需补 .js 才能直连 composables
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.(js|mjs|cjs|json|vue|css)$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.js`, context)
      } catch {
        /* 交由默认解析报错 */
      }
    }
    return nextResolve(specifier, context)
  },
})

const CONFIG = {
  baseUrl: 'https://global.example',
  environments: {
    DEV: { services: [{ host: '10.0.0.1', app: 'same-app', baseUrl: 'https://dev.example' }] },
    TEST: { services: [{ host: '10.0.0.1', app: 'same-app', baseUrl: 'https://test.example' }] },
  },
}

function createStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  }
}

globalThis.localStorage = createStorage()
globalThis.window = { addEventListener() {}, removeEventListener() {} }

const calls = []
globalThis.fetch = async (path, init) => {
  calls.push({ path, init })
  const url = String(path)
  if (url.startsWith('/config/logs.json')) {
    return new Response(JSON.stringify(CONFIG), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (url.startsWith('/api/proxy')) {
    const q = new URL(url, 'http://localhost')
    if (!q.searchParams.has('tail')) {
      return new Response('<a href="same-app_info.log">same-app_info.log</a>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }
    return new Response('line1\nline2', { status: 200, headers: { 'X-Total-Size': '11' } })
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const { useLogs } = await import('../src/composables/useLogs.js?case=envkey')
const logs = useLogs()

function proxyTarget(path) {
  return new URL(path, 'http://localhost').searchParams.get('url') || ''
}

function isDirCall(c) {
  return c.path.startsWith('/api/proxy') &&
    !new URL(c.path, 'http://localhost').searchParams.has('tail')
}

function tailCalls() {
  return calls.filter((c) => c.path.startsWith('/api/proxy') &&
    new URL(c.path, 'http://localhost').searchParams.has('tail'))
}

test('envKey 必填，跨环境同名服务使用各自的 baseUrl', async () => {
  await logs.loadConfig()
  assert.throws(() => logs.buildLogUrl('10.0.0.1', 'same-app', 'INFO'), /envKey/)
  assert.throws(() => logs.buildDirUrl('10.0.0.1', 'same-app'), /envKey/)
  const dev = logs.buildLogUrl('10.0.0.1', 'same-app', 'INFO', undefined, 'DEV')
  const test = logs.buildLogUrl('10.0.0.1', 'same-app', 'INFO', undefined, 'TEST')
  assert.ok(dev.startsWith('https://dev.example/10.0.0.1/same-app/'), dev)
  assert.ok(test.startsWith('https://test.example/10.0.0.1/same-app/'), test)
  assert.equal(
    logs.buildDirUrl('10.0.0.1', 'same-app', 'DEV'),
    'https://dev.example/10.0.0.1/same-app/',
  )
})

test('discoverLevels 的目录 URL 带当前环境前缀', async () => {
  const opts = { force: true, soft: false }
  const before = calls.length
  const dev = await logs.discoverLevels('10.0.0.1', 'same-app', { ...opts, envKey: 'DEV' })
  assert.ok(dev?.levels.includes('INFO'))
  const devTarget = proxyTarget(calls.slice(before).find(isDirCall).path)
  assert.ok(devTarget.startsWith('https://dev.example/10.0.0.1/same-app/'), devTarget)

  const beforeTest = calls.length
  const tst = await logs.discoverLevels('10.0.0.1', 'same-app', { ...opts, envKey: 'TEST' })
  assert.ok(tst?.levels.includes('INFO'))
  const testTarget = proxyTarget(calls.slice(beforeTest).find(isDirCall).path)
  assert.ok(testTarget.startsWith('https://test.example/10.0.0.1/same-app/'), testTarget)
})

test('fetchLog 的 cacheKey 含 envKey：跨环境不串缓存，同环境命中', async () => {
  const before = tailCalls().length
  const devA = await logs.fetchLog('10.0.0.1', 'same-app', 'INFO', undefined, { envKey: 'DEV' })
  const devB = await logs.fetchLog('10.0.0.1', 'same-app', 'INFO', undefined, { envKey: 'DEV' })
  const testA = await logs.fetchLog('10.0.0.1', 'same-app', 'INFO', undefined, { envKey: 'TEST' })
  assert.equal(devA.fromCache, false)
  assert.equal(devB.fromCache, true)
  assert.equal(testA.fromCache, false)
  assert.equal(tailCalls().length - before, 2)
  const targets = tailCalls().slice(before).map((c) => proxyTarget(c.path))
  assert.ok(targets.some((t) => t.startsWith('https://dev.example/')))
  assert.ok(targets.some((t) => t.startsWith('https://test.example/')))
  assert.deepEqual(devA.lines, ['line1', 'line2'])
  assert.equal(devA.filename, 'same-app_info.log')
})

test('同键并发共享 in-flight，一个订阅者取消不影响另一个', async () => {
  const before = tailCalls().length
  const controller = new AbortController()
  const p1 = logs.fetchLog('10.0.0.1', 'same-app', 'WARN', undefined, {
    envKey: 'DEV', force: true, signal: controller.signal,
  })
  const p2 = logs.fetchLog('10.0.0.1', 'same-app', 'WARN', undefined, {
    envKey: 'DEV', force: true,
  })
  controller.abort()
  await assert.rejects(p1, (e) => e?.name === 'AbortError')
  const data = await p2
  assert.deepEqual(data.lines, ['line1', 'line2'])
  assert.equal(tailCalls().length - before, 1)
})
