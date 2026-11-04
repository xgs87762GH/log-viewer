## Log Viewer v1.0.1

首个公开发布。通用内网日志浏览工具：本地 Python 代理 + Vue 3 前端，支持仪表盘、日志聚合与访问统计。

### Highlights

- **三栏布局**：仪表盘 / 日志聚合 / 统计；二级模块树可折叠
- **Range 尾部下载**：按 `tailMB` / `maxLines` 拉取，避免整文件加载
- **可变行高虚拟滚动**：默认换行也只渲染可视区；≥2500 行分组过滤走 Web Worker
- **加载体验**：请求 Abort、正文短期缓存、视图 keep-alive、异步分包
- **Grafana 风格过滤**：包含 / 排除芯片；历史日期归档 + 本地索引
- **版本标记**：根目录 `VERSION`、UI、`manage.py` / `server.py` 启动信息均为 **1.0.1**

### 安全说明

- 仓库仅包含 `config/*.example`
- 真实 `config/logs.json`、`config/access.json`（含内网 host / IP 白名单）已 gitignore，请本地复制示例后填写
- 代理 Basic Auth 无内置默认账号，请用环境变量或 CLI 传入

### 快速开始

```bash
git clone git@github.com:xgs87762GH/log-viewer.git
cd log-viewer
copy config\logs.json.example config\logs.json
copy config\access.json.example config\access.json
python manage.py build
python manage.py start
```

详见 README。
