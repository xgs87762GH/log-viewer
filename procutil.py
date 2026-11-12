"""进程与端口查询工具。

职责单一：回答「谁占了端口」「进程在哪、在跑什么」，并支持精确结束进程。
不依赖项目其它模块，可独立复用与测试。

可移植性约定：
- Windows 依赖 tasklist / taskkill / netstat / PowerShell（系统自带）；
- Linux/macOS 依赖 ps / lsof / os.killpg。
任一命令不可用时返回空结果或 False，绝不抛出异常。
"""
from __future__ import annotations

import csv
import io
import os
import re
import shlex
import signal
import subprocess
from pathlib import Path

IS_WIN = os.name == "nt"

# netstat 监听行的 PID 位于行尾，避免 8090 误匹配 80900
_NETSTAT_PID = re.compile(r"LISTENING\s+(\d+)\s*$", re.I)

# 进程结束后命令行不可再查，单次命令内缓存以减少 PowerShell 调用
_cmd_cache: dict[int, str] = {}


def clear_command_cache(pid: int | None = None) -> None:
    """进程结束后清理缓存；不传 pid 时清空全部。"""
    if pid is None:
        _cmd_cache.clear()
    else:
        _cmd_cache.pop(pid, None)


def pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        if IS_WIN:
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, encoding="utf-8", errors="ignore",
            )
            # CSV 第二列是 PID；精确比对，避免 5428 与 54288 互相误判
            for row in csv.reader(io.StringIO(out.stdout)):
                if len(row) >= 2 and row[1].strip() == str(pid):
                    return True
            return False
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def kill_pid(pid: int) -> bool:
    """结束进程及其子进程；返回是否确实发出且被系统接受。"""
    if not pid_alive(pid):
        return False
    try:
        if IS_WIN:
            result = subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True, check=False,
            )
            ok = result.returncode == 0
        else:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
            ok = True
    except Exception:
        ok = False
    if ok:
        clear_command_cache(pid)
    return ok


def port_owner_pids(port: int) -> list[int]:
    """只查询占用端口的 PID，不动进程。"""
    found: list[int] = []
    if IS_WIN:
        try:
            out = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True, encoding="utf-8", errors="ignore",
            )
            for line in out.stdout.splitlines():
                if "LISTENING" not in line or not re.search(rf":{port}\s", line):
                    continue
                match = _NETSTAT_PID.search(line)
                if not match:
                    continue
                pid = int(match.group(1))
                if pid > 0 and pid not in found:
                    found.append(pid)
        except Exception:
            pass
    else:
        try:
            out = subprocess.run(["lsof", "-ti", f":{port}"], capture_output=True, text=True)
            for pid_str in out.stdout.split():
                try:
                    pid = int(pid_str)
                except ValueError:
                    continue
                if pid not in found:
                    found.append(pid)
        except Exception:
            pass
    return found


def command_line(pid: int) -> str:
    """进程命令行；取不到返回空串。同一进程只查一次。"""
    if pid in _cmd_cache:
        return _cmd_cache[pid]
    cmd = ""
    try:
        if IS_WIN:
            out = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 f"(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine"],
                capture_output=True, text=True, encoding="utf-8", errors="ignore",
            )
            cmd = (out.stdout or "").strip()
        else:
            out = subprocess.run(
                ["ps", "-o", "args=", "-p", str(pid)],
                capture_output=True, text=True,
            )
            cmd = (out.stdout or "").strip()
    except Exception:
        cmd = ""
    _cmd_cache[pid] = cmd
    return cmd


def _script_dir(cmd: str) -> str:
    """从命令行里取脚本绝对路径的父目录；相对路径（如 `python server.py`）返回空串。"""
    if not cmd:
        return ""
    try:
        tokens = shlex.split(cmd, posix=not IS_WIN)
    except ValueError:
        tokens = cmd.split()
    for token in tokens:
        token = token.strip('"').strip("'")
        if not token.lower().endswith(".py"):
            continue
        path = Path(token)
        if path.is_absolute() and path.parent.is_dir():
            return str(path.parent)
    return ""


def working_dir(pid: int, cwd_hint: str = "") -> str:
    """进程所属目录。

    依次尝试：调用方已知目录（pids.json 记录）→ 命令行里脚本的绝对路径 →
    Linux 的 /proc/<pid>/cwd。Windows 下用相对路径启动的外部进程无法反推，返回空串。
    """
    if cwd_hint:
        return cwd_hint
    script_dir = _script_dir(command_line(pid))
    if script_dir:
        return script_dir
    if not IS_WIN:
        try:
            return str(Path(os.readlink(f"/proc/{pid}/cwd")))
        except OSError:
            return ""
    return ""


def format_desc(pid: int, cwd_hint: str = "", max_cmd: int = 140) -> str:
    """单行描述：PID + 目录 + 命令行，用于启动/重启/停止时的日志。

    不查询存活状态，避免与调用方的 pid_alive 重复探测。
    """
    cwd = working_dir(pid, cwd_hint) or "(未知，命令行未含绝对路径)"
    cmd = command_line(pid) or "(无法读取)"
    if len(cmd) > max_cmd:
        cmd = cmd[:max_cmd] + "…"
    return f"PID={pid}  目录={cwd}  命令={cmd}"
