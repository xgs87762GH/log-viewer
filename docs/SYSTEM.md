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
| Backend | `server.py`（config + proxy + access 统计） |
| Config | `config/logs.json`、`config/access.json` |
| Access DB | SQLite `data/access.db` |
| Ops | `manage.py` / `manage.bat` |

Backend need not change for most UI/nav work. Frontend talks to:
- `GET /config/logs.json`
- `GET /api/proxy?url=...&tail=...` (HTTP Range tail download)
- `/api/access/*`（在线 / 埋点 / 统计，见 `docs/ACCESS.md`）

## Directory map

```
log-viewer/
├── config/
│   ├── logs.json             # envs → services (host/app/levels)
│   └── access.json           # 访问统计开关 / IP 白名单 / 保留天数
├── access_store.py           # SQLite 会话 + 事件
├── data/access.db            # 运行时生成（gitignore）
├── server.py                 # proxy + config + access API
├── manage.py                 # start/stop/status/logs menu
├── docs/
│   ├── SYSTEM.md             # this file
│   ├── DESIGN.md             # coding / architecture rules
│   └── ACCESS.md             # 访问统计说明
└── frontend/src/
    ├── App.vue               # 三栏壳：NavPrimary | NavSecondary? | main
    ├── components/
    │   ├── nav/              # L1 / L2 导航
    │   ├── viewer/           # LogViewer + LogFilterBar
    │   ├── dashboard/        # Dashboard
    │   ├── stats/            # AccessStats
    │   └── settings/         # SettingsModal
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
    │   ├── logFileRules.js   # 文件名匹配规则
    │   └── themes.js         # 主题 / 日志区色板
    ├── utils/
    │   ├── logParser.js      # 着色引擎
    │   ├── logFileIndex.js   # 索引持久化
    │   ├── logEntries.js     # 条目归并 / 过滤
    │   ├── logViewRows.js    # 折叠展平 / 行高布局
    │   ├── logProcessClient.js # Worker 调度（大日志）
    │   ├── logFilterMatch.js # 纯过滤匹配
    │   ├── dirListing.js     # 目录 HTML 抽文件名
    │   └── color.js          # 色运算
    ├── workers/
    │   └── logProcess.worker.js
    └── styles/global.css
```

Proxy Basic Auth：`LOG_VIEWER_USER` / `LOG_VIEWER_PASS`（或 `LOGINDEX_*`）优先于 CLI；无内置默认账号。

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
5. `LogViewer` slices by `maxLines`，可变行高虚拟滚动（换行开/关统一）；大日志分组/过滤可走 Worker

## Settings (browser localStorage)

Key: `log_viewer_settings`

Notable behavior fields:
- `maxLines` — keep last N lines after download
- `tailMB` — Range tail size (default 10)
- `autoScroll` — jump to end after load
- `wordWrap` — 自动换行（仍虚拟滚动；超大日志建议降低 maxLines）

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
