#!/usr/bin/env python3
"""Log Viewer - Backend: config + proxy + access stats (SQLite)."""
import http.server
import json
import urllib.request
import urllib.parse
import urllib.error
import os
import argparse
import base64
import socketserver
import access_store

# 凭据：环境变量优先，其次 CLI --user/--password；无默认账号
DEFAULT_USER = (
    os.environ.get('LOG_VIEWER_USER')
    or os.environ.get('LOGINDEX_USER')
    or ''
)
DEFAULT_PASS = (
    os.environ.get('LOG_VIEWER_PASS')
    or os.environ.get('LOGINDEX_PASS')
    or ''
)
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_DIR = os.path.join(HERE, 'config')
DIST_DIR = os.path.join(HERE, 'frontend', 'dist')
_PROXY_CHUNK = 64 * 1024


def read_version():
    try:
        with open(os.path.join(HERE, 'VERSION'), encoding='utf-8') as f:
            return f.read().strip() or '1.0.1'
    except Exception:
        return '1.0.1'


APP_VERSION = read_version()

# LogIndex 为内网地址：必须直连，不能走系统/环境 HTTP 代理。
# urllib.urlopen 会缓存首开时的 ProxyHandler；用户关掉本地代理后仍可能
# 打向 127.0.0.1:xxxx → WinError 10061 → 前端看到 HTTP 502。
_LOGINDEX_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _json_body(handler):
    length = int(handler.headers.get('Content-Length') or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode('utf-8') or '{}')
    except Exception:
        return {}


def _client_ip(handler):
    # 经 Vite/反向代理时优先 X-Forwarded-For
    xff = handler.headers.get('X-Forwarded-For') or handler.headers.get('X-Real-IP')
    if xff:
        ip = xff.split(',')[0].strip()
        if ip.startswith('::ffff:'):
            ip = ip[7:]
        return ip
    ip = handler.client_address[0] if handler.client_address else ''
    if ip.startswith('::ffff:'):
        ip = ip[7:]
    return ip


class Handler(http.server.SimpleHTTPRequestHandler):
    """单进程：API/config + 静态前端（frontend/dist）。无需 Nginx。"""

    def __init__(self, *args, **kwargs):
        # 有 dist 就托管构建产物；否则仍可只调 API（开发时由 Vite 提供页面）
        root = DIST_DIR if os.path.isdir(DIST_DIR) else HERE
        super().__init__(*args, directory=root, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # 构建产物带 hash，可强缓存，减轻二次打开变慢
        path = urllib.parse.urlparse(self.path).path
        if path.startswith('/assets/'):
            self.send_header('Cache-Control', 'public, max-age=604800, immutable')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path.startswith('/config/'):
            self.serve_config(parsed.path)
            return

        if parsed.path == '/api/proxy':
            self.handle_proxy(parsed.query)
            return

        if parsed.path == '/api/access/online':
            self.handle_access_online()
            return

        if parsed.path == '/api/access/recent':
            self.handle_access_recent(parsed.query)
            return

        if parsed.path == '/api/access/summary':
            self.handle_access_summary()
            return

        if parsed.path == '/api/access/me':
            self.handle_access_me()
            return

        # SPA：根路径与未知前端路由回落到 index.html
        if parsed.path in ('/', ''):
            self.path = '/index.html'
            return super().do_GET()

        if os.path.isdir(DIST_DIR):
            rel = parsed.path.lstrip('/').replace('/', os.sep)
            candidate = os.path.join(DIST_DIR, rel)
            if not os.path.isfile(candidate) and not parsed.path.startswith('/assets/'):
                self.path = '/index.html'
                return super().do_GET()

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        cfg = access_store.load_access_config()
        if not cfg.get('enabled', True) and parsed.path.startswith('/api/access/'):
            self.json_err(503, 'Access tracking disabled')
            return

        if parsed.path == '/api/access/hello':
            self.handle_access_hello()
            return
        if parsed.path == '/api/access/ping':
            self.handle_access_ping()
            return
        if parsed.path == '/api/access/event':
            self.handle_access_event()
            return

        self.json_err(404, 'Not found')

    def serve_config(self, path):
        filename = path.replace('/config/', '', 1)
        # access.json 含 IP 白名单，不通过静态配置接口暴露
        if filename == 'access.json' or filename.endswith('/access.json'):
            self.json_err(403, 'Forbidden')
            return
        filepath = os.path.join(CONFIG_DIR, filename)
        if not os.path.isfile(filepath):
            self.send_error(404, 'Config not found')
            return
        try:
            with open(filepath, 'rb') as f:
                data = f.read()
            self.send_response(200)
            ct = 'application/json' if filename.endswith('.json') else 'text/plain'
            self.send_header('Content-Type', ct + '; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(500, str(e))

    def handle_proxy(self, query):
        params = urllib.parse.parse_qs(query)
        url = params.get('url', [None])[0]
        if not url:
            self.json_err(400, 'Missing url parameter')
            return

        user = params.get('user', [DEFAULT_USER])[0]
        passwd = params.get('pass', [DEFAULT_PASS])[0]
        tail = params.get('tail', [None])[0]
        tail_bytes = int(tail) if tail and tail.isdigit() else None

        try:
            req = urllib.request.Request(url)
            if user:
                cred = base64.b64encode('{}:{}'.format(user, passwd).encode()).decode()
                req.add_header('Authorization', 'Basic {}'.format(cred))

            if tail_bytes:
                req.add_header('Range', 'bytes=-{}'.format(tail_bytes))

            # 目录探测不要拖 30s：否则单线程时代会卡死整站；多线程下也浪费连接
            if tail_bytes:
                timeout = 90 if tail_bytes > 5 * 1024 * 1024 else 30
            else:
                timeout = 8
            with _LOGINDEX_OPENER.open(req, timeout=timeout) as resp:
                status_code = resp.status
                ct = resp.headers.get('Content-Type', 'text/plain; charset=utf-8')
                content_range = resp.headers.get('Content-Range', '')

                total_size = None
                truncated = False
                if content_range:
                    parts = content_range.split('/')
                    if len(parts) == 2 and parts[1].strip().isdigit():
                        total_size = int(parts[1].strip())

                # 非 Range 尾截断：仍需整段读入再裁剪；Range 响应可按块流式转发
                if not content_range and tail_bytes:
                    data = resp.read()
                    if status_code == 200 and len(data) > tail_bytes:
                        total_size = len(data)
                        data = data[-tail_bytes:]
                        truncated = True
                    self.send_response(200)
                    self.send_header('Content-Type', ct)
                    self.send_header('Access-Control-Expose-Headers', 'X-Total-Size, X-Truncated')
                    self.send_header('Content-Length', str(len(data)))
                    if total_size:
                        self.send_header('X-Total-Size', str(total_size))
                    if truncated:
                        self.send_header('X-Truncated', 'true')
                    self.end_headers()
                    self.wfile.write(data)
                    return

                # Range / 目录：先发头再分块写，降低大尾包首字节等待
                cl_hdr = resp.headers.get('Content-Length')
                body_len = int(cl_hdr) if cl_hdr and str(cl_hdr).isdigit() else None
                if total_size is not None and body_len is not None:
                    truncated = body_len < total_size

                self.send_response(200)
                self.send_header('Content-Type', ct)
                self.send_header('Access-Control-Expose-Headers', 'X-Total-Size, X-Truncated')
                if body_len is not None:
                    self.send_header('Content-Length', str(body_len))
                if total_size:
                    self.send_header('X-Total-Size', str(total_size))
                if truncated:
                    self.send_header('X-Truncated', 'true')
                self.end_headers()

                written = 0
                while True:
                    chunk = resp.read(_PROXY_CHUNK)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    written += len(chunk)
                # 无 Content-Length 时用已写字节数补截断判断
                if total_size is not None and body_len is None and written < total_size:
                    pass  # 头已发出，无法再改 X-Truncated；Range 通常带 Content-Length

        except urllib.error.HTTPError as e:
            self.json_err(e.code, 'LogIndex returned HTTP {}'.format(e.code))
        except urllib.error.URLError as e:
            self.json_err(
                502,
                '无法直连 LogIndex（已绕过系统代理）: {}'.format(e.reason),
            )
        except Exception as e:
            self.json_err(502, str(e))

    # ── access / presence ─────────────────────────────────

    def _require_stats_ip(self):
        ip = _client_ip(self)
        if not access_store.client_ip_allowed(ip):
            self.json_err(403, '当前 IP（{}）无权查看访问统计，请联系管理员加入白名单'.format(ip))
            return None
        return ip

    def handle_access_me(self):
        ip = _client_ip(self)
        self.json_ok({
            'ip': ip,
            'canViewStats': access_store.client_ip_allowed(ip),
            'enabled': access_store.load_access_config().get('enabled', True),
        })

    def handle_access_hello(self):
        body = _json_body(self)
        ip = _client_ip(self)
        ua = self.headers.get('User-Agent') or body.get('ua') or ''
        sid = body.get('sid') or None
        data = access_store.hello(ip, ua, sid)
        data['ip'] = ip
        self.json_ok(data)

    def handle_access_ping(self):
        body = _json_body(self)
        sid = body.get('sid')
        if not sid:
            self.json_err(400, 'Missing sid')
            return
        ip = _client_ip(self)
        self.json_ok(access_store.ping(sid, ip))

    def handle_access_event(self):
        body = _json_body(self)
        action = body.get('action')
        if not action:
            self.json_err(400, 'Missing action')
            return
        ip = _client_ip(self)
        self.json_ok(access_store.track_event(
            sid=body.get('sid'),
            ip=ip,
            action=action,
            env=body.get('env') or '',
            module=body.get('module') or '',
            app=body.get('app') or '',
            level=body.get('level') or '',
            detail=body.get('detail') or '',
        ))

    def handle_access_online(self):
        if self._require_stats_ip() is None:
            return
        self.json_ok({
            'online': access_store.list_online(),
            'count': access_store.online_count(),
        })

    def handle_access_recent(self, query):
        if self._require_stats_ip() is None:
            return
        params = urllib.parse.parse_qs(query)
        limit = params.get('limit', ['100'])[0]
        self.json_ok({'items': access_store.list_recent(limit)})

    def handle_access_summary(self):
        if self._require_stats_ip() is None:
            return
        self.json_ok(access_store.stats_summary())

    def json_ok(self, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def json_err(self, code, msg):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        body = json.dumps({'error': msg}, ensure_ascii=False)
        self.wfile.write(body.encode('utf-8'))

    def log_message(self, fmt, *args):
        path = str(args[0]) if args else ''
        if '/api/proxy' in path or '/config/' in path or '/api/access/ping' in path:
            return
        super().log_message(fmt, *args)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Log Viewer Server')
    ap.add_argument('--port', type=int, default=8090)
    ap.add_argument('--user', default=DEFAULT_USER)
    ap.add_argument('--password', default=DEFAULT_PASS)
    ap.add_argument('--version', action='version', version='%(prog)s ' + APP_VERSION)
    args = ap.parse_args()

    DEFAULT_USER = args.user
    DEFAULT_PASS = args.password

    access_store.purge_old()
    cfg = access_store.load_access_config()
    has_dist = os.path.isdir(DIST_DIR) and os.path.isfile(os.path.join(DIST_DIR, 'index.html'))

    # 多线程：代理拉 LogIndex 时不阻塞 JS/CSS/其它 API
    class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    srv = ThreadingServer(('0.0.0.0', args.port), Handler)
    print('Log Viewer {} started -> http://localhost:{}'.format(APP_VERSION, args.port))
    print('  Mode: threaded HTTP')
    if has_dist:
        print('  UI: single-process (frontend/dist)')
    else:
        print('  UI: frontend/dist missing - run: python manage.py build')
        print('  Dev UI: Vite on :5173 (python manage.py dev)')
    print('  Config dir: {}'.format(CONFIG_DIR))
    print('  Access DB: {}'.format(access_store.DB_PATH))
    print('  Stats allow IPs: {}'.format(', '.join(cfg.get('statsAllowIps') or [])))
    print('  Press Ctrl+C to stop')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped')
