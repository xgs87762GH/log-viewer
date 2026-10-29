# DESIGN — rules for humans & AI

Short constraints. Prefer following these over inventing new patterns.

## Goals

High cohesion, low coupling, clear layers, readable code. No backend change
unless proxy/config API must change.

## Layers (do not cross)

| Layer | Owns | Must not |
|-------|------|----------|
| `config/logs.json` | env/service catalog | UI logic |
| `server.py` | proxy, serve config | Vue/nav/theme |
| `composables/*` | shared state & domain ops | heavy DOM/CSS layout helpers |
| `components/*` | render + local UI state | raw fetch to LogIndex |
| `constants` | 可扩展配置（规则 / 色板 / 级别） | Vue reactivity / HTTP |
| `utils` | 纯函数引擎 / 持久化 / 解析 | Vue / 业务编排副作用 |
| `constants/logHighlightRules.js` | 日志着色规则唯一配置 | 渲染 / 过滤逻辑 |
| `constants/logFileRules.js` | 日志**文件名**匹配规则唯一配置 | 网络请求 / UI |
| `constants/themes.js` | 主题 / 日志区色板 | DOM 写入 |
| `utils/logParser.js` | 执行着色规则的引擎 | 内嵌业务正则（应写在 rules） |
| `utils/logFileIndex.js` | 文件名索引：持久化 / 按日刷新 / 合并 | HTTP / Vue / UI |
| `utils/logEntries.js` | 条目归并 / 文本过滤 | Vue |
| `utils/logViewRows.js` | 折叠展平 / 视觉行估算 | Vue |
| `utils/dirListing.js` | 目录 HTML 抽文件名 | 命名规则 |
| `utils/color.js` | 色混合 / alpha | DOM |

## Composables = single source of truth

- Module-level singleton: `useLogs`, `useNavigation`, `useSettings`.
- Components communicate **only** via composables (no parent↔child refs for nav).
- `useNavigation`: view / env / selectedIdx / selectedLevel / routeFile；
  地址栏 `?view=&env=&app=&host=&level=&file=` 双向同步，刷新可还原。
- `useLogs`: config, URL build, fetchLog, 目录探测编排；
  文件名匹配 → `logFileRules`；目录 HTML → `dirListing`；索引 → `logFileIndex`。
  `discoverLevels` 默认不自动批量。仪表盘「探测级别」可手动串行；打开日志时
  单服务探测（有缓存）；404 回退时单次探测。服务可在 `logs.json` 用 `logFile`
  覆盖命名（preset 或自定义 active/archive 模板）。
  索引按模块（host|app）：每次点开只判断「今日是否已刷新」，未刷新才后台软扫；
  「重新探测」全量覆盖并更新刷新时间。
  `getLevels` 会 hydrate localStorage；force/404 失败不抹掉旧索引，避免切视图后
  级别按钮回退到配置全量。
- Log 正文：只在用户打开/切换/点刷新时 `fetchLog`，**无轮询**。
- 正文过滤：`useLogViewFilters` + `components/viewer/LogFilterBar`
  （Grafana 风格芯片：∋ 包含 / ≠ 排除，多条件 AND；整条日志匹配）。
- `useSettings`: cfg 持久化 + `apply` 写 CSS 变量；色板来自 `constants/themes`。

## Feature folders under `components/`

```
components/
  nav/         # L1 / L2 导航
  viewer/      # LogViewer + LogFilterBar
  dashboard/   # Dashboard
  stats/       # AccessStats
  settings/    # SettingsModal
```

- When adding nav UI, put it under `components/nav/`.
- Viewer-only UI → `components/viewer/`（开闭：加过滤条/历史条不污染 dashboard）。

## Navigation shape（三栏独立）

```
App shell
  ├─ NavPrimary      # 栏1：仪表盘 | 日志聚合 | 统计（可缩小）
  ├─ NavSecondary    # 栏2：仅 viewer — 环境›模块（可缩小，可整栏卸载）
  └─ main            # 栏3：Dashboard | LogViewer | AccessStats
```

- 不要再把 L1/L2 塞进同一个 Sidebar。
- L1 labels: 仪表盘 / 日志聚合 / 统计（code: `dashboard` / `viewer` / `stats`）。
- Collapse: `navL1Collapsed` / `navL2Collapsed`。
- 访问统计：`usePresence` + `useAccessLog` + `AccessStats`；配置见 `config/access.json`，详设 `docs/ACCESS.md`。
- Selecting a module under another env: use `selectEnvService(env, idx)` or
  `openLog(idx, level, env)` — never `selectEnv` then `selectService` in two
  ticks (idx would reset).

## UI rules

- Layout shell stays three columns; restyle with **Element Plus** (on-demand via unplugin).
- Keep log line rendering in `global.css` (v-html cannot use scoped EP styles).
- Toasts: `useToast` → `ElMessage` only (do not full-register Element Plus).
- Dashboard lists modules; L2 nav is for switching while reading.
- Do not duplicate the full module grid in the sidebar on dashboard.
- Level colors: global classes `.lvl-*` / `.ln-*` in `global.css` (v-html safe).
- Loading: newest request wins (sequence token); scroll-to-end only **after**
  `loading === false` and DOM painted.
- Toolbar 不做级别二次过滤（文件已按 level 区分）；正文用文本过滤条。

## Change checklist

1. Config-only? → edit `config/logs.json` only.
2. Nav/UI? → composable first if state shared; component if presentational.
3. Fetch/tail/maxLines? → `useLogs` + `useSettings`, not hardcoded in Vue.
4. Avoid new global stores (Pinia/Vuex) unless composables clearly fail.
5. Keep comments short; explain **why** / boundaries, not narrate code.
6. Update `docs/SYSTEM.md` if architecture or nav hierarchy changes.
7. New pure algorithm? → `utils/`；new 可扩展规则? → `constants/`。

## Anti-patterns

- Fetching LogIndex URLs directly from a component (bypass proxy).
- Storing viewed log files on disk by default.
- Mixing L1 view switch and L2 env/module tree in one giant template without split.
- Silent hard caps that ignore user settings (document or expose in Settings).
- Putting theme palettes / HTML directory parsing inside composables.
