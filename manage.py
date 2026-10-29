#!/usr/bin/env python3
"""Log Viewer - 交互式管理工具（默认单进程托管前端）"""
from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNTIME = HERE / ".runtime"
PID_FILE = RUNTIME / "pids.json"
SERVER_LOG = RUNTIME / "server.log"
FRONTEND_LOG = RUNTIME / "frontend.log"  # 仅开发模式
DIST_DIR = HERE / "frontend" / "dist"
DIST_INDEX = DIST_DIR / "index.html"

APP_PORT = 8090
DEV_UI_PORT = 5173
APP_URL = f"http://localhost:{APP_PORT}"
DEV_UI_URL = f"http://localhost:{DEV_UI_PORT}"

IS_WIN = os.name == "nt"


def read_version() -> str:
    try:
        return (HERE / "VERSION").read_text(encoding="utf-8").strip() or "1.0.1"
    except Exception:
        return "1.0.1"


APP_VERSION = read_version()


# ── helpers ──────────────────────────────────────────────

def ensure_runtime():
    RUNTIME.mkdir(exist_ok=True)


def load_pids() -> dict:
    if not PID_FILE.exists():
        return {}
    try:
        return json.loads(PID_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_pids(pids: dict):
    ensure_runtime()
    PID_FILE.write_text(json.dumps(pids, indent=2), encoding="utf-8")


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        if IS_WIN:
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True, text=True, encoding="utf-8", errors="ignore",
            )
            return str(pid) in out.stdout
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def kill_pid(pid: int) -> bool:
    try:
        if IS_WIN:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True, check=False,
            )
        else:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        return True
    except Exception:
        return False


def kill_port(port: int) -> list[int]:
    killed = []
    if IS_WIN:
        try:
            out = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True, encoding="utf-8", errors="ignore",
            )
            for line in out.stdout.splitlines():
                if f":{port}" not in line or "LISTENING" not in line:
                    continue
                parts = line.split()
                if not parts:
                    continue
                pid = int(parts[-1])
                if pid > 0 and kill_pid(pid):
                    killed.append(pid)
        except Exception:
            pass
    else:
        try:
            out = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True, text=True,
            )
            for pid_str in out.stdout.split():
                pid = int(pid_str)
                if kill_pid(pid):
                    killed.append(pid)
        except Exception:
            pass
    return killed


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
    """源码或配置比 dist 新时视为过期（避免改完代码仍跑旧包）。"""
    if not has_dist():
        return True
    try:
        dist_mtime = max(
            (p.stat().st_mtime for p in DIST_DIR.rglob("*") if p.is_file()),
            default=0.0,
        )
    except OSError:
        return True
    watch_roots = [
        HERE / "frontend" / "src",
        HERE / "frontend" / "index.html",
        HERE / "frontend" / "vite.config.js",
        HERE / "frontend" / "package.json",
    ]
    for root in watch_roots:
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


def start_server(ensure_ui: bool = True) -> bool:
    if ensure_ui:
        if not has_dist():
            print("  [*] 未找到 frontend/dist，开始构建...")
            if not build_frontend(force=True):
                return False
        elif dist_stale():
            print("  [*] 检测到前端源码新于 dist，重新构建...")
            if not build_frontend(force=True):
                return False

    if port_in_use(APP_PORT):
        print(f"  [*] 服务已在端口 {APP_PORT} 运行，跳过")
        return True

    py = sys.executable
    print(f"  [+] 启动单进程服务 (port {APP_PORT})...")
    pid = spawn([py, "server.py", "--port", str(APP_PORT)], HERE, SERVER_LOG)
    pids = load_pids()
    pids["server"] = pid
    # 兼容旧字段
    pids.pop("backend", None)
    save_pids(pids)

    if wait_port(APP_PORT, 8):
        print(f"  [√] 已启动  PID={pid}")
        print(f"  [√] 访问地址: {APP_URL}")
        return True
    print(f"  [!] 启动超时，请查看日志: {SERVER_LOG}")
    return False


def start_dev_ui() -> bool:
    """仅开发：Vite 热更新（仍走 /api 代理到 8090）。"""
    if port_in_use(DEV_UI_PORT):
        print(f"  [*] Vite 已在端口 {DEV_UI_PORT} 运行，跳过")
        return True

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


def start_all():
    """默认：单进程（Python 托管 dist）。"""
    print("\n启动服务（单进程）...")
    ok = start_server(ensure_ui=True)
    print()
    if ok:
        print(f"  浏览器打开: {APP_URL}")
        print("  无需 Nginx；前端已由 server.py 托管。")
    pause()


def start_dev():
    print("\n启动开发模式（后端 + Vite）...")
    ok_s = start_server(ensure_ui=False)
    ok_f = start_dev_ui()
    print()
    if ok_s and ok_f:
        print(f"  开发地址: {DEV_UI_URL}")
        print(f"  API 地址: {APP_URL}")
    pause()


def stop_all():
    print("\n关闭服务...")
    pids = load_pids()
    killed_ports = set()

    for name, port, key in (
        ("单进程服务", APP_PORT, "server"),
        ("单进程服务", APP_PORT, "backend"),  # 兼容旧 PID
        ("Vite", DEV_UI_PORT, "frontend"),
    ):
        pid = pids.get(key)
        killed = []
        if pid_alive(pid):
            if kill_pid(pid):
                killed.append(pid)
        if port not in killed_ports:
            killed_ports.add(port)
            for p in kill_port(port):
                if p not in killed:
                    killed.append(p)
        if killed:
            print(f"  [√] 已关闭 {name}: {killed}")

    save_pids({})
    pause()


def show_status():
    print("\n服务状态:")
    pids = load_pids()
    sid = pids.get("server") or pids.get("backend")
    print(status_line("单进程服务", APP_PORT, sid))
    print(status_line("Vite(开发)", DEV_UI_PORT, pids.get("frontend")))
    print(f"\n  日常访问: {APP_URL}")
    print(f"  前端 dist: {'已构建' if has_dist() else '未构建（请 python manage.py build）'}")
    pause()


def restart_all():
    print("\n重启服务...")
    pids = load_pids()
    for key, port in (("server", APP_PORT), ("backend", APP_PORT), ("frontend", DEV_UI_PORT)):
        pid = pids.get(key)
        if pid_alive(pid):
            kill_pid(pid)
        kill_port(port)
    save_pids({})
    time.sleep(0.8)
    start_server(ensure_ui=True)
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
  1. 启动（单进程，推荐）
  2. 关闭
  3. 重启
  4. 查看状态
  5. 查看运行日志
  6. 打开浏览器
  7. 构建前端 (npm run build)
  8. 安装桌面快捷方式
  9. 开发模式（后端 + Vite）
  0. 退出
============================================"""


def main():
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        actions = {
            "start": start_all,
            "stop": stop_all,
            "status": show_status,
            "restart": restart_all,
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

    while True:
        clear_screen()
        print(MENU)
        s = "●" if port_in_use(APP_PORT) else "○"
        d = "●" if port_in_use(DEV_UI_PORT) else "○"
        dist = "有" if has_dist() else "无"
        print(f"  当前: 服务{s}  Vite{d}  dist={dist}  → {APP_URL}")
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
            print("\n构建前端...")
            build_frontend(force=True)
            pause()
        elif choice == "8":
            install_desktop_shortcut()
        elif choice == "9":
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
