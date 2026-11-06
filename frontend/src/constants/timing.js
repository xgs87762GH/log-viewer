/**
 * 请求编排时序常量 —— 前端超时略大于后端 8/30/90s，避免误杀。
 * 心跳、轮询、防抖等常量留待后续主题扩展，本轮只登记请求链路。
 */

export const REQUEST_TIMEOUT_MS = 10_000
export const CONFIG_TIMEOUT_MS = 10_000
export const JSON_TIMEOUT_MS = 8_000
export const DIR_TIMEOUT_MS = 12_000
export const LOG_TIMEOUT_MS = 95_000

export const LOG_CACHE_TTL_MS = 60_000
export const LOG_CACHE_MAX_ENTRIES = 12

/** GitHub tag 检查：刷新时触发，1 小时内复用缓存（未认证限流 60 次/小时） */
export const VERSION_CHECK_TTL_MS = 60 * 60 * 1000
export const VERSION_CHECK_TIMEOUT_MS = 6_000

/** 目录探测：有限并发 + 批间抖动，替代严格串行 400ms */
export const PROBE_CONCURRENCY = 4
export const PROBE_GAP_MS = 160
export const PROBE_JITTER_MS = 120

/** 错误体最多解析的字节长度（按 UTF-16 长度裁切，避免大响应拖慢失败路径） */
export const ERROR_BODY_LIMIT = 4096
