/**
 * 日志拉取限制 —— 设置页、保存夹紧与请求链路共用同一份区间。
 *
 * 行数不再设上限：实际行数由尾部大小决定，状态栏仍统计行数。
 * 尾部大小保留技术上限（1024 MB），超过 100 MB 时提示可能变慢。
 */
export const LOG_LIMITS = {
  tailMB: { min: 1, max: 1024, step: 1, default: 10 },
}

/** 超过该阈值时提示性能风险 */
export const LOG_HEAVY_HINT = { tailMB: 100 }
