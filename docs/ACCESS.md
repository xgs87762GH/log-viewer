# ACCESS — 访问记录 & 在线统计（已实现）

轻量审计：记录谁在何时看了哪些日志；统计页仅白名单 IP 可看。不记日志正文。

## 已定决策

| 项 | 结论 |
|----|------|
| 入口 | L1「统计」独立页 |
| 权限 | `config/access.json` → `statsAllowIps` 写死白名单；默认仅本机 `127.0.0.1` / `::1` |
| 口令 | **不做**（用 IP 门禁） |
| 内外网标注 | **不做** |
| 存储 | **SQLite**（`data/access.db`） |
| 清理 | 启动时按 `retainDays`（默认 30）删除过期事件 / 离线会话 |

## 配置

`config/access.json`：

```json
{
  "enabled": true,
  "heartbeatSec": 25,
  "onlineTimeoutSec": 90,
  "retainDays": 30,
  "statsAllowIps": ["127.0.0.1", "::1"]
}
```

- `enabled: false` 关闭埋点与统计 API。
- 该文件**不**通过 `/config/` 对外暴露。

## 架构

```
浏览器
  POST /api/access/hello|ping|event   → SQLite sessions / events
  GET  /api/access/me                 → { ip, canViewStats }（公开）
  GET  /api/access/online|recent|summary → 仅白名单 IP（403 否则）
```

Vite 开发代理会把真实客户端 IP 写入 `X-Forwarded-For`。

## 前端

| 文件 | 职责 |
|------|------|
| `usePresence.js` | hello + 定时 ping；sid → sessionStorage |
| `useAccessLog.js` | `track(action, payload)` |
| `AccessStats.vue` | 统计页 UI |
| L1 `view: 'stats'` | NavViewSwitch 第三项「统计」 |

埋点：打开仪表盘 / 统计、切换环境、打开日志、复制链接。

## 隐私

1. 只存 IP / UA / 操作元数据，**不存日志正文**。
2. 统计查询接口强制 IP 白名单。
3. 保留天数可配；启动 `purge_old()`。
