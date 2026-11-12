#!/usr/bin/env python3
"""Log Viewer - 交互式管理工具（默认单进程托管前端）"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent

from envfile import load_env  # noqa: E402
from procutil import (  # noqa: E402
    command_line,
    format_desc,
    kill_pid,
    pid_alive,
    port_owner_pids,
)

load_env(HERE / ".env")

RUNTIME = HERE / ".runtime"
CONFIG_DIR = HERE / "config"
PID_FILE = RUNTIME / "pids.json"
SERVER_LOG = RUNTIME / "server.log"

# 运行日志轮转：超过阈值时保留最近若干行，旧内容覆盖到 .1 归档
LOG_MAX_BYTES = 5 * 1024 * 1024
LOG_KEEP_LINES = 5000
SERVER_LOG_ARCHIVE = RUNTIME / "server.log.1"
FRONTEND_LOG = RUNTIME / "frontend.log"  # 仅开发模式
DIST_DIR = HERE / "frontend" / "dist"
DIST_INDEX = DIST_DIR / "index.html"

# 影响前端产物的路径：任一文件比 dist 新即视为过期（含 public 静态资源与依赖锁）
FRONTEND_WATCH_PATHS = (
    "src",
    "public",
    "index.html",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.ts",
    "package.json",
    "package-lock.json",
)

APP_PORT = 8090
DEV_UI_PORT = 5173
APP_URL = f"http://localhost:{APP_PORT}"
DEV_UI_URL = f"http://localhost:{DEV_UI_PORT}"

# 端口兜底清理时，用于确认占用者确实属于本服务（避免误杀无关进程）
SERVER_MARKS = ("server.py",)
VITE_MARKS = ("vite", "npm")

IS_WIN = os.name == "nt"


def read_version() -> str:
    try:
        # utf-8-sig：容忍外部编辑器 / PowerShell 写入的 BOM
        return (HERE / "VERSION").read_text(encoding="utf-8-sig").strip() or "1.1.0"
    except Exception:
        return "1.1.0"


APP_VERSION = read_version()


# ── helpers ──────────────────────────────────────────────

def ensure_runtime():
    RUNTIME.mkdir(exist_ok=True)


def load_pids() -> dict:
    if not PID_FILE.exists():
        return {}
    try:
        # utf-8-sig：手动编辑或 PowerShell 写入可能带 BOM，直接 utf-8 会让 json 解析失败
        data = json.loads(PID_FILE.read_text(encoding="utf-8-sig"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_pids(pids: dict):
    ensure_runtime()
    PID_FILE.write_text(json.dumps(pids, indent=2), encoding="utf-8")


def _tail_bytes(path: Path, keep_lines: int, chunk: int = 64 * 1024) -> bytes:
    """按字节读取文件末尾 keep_lines 行；文件更短时返回全部内容。"""
    with path.open("rb") as f:
        f.seek(0, os.SEEK_END)
        pos = f.tell()
        data = b""
        while pos > 0 and data.count(b"\n") <= keep_lines:
            step = min(chunk, pos)
            pos -= step
            f.seek(pos)
            data = f.read(step) + data

    # 末尾换行会 split 出一个空段，先剔除再截取，否则会少保留一行
    trailing_newline = data.endswith(b"\n")
    lines = data.split(b"\n")
    if trailing_newline and lines and lines[-1] == b"":
        lines = lines[:-1]
    if len(lines) > keep_lines:
        lines = lines[-keep_lines:]
    out = b"\n".join(lines)
    if trailing_newline:
        out += b"\n"
    return out


def trim_server_log(
    path: Path = SERVER_LOG,
    archive: Path = SERVER_LOG_ARCHIVE,
    max_bytes: int = LOG_MAX_BYTES,
    keep_lines: int = LOG_KEEP_LINES,
) -> str:
    """运行日志超过阈值时裁剪：保留最近 keep_lines 行，旧内容覆盖到归档文件。

    只在启动新进程前调用（此时旧进程已停或未运行，避免 Windows 文件占用）。
    全程按字节处理，不碰编码；任何失败只返回说明，绝不阻断启动。
    """
    if not path.is_file():
        return ""
    try:
        size = path.stat().st_size
    except OSError as e:
        return "读取运行日志大小失败: {}".format(e)
    if size <= max_bytes:
        return ""

    tmp = path.with_name(path.name + ".trim")
    try:
        kept = _tail_bytes(path, keep_lines)
        tmp.write_bytes(kept)
        # 两次原子替换：先归档旧文件，再放入裁剪后的新文件
        os.replace(path, archive)
        os.replace(tmp, path)
    except OSError as e:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        return "裁剪运行日志失败（可能文件被占用）: {}".format(e)
    return "运行日志已裁剪：{:.2f} MB → 最近 {} 行（旧内容见 {}）".format(
        size / (1024 * 1024), keep_lines, archive.name
    )


def cleanup_stale_pids() -> list[str]:
    """清理 pids.json 里已经退出的进程记录。

    只删失效记录，不结束任何仍然存活的进程——避免误杀其它目录同时运行的实例。
    返回被清理的条目描述，供启动时提示。
    """
    pids = load_pids()
    if not pids:
        return []
    stale: list[str] = []
    for key in ("server", "backend", "frontend"):
        pid = pids.get(key)
        if not pid:
            pids.pop(key, None)
            continue
        if not pid_alive(pid):
            pids.pop(key, None)
            stale.append("{}={}".format(key, pid))
    if stale:
        save_pids(pids)
    return stale


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def probe_upstream(base_url: str, timeout: float = 4.0) -> tuple[bool, str]:
    """直连探测日志索引服务（与 server.py 一致，忽略系统代理）。

    只用于启动提示：401 / 403 说明服务可达；异常只返回原因，不抛出。
    """
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        req = urllib.request.Request(base_url, method="GET")
        with opener.open(req, timeout=timeout) as resp:
            return True, "HTTP {}".format(resp.status)
    except urllib.error.HTTPError as e:
        return True, "HTTP {}（需要认证属正常）".format(e.code)
    except urllib.error.URLError as e:
        return False, str(e.reason)
    except Exception as e:
        return False, "{}: {}".format(type(e).__name__, e)


def preflight() -> bool:
    """启动前置检查：配置缺失阻断启动，上游不可达只提示不阻断。"""
    config_file = CONFIG_DIR / "logs.json"
    if not config_file.is_file():
        print("  [!] 未找到 config/logs.json，无法确定日志源")
        print("      Windows:      copy config\\logs.json.example config\\logs.json")
        print("      macOS/Linux:  cp config/logs.json.example config/logs.json")
        return False
    try:
        cfg = json.loads(config_file.read_text(encoding="utf-8-sig"))
    except Exception as e:
        print("  [!] config/logs.json 解析失败: {}".format(e))
        return False
    if not isinstance(cfg, dict):
        print("  [!] config/logs.json 顶层必须是 JSON 对象")
        return False
    base_url = str(cfg.get("baseUrl") or "").strip()
    if not base_url:
        print("  [!] config/logs.json 未配置 baseUrl")
        return False
    envs = cfg.get("environments") or {}
    service_count = sum(len((env or {}).get("services") or []) for env in envs.values())
    print(
        "  [*] 配置: {} 个环境 / {} 个服务，baseUrl={}".format(
            len(envs), service_count, base_url
        )
    )
    if not (HERE / ".env").is_file():
        print("  [*] 未找到 .env；若上游需要 Basic Auth，请配置 LOG_VIEWER_USER / LOG_VIEWER_PASS")

    ok, detail = probe_upstream(base_url)
    if ok:
        print("  [√] 日志索引服务可达: {}（{}）".format(base_url, detail))
    else:
        print("  [!] 日志索引服务暂不可达: {}".format(base_url))
        print("      原因: {}".format(detail))
        print("      → 页面可能无法加载日志，请检查网络 / VPN / baseUrl 后重试")
    return True


def is_own_server(pid: int | None, owners: list[int]) -> bool:
    """端口占用者是否正是本目录上次启动并记录在 pids.json 的进程。"""
    return bool(pid) and pid in owners and pid_alive(pid)


def find_npm() -> str | None:
    candidates = ["npm.cmd", "npm"] if IS_WIN else ["npm"]
    for name in candidates:
        try:
            r = subprocess.run(
                [name, "--version"],
                capture_output=True, check=False,
            )
            if r.returncode == 0:
                return name
        except FileNotFoundError:
            continue
    return None


def spawn(cmd: list[str], cwd: Path, log_path: Path) -> int:
    ensure_runtime()
    log_f = open(log_path, "a", encoding="utf-8", errors="replace")
    log_f.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} START =====\n")
    log_f.flush()

    kwargs = {
        "cwd": str(cwd),
        "stdout": log_f,
        "stderr": subprocess.STDOUT,
        "stdin": subprocess.DEVNULL,
    }
    if IS_WIN:
        kwargs["creationflags"] = (
            subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS  # type: ignore[attr-defined]
        )
        kwargs["close_fds"] = False
    else:
        kwargs["start_new_session"] = True
        kwargs["close_fds"] = True

    proc = subprocess.Popen(cmd, **kwargs)
    return proc.pid


def wait_port(port: int, timeout: float = 15.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_in_use(port):
            return True
        time.sleep(0.3)
    return False


def status_line(name: str, port: int, pid: int | None) -> str:
    running = port_in_use(port)
    alive = pid_alive(pid)
    mark = "● 运行中" if running else "○ 未运行"
    pid_info = f"PID={pid}" if alive else (f"PID={pid}(已失效)" if pid else "无 PID")
    return f"  {name:<10} 端口 {port}  {mark}  ({pid_info})"


def pause():
    if not sys.stdin.isatty():
        return
    try:
        input("\n按回车继续...")
    except EOFError:
        pass


def clear_screen():
    os.system("cls" if IS_WIN else "clear")


def has_dist() -> bool:
    return DIST_INDEX.is_file()


def dist_stale() -> bool:
    """前端源码 / 静态资源 / 依赖清单比 dist 新时视为过期（避免改完代码仍跑旧包）。"""
    if not has_dist():
        return True
    try:
        dist_mtime = max(
            (p.stat().st_mtime for p in DIST_DIR.rglob("*") if p.is_file()),
            default=0.0,
        )
    except OSError:
        return True
    for name in FRONTEND_WATCH_PATHS:
        root = HERE / "frontend" / name
        if not root.exists():
            continue
        if root.is_file():
            if root.stat().st_mtime > dist_mtime:
                return True
            continue
        for p in root.rglob("*"):
            if p.is_file() and p.stat().st_mtime > dist_mtime:
                return True
    return False


def desktop_dir() -> Path:
    home = Path.home()
    for name in ("Desktop", "桌面"):
        p = home / name
        if p.is_dir():
            return p
    # Windows 常见路径
    win = Path(os.environ.get("USERPROFILE", str(home))) / "Desktop"
    return win


# ── actions ──────────────────────────────────────────────

def build_frontend(force: bool = False) -> bool:
    if has_dist() and not force:
        print(f"  [*] 已有构建产物: {DIST_DIR}")
        return True

    npm = find_npm()
    if not npm:
        print("  [!] 未找到 npm，无法构建前端。请先安装 Node.js，或拷贝已有 frontend/dist")
        return False

    frontend_dir = HERE / "frontend"
    if not (frontend_dir / "node_modules").exists():
        print("  [*] npm install ...")
        r = subprocess.run([npm, "install"], cwd=str(frontend_dir))
        if r.returncode != 0:
            print("  [!] npm install 失败")
            return False

    print("  [*] npm run build ...")
    r = subprocess.run([npm, "run", "build"], cwd=str(frontend_dir))
    if r.returncode != 0 or not has_dist():
        print("  [!] 前端构建失败")
        return False
    print(f"  [√] 构建完成 → {DIST_DIR}")
    return True


def start_server(ensure_ui: bool = True, force_build: bool = False) -> bool:
    if not preflight():
        return False

    if ensure_ui:
        if force_build:
            print("  [*] 按要求强制重建前端...")
            if not build_frontend(force=True):
                return False
        elif not has_dist():
            print("  [*] 未找到 frontend/dist，开始构建...")
            if not build_frontend(force=True):
                return False
        elif dist_stale():
            print("  [*] 检测到前端源码新于 dist，重新构建...")
            if not build_frontend(force=True):
                return False

    if port_in_use(APP_PORT):
        pids = load_pids()
        own = pids.get("server") or pids.get("backend")
        owners = port_owner_pids(APP_PORT)
        if is_own_server(own, owners):
            print(f"  [*] 本目录服务已在端口 {APP_PORT} 运行")
            print(f"      {format_desc(own, pids.get('cwd', ''))}")
            return True
        print(f"  [!] 端口 {APP_PORT} 已被其它进程占用，本目录的服务没有启动：")
        if owners:
            for owner in owners:
                hint = pids.get("cwd", "") if owner == own else ""
                print(f"      {format_desc(owner, hint)}")
        else:
            print(f"      (未能识别占用进程，可用 netstat -ano | findstr :{APP_PORT} 排查)")
        print(f"  → 先停止占用进程，或换端口：python manage.py start --port {APP_PORT + 1}")
        return False

    py = sys.executable
    trimmed = trim_server_log()
    if trimmed:
        print(f"  [*] {trimmed}")
    print(f"  [+] 启动单进程服务 (port {APP_PORT})...")
    pid = spawn([py, "server.py", "--port", str(APP_PORT)], HERE, SERVER_LOG)
    pids = load_pids()
    pids["server"] = pid
    # 兼容旧字段
    pids.pop("backend", None)
    pids["port"] = APP_PORT
    pids["cwd"] = str(HERE)
    save_pids(pids)

    if wait_port(APP_PORT, 8):
        print(f"  [√] 已启动  PID={pid}  目录={HERE}")
        print(f"  [√] 访问地址: {APP_URL}")
        print(f"  [*] 运行日志: {SERVER_LOG}")
        return True
    print(f"  [!] 启动超时，请查看日志: {SERVER_LOG}")
    return False


def start_dev_ui() -> bool:
    """仅开发：Vite 热更新（仍走 /api 代理到 8090）。"""
    if port_in_use(DEV_UI_PORT):
        pids = load_pids()
        own = pids.get("frontend")
        owners = port_owner_pids(DEV_UI_PORT)
        if own and own in owners:
            print(f"  [*] 本目录 Vite 已在端口 {DEV_UI_PORT} 运行")
            print(f"      {format_desc(own, pids.get('cwd', ''))}")
            return True
        print(f"  [!] 端口 {DEV_UI_PORT} 已被其它进程占用，Vite 未启动：")
        if owners:
            for owner in owners:
                print(f"      {format_desc(owner)}")
        else:
            print(f"      (未能识别占用进程，可用 netstat -ano | findstr :{DEV_UI_PORT} 排查)")
        return False

    npm = find_npm()
    if not npm:
        print("  [!] 未找到 npm")
        return False

    frontend_dir = HERE / "frontend"
    if not (frontend_dir / "node_modules").exists():
        print("  [*] npm install ...")
        r = subprocess.run([npm, "install"], cwd=str(frontend_dir))
        if r.returncode != 0:
            return False

    print(f"  [+] 启动 Vite 开发服 (port {DEV_UI_PORT})...")
    pid = spawn([npm, "run", "dev"], frontend_dir, FRONTEND_LOG)
    pids = load_pids()
    pids["frontend"] = pid
    save_pids(pids)

    if wait_port(DEV_UI_PORT, 20):
        print(f"  [√] Vite 已启动  {DEV_UI_URL}")
        return True
    print(f"  [!] Vite 启动超时: {FRONTEND_LOG}")
    return False


def start_all(force_build: bool = False):
    """默认：单进程（Python 托管 dist）。"""
    print("\n启动服务（单进程）...")
    ok = start_server(ensure_ui=True, force_build=force_build)
    print()
    if ok:
        print(f"  浏览器打开: {APP_URL}")
        print("  无需 Nginx；前端已由 server.py 托管。")
    else:
        print("  [!] 启动失败，请按上方提示处理后重试。")
    pause()


def start_dev():
    print("\n启动开发模式（后端 + Vite）...")
    ok_s = start_server(ensure_ui=False)
    ok_f = start_dev_ui()
    print()
    if ok_s and ok_f:
        print(f"  开发地址: {DEV_UI_URL}")
        print(f"  API 地址: {APP_URL}")
    else:
        print("  [!] 开发模式未完全启动，请按上方提示处理后重试。")
    pause()


def stop_own_services() -> set[int]:
    """结束本目录启动的服务；端口兜底只处理确认属于本服务的进程。

    关闭前先取进程描述（PID / 目录 / 命令），因为进程结束后就查不到了。
    """
    pids = load_pids()
    cwd_hint = pids.get("cwd", "")
    stopped: set[int] = set()

    # 1) 只结束本目录记录在案的进程
    for name, key in (
        ("单进程服务", "server"),
        ("单进程服务", "backend"),  # 兼容旧 PID
        ("Vite", "frontend"),
    ):
        pid = pids.get(key)
        if not pid_alive(pid):
            continue
        desc = format_desc(pid, cwd_hint)
        if kill_pid(pid):
            print(f"  [√] 已关闭 {name}:")
            print(f"      {desc}")
            stopped.add(pid)
        else:
            print(f"  [!] 关闭 {name} 失败（可能权限不足）:")
            print(f"      {desc}")

    # 2) 端口兜底：仅结束确认是本服务（server.py / vite）的进程，其它只提示
    for name, port, marks in (
        ("单进程服务", APP_PORT, SERVER_MARKS),
        ("Vite", DEV_UI_PORT, VITE_MARKS),
    ):
        for pid in port_owner_pids(port):
            if pid in stopped:
                continue
            cmd = command_line(pid)
            low = cmd.lower()
            if cmd and any(mark in low for mark in marks):
                desc = format_desc(pid)
                if kill_pid(pid):
                    print(f"  [√] 已关闭 {name}（端口 {port}）:")
                    print(f"      {desc}")
                    stopped.add(pid)
                else:
                    print(f"  [!] 关闭 {name}（端口 {port}）失败（可能权限不足）:")
                    print(f"      {desc}")
            else:
                print(f"  [!] 端口 {port} 被其它进程占用，未自动关闭:")
                print(f"      {format_desc(pid)}")

    save_pids({})
    return stopped


def stop_all():
    print("\n关闭服务...")
    stop_own_services()
    pause()


def show_status():
    print("\n服务状态:")
    pids = load_pids()
    sid = pids.get("server") or pids.get("backend")
    print(status_line("单进程服务", APP_PORT, sid))

    # 端口在听时说明归属：是本目录启动的，还是被外部进程占用
    if port_in_use(APP_PORT):
        owners = port_owner_pids(APP_PORT)
        if is_own_server(sid, owners):
            print(f"      归属: 本目录（{HERE}）")
        else:
            print("      归属: 外部进程占用了该端口，本目录服务未运行")
            own_cwd = pids.get("cwd", "")
            for owner in owners:
                hint = own_cwd if owner == sid else ""
                print(f"      {format_desc(owner, hint)}")

    print(status_line("Vite(开发)", DEV_UI_PORT, pids.get("frontend")))
    print(f"\n  日常访问: {APP_URL}")
    print(f"  前端 dist: {'已构建' if has_dist() else '未构建（请 python manage.py build）'}")
    pause()


def restart_all(force_build: bool = False):
    print("\n重启服务...")
    stop_own_services()
    time.sleep(0.8)
    start_server(ensure_ui=True, force_build=force_build)
    print(f"\n  访问地址: {APP_URL}")
    pause()


def read_text_auto(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8", "gbk", "cp936"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def resolve_server_log() -> Path:
    if SERVER_LOG.exists():
        return SERVER_LOG
    old = RUNTIME / "backend.log"
    return old if old.exists() else SERVER_LOG


def tail_file(path: Path, lines: int = 40, follow: bool = False):
    if not path.exists():
        print(f"  [!] 日志文件不存在: {path}")
        pause()
        return

    print(f"\n── {path.name} (最近 {lines} 行) ──")
    try:
        content = read_text_auto(path).splitlines()
        for line in content[-lines:]:
            print(line)
    except Exception as e:
        print(f"  [!] 读取失败: {e}")
        pause()
        return

    if not follow:
        pause()
        return

    print("\n── 实时跟踪中，Ctrl+C 停止 ──")
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            while True:
                chunk = f.readline()
                if chunk:
                    for enc in ("utf-8", "gbk"):
                        try:
                            print(chunk.decode(enc), end="")
                            break
                        except UnicodeDecodeError:
                            continue
                    else:
                        print(chunk.decode("utf-8", errors="replace"), end="")
                else:
                    time.sleep(0.3)
    except KeyboardInterrupt:
        print("\n已停止跟踪")
        pause()


def view_log_menu():
    while True:
        print("""
查看日志:
  1. 服务日志 (最近)      ← 日常单进程看这个
  2. 服务日志 (实时)
  3. Vite 开发日志 (最近)  ← 仅 manage.py dev 时有用
  0. 返回
""")
        choice = input("请选择: ").strip()
        if choice == "1":
            tail_file(resolve_server_log(), follow=False)
        elif choice == "2":
            tail_file(resolve_server_log(), follow=True)
        elif choice == "3":
            if not FRONTEND_LOG.exists():
                print("  [*] 尚无 Vite 日志（日常单进程不会写这个文件）")
                pause()
            else:
                tail_file(FRONTEND_LOG, follow=False)
        elif choice == "0":
            return
        else:
            print("  无效选项")


def open_browser():
    url = APP_URL if port_in_use(APP_PORT) else (DEV_UI_URL if port_in_use(DEV_UI_PORT) else None)
    if not url:
        print("\n  [!] 服务未运行，无法打开")
        pause()
        return
    print(f"\n  打开 {url}")
    webbrowser.open(url)
    pause()


def install_desktop_shortcut():
    """在桌面创建指向项目内 Log-Viewer.bat 的快捷方式。"""
    bat = HERE / "Log-Viewer.bat"
    if not bat.is_file():
        print(f"\n  [!] 未找到 {bat}")
        pause()
        return

    desk = desktop_dir()
    desk.mkdir(parents=True, exist_ok=True)
    lnk = desk / "Log Viewer.lnk"

    ps = f'''
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{lnk}")
$Shortcut.TargetPath = "{bat}"
$Shortcut.WorkingDirectory = "{HERE}"
$Shortcut.WindowStyle = 1
$Shortcut.Description = "Log Viewer"
$Shortcut.Save()
'''
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0 or not lnk.is_file():
        print(f"\n  [!] 创建快捷方式失败: {r.stderr or r.stdout or 'unknown'}")
        print(f"  可手动把快捷方式指向: {bat}")
        pause()
        return

    print(f"\n  [√] 桌面快捷方式: {lnk}")
    print(f"  [√] 目标脚本: {bat}")
    pause()


# ── menu ─────────────────────────────────────────────────

MENU = f"""
============================================
  Log Viewer  v{APP_VERSION}  管理工具
============================================
  1. 启动（单进程，自动构建前端）
  2. 关闭
  3. 重启（自动构建前端）
  4. 查看状态
  5. 查看运行日志
  6. 打开浏览器
  7. 安装桌面快捷方式
  8. 开发模式（后端 + Vite）
  0. 退出
============================================"""


def parse_args(argv: list[str]) -> tuple[int | None, bool, list[str]]:
    """解析 --port / -p（也支持 --port=8091）与 --rebuild，其余参数原样返回。"""
    port = None
    rebuild = False
    rest: list[str] = []
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg in ("--port", "-p") and i + 1 < len(argv):
            try:
                port = int(argv[i + 1])
            except ValueError:
                pass
            i += 2
            continue
        if arg.startswith("--port="):
            try:
                port = int(arg.split("=", 1)[1])
            except ValueError:
                pass
            i += 1
            continue
        if arg == "--rebuild":
            rebuild = True
            i += 1
            continue
        rest.append(arg)
        i += 1
    return port, rebuild, rest


def main():
    # --port 覆盖模块级常量，供 start / stop / status / APP_URL 统一使用
    global APP_PORT, APP_URL
    port_override, force_rebuild, rest = parse_args(sys.argv[1:])
    if port_override:
        APP_PORT = port_override
        APP_URL = f"http://localhost:{APP_PORT}"

    # 打开即清理上次异常退出留下的失效记录；不结束任何仍存活的进程
    stale = cleanup_stale_pids()

    if rest:
        cmd = rest[0].lower()
        if stale:
            print("  [*] 已清理失效的进程记录: " + "，".join(stale))
        actions = {
            "start": lambda: start_all(force_build=force_rebuild),
            "stop": stop_all,
            "status": show_status,
            "restart": lambda: restart_all(force_build=force_rebuild),
            "logs": view_log_menu,
            "build": lambda: (print("\n构建前端..."), build_frontend(force=True), pause()),
            "dev": start_dev,
            "open": open_browser,
            "shortcut": install_desktop_shortcut,
            "desktop": install_desktop_shortcut,
        }
        fn = actions.get(cmd)
        if fn:
            fn()
            return
        print(f"未知命令: {cmd}")
        print("可用: start | stop | status | restart | build | dev | open | shortcut | logs")
        sys.exit(1)

    notice_shown = False
    while True:
        clear_screen()
        print(MENU)
        s = "●" if port_in_use(APP_PORT) else "○"
        d = "●" if port_in_use(DEV_UI_PORT) else "○"
        dist = "有" if has_dist() else "无"
        print(f"  当前: 服务{s}  Vite{d}  dist={dist}  → {APP_URL}")
        if stale and not notice_shown:
            print("  [*] 已清理失效的进程记录: " + "，".join(stale))
            notice_shown = True
        print()
        choice = input("请输入选项: ").strip()

        if choice == "1":
            start_all()
        elif choice == "2":
            stop_all()
        elif choice == "3":
            restart_all()
        elif choice == "4":
            show_status()
        elif choice == "5":
            view_log_menu()
        elif choice == "6":
            open_browser()
        elif choice == "7":
            install_desktop_shortcut()
        elif choice == "8":
            start_dev()
        elif choice == "0":
            print("再见!")
            break
        else:
            print("  无效选项")
            time.sleep(0.8)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n已退出")
