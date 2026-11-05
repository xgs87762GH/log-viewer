/**
 * 上下文弹窗参数 —— 唯一配置源。
 * useSettings 取默认值、SettingsModal 取区间、弹窗与窗口算法取夹紧结果。
 * 纯配置 + 纯函数，不依赖 Vue / DOM。
 */

export const CONTEXT_CONFIG = {
  /** 打开时中心行前后各取多少行 */
  initialLines: 10,
  /** 滚到边界时每次追加多少行 */
  lazyStep: 5,
  /** 单侧累计上限；与「已加载数据边界」是两回事 */
  maxLinesPerSide: 50,
}

export const CONTEXT_LIMITS = {
  initialLines: { min: 0, max: 50 },
  lazyStep: { min: 1, max: 20 },
  maxLinesPerSide: { min: 10, max: 500 },
}

/** 夹紧任意输入（含旧 localStorage 缺字段）到合法区间 */
export function clampContextConfig(raw = {}) {
  const pick = (key) => {
    const { min, max } = CONTEXT_LIMITS[key]
    const n = Number(raw?.[key])
    if (!Number.isFinite(n)) return CONTEXT_CONFIG[key]
    return Math.min(max, Math.max(min, Math.round(n)))
  }
  return {
    initialLines: pick('initialLines'),
    lazyStep: pick('lazyStep'),
    maxLinesPerSide: pick('maxLinesPerSide'),
  }
}
