import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ApiError,
  isAbortError,
  joinSignals,
  requestJson,
  requestText,
  requestRaw,
  releaseResponse,
  parseErrorBody,
} from '../src/utils/apiClient.js'

function withFetch(handler) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = original }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

function pendingFetch(_path, init) {
  if (init.signal?.aborted) return Promise.reject(init.signal.reason)
  return new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
  })
}

test('requestJson 返回结构化 JSON，204 与空体返回 null', async (t) => {
  t.after(withFetch(async () => json({ ok: true })))
  assert.deepEqual(await requestJson('/api/x'), { ok: true })
  globalThis.fetch = async () => new Response(null, { status: 204 })
  assert.equal(await requestJson('/api/x'), null)
  globalThis.fetch = async () => new Response('', { status: 200 })
  assert.equal(await requestJson('/api/x'), null)
})

test('非 2xx 统一为带 status/code 的 ApiError，兼容 JSON / HTML / 纯文本', async (t) => {
  t.after(withFetch(async () => json({ error: '无权访问' }, 403)))
  await assert.rejects(
    requestJson('/api/x'),
    (e) => e instanceof ApiError && e.status === 403 && e.code === 'FORBIDDEN' &&
      e.message.includes('无权访问') && e.message.includes('403'),
  )

  globalThis.fetch = async () => new Response(
    '<html><head><title>Not Found</title></head><body><h1>Config not found</h1></body></html>',
    { status: 404, headers: { 'Content-Type': 'text/html' } },
  )
  await assert.rejects(
    requestText('/config/nope'),
    (e) => e.status === 404 && e.message.includes('Config not found') && !e.message.includes('<html>'),
  )

  globalThis.fetch = async () => new Response('  服务暂不可用  ', { status: 503 })
  await assert.rejects(
    requestJson('/api/x'),
    (e) => e.status === 503 && e.message.includes('服务暂不可用'),
  )
})

test('304 / 403 / 502 以 status 与 code 暴露，错误体不回显完整目标 URL', async (t) => {
  t.after(withFetch(async () => new Response(null, { status: 304 })))
  await assert.rejects(
    requestJson('/api/x'),
    (e) => e.status === 304 && e.code === 'NOT_MODIFIED',
  )
  globalThis.fetch = async () => json({ error: '上游 https://internal.example.com/secret 不可达' }, 502)
  await assert.rejects(
    requestJson('/api/x'),
    (e) => e.status === 502 && e.code === 'UPSTREAM' && !e.message.includes('internal.example.com'),
  )
})

test('条件请求头透传，超时以 TIMEOUT 暴露且不带 status', async (t) => {
  let seenHeaders
  t.after(withFetch(async (_path, init) => {
    seenHeaders = init.headers
    return pendingFetch(_path, init)
  }))
  await assert.rejects(
    requestJson('/api/x', { headers: { 'If-None-Match': 'W/"v1"' }, timeoutMs: 15 }),
    (e) => e instanceof ApiError && e.code === 'TIMEOUT',
  )
  assert.equal(seenHeaders['If-None-Match'], 'W/"v1"')
})

test('外部 AbortSignal 取消抛 AbortError，不误判为超时或业务错误', async (t) => {
  t.after(withFetch(pendingFetch))
  const controller = new AbortController()
  const p = requestJson('/api/x', { signal: controller.signal, timeoutMs: 0 })
  controller.abort()
  await assert.rejects(p, (e) => isAbortError(e) || e?.name === 'AbortError')
})

test('POST 自动序列化 JSON 体并补 Content-Type', async (t) => {
  let seen
  t.after(withFetch(async (_path, init) => {
    seen = init
    return json({ ok: 1 })
  }))
  await requestJson('/api/access/event', { method: 'POST', body: { action: 'view_log' } })
  assert.equal(seen.method, 'POST')
  assert.equal(seen.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(seen.body), { action: 'view_log' })
})

test('requestRaw 保留自定义响应头，releaseResponse 幂等释放', async (t) => {
  t.after(withFetch(async () => new Response('a\nb', {
    status: 200,
    headers: { 'X-Total-Size': '3', 'X-Truncated': 'true' },
  })))
  const res = await requestRaw('/api/proxy?url=x', { timeoutMs: 50 })
  assert.equal(res.headers.get('X-Total-Size'), '3')
  assert.equal(res.headers.get('X-Truncated'), 'true')
  assert.equal(await res.text(), 'a\nb')
  releaseResponse(res)
  releaseResponse(res)
})

test('joinSignals 组合多个取消源', () => {
  const a = new AbortController()
  const b = new AbortController()
  const linked = joinSignals(a.signal, b.signal)
  assert.equal(linked.signal.aborted, false)
  a.abort()
  assert.equal(linked.signal.aborted, true)
  linked.dispose()

  const c = new AbortController()
  const single = joinSignals(c.signal)
  c.abort()
  assert.equal(single.signal.aborted, true)
  single.dispose()

  assert.equal(isAbortError(new Error('boom')), false)
  const err = new Error('aborted')
  err.name = 'AbortError'
  assert.equal(isAbortError(err), true)
})

test('parseErrorBody 对非法 JSON 与超大响应安全回退', async () => {
  assert.ok((await parseErrorBody(new Response('{not-json', { status: 500 }))).includes('{not-json'))
  const huge = await parseErrorBody(new Response('x'.repeat(10000), { status: 500 }))
  assert.ok(huge.length <= 4096)
  assert.equal(await parseErrorBody(new Response('', { status: 502 })), 'HTTP 502')
})
