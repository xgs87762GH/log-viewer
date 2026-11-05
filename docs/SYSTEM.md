# SYSTEM — Log Viewer

> For humans and AI agents. Describes what the system is and how it runs.
> Design rules: see `docs/DESIGN.md`.
> Version: root `VERSION` file (currently **1.0.1**).

## Purpose

Internal log browser. Reads log files from a LogIndex-compatible HTTP service
(`{baseUrl}/{host}/{app}/...`, `baseUrl` from `config/logs.json`) via a local
Python proxy, with optional Basic Auth. Does **not** persist viewed logs to disk.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vue 3 + Vite + Element Plus（按需） |
| Backend | `server.py`（config + proxy + download + access 统计） |
| Config | `config/logs.json`、`config/access.json` |
| Access DB | SQLite `data/access.db` |
| Ops | `manage.py` / `manage.bat` |

Backend need not change for most UI/nav work. Frontend talks to:
- `GET /config/logs.json`
- `GET /api/proxy?url=...&tail=...` (HTTP Range tail download)
- `GET /api/download?url=...&file=...` (整文件流式下载)
- `/api/access/*`（在线 / 埋点 / 统计，见 `docs/ACCESS.md`）

### 下载端点

`/api/download` 与 `/api/proxy` 分开：下载不带 `tail`，超时 300s（目录探测保持 8s），
响应带 `Content-Disposition: attachment` 与 `X-Total-Size`，复用 Basic 凭据与 64KB
分块转发。**路由必须排在 `do_GET` 的 SPA fallback 之前**，否则会被改写成 index.html。
前端 `utils/logDownload.js` 用 `fetch().body.getReader()` 逐片读取 → 累积字节分片 →
`Blob` → 临时 `<a download>`，支持进度回调与 `AbortController` 取消。读取与落盘分离，
预留 HTTP Range 分片 / 断点续传替换点。

## Directory map

```
log-viewer/
├── config/
│   ├── logs.json             # envs → services (host/app/levels)
│   └── access.json           # 访问统计开关 / IP 白名单 / 保留天数
├── access_store.py           # SQLite 会话 + 事件
├── data/access.db            # 运行时生成（gitignore）
├── server.py                 # proxy + download + config + access API
├── manage.py                 # start/stop/status/logs menu
├── docs/
│   ├── SYSTEM.md             # this file
│   ├── DESIGN.md             # coding / architecture rules
│   └── ACCESS.md             # 访问统计说明
└── frontend/
    ├── tests/                # node --test 纯函数用例 + 性能基准
    └── src/
        ├── App.vue           # 三栏壳：NavPrimary | NavSecondary? | main
        ├── components/
        │   ├── nav/          # L1 / L2 导航
        │   ├── viewer/       # LogViewer / LogFilterBar / LogFoldBar / LogContextDialog
        │   ├── dashboard/    # Dashboard
        │   ├── stats/        # AccessStats
        │   └── settings/     # SettingsModal
        ├── composables/
        │   ├── useLogs.js
        │   ├── useNavigation.js
        │   ├── useSettings.js
        │   ├── useLogViewFilters.js
        │   ├── usePresence.js
        │   └── useAccessLog.js
        ├── constants/
        │   ├── logLevels.js
        │   ├── logHighlightRules.js
        │   ├── logFileRules.js     # 文件名匹配规则
        │   ├── logContextConfig.js # 上下文默认值 / 区间
        │   └── themes.js           # 主题 / 日志区色板
        ├── utils/
        │   ├── logParser.js        # 着色引擎
        │   ├── logFileIndex.js     # 索引持久化
        │   ├── logEntries.js       # 条目归并 / 过滤 / 搜索索引
        │   ├── logViewRows.js      # 折叠展平 / 行高布局
        │   ├── logProcessClient.js # Worker 命令协议 + 同步回退
        │   ├── logFilterMatch.js   # 过滤匹配 / 条件预编译
        │   ├── logContextWindow.js # 上下文窗口推进
        │   ├── logDownload.js      # 分片流式下载
        │   ├── logTextMetrics.js   # 文本列宽 / 视觉行数
        │   ├── logVirtualLayout.js # 虚拟列表高度表
        │   ├── dirListing.js       # 目录 HTML 抽文件名
        │   └── color.js            # 色运算
        ├── workers/
        │   └── logProcess.worker.js
        └── styles/global.css
```

Proxy Basic Auth：根目录 `.env`（见 `.env.example`）或环境变量 `LOG_VIEWER_USER` / `LOG_VIEWER_PASS`（或 `LOGINDEX_*`）；CLI `--user`/`--password` 可覆盖。无内置默认账号。`.env` 已 gitignore。

## Navigation (UI) — 三栏

```
| NavPrimary (L1) | NavSecondary (L2) | main        |
| 仪表盘          | (仅日志聚合时)    | Dashboard / |
| 日志聚合        | 环境 Tab + 模块列表 | LogViewer / |
| 统计            |                   | AccessStats |
```

- L1 / L2 是**两个独立侧栏**，可分别缩小（localStorage）。
- 仪表盘 / 统计时不挂载 L2；环境 Tab 在右侧 Dashboard。
- `useNavigation.view`: `dashboard` | `viewer` | `stats`。
- 访问统计见 `docs/ACCESS.md`（SQLite + IP 白名单）。

## Data flow (read path)

1. `useLogs.loadConfig()` → `/config/logs.json`
2. User picks env/module/level → `useNavigation`
3. `useLogs.fetchLog(host, app, level)` → `/api/proxy?tail=`
4. Proxy requests LogIndex with `Range: bytes=-N` (N from settings `tailMB`)
5. `LogViewer` slices by `maxLines`，可变行高虚拟滚动（换行开/关统一）；大日志分组/过滤走 Worker

### Worker 协议（≥2500 行）

- `setLines`：**仅在 lines 引用变化时**发送一次；Worker 常驻 lines、分组条目、
  每条日志的小写搜索索引；视觉行数按 `(idx, wordWrap, wrapCols)` 缓存。
- `query`：只带过滤条件与折叠/换行参数，编译过滤后展平，返回 `viewRows` +
  `filteredRowCount`。Worker 用 `latestId` 合并连续 query，客户端作废旧 pending。
- 小数据或 Worker 不可用：同步回退 `processLogSync`，返回结构同构。
- `hlCache` 键已含关键词，不再随每次重建清空；`viewRows` 用 `shallowRef` 避免深度代理。

### 上下文弹窗

从**原始 `lines`** 以 `row.idx` 为中心取窗口，与过滤结果解耦（筛选状态下也能看到
被隐藏的周边行）。`utils/logContextWindow.js` 负责推进：滚到边界每次追加
`contextLazyStep` 行（默认 5），单侧上限 `contextMaxLines`（默认 50）。两重边界分别
提示：配置上限 vs 已加载数据边界——`fetchLog` 只拉尾部，更早的行不在内存里，
本期不联网补拉（按字节区间拉取列为二期）。

## Settings (browser localStorage)

Key: `log_viewer_settings`

Notable behavior fields:
- `maxLines` — keep last N lines after download
- `tailMB` — Range tail size (default 10)
- `autoScroll` — jump to end after load
- `wordWrap` — 自动换行（仍虚拟滚动；超大日志建议降低 maxLines）
- `foldOverLimit` / `foldMaxLines` — 单条日志超行折叠
- `contextInitialLines` / `contextLazyStep` / `contextMaxLines` — 上下文弹窗参数；
  默认值与合法区间来自 `constants/logContextConfig.js`，**不触发日志重载**
  （`needsReload` 只比较 maxLines / tailMB）。

## Performance baseline

`node frontend/tests/bench-filter.mjs`（10000 行、9166 条目、3 个条件、7 轮中位）：

- 旧链路 `group+filter` ≈ 5.4ms，且每次条件变化还要把整个 `lines` 克隆进 Worker；
- 新链路 `setLines` 建索引一次 ≈ 1.0ms，`query` 编译过滤 ≈ 0.9ms（约 6x）；
- `clone(viewRows) → main` ≈ 12ms 是当前最大单项，因此 `viewRows` 用 `shallowRef`、
  高亮缓存不再随每次重建清空、过滤交互加 60ms 防抖；目标 < 100ms。

## Tests

```bash
node --test "frontend/tests/*.test.js"   # 纯函数单测，无第三方依赖
node frontend/tests/bench-filter.mjs    # 过滤链路耗时
cd frontend && npm run build
python -m py_compile server.py
```

## Run

单进程（无需 Nginx）：`server.py` 托管 `frontend/dist` + API。

```bash
python manage.py          # interactive
python manage.py start    # single process on :8090
python manage.py build    # npm run build → frontend/dist
python manage.py shortcut # desktop launcher bat
python manage.py dev      # optional: :8090 API + Vite :5173
```

Open http://localhost:8090
