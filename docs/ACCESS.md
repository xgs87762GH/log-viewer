# 访问记录与在线统计

> 讲什么：可选的轻量审计能力。只记录谁在何时看了哪些日志，**不记录日志正文**。系统位置见 [SYSTEM](SYSTEM.md)。

## 已定决策

| 项 | 结论 |
| --- | --- |
| 入口 | 一级导航「统计」独立页 |
| 权限 | `config/access.json` 的 `statsAllowIps` 白名单，默认仅本机 `127.0.0.1` / `::1` |
| 口令 | 不做，用 IP 门禁 |
| 内外网标注 | 不做 |
| 存储 | SQLite `data/access.db`（运行时生成，已 gitignore） |
| 清理 | 启动时按 `retainDays`（默认 30）删除过期事件与离线会话 |

## 配置

`config/access.json`（示例见 [`config/access.json.example`](../config/access.json.example)）：

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
- 开发环境由 Vite 代理写入 `X-Forwarded-For`，以便后端识别真实客户端 IP。

## 接口

```text
POST /api/access/hello | ping | event   → 写入 sessions / events
GET  /api/access/me                    → { ip, canViewStats }（公开）
GET  /api/access/online | recent | summary → 仅白名单 IP（否则 403）
```

## 前端

| 文件 | 职责 |
| --- | --- |
| `composables/usePresence.js` | hello + 定时 ping；会话 id 存 `sessionStorage` |
| `composables/useAccessLog.js` | `track(action, payload)` 埋点 |
| `components/stats/AccessStats.vue` | 统计页界面 |

埋点覆盖：打开仪表盘 / 统计、切换环境、打开日志、复制链接、下载日志、查看日志上下文。

## 隐私

1. 只存 IP、UA 与操作元数据，不存日志正文。
2. 统计查询接口强制 IP 白名单。
3. 保留天数可配置，启动时执行清理。

## 相关文档

[系统架构](SYSTEM.md) · [功能清单](FEATURES.md) · [变更记录](CHANGELOG.md)
