/**
 * 设置页分区与选项 —— 唯一配置源。
 * 纯常量：不依赖 Vue / DOM / 网络；组件与测试共用。
 */

/** 左侧锚点顺序；id 同时作为 DOM id 与分区组件后缀 */
export const SETTINGS_SECTIONS = [
  {
    id: 'appearance',
    icon: 'Brush',
    label: '外观',
    title: '外观与主题',
    desc: '三套预设色板，或逐项微调界面颜色',
    hint: '选择预设会覆盖自定义颜色',
  },
  {
    id: 'typography',
    icon: 'EditPen',
    label: '字体',
    title: '字体与排版',
    desc: '界面字体、日志字体、基础字号与行高',
    hint: '日志字体仅影响日志阅读区',
  },
  {
    id: 'behavior',
    icon: 'Operation',
    label: '行为',
    title: '阅读与加载行为',
    desc: '滚动、换行、折叠阈值与日志拉取上限',
    hint: '最大行数与尾部下载变化会重新拉取日志',
  },
]

/** 覆盖 THEMES.dark.colors（即 DEFAULTS.colors）的全部键 */
export const colorLabels = {
  bg: '页面背景', s1: '侧边栏', s2: '卡片 / 工具栏', bd: '边框', bd2: '强调边框',
  t1: '主文字', t2: '次要文字', t3: '辅助文字', ac: '强调色', ac2: '强调渐变',
  info: 'INFO', warn: 'WARN', err: 'ERROR', dbg: 'DEBUG', trc: 'TRACE',
}

export const fontOptions = {
  ui: [
    "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
    "'Microsoft YaHei',sans-serif",
    'system-ui,sans-serif',
  ],
  log: [
    "Consolas,'Courier New','Microsoft YaHei',monospace",
    'Consolas,monospace',
    'monospace',
  ],
}

export const sizeOptions = {
  base: ['12px', '13px', '14px', '15px', '16px'],
  log: ['11px', '12px', '13px', '14px', '15px'],
  lh: ['1.4', '1.5', '1.65', '1.8', '2.0'],
}
