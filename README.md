# Log Viewer

通用内网日志浏览工具：通过本地 Python 代理拉取 LogIndex（或兼容服务）尾部日志，Vue 3 前端提供仪表盘、日志聚合与访问统计。

**当前版本：`1.0.1`**（根目录 [`VERSION`](VERSION)）

仓库：<https://github.com/xgs87762GH/log-viewer>

---

## 功能概览

- **三栏布局**：一级导航（仪表盘 / 日志聚合 / 统计）+ 二级模块树 + 主内容区
- **Range 尾部下载**：按设置的 `tailMB` / `maxLines` 拉取，避免整文件进浏览器
- **可变行高虚拟滚动**：默认换行也只渲染可视区；大日志分组/过滤可走 Web Worker
- **Grafana 风格文本过滤**：包含 / 排除芯片，按「整条日志」命中
- **历史归档**：按日期筛选目录下滚动日志文件，本地索引 + 按日软刷新
- **主题与行为设置**：主题色、字号、折叠阈值、自动滚到末尾等（浏览器 localStorage）
- **访问统计**（可选）：SQLite 记录在线与打开事件，IP 白名单可看统计页

---

## 环境要求

- Python 3.8+（标准库即可，无额外 pip 依赖）
- Node.js 18+（仅构建前端需要）
- 可访问的日志索引服务（HTTP Basic Auth + 目录列表 + 文件 Range 可选）

---

## 快速开始

### 1. 克隆与配置

```bash
git clone git@github.com:xgs87762GH/log-viewer.git
cd log-viewer
```

复制示例配置（**真实配置含内网地址，已 gitignore，勿提交**）：

```bash
copy config\logs.json.example config\logs.json
copy config\access.json.example config\access.json
# macOS / Linux:
# cp config/logs.json.example config/logs.json
# cp config/access.json.example config/access.json
```

按本单位点编辑 `config/logs.json`（`baseUrl`、环境、`host` / `app` / `module`）。  
按需编辑 `config/access.json` 中的 `statsAllowIps`。

可选：用环境变量提供代理 Basic Auth（无内置默认账号）：

```bash
set LOG_VIEWER_USER=your_user
set LOG_VIEWER_PASS=your_pass
# 或: LOGINDEX_USER / LOGINDEX_PASS
```

### 2. 构建并启动（单进程）

```bash
python manage.py build    # npm ci/install + vite build → frontend/dist
python manage.py start    # 监听 :8090，托管 dist + API
python manage.py open     # 打开浏览器
```

或交互菜单：`python manage.py` / 双击 `Log-Viewer.bat`。

开发热更新：

```bash
python manage.py dev      # API :8090 + Vite :5173（/api、/config 已代理）
```

默认访问：<http://localhost:8090>

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `python manage.py start` | 启动（缺 dist 时会先 build） |
| `python manage.py stop` | 停止 |
| `python manage.py restart` | 重启 |
| `python manage.py status` | 状态 |
| `python manage.py build` | 仅构建前端 |
| `python manage.py open` | 打开浏览器 |
| `python manage.py shortcut` | 生成桌面快捷方式 |
| `python manage.py dev` | 后端 + Vite |

---

## 配置说明

### `config/logs.json`

| 字段 | 含义 |
|------|------|
| `baseUrl` | 日志索引服务根地址 |
| `logFile.preset` | 文件名规则预设（见 `logFileRules`） |
| `environments.*.services[]` | `module` 展示名、`host`、`app`、可选 `levels` |

示例见 [`config/logs.json.example`](config/logs.json.example)。

### `config/access.json`

| 字段 | 含义 |
|------|------|
| `enabled` | 是否开启访问埋点 |
| `statsAllowIps` | 可查看「统计」页的客户端 IP |
| `retainDays` | SQLite 事件保留天数 |

示例见 [`config/access.json.example`](config/access.json.example)。该文件**不会**通过 `/config/` HTTP 接口对外暴露。

---

## 项目结构

```
log-viewer/
├── VERSION                 # 语义化版本
├── config/
│   ├── *.example           # 可提交的示例
│   ├── logs.json           # 本地私有（gitignore）
│   └── access.json         # 本地私有（gitignore）
├── docs/
│   ├── SYSTEM.md           # 系统说明
│   ├── DESIGN.md           # 设计规范
│   └── ACCESS.md           # 访问统计
├── frontend/               # Vue 3 + Vite + Element Plus（按需）
├── manage.py               # 启停 / 构建 / 快捷方式
├── server.py               # 代理 + 静态托管 + access API
└── access_store.py         # SQLite 访问记录
```

布局：`| 一级导航 | 二级导航(仅日志聚合) | 主内容 |`

更完整说明见 [`docs/SYSTEM.md`](docs/SYSTEM.md)、[`docs/DESIGN.md`](docs/DESIGN.md)。

---

## 架构要点

- **Composables**：业务状态在 `useLogs` / `useNavigation` / `useSettings` 等模块单例中
- **代理**：`GET /api/proxy?url=&tail=`，服务端 Range 拉尾部并分块回写
- **性能**：虚拟列表、请求 Abort、正文短期缓存、视图 keep-alive、异步分包、大日志 Worker
- **主题**：CSS 变量 + Element Plus 映射，设置即时生效

---

## 版本与发布

- 版本源：根目录 `VERSION`、前端 `package.json`、`frontend/src/constants/version.js`（需同步）
- Git tag：`v1.0.1`

升级前端后执行 `python manage.py build`，再 `restart`。

---

## 说明

请勿将含内网 host、账号或白名单的真实 `config/*.json` 推送到公开仓库。
