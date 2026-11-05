/**
 * apiClient —— 同源请求统一出口。
 *
 * 职责：超时、外部 AbortSignal 组合、错误体解析与可处理状态码。
 * 边界：无 Vue、无 DOM、无业务编排；条件请求头与缓存 meta 由调用方传入/读取，
 * 未来 ETag/304 接入只需扩展这里，不改各 composable。
 */
import {
  REQUEST_TIMEOUT_MS,
  JSON_TIMEOUT_MS,
  DIR_TIMEOUT_MS,
  ERROR_BODY_LIMIT,
} from '../constants/timing.js'

/** 非 2xx / 超时 / 网络失败均带可处理的 status 与 code */
export class ApiError extends Error {
  constructor(message, { status = 0, code = '', cause } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function isAbortError(e) {
  return e?.name === 'AbortError' || e?.code === 20 || e?.code === 'ABORT_ERR'
}

function abortError(reason) {
  if (reason instanceof Error) return reason
  const err = new Error('aborted')
  err.name = 'AbortError'
  return err
}

/** 手写组合，不依赖 AbortSignal.any，兼容旧运行时；dispose 必须成对调用 */
export function joinSignals(...signals) {
  const controller = new AbortController()
  const cleanups = []
  for (const s of signals) {
    if (!s) continue
    if (s.aborted) {
      controller.abort(s.reason)
      break
    }
    const onAbort = () => controller.abort(s.reason)
    s.addEventListener('abort', onAbort, { once: true })
    cleanups.push(() => s.removeEventListener('abort', onAbort))
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const fn of cleanups) fn()
    },
  }
}

function toInit(opts) {
  const { method = 'GET', headers, body, ...rest } = opts
  const nextHeaders = { ...(headers || {}) }
  let nextBody
  if (body !== undefined && body !== null) {
    if (typeof body === 'string' || body instanceof URLSearchParams) {
      nextBody = body
    } else {
      nextBody = JSON.stringify(body)
      if (!Object.keys(nextHeaders).some((k) => k.toLowerCase() === 'content-type')) {
        nextHeaders['Content-Type'] = 'application/json'
      }
    }
  }
  return {
    ...rest,
    method,
    headers: Object.keys(nextHeaders).length ? nextHeaders : undefined,
    body: nextBody,
  }
}

function startRequest(opts) {
  const { path, signal, timeoutMs = REQUEST_TIMEOUT_MS } = opts
  const timeoutController = new AbortController()
  let timedOut = false
  let timer = 0
  if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
    timer = setTimeout(() => {
      timedOut = true
      timeoutController.abort(
        new ApiError(`请求超时（${Math.round(timeoutMs)}ms）`, { code: 'TIMEOUT' }),
      )
    }, timeoutMs)
  }
  const link = joinSignals(signal, timeoutController.signal)
  const init = {
    method: opts.method,
    signal: link.signal,
    headers: opts.headers,
    body: opts.body,
  }
  if (opts.cache) init.cache = opts.cache
  return {
    path,
    init,
    external: signal,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer)
      link.dispose()
    },
  }
}

function wrapFetchError(e, ctx) {
  if (ctx.timedOut()) {
    return new ApiError(e?.message || '请求超时', { code: 'TIMEOUT', cause: e })
  }
  if (ctx.external?.aborted) return abortError(ctx.external.reason ?? e)
  if (isAbortError(e)) return e
  return new ApiError(`网络请求失败: ${e?.message || String(e)}`, { code: 'NETWORK', cause: e })
}

const RELEASE_KEY = Symbol('apiClient.release')

/** requestRaw 的调用方读完 body 后调用，释放超时定时器与信号监听 */
export function releaseResponse(res) {
  const fn = res?.[RELEASE_KEY]
  if (typeof fn === 'function') {
    fn()
    delete res[RELEASE_KEY]
  }
}

/** 返回原始 Response，供需要读取 X-Total-Size / X-Truncated 的正文路径使用 */
export async function requestRaw(path, opts = {}) {
  const ctx = startRequest({ ...toInit(opts), path })
  let handedOff = false
  try {
    const res = await fetch(ctx.path, ctx.init)
    handedOff = true
    Object.defineProperty(res, RELEASE_KEY, { value: ctx.dispose, configurable: true })
    return res
  } catch (e) {
    throw wrapFetchError(e, ctx)
  } finally {
    if (!handedOff) ctx.dispose()
  }
}

/** 兼容 JSON {"error"}、HTML 与纯文本；解析前截断，且不回显完整目标 URL */
export async function parseErrorBody(res) {
  const status = res?.status ?? 0
  let raw = ''
  try {
    raw = typeof res?.text === 'function' ? await res.text() : ''
  } catch {
    return `HTTP ${status}`
  }
  const trimmed = String(raw || '').slice(0, ERROR_BODY_LIMIT).trim()
  if (!trimmed) return `HTTP ${status}`

  const ct = typeof res?.headers?.get === 'function' ? res.headers.get('Content-Type') || '' : ''
  let message = ''
  if (ct.includes('json') || /^[\[{]/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed)
      const value = typeof parsed === 'string' ? parsed : parsed?.error ?? parsed?.message ?? parsed?.detail
      if (typeof value === 'string') message = value
      else if (value != null) message = JSON.stringify(value)
    } catch {
      /* 非法 JSON 按纯文本处理 */
    }
  }
  if (!message) {
    message = trimmed
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return (message || `HTTP ${status}`)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[地址已隐藏]')
}

export async function throwHttpError(res) {
  const status = res?.status ?? 0
  const reason = await parseErrorBody(res)
  const code =
    status === 304 ? 'NOT_MODIFIED' :
    status === 403 ? 'FORBIDDEN' :
    status === 404 ? 'NOT_FOUND' :
    status === 502 ? 'UPSTREAM' : 'HTTP'
  throw new ApiError(`HTTP ${status}: ${reason}`, { status, code })
}

async function readBody(path, opts, parse) {
  const ctx = startRequest({ ...toInit(opts), path })
  try {
    const res = await fetch(ctx.path, ctx.init)
    return await parse(res)
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw wrapFetchError(e, ctx)
  } finally {
    ctx.dispose()
  }
}

/** 非 2xx 抛 ApiError（304/403/502 以 status + code 暴露）；204/空体返回 null */
export async function requestJson(path, opts = {}) {
  return readBody(path, { ...opts, timeoutMs: opts.timeoutMs ?? JSON_TIMEOUT_MS }, async (res) => {
    if (res.status === 204 || res.status === 205) return null
    if (!res.ok) await throwHttpError(res)
    const text = await res.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new ApiError('响应不是合法 JSON', { status: res.status, code: 'BAD_JSON', cause: e })
    }
  })
}

/** 目录 HTML 等纯文本；非 2xx 抛 ApiError */
export async function requestText(path, opts = {}) {
  return readBody(path, { ...opts, timeoutMs: opts.timeoutMs ?? DIR_TIMEOUT_MS }, async (res) => {
    if (!res.ok) await throwHttpError(res)
    return await res.text()
  })
}
