"""logcache 单元测试：全部在临时目录，不触碰真实缓存。"""
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import logcache  # noqa: E402


class LogCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.cache = logcache.LogCache(
            root=base / "cache",
            db_path=base / "cache.db",
            config={"enabled": True, "maxGB": 0.000001, "maxFileMB": 10, "ttlDays": 0},
        )

    def tearDown(self):
        self.tmp.cleanup()

    def test_key_and_path(self):
        key = self.cache.key("10.0.0.1", "app", "a_info.log", 1024)
        self.assertEqual(key, "10.0.0.1|app|a_info.log|1024")
        path = self.cache.path_for(key)
        self.assertEqual(path.name, "a_info.log.tail1024")
        self.assertEqual(path.parent.name, "app")
        self.assertEqual(path.parent.parent.name, "10.0.0.1")

    def test_store_and_lookup(self):
        key = self.cache.key("h", "a", "x.log", 8)
        self.assertTrue(self.cache.store(key, b"payload-1"))
        hit = self.cache.lookup(key)
        self.assertIsNotNone(hit)
        self.assertEqual(Path(hit["path"]).read_bytes(), b"payload-1")
        stats = self.cache.stats()
        self.assertEqual(stats["files"], 1)
        self.assertEqual(stats["bytes"], 9)
        self.assertEqual(stats["hits"], 1)

    def test_lookup_rejects_missing_file(self):
        key = self.cache.key("h", "a", "gone.log", 8)
        self.assertTrue(self.cache.store(key, b"abc"))
        Path(self.cache.lookup(key)["path"]).unlink()
        self.assertIsNone(self.cache.lookup(key))
        # 失效记录应被清掉，不再占用容量
        self.assertEqual(self.cache.stats()["files"], 0)

    def test_max_file_bytes_rejects_large_payload(self):
        small = logcache.LogCache(
            root=Path(self.tmp.name) / "c2",
            db_path=Path(self.tmp.name) / "c2.db",
            config={"enabled": True, "maxGB": 1, "maxFileMB": 0.00001, "ttlDays": 0},
        )
        self.assertFalse(small.store(small.key("h", "a", "big.log", 8), b"x" * 5000))
        self.assertEqual(small.stats()["files"], 0)

    def test_disabled_does_not_cache(self):
        off = logcache.LogCache(
            root=Path(self.tmp.name) / "c3",
            db_path=Path(self.tmp.name) / "c3.db",
            config={"enabled": False},
        )
        self.assertFalse(off.store(off.key("h", "a", "x.log", 8), b"abc"))
        self.assertIsNone(off.lookup(off.key("h", "a", "x.log", 8)))

    def test_lru_evicts_oldest_until_watermark(self):
        # maxGB=1e-6 => 1073 字节上限，90% 水位 965
        keys = []
        for i in range(3):
            key = self.cache.key("h", "a", "f{}.log".format(i), 500)
            keys.append(key)
            self.assertTrue(self.cache.store(key, b"y" * 500))
            time.sleep(0.02)

        stats = self.cache.stats()
        self.assertLessEqual(stats["bytes"], 965)
        self.assertEqual(stats["files"], 1)
        # 最新的那条必须还在，最旧的被淘汰
        self.assertIsNotNone(self.cache.lookup(keys[-1]))
        self.assertIsNone(self.cache.lookup(keys[0]))

    def test_clear_removes_files_and_index(self):
        key = self.cache.key("h", "a", "x.log", 8)
        self.assertTrue(self.cache.store(key, b"abc"))
        removed = self.cache.clear()
        self.assertEqual(removed, 1)
        stats = self.cache.stats()
        self.assertEqual(stats["files"], 0)
        self.assertEqual(stats["bytes"], 0)
        self.assertFalse(self.cache.path_for(key).exists())

    def test_purge_expired_by_ttl(self):
        ttl = logcache.LogCache(
            root=Path(self.tmp.name) / "c4",
            db_path=Path(self.tmp.name) / "c4.db",
            config={"enabled": True, "maxGB": 1, "ttlDays": 1},
        )
        key = ttl.key("h", "a", "old.log", 8)
        self.assertTrue(ttl.store(key, b"abc"))
        # 手动把访问时间改成两天前
        with ttl._lock, ttl._open() as conn:
            conn.execute(
                "UPDATE entries SET last_access = ? WHERE key = ?",
                (int((time.time() - 2 * 86400) * 1000), key),
            )
        self.assertEqual(ttl.purge_expired(), 1)
        self.assertIsNone(ttl.lookup(key))

    def test_list_entries_filters_by_host_and_app(self):
        a = self.cache.key("h1", "app1", "x.log", 8)
        b = self.cache.key("h1", "app2", "y.log", 8)
        c = self.cache.key("h2", "app1", "z.log", 8)
        for key in (a, b, c):
            self.assertTrue(self.cache.store(key, b"abc"))

        names = [e["file"] for e in self.cache.list_entries("h1", "app1")]
        self.assertEqual(names, ["x.log"])
        self.assertEqual(len(self.cache.list_entries("h1", "")), 2)
        self.assertEqual(len(self.cache.list_entries("", "")), 3)
        self.assertEqual(self.cache.list_entries("h1", "app1")[0]["tail"], 8)

    def test_config_clamps_and_defaults(self):
        cfg = logcache.load_config(Path(self.tmp.name) / "missing.json")
        self.assertEqual(cfg["maxGB"], logcache.DEFAULTS["maxGB"])
        self.assertTrue(cfg["enabled"])

        bad = Path(self.tmp.name) / "bad.json"
        bad.write_text('{"enabled": false, "maxGB": -5, "maxFileMB": 999999, "ttlDays": "x"}', encoding="utf-8")
        cfg2 = logcache.load_config(bad)
        self.assertFalse(cfg2["enabled"])
        self.assertEqual(cfg2["maxGB"], logcache.CONFIG_LIMITS["maxGB"][0])
        self.assertEqual(cfg2["maxFileMB"], logcache.CONFIG_LIMITS["maxFileMB"][1])
        self.assertEqual(cfg2["ttlDays"], logcache.DEFAULTS["ttlDays"])


if __name__ == "__main__":
    unittest.main()
