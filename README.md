# Log Viewer

内网日志浏览工具：本地 Python 代理通过 HTTP Range 拉取 LogIndex（或兼容服务）的日志尾部，Vue 3 前端提供仪表盘、日志聚合、访问统计与设置。**日志正文只存在于浏览器内存，不落盘。**

- 当前版本 `1.0.4`（[`VERSION`](VERSION)）
- 仓库：<https://github.com/xgs87762GH/log-viewer>

## 功能速览

| 领域 | 能力 |
| --- | --- |
| 日志阅读 | 只拉尾部 N MB / 最多 N 行、可变行高虚拟滚动、自动换行、长条目折叠、点击行查看上下文（前后行懒加载）、整文件流式下载（按「中文环境标签_项目展示名_级别.log」命名，如「测试环境_订单服务_INFO.log」） |
| 搜索工具 | 芯片式包含/排除过滤与过滤历史、过滤后行数反馈、独立高亮词条（整串匹配，可含逗号）、查找并跳转「第 n/N 处」并标记当前行 |
| 历史归档 | 按日期筛选滚动日志文件；文件名索引本地持久化、按日软刷新、可强制全量探测 |
| 界面 | 仪表盘 / 日志聚合 / 统计 / 设置四个视图；两级导航；三套主题、字体与阅读行为设置 |
| 工具区 | 过滤、高亮、查找、历史文件统一收进搜索工具抽屉；可固定，未固定时点击外部或切走视图自动收起 |
| 访问统计（可选） | SQLite 记录在线与操作事件，仅白名单 IP 可查看；不记录日志正文 |
| 性能 | 请求超时与取消、同键进行中请求共享、正文内存短期缓存、≥2500 行交给 Web Worker、视图 keep-alive |
| 配置管理 | 单个 JSON 导入导出服务配置与本地偏好；导入前预览并逐项勾选，写回服务端前自动备份 |
| 版本检查 | 页面加载时比对 GitHub 最新 tag 与本地版本（1 小时缓存、失败静默）；有新版本时在侧栏版本号旁显示可点击的「有更新」提示 |

完整功能清单见 [`docs/FEATURES.md`](docs/FEATURES.md)，加载与缓存链路见 [`docs/DATA-FLOW.md`](docs/DATA-FLOW.md)。

## 环境要求

- Python 3.8+（仅标准库，无额外 pip 依赖）
- Node.js 18+（仅构建前端需要）
- 可访问的日志索引服务（Basic Auth、目录列表，文件 Range 可选）

## 快速开始

```bash
git clone git@github.com:xgs87762GH/log-viewer.git
cd log-viewer
```

复制示例配置（真实配置含内网地址，已 gitignore，勿提交）：

```bash
copy config\logs.json.example config\logs.json
copy config\access.json.example config\access.json
copy .env.example .env
# macOS / Linux 用 cp 代替 copy
```

按本单位点编辑 `config/logs.json`（`baseUrl`、环境、`host` / `app` / `module`）；按需调整 `config/access.json` 的 `statsAllowIps`；在 `.env` 填写代理 Basic Auth 的 `LOG_VIEWER_USER` / `LOG_VIEWER_PASS`。也可用进程环境变量（覆盖 `.env`）或启动参数 `--user` / `--password`，无内置默认账号。

```bash
python manage.py build    # 构建前端到 frontend/dist
python manage.py start    # 单进程启动，监听 :8090，同时托管页面与 API
python manage.py open     # 打开浏览器
```

访问 <http://localhost:8090>。开发热更新用 `python manage.py dev`（API :8090 + Vite :5173，已代理 `/api` 与 `/config`）；也可直接运行 `python manage.py` 或双击 `Log-Viewer.bat` 打开交互菜单。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `python manage.py start` | 启动（缺 `dist` 或源码较新时自动构建） |
| `python manage.py stop` / `restart` | 停止 / 重启 |
| `python manage.py status` / `logs` | 查看状态 / 日志 |
| `python manage.py build` | 仅构建前端（缺 `node_modules` 时先 `npm install`） |
| `python manage.py dev` | 后端 + Vite 开发模式 |
| `python manage.py open` | 打开浏览器 |
| `python manage.py shortcut` | 生成桌面快捷方式（`desktop` 为同义命令） |

## 配置

| 文件 | 关键字段 |
| --- | --- |
| [`config/logs.json.example`](config/logs.json.example) | `baseUrl`、`logFile.preset`、`environments.*.services[]`（`module` / `host` / `app` / 可选 `levels`）；服务可覆盖 `baseUrl` / `urlStyle` / `logFile` |
| [`config/access.json.example`](config/access.json.example) | `enabled`、`heartbeatSec`、`onlineTimeoutSec`、`retainDays`、`statsAllowIps` |
| [`.env.example`](.env.example) | `LOG_VIEWER_USER` / `LOG_VIEWER_PASS`（由 `envfile.py` 加载） |

`config/access.json` 不会通过 `/config/` 接口对外暴露；访问统计细节见 [`docs/ACCESS.md`](docs/ACCESS.md)。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/SYSTEM.md`](docs/SYSTEM.md) | 技术栈、分层、目录、视图与后端边界 |
| [`docs/FEATURES.md`](docs/FEATURES.md) | 按视图与能力汇总的功能清单 |
| [`docs/DATA-FLOW.md`](docs/DATA-FLOW.md) | 从加载到展示的完整链路、缓存与失效策略 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 工程分层约束、UI 规则与变更检查清单 |
| [`docs/ACCESS.md`](docs/ACCESS.md) | 访问记录与在线统计 |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | 版本、改造记录、已知限制与后续方向 |

## 项目结构

```text
log-viewer/
├── VERSION / RELEASE_NOTES_v1.0.1.md   # 版本与发布说明
├── backup/                 # 配置导入前的自动备份（gitignore）
├── config/                 # *.example 可提交；真实 json 私有
├── docs/                   # 上表六篇文档
├── frontend/
│   ├── src/                # App.vue、components/、composables/、constants/、utils/、workers/、styles/
│   ├── tests/              # node --test 纯函数用例与性能基准
│   └── dist/               # 构建产物（gitignore）
├── manage.py / manage.bat  # 启停、构建、快捷方式
├── server.py               # 代理、下载、配置托管、access API
├── access_store.py         # SQLite 访问记录（data/access.db）
└── envfile.py              # .env 加载
```

页面布局：`| 一级导航 | 二级导航（仅日志聚合） | 主内容 |`。

## 版本与安全

- 版本号以 `VERSION` 为准；`frontend/package.json`、两个 `package-lock.json`、`frontend/src/constants/version.js`、`frontend/index.html` 及 `server.py` / `manage.py` 的兜底值需同步。历史发布说明见 [`RELEASE_NOTES_v1.0.1.md`](RELEASE_NOTES_v1.0.1.md)，本版变更见 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。
- 升级前端后执行 `python manage.py build`，再 `python manage.py restart`。
- 含内网 host、账号或 IP 白名单的 `config/*.json` 与 `.env` 已 gitignore，**请勿推送到公开仓库**。
- 导出的配置归档同样包含内网地址与白名单 IP，请妥善保管；代理凭据（`.env`）不会进入归档。
