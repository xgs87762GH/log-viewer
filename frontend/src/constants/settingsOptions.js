/**
 * 设置页分区与选项 —— 唯一配置源。
 * 纯常量：不依赖 Vue / DOM / 网络；组件与测试共用。
 */

/**
 * 左侧锚点顺序；id 作为 DOM id。
 * component 指向 settings/ 下的分区组件，props 声明该分区需要的入参：
 * 新增分区只需放一个 Settings*.vue 并在这里加一项，模板与测试都不用改。
 */
export const SETTINGS_SECTIONS = [
  {
    id: 'appearance',
    icon: 'Brush',
    component: 'SettingsAppearance',
    props: { draft: true, themes: true, update: true },
    label: '外观',
    title: '外观与主题',
    desc: '三套预设色板，或逐项微调界面颜色',
    hint: '选择预设会覆盖自定义颜色',
  },
  {
    id: 'typography',
    icon: 'EditPen',
    component: 'SettingsTypography',
    props: { draft: true },
    label: '字体',
    title: '字体与排版',
    desc: '界面字体、日志字体、基础字号与行高',
    hint: '日志字体仅影响日志阅读区',
  },
  {
    id: 'behavior',
    icon: 'Operation',
    component: 'SettingsBehavior',
    props: { draft: true },
    label: '行为',
    title: '阅读与加载行为',
    desc: '滚动、换行、折叠阈值与日志拉取上限',
    hint: '最大行数与尾部下载变化会重新拉取日志',
  },
  {
    id: 'config',
    icon: 'Folder',
    component: 'SettingsConfigTransfer',
    props: {},
    label: '配置',
    title: '配置导入与导出',
    desc: '备份服务清单与本地偏好，或迁移到另一台机器',
    hint: '服务配置需统计白名单权限',
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
