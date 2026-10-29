#!/usr/bin/env python3
"""简易 .env 加载（无第三方依赖）。已存在的环境变量不会被覆盖。"""
from __future__ import annotations

import os
from pathlib import Path


def load_env(path: str | Path | None = None, *, override: bool = False) -> Path | None:
    """
    读取 KEY=VALUE 行写入 os.environ。
    - 支持 # 注释、空行、可选双引号/单引号
    - 默认不覆盖进程里已有变量（override=False）
    返回实际加载的路径；文件不存在则返回 None。
    """
    root = Path(__file__).resolve().parent
    env_path = Path(path) if path else root / '.env'
    if not env_path.is_file():
        return None

    try:
        text = env_path.read_text(encoding='utf-8')
    except Exception:
        return None

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('export '):
            line = line[7:].strip()
        if '=' not in line:
            continue
        key, _, val = line.partition('=')
        key = key.strip()
        if not key:
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        if not override and key in os.environ:
            continue
        os.environ[key] = val
    return env_path
