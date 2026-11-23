"""日志尾部磁盘缓存 —— 按需写入 + 按字节 LRU 淘汰。

职责单一：给定 key（host|app|file|tail）查询本地缓存、写入落盘、超限淘汰。
不依赖 server.py，配置从 config/cache.json 读取，可独立测试。

设计约束：
- 只缓存用户实际请求过的尾部片段，不做预取，不额外增加上游请求；
- 只缓存归档文件（文件名含 `_YYYY-MM-DD_N`），活跃文件持续增长，缓存必然过期；
- 写入先落 .part 再原子替换，失败只返回 False，绝不影响转发；
- 淘汰按字节总量而非文件个数，删到上限的 90% 水位，避免频繁触发。
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ROOT = HERE / "data" / "logcache"
DEFAULT_DB = HERE / "data" / "cache.db"
CONFIG_FILE = HERE / "config" / "cache.json"

DEFAULTS = {
    "enabled": True,
    "maxGB": 8,
    "maxFileMB": 300,
    "ttlDays": 30,
}

CONFIG_LIMITS = {
    "maxGB": (0.1, 200),
    "maxFileMB": (10, 4096),
    "ttlDays": (0, 3650),
}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
  key          TEXT PRIMARY KEY,
  path         TEXT NOT NULL,
  size         INTEGER NOT NULL,
  total_size   INTEGER DEFAULT 0,
  content_type TEXT DEFAULT '',
  truncated    INTEGER DEFAULT 0,
  fetched_at   INTEGER NOT NULL,
  last_access  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_access ON entries(last_access);
"""

# 表结构升级：旧库缺列时补上，避免必须清缓存
_MIGRATIONS = (
    ("total_size", "ALTER TABLE entries ADD COLUMN total_size INTEGER DEFAULT 0"),
    ("content_type", "ALTER TABLE entries ADD COLUMN content_type TEXT DEFAULT ''"),
    ("truncated", "ALTER TABLE entries ADD COLUMN truncated INTEGER DEFAULT 0"),
)


def _now_ms() -> int:
    # 毫秒精度：同一秒内写入多个条目也能正确排序 LRU
    return int(time.time() * 1000)


def _clamp(value, low, high, fallback):
    try:
        num = float(value)
    except (TypeError, ValueError):
        return fallback
    if num != num:  # NaN
        return fallback
    return min(high, max(low, num))


def load_config(path: Path = CONFIG_FILE) -> dict:
    """读取缓存配置；文件缺失或损坏时回落到默认值，数值一律夹紧。"""
    raw = {}
    try:
        with open(path, encoding="utf-8-sig") as f:
            data = json.load(f)
        if isinstance(data, dict):
            raw = data
    except Exception:
        raw = {}
    return {
        "enabled": raw.get("enabled", DEFAULTS["enabled"]) is not False,
        "maxGB": _clamp(raw.get("maxGB"), *CONFIG_LIMITS["maxGB"], DEFAULTS["maxGB"]),
        "maxFileMB": _clamp(raw.get("maxFileMB"), *CONFIG_LIMITS["maxFileMB"], DEFAULTS["maxFileMB"]),
        "ttlDays": _clamp(raw.get("ttlDays"), *CONFIG_LIMITS["ttlDays"], DEFAULTS["ttlDays"]),
    }


def _safe_segment(text: str) -> str:
    """把 host / app / 文件名压成安全的单层路径片段。"""
    name = str(text or "").strip().replace("\\", "_").replace("/", "_")
    name = name.replace("..", "_").replace(":", "_")
    return name[:120] or "_"


class LogCache:
    def __init__(self, root: Path | None = None, db_path: Path | None = None, config: dict | None = None):
        self.root = Path(root) if root else DEFAULT_ROOT
        self.db_path = Path(db_path) if db_path else DEFAULT_DB
        self.config = dict(DEFAULTS)
        self.config.update(config or {})
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    # ── 基础 ────────────────────────────────────────────────
    @property
    def enabled(self) -> bool:
        return self.config.get("enabled") is not False

    @property
    def max_bytes(self) -> int:
        return int(float(self.config.get("maxGB", DEFAULTS["maxGB"])) * 1024 ** 3)

    @property
    def max_file_bytes(self) -> int:
        return int(float(self.config.get("maxFileMB", DEFAULTS["maxFileMB"])) * 1024 ** 2)

    def key(self, host: str, app: str, filename: str, tail_bytes: int) -> str:
        return "{}|{}|{}|{}".format(host, app, filename, int(tail_bytes))

    def path_for(self, key: str) -> Path:
        parts = key.split("|")
        if len(parts) < 4:
            parts = parts + ["_"] * (4 - len(parts))
        host, app, filename, tail = parts[0], parts[1], "|".join(parts[2:-1]), parts[-1]
        return self.root / _safe_segment(host) / _safe_segment(app) / "{}.tail{}".format(
            _safe_segment(filename), tail
        )

    def _conn(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=5, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(_SCHEMA)
        cols = {row[1] for row in conn.execute("PRAGMA table_info(entries)")}
        for name, ddl in _MIGRATIONS:
            if name not in cols:
                conn.execute(ddl)
        conn.commit()
        return conn

    @contextmanager
    def _open(self):
        """自动提交并关闭连接：Windows 下不关闭会锁住 db 文件。"""
        conn = self._conn()
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    # ── 读取 ────────────────────────────────────────────────
    def lookup(self, key: str) -> dict | None:
        """命中返回 {path,size,total_size,content_type,truncated} 并刷新访问时间。"""
        if not self.enabled:
            return None
        try:
            with self._lock, self._open() as conn:
                row = conn.execute(
                    "SELECT path, size, total_size, content_type, truncated FROM entries WHERE key = ?",
                    (key,),
                ).fetchone()
                if not row:
                    self._misses += 1
                    return None
                path = Path(row[0])
                try:
                    actual = path.stat().st_size
                except OSError:
                    actual = -1
                if actual != int(row[1]):
                    conn.execute("DELETE FROM entries WHERE key = ?", (key,))
                    self._misses += 1
                    return None
                conn.execute(
                    "UPDATE entries SET last_access = ? WHERE key = ?", (_now_ms(), key)
                )
                self._hits += 1
                return {
                    "path": path,
                    "size": int(row[1]),
                    "total_size": int(row[2] or 0),
                    "content_type": row[3] or "",
                    "truncated": bool(row[4]),
                }
        except Exception:
            self._misses += 1
            return None

    # ── 写入 ────────────────────────────────────────────────
    def store(self, key: str, data: bytes, meta: dict | None = None) -> bool:
        """整段写入；超过单文件上限直接放弃。meta 可带 total_size/content_type/truncated。"""
        if not self.enabled or not data:
            return False
        if len(data) > self.max_file_bytes:
            return False
        path = self.path_for(key)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(path.name + ".part")
            with open(tmp, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
            self._index(key, path, len(data), meta or {})
            self.evict_if_needed()
            return True
        except Exception:
            try:
                path.with_name(path.name + ".part").unlink(missing_ok=True)
            except OSError:
                pass
            return False

    def _index(self, key: str, path: Path, size: int, meta: dict) -> None:
        now = _now_ms()
        with self._lock, self._open() as conn:
            conn.execute(
                "INSERT INTO entries (key, path, size, total_size, content_type, truncated, fetched_at, last_access) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET path = excluded.path, size = excluded.size, "
                "total_size = excluded.total_size, content_type = excluded.content_type, "
                "truncated = excluded.truncated, fetched_at = excluded.fetched_at, last_access = excluded.last_access",
                (
                    key,
                    str(path),
                    size,
                    int(meta.get("total_size") or 0),
                    str(meta.get("content_type") or ""),
                    1 if meta.get("truncated") else 0,
                    now,
                    now,
                ),
            )

    # ── 淘汰与清理 ──────────────────────────────────────────
    def evict_if_needed(self) -> int:
        """超过上限时按最久未访问删除，直到降到 90% 水位；返回删除字节数。"""
        if not self.enabled:
            return 0
        removed = 0
        try:
            with self._lock, self._open() as conn:
                total = conn.execute("SELECT COALESCE(SUM(size), 0) FROM entries").fetchone()[0]
                if total <= self.max_bytes:
                    return 0
                target = int(self.max_bytes * 0.9)
                rows = conn.execute(
                    "SELECT key, path, size FROM entries ORDER BY last_access ASC"
                ).fetchall()
                for key, path, size in rows:
                    if total <= target:
                        break
                    try:
                        Path(path).unlink(missing_ok=True)
                    except OSError:
                        pass
                    conn.execute("DELETE FROM entries WHERE key = ?", (key,))
                    total -= int(size)
                    removed += int(size)
        except Exception:
            return removed
        return removed

    def purge_expired(self) -> int:
        """删除超过 ttlDays 未访问的条目；返回删除条数。"""
        ttl_days = float(self.config.get("ttlDays", DEFAULTS["ttlDays"]))
        if ttl_days <= 0:
            return 0
        cutoff = int((time.time() - ttl_days * 86400) * 1000)
        removed = 0
        try:
            with self._lock, self._open() as conn:
                rows = conn.execute(
                    "SELECT key, path FROM entries WHERE last_access < ?", (cutoff,)
                ).fetchall()
                for key, path in rows:
                    try:
                        Path(path).unlink(missing_ok=True)
                    except OSError:
                        pass
                    conn.execute("DELETE FROM entries WHERE key = ?", (key,))
                    removed += 1
        except Exception:
            return removed
        return removed

    def clear(self) -> int:
        """清空缓存文件与索引；返回删除条数。"""
        removed = 0
        try:
            with self._lock, self._open() as conn:
                rows = conn.execute("SELECT path FROM entries").fetchall()
                for (path,) in rows:
                    try:
                        Path(path).unlink(missing_ok=True)
                    except OSError:
                        pass
                    removed += 1
                conn.execute("DELETE FROM entries")
        except Exception:
            pass
        return removed

    def list_entries(self, host: str = "", app: str = "") -> list[dict]:
        """按 host/app 前缀列出缓存条目（用于前端标记「已缓存」）；空参数返回全部。"""
        if not self.enabled:
            return []
        prefix = ""
        if host and app:
            prefix = "{}|{}|".format(host, app)
        elif host:
            prefix = "{}|".format(host)
        try:
            with self._lock, self._open() as conn:
                if prefix:
                    rows = conn.execute(
                        "SELECT key, size, total_size, last_access FROM entries "
                        "WHERE key LIKE ? ORDER BY last_access DESC",
                        (prefix.replace("%", r"\%") + "%",),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT key, size, total_size, last_access FROM entries "
                        "ORDER BY last_access DESC"
                    ).fetchall()
        except Exception:
            return []
        out = []
        for key, size, total, access in rows:
            parts = str(key).split("|")
            if len(parts) < 4:
                continue
            out.append({
                "file": parts[-2],
                "tail": int(parts[-1]),
                "size": int(size),
                "totalSize": int(total or 0),
                "lastAccess": int(access),
            })
        return out

    def stats(self) -> dict:
        files = 0
        total = 0
        try:
            with self._lock, self._open() as conn:
                files, total = conn.execute(
                    "SELECT COUNT(*), COALESCE(SUM(size), 0) FROM entries"
                ).fetchone()
        except Exception:
            pass
        return {
            "enabled": self.enabled,
            "files": int(files or 0),
            "bytes": int(total or 0),
            "maxBytes": self.max_bytes,
            "maxFileBytes": self.max_file_bytes,
            "ttlDays": float(self.config.get("ttlDays", DEFAULTS["ttlDays"])),
            "hits": self._hits,
            "misses": self._misses,
            "root": str(self.root),
        }


# 进程级单例：server.py 直接复用；测试自行构造实例
cache = LogCache(config=load_config())
