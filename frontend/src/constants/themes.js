/**
 * 主题色板 —— 唯一配置源
 * useSettings 只负责读写 / 应用到 DOM，不内嵌色板定义。
 */

/** 预设：暗黑=冷灰蓝；暖色=棕琥珀；明亮=浅灰蓝 */
export const THEMES = {
  dark: {
    name: '暗黑',
    colors: {
      bg: '#0d1117', s1: '#161b22', s2: '#21262d', bd: '#30363d', bd2: '#484f58',
      t1: '#e6edf3', t2: '#8b949e', t3: '#6e7681',
      ac: '#58a6ff', ac2: '#388bfd',
      info: '#3fb950', warn: '#d29922', err: '#f85149', dbg: '#79c0ff', trc: '#d2a8ff',
    },
  },
  light: {
    name: '明亮',
    colors: {
      bg: '#f6f8fa', s1: '#ffffff', s2: '#eef1f4', bd: '#d0d7de', bd2: '#afb8c1',
      t1: '#1f2328', t2: '#656d76', t3: '#8b949e',
      ac: '#0969da', ac2: '#0550ae',
      info: '#1a7f37', warn: '#9a6700', err: '#cf222e', dbg: '#0550ae', trc: '#8250df',
    },
  },
  warm: {
    name: '暖色',
    colors: {
      bg: '#1a1612', s1: '#221c17', s2: '#2c241d', bd: '#3f342a', bd2: '#564738',
      t1: '#f0e6dc', t2: '#a89888', t3: '#7d6f60',
      ac: '#d4a06a', ac2: '#c4894a',
      info: '#8fbc8f', warn: '#d4b06a', err: '#d4847a', dbg: '#9ab0c4', trc: '#c4a8d4',
    },
  },
}

/** 日志区随主题微调的色板（始终深色底，冷暖倾向不同） */
export const LOG_PALETTES = {
  dark: {
    bg: '#111418', fg: '#c8cdd5', muted: '#6b7280', num: '#555b66',
    sqlTag: '#6aadb3', sqlKw: '#7a9fc2', sqlStr: '#a89070', res: '#7a9e80',
  },
  warm: {
    bg: '#17130f', fg: '#d8cfc4', muted: '#7a6e62', num: '#5c5248',
    sqlTag: '#b89a6e', sqlKw: '#c4a882', sqlStr: '#b8956c', res: '#9aaf8a',
  },
  light: {
    bg: '#111418', fg: '#c8cdd5', muted: '#6b7280', num: '#555b66',
    sqlTag: '#6aadb3', sqlKw: '#7a9fc2', sqlStr: '#a89070', res: '#7a9e80',
  },
  custom: {
    bg: '#111418', fg: '#c8cdd5', muted: '#6b7280', num: '#555b66',
    sqlTag: '#6aadb3', sqlKw: '#7a9fc2', sqlStr: '#a89070', res: '#7a9e80',
  },
}
