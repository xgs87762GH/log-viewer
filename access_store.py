#!/usr/bin/env python3
"""访问统计存储（SQLite）—— 会话在线 + 访问事件。"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, 'data')
DB_PATH = os.path.join(DATA_DIR, 'access.db')
ACCESS_CFG = os.path.join(HERE, 'config', 'access.json')

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_cfg_cache: dict[str, Any] | None = None
_cfg_mtime = 0.0


def _ensure_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)


def load_access_config() -> dict[str, Any]:
    global _cfg_cache, _cfg_mtime
    defaults = {
        'enabled': True,
        'heartbeatSec': 25,
        'onlineTimeoutSec': 90,
        'retainDays': 30,
        'statsAllowIps': ['127.0.0.1', '::1'],
    }
    try:
        mtime = os.path.getmtime(ACCESS_CFG)
        if _cfg_cache is not None and mtime == _cfg_mtime:
            return _cfg_cache
        with open(ACCESS_CFG, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        cfg = {**defaults, **raw}
        if not isinstance(cfg.get('statsAllowIps'), list):
            cfg['statsAllowIps'] = defaults['statsAllowIps']
        _cfg_cache = cfg
        _cfg_mtime = mtime
        return cfg
    except Exception:
        return defaults


def get_conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            _ensure_dirs()
            _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute('PRAGMA journal_mode=WAL')
            _init_schema(_conn)
        return _conn


def _init_schema(conn: sqlite3.Connection):
    conn.executescript(
        '''
        CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY,
          ip TEXT NOT NULL,
          ua TEXT,
          started_at INTEGER NOT NULL,
          last_seen INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          sid TEXT,
          ip TEXT NOT NULL,
          action TEXT NOT NULL,
          env TEXT,
          module TEXT,
          app TEXT,
          level TEXT,
          detail TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
        CREATE INDEX IF NOT EXISTS idx_sessions_last ON sessions(last_seen DESC);
        '''
    )
    conn.commit()


def purge_old(retain_days: int | None = None):
    cfg = load_access_config()
    days = retain_days if retain_days is not None else int(cfg.get('retainDays') or 30)
    cutoff = int(time.time()) - max(1, days) * 86400
    with _lock:
        conn = get_conn()
        conn.execute('DELETE FROM events WHERE ts < ?', (cutoff,))
        conn.execute('DELETE FROM sessions WHERE last_seen < ?', (cutoff,))
        conn.commit()


def client_ip_allowed(ip: str) -> bool:
    cfg = load_access_config()
    allow = cfg.get('statsAllowIps') or []
    if not allow:
        return False
    ip = (ip or '').strip()
    # IPv4-mapped IPv6
    if ip.startswith('::ffff:'):
        ip = ip[7:]
    return ip in allow or ip in {'127.0.0.1', '::1'}


def hello(ip: str, ua: str, sid: str | None = None) -> dict[str, Any]:
    now = int(time.time())
    with _lock:
        conn = get_conn()
        if sid:
            row = conn.execute('SELECT sid FROM sessions WHERE sid = ?', (sid,)).fetchone()
            if row:
                conn.execute(
                    'UPDATE sessions SET ip = ?, ua = ?, last_seen = ? WHERE sid = ?',
                    (ip, ua or '', now, sid),
                )
                conn.commit()
                return {'sid': sid, 'onlineCount': online_count()}
        sid = str(uuid.uuid4())
        conn.execute(
            'INSERT INTO sessions (sid, ip, ua, started_at, last_seen) VALUES (?, ?, ?, ?, ?)',
            (sid, ip, ua or '', now, now),
        )
        conn.commit()
        return {'sid': sid, 'onlineCount': online_count()}


def ping(sid: str, ip: str) -> dict[str, Any]:
    now = int(time.time())
    with _lock:
        conn = get_conn()
        cur = conn.execute(
            'UPDATE sessions SET last_seen = ?, ip = ? WHERE sid = ?',
            (now, ip, sid),
        )
        conn.commit()
        if cur.rowcount == 0:
            return hello(ip, '', sid=None)
        return {'ok': True, 'onlineCount': online_count()}


def track_event(
    *,
    sid: str | None,
    ip: str,
    action: str,
    env: str = '',
    module: str = '',
    app: str = '',
    level: str = '',
    detail: str = '',
) -> dict[str, Any]:
    now = int(time.time())
    action = (action or 'unknown')[:64]
    with _lock:
        conn = get_conn()
        if sid:
            conn.execute(
                'UPDATE sessions SET last_seen = ?, ip = ? WHERE sid = ?',
                (now, ip, sid),
            )
        conn.execute(
            '''INSERT INTO events (ts, sid, ip, action, env, module, app, level, detail)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                now,
                sid or '',
                ip,
                action,
                (env or '')[:32],
                (module or '')[:128],
                (app or '')[:128],
                (level or '')[:16],
                (detail or '')[:256],
            ),
        )
        conn.commit()
    return {'ok': True}


def _prune_offline():
    cfg = load_access_config()
    timeout = int(cfg.get('onlineTimeoutSec') or 90)
    cutoff = int(time.time()) - timeout
    conn = get_conn()
    conn.execute('DELETE FROM sessions WHERE last_seen < ?', (cutoff,))
    conn.commit()


def online_count() -> int:
    with _lock:
        _prune_offline()
        conn = get_conn()
        row = conn.execute('SELECT COUNT(*) AS c FROM sessions').fetchone()
        return int(row['c'] if row else 0)


def list_online() -> list[dict[str, Any]]:
    with _lock:
        _prune_offline()
        conn = get_conn()
        rows = conn.execute(
            '''SELECT sid, ip, ua, started_at, last_seen
               FROM sessions ORDER BY last_seen DESC'''
        ).fetchall()
    return [dict(r) for r in rows]


def list_recent(limit: int = 100) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit or 100), 500))
    with _lock:
        conn = get_conn()
        rows = conn.execute(
            '''SELECT id, ts, sid, ip, action, env, module, app, level, detail
               FROM events ORDER BY id DESC LIMIT ?''',
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def stats_summary() -> dict[str, Any]:
    with _lock:
        _prune_offline()
        conn = get_conn()
        online = conn.execute('SELECT COUNT(*) AS c FROM sessions').fetchone()['c']
        today0 = int(time.time()) - (int(time.time()) % 86400)
        # 用本地日界近似：保留简单 today 计数（UTC 日切可接受；UI 显示「今日」）
        day_start = int(time.time()) - 86400  # 近 24h
        recent24 = conn.execute(
            'SELECT COUNT(*) AS c FROM events WHERE ts >= ?', (day_start,)
        ).fetchone()['c']
        total = conn.execute('SELECT COUNT(*) AS c FROM events').fetchone()['c']
    return {
        'onlineCount': int(online),
        'events24h': int(recent24),
        'eventsTotal': int(total),
        'dayStartHint': today0,
    }
