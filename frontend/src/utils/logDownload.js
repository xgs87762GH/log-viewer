/**
 * 分片流式下载引擎 —— 不依赖 Vue / 业务编排。
 *
 * 后端按 64KB 分块转发，前端用 ReadableStream 逐片读取并累积字节，
 * 最后合成 Blob 保存。URL 构造、埋点、toast 归 useLogs / Dashboard。
 *
 * 扩展点：读取与落盘分离，将来接入 HTTP Range 分片 / 断点续传时，
 * 只需新增一个产生 chunks 的策略并复用 saveChunksAsFile，不改调用方。
 */

const BLOB_MIME = 'application/octet-stream'
const REVOKE_DELAY_MS = 1000

function readTotalSize(res) {
  const raw = res.headers.get('X-Total-Size') || res.headers.get('Content-Length')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** 逐片读取响应体；无流 API 时退化为整包。返回累计字节数。 */
async function readChunks(res, chunks, onReceived) {
  let received = 0
  const emit = (n) => {
    received += n
    onReceived?.(received)
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    chunks.push(bytes)
    emit(bytes.length)
    return received
  }
  const reader = res.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.length) continue
      chunks.push(value)
      emit(value.length)
    }
    return received
  } catch (e) {
    try { reader.cancel() } catch {}
    throw e
  }
}

/** 把字节分片合成 Blob 并触发浏览器保存；返回对象 URL 的释放函数。 */
export function saveChunksAsFile(chunks, filename) {
  const blob = new Blob(chunks, { type: BLOB_MIME })
  const objectUrl = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename || 'log.txt'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (e) {
    URL.revokeObjectURL(objectUrl)
    throw e
  }
  // 点击后延迟释放：部分浏览器需要时间开始读取 Blob
  return () => setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_DELAY_MS)
}

/**
 * @param {string} url 同源 /api/download 地址
 * @param {{ filename?: string, signal?: AbortSignal,
 *           onProgress?: (received: number, total: number) => void }} opts
 * @returns {Promise<{ filename: string, size: number }>} 失败抛 Error 交由调用方呈现
 */
export async function downloadLogFile(url, opts = {}) {
  const { filename = 'log.txt', signal, onProgress } = opts
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {}
    throw new Error(message)
  }

  const total = readTotalSize(res)
  const chunks = []
  const received = await readChunks(res, chunks, (at) => onProgress?.(at, total))

  if (total && received < total) {
    throw new Error(`下载不完整（${received} / ${total} 字节）`)
  }

  const release = saveChunksAsFile(chunks, filename)
  release()
  return { filename, size: received }
}
