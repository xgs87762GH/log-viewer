# 设计规范

> 讲什么：改代码时应当遵守的分层、状态与界面约束。系统全貌见 [SYSTEM](SYSTEM.md)，日志链路见 [DATA-FLOW](DATA-FLOW.md)。以下规则优先于临时发挥。

## 目标

高内聚、低耦合、层次清晰、代码可读。除非代理或配置 API 必须改动，不动后端。

## 分层（不得越界）

| 层 | 负责 | 不得做 |
| --- | --- | --- |
| `config/logs.json` | 环境与服务目录 | 界面逻辑 |
| `server.py` | 代理、下载、配置托管、访问统计 API | Vue / 导航 / 主题 |
| `utils/apiClient.js` | 超时、信号组合、错误体解析 | 业务编排 |
| `composables/*` | 共享状态与业务编排 | 重度 DOM / 布局计算 |
| `components/*` | 渲染与本地交互 | 直连 LogIndex |
| `constants/*` | 可扩展规则、色板、级别、时序常量 | Vue 响应式 / HTTP |
| `utils/*` | 纯函数引擎、解析、持久化 | Vue / 业务副作用 |
| `workers/*` | 常驻大日志数据，按命令产出视图行 | DOM / Vue |
| `styles/global.css` | 静态 token、UI 原子类、v-html 样式 | 组件私有状态 |

关键模块的单一职责：

| 文件 | 唯一职责 |
| --- | --- |
| `constants/logFileRules.js` | 日志**文件名**匹配规则 |
| `constants/logHighlightRules.js` | 日志着色规则 |
| `constants/logContextConfig.js` | 上下文默认值与区间夹紧 |
| `constants/logSearchTools.js` | 搜索工具区常量与高亮 class 白名单 |
| `constants/themes.js` | 主题与日志区色板 |
| `constants/settingsOptions.js` | 设置分区顺序、组件名与入参声明 |
| `constants/storageKeys.js` | 所有 localStorage / sessionStorage 键的唯一来源 |
| `utils/logParser.js` | 执行着色规则，追加高亮时只替换纯文本片段 |
| `utils/logFileIndex.js` | 文件名索引的持久化、按日刷新与合并 |
| `utils/logEntries.js` | 条目归并、过滤与搜索索引 |
| `utils/logViewRows.js` | 折叠展平与视觉行数 |
| `utils/logVirtualLayout.js` | 高度表与二分查找 |
| `utils/logProcessClient.js` | Worker 命令协议与同步回退 |
| `utils/logFind.js` / `highlightTerms.js` / `toolDrawerState.js` / `logScrollState.js` | 查找、高亮词条、抽屉状态、置顶/置底判定的纯函数 |
| `utils/filterHistory.js` / `logDownload.js` / `logContextWindow.js` | 过滤历史、流式下载、上下文窗口推进 |
| `utils/downloadName.js` | 下载命名清洗（与后端 `_safe_download_name` 同步字符集与上限） |
| `utils/configBundle.js` | 配置段的唯一 descriptor（`SECTION_DEFS`）与归档组装 / 校验 / 摘要 |
| `utils/versionCheck.js` | 语义化版本解析 / 比较、最新 tag 选取与缓存判定 |
| `constants/versionCheck.js` | GitHub 只读端点与标签页链接 |
| `composables/useConfigTransfer.js` | 配置导入导出编排：按 `SECTION_DEFS` 遍历读写 |
| `composables/useVersionCheck.js` | 版本检查编排：1 小时缓存、请求去重、失败静默降级 |

## 状态唯一来源

所有 composable 都是**模块级单例**，组件之间不靠父子 ref 传递共享状态：

`useLogs`、`useNavigation`、`useSettings`、`useLogViewFilters`、`useLogSearchTools`、`useConfigTransfer`、`useVersionCheck`、`usePresence`、`useAccessLog`、`useToast`。

- `useNavigation`：视图 / 环境 / 服务 / 级别 / 文件；地址栏双向同步，刷新可还原。
- `useLogs`：配置、URL 构造、拉正文、目录探测。**构造 URL 与缓存键必须显式传 `envKey`**；索引按模块持久化，打开时只判断「今日是否已刷新」，失败不抹掉旧索引；日志正文无轮询，只在打开 / 切换 / 刷新时拉取。
- `useLogViewFilters` 与 `useLogSearchTools` 严格隔离：过滤词进 `includeTerms` / `excludeTerms` 并触发 Worker 过滤；**高亮词与查找词绝不混入过滤条件**，只负责染色与定位。
- `useSettings`：配置持久化 + 写入 CSS 变量；`needsReload` 只比较 `maxLines` / `tailMB`。
- 下载 URL 只由 `useLogs.buildDownloadUrl` 构造，组件不得直连 LogIndex；保存名统一由 `utils/downloadName.js` 生成（配置的中文环境 `label` / 项目 / 级别），并同步给后端附件头。
- 上下文弹窗数据源是原始 `lines`，锚点是 `row.idx`，**不得取过滤后的 `viewRows`**。
- Worker 协议：`setLines` 仅在 `lines` 引用变化时发送；`query` 只带条件与展示参数；两端保持 `{ viewRows, filteredRowCount }` 同构，同步回退路径同样如此。
- 搜索工具抽屉是右侧浮层、四区各占一行，只持久化「是否固定」；未固定时切走视图或点击抽屉外部自动收起，固定态豁免；抽屉开关与状态栏置顶/置底按钮不算「外部」。
- 置顶/置底按钮常驻状态栏最右（`margin-left: auto`），只做一次性平滑滚动，不读写「自动滚动到末尾」设置；禁用态由 `utils/logScrollState.js` 的 `isAtTop` / `isAtBottom` 判定（2px 容差）。
- `useConfigTransfer` 只做编排：段的形状、作用域、存储键与预览摘要都声明在 `utils/configBundle.js` 的 `SECTION_DEFS`（**新增配置段只改这一处**），落盘在 `utils/logDownload.js`；服务端段走 `/api/config/*`（白名单），本地段走 localStorage，**凭据永不入归档**。
- 配置分区独立于设置草稿：导入必须先预览并逐项勾选，确认后才写入；服务端写回前必须备份。
- 本地存储键一律从 `constants/storageKeys.js` 导入（原模块可 re-export 保持调用方不变），不得在组件 / composable 里写裸字符串。

## 功能目录

```text
components/
├── nav/         # NavPrimary / NavSecondary / NavViewSwitch / NavEnvModuleTree
├── viewer/      # LogViewer + 右侧工具抽屉、过滤、高亮、查找、历史文件、折叠、上下文、置顶/置底
├── dashboard/   # Dashboard
├── stats/       # AccessStats
└── settings/    # SettingsPage + Appearance / Typography / Behavior / ConfigTransfer
```

新增导航 UI 放 `nav/`，仅日志页使用的控件放 `viewer/`，避免污染其它视图。

## 导航形状

```text
App 外壳
  ├─ NavPrimary     # 栏 1：仪表盘 | 日志聚合 | 统计 | 设置（可折叠）
  ├─ NavSecondary   # 栏 2：仅 viewer 挂载 — 环境 › 模块（可折叠）
  └─ main           # 栏 3：四个视图（keep-alive）
```

- L1 / L2 是两个独立侧栏，不要合并进同一个 Sidebar。
- 折叠状态键见 `constants/storageKeys.js` 的 `NAV_L1_KEY` / `NAV_L2_KEY`。
- 跨环境选模块用 `selectEnvService(env, idx)` 或 `openLog(idx, level, env)`，不要分两拍先 `selectEnv` 再 `selectService`（索引会被重置）。

## 界面规则

- 组件只消费语义 token（`--r*` / `--sp*` / `--sh*` / `--grad-*` / `--surf-*` / `--dur` / `--t*`），**不得写死颜色、圆角、阴影与过渡时长**；新表面效果先加 token。
- 静态 token、`Element Plus` 桥接与可复用原子类只在 `global.css`：`.ui-eyebrow` / `.ui-grad-text` / `.ui-surface` / `.ui-kpi*` / `.ui-chip*` / `.ui-dot*` / `.ui-icon-btn` / `.ui-empty*` / `.ui-toolbar-group` / `.ui-divider-v`。
- 图标按钮必须同时有 `el-tooltip` 与 `aria-label`；所有交互元素保留 `focus-visible`。
- 上下文弹窗高度自适应：弹窗 `max-height: calc(100vh - 3vh - 20px)`，标题与操作条固定，日志区 `flex: 1` 占满剩余高度；遮罩层锁定 `overflow: hidden`，禁止整窗随页面滚动。
- 提示只用 `useToast`（按需引入 `ElMessage`），不要全量注册 Element Plus。
- **v-html 产出的样式必须写在 `global.css`**：日志行、级别色、三层高亮（`hit` / `hl` / `find-hit`）与当前命中行都依赖它。追加高亮只接受 class 白名单，防止注入。
- 行操作项 hover 才出现，绝不撑开行高；工具条不做级别二次过滤（文件已按级别区分）。
- 加载以「最新请求胜出」（序号令牌）为准；滚到末尾只在加载完成且 DOM 绘制后执行。刷新或切换服务 / 级别 / 文件后的首次定位强制置底；「自动滚动到末尾」只控制后续增量是否跟随，`onActivated` 切回视图仍恢复原阅读位置。
- 全局快捷键在 `keep-alive` 下仍会触发，处理前必须判断当前处于 `viewer` 视图。
- `keep-alive` 隐藏时容器宽高为 0：任何测量前必须判可见，尺寸变化用 `ResizeObserver` 兜住侧栏折叠 / 抽屉开合 / 窗口缩放；`onActivated` 必须重测并把逻辑滚动位置夹紧后写回 DOM，否则虚拟列表窗口错位出现空白。
- 行高只由 `visualLines × baseRowH` 决定；`wrapCols` 的单字符宽度用与 `.ln .tx` 同字体的 DOM 探针实测，不用 `fontSize × 0.62` 经验值（会系统性多算一整行）。
- 高亮 HTML 缓存键要包含过滤词、高亮词与查找词；`viewRows` 用 `shallowRef` 避免深度代理。
- 设置分区按 `SETTINGS_SECTIONS` 的 `component` 字段动态挂载（`<component :is>` + 按 `props` 声明装配入参）；新增分区只需加常量项与一个 `Settings*.vue`，不改模板、图标映射与测试。

## 变更检查清单

1. 只改配置？→ 只动 `config/logs.json`。
2. 导航 / 界面？→ 共享状态先落 composable，纯展示才写组件。
3. 拉取 / 尾部 / 行数上限？→ 改 `useLogs` + `useSettings`，不要在 Vue 里写死。
4. 不引入全局状态库（Pinia / Vuex），除非 composable 明显不够用。
5. 注释简短，解释「为什么」与边界，不复述代码。
6. 架构或导航变化 → 同步 `docs/SYSTEM.md`；功能变化 → `docs/FEATURES.md`；链路变化 → `docs/DATA-FLOW.md`。
7. 新算法放 `utils/`，新可扩展规则放 `constants/`。
8. 验证：构建、`node --test "frontend/tests/*.test.js"`、`python -m py_compile server.py`、lint、文档相对链接校验、后端 HTTP 冒烟与浏览器端到端冒烟（含控制台错误检查）；性能改动另跑 `node frontend/tests/bench-filter.mjs`。
9. 新增本地存储键 → 只改 `constants/storageKeys.js`；新增配置归档段 → 只改 `configBundle.js` 的 `SECTION_DEFS`；新增设置分区 → 只改 `settingsOptions.js` 并添加组件文件。

## 反模式

- 组件里直接请求 LogIndex 地址（绕过代理）。
- 默认把看过的日志文件写到磁盘；把日志正文塞进 localStorage。
- 把 L1 视图切换与 L2 模块树揉进一个巨型模板。
- 静默硬上限且忽略用户设置（要么写进设置，要么写明）。
- 主题色板或目录 HTML 解析放进 composable。
- 用过滤后的 `viewRows` 当上下文弹窗的数据源。
- 每次过滤都把整个 `lines` 重新发给 Worker。
- 高亮词或查找词混入过滤条件，触发本不该发生的 Worker 过滤。
- 正文缓存键漏掉 `envKey` 或 `maxLines` / `tailMB`，导致跨环境或改设置后复用错误内容。
- 在两处硬编码同一个存储键，或按分区 id 写 `v-if` 分支链。
- 把配置段清单散落在归档、编排、摘要与界面四处。

## 相关文档

[系统架构](SYSTEM.md) · [功能清单](FEATURES.md) · [数据链路](DATA-FLOW.md) · [访问统计](ACCESS.md) · [变更记录](CHANGELOG.md)
