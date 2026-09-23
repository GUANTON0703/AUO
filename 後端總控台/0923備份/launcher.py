"""
HTA Work Platform - Main Launcher  v2.9.3
【本次修正 v2.9.3】
  ★ 服務管理「連線」數與連線摘要同步
    - proxy_log 服務：改從 DB 查最近 2 分鐘活躍 IP 數（與連線摘要一致）
    - 非 proxy 服務：維持 psutil TCP 連線數（原本就準確）

【v2.9.2】每行 Log 自動加時間戳 [HH:MM:SS]
【v2.9】連線摘要顯示系統、清除 Log API、每日 07:00 自動清空
"""

import sys
import os

SHARED_LIB = r"U:\GPT\小工具轉換\後端總控台\SharedLib"
if os.path.isdir(SHARED_LIB) and SHARED_LIB not in sys.path:
    sys.path.append(SHARED_LIB)

import json
import re
import sqlite3
import time
import threading
import subprocess
import asyncio

import psutil
from flask import Flask, jsonify, request, Response
import aiohttp

# ── Config ──────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
LOCK_FILE     = r"U:\GPT\小工具轉換\後端總控台\LOG\HTA.lock"
LOG_DIR       = r"U:\GPT\小工具轉換\後端總控台\LOG"
DB_PATH       = os.path.join(LOG_DIR, "hta_access.db")
NAME_MAP_PATH = r"U:\GPT\小工具轉換\後端總控台\name_map.json"
MGMT_PORT     = 5100
SERVICES_CFG  = os.path.join(BASE_DIR, "services.json")

PROXY_TIMEOUT   = 10
PROXY_POOL_SIZE = 32
PROXY_POOL_CONN = 10

# ── State ────────────────────────────────────────────────────
running_services     = {}
last_heartbeat       = [time.time()]
app                  = Flask(__name__)
_CNOW                = getattr(subprocess, "CREATE_NO_WINDOW", 0)
_proxy_real_port_map = {}
_proxy_threads       = {}
_thread_local        = threading.local()

# ── Utility ──────────────────────────────────────────────────
def wlog(msg):
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(os.path.join(LOG_DIR, "launcher.log"), "a", encoding="utf-8") as f:
            f.write("[" + time.strftime("%Y-%m-%d %H:%M:%S") + "] " + msg + "\n")
    except Exception:
        pass

def load_services():
    if not os.path.isfile(SERVICES_CFG):
        return []
    try:
        with open(SERVICES_CFG, "r", encoding="utf-8") as f:
            return json.load(f).get("services", [])
    except Exception:
        return []

def proc_stats(pid):
    try:
        ps = psutil.Process(pid)
        return round(ps.cpu_percent(interval=0.1), 1), ps.memory_info().rss // 1024 // 1024
    except Exception:
        return 0.0, 0

def kill_tree(pid):
    try:
        parent = psutil.Process(pid)
        for child in parent.children(recursive=True):
            child.kill()
        parent.kill()
    except Exception:
        pass

def kill_port(port):
    """啟動前強制釋放指定 Port，避免 [WinError 10048]"""
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr.port == port and conn.status in ("LISTEN", "CLOSE_WAIT"):
                try:
                    psutil.Process(conn.pid).kill()
                    wlog("kill_port: 已清除 Port " + str(port) + " (pid=" + str(conn.pid) + ")")
                except Exception as _ke:
                    wlog("kill_port: 清除失敗 port=" + str(port) + " " + str(_ke))
    except Exception as e:
        wlog("kill_port error: " + str(e))


def shutdown_all():
    wlog("Shutting down all services...")
    for sid, info in list(running_services.items()):
        proc = info.get("proc")
        if proc and proc.poll() is None:
            kill_tree(proc.pid)
    try:
        if os.path.isfile(LOCK_FILE):
            os.remove(LOCK_FILE)
    except Exception:
        pass
    wlog("Done.")

def check_lock():
    if os.path.isfile(LOCK_FILE):
        try:
            with open(LOCK_FILE, "r") as f:
                pid = int(f.read().strip())
            if psutil.pid_exists(pid):
                return False
        except Exception:
            pass
    try:
        os.makedirs(os.path.dirname(LOCK_FILE), exist_ok=True)
        with open(LOCK_FILE, "w") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass
    return True

# ══════════════════════════════════════════════════════════════
# 時間戳 Logger（v2.9.2）
# ══════════════════════════════════════════════════════════════
def _timestamped_logger(sid, pipe, log_path):
    try:
        with open(log_path, "a", encoding="utf-8", errors="replace", buffering=1) as lf:
            lf.write("\n" + "=" * 52 + "\n")
            lf.write("[ 啟動於 " + time.strftime("%Y-%m-%d %H:%M:%S") + " ]\n")
            lf.write("=" * 52 + "\n")
            lf.flush()
            for raw_line in pipe:
                try:
                    line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
                except Exception:
                    line = repr(raw_line)
                ts = time.strftime("%H:%M:%S")
                lf.write("[" + ts + "] " + line + "\n")
                lf.flush()
    except Exception as e:
        wlog("_timestamped_logger [" + sid + "] error: " + str(e))

def _start_proc_with_log(sid, python, script, cwd, env):
    log_path = os.path.join(LOG_DIR, sid + ".log")
    proc = subprocess.Popen(
        [python, script],
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        creationflags=_CNOW,
        bufsize=0
    )
    threading.Thread(
        target=_timestamped_logger,
        args=(sid, proc.stdout, log_path),
        daemon=True,
        name="log_" + sid
    ).start()
    return proc, log_path

# ══════════════════════════════════════════════════════════════
# 姓名對應表
# ══════════════════════════════════════════════════════════════
_name_map      = {}
_name_map_ci   = {}
_name_map_lock = threading.Lock()

def load_name_map():
    global _name_map, _name_map_ci
    if not os.path.isfile(NAME_MAP_PATH):
        wlog("⚠ name_map.json 不存在：" + NAME_MAP_PATH)
        return 0
    try:
        with open(NAME_MAP_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        cleaned = {k: v for k, v in raw.items()
                   if not k.startswith("_") and not k.startswith("---")}
        ci = {k.lower(): v for k, v in cleaned.items()}
        with _name_map_lock:
            _name_map    = cleaned
            _name_map_ci = ci
        wlog("name_map 載入：" + str(len(cleaned)) + " 筆")
        return len(cleaned)
    except Exception as e:
        wlog("name_map 載入失敗：" + str(e))
        return 0

# ══════════════════════════════════════════════════════════════
# IP → 姓名解析
# ══════════════════════════════════════════════════════════════
_ip_cache_lock = threading.Lock()
_ip_name_cache = {}
_NSLOOKUP_RE   = re.compile(r'(?:Name|名稱)\s*:\s*(\S+)', re.IGNORECASE)

def _lookup_name(key):
    with _name_map_lock:
        name = _name_map.get(key)
        if name:
            return name, key
        name = _name_map_ci.get(key.lower())
        if name:
            orig = next((k for k, v in _name_map.items() if k.lower() == key.lower()), key)
            return name, orig
    return None, None

def resolve_hostname(ip):
    with _ip_cache_lock:
        if ip in _ip_name_cache:
            return _ip_name_cache[ip]
    first_seg = None
    display   = ip
    try:
        r = subprocess.run(["nslookup", ip], capture_output=True, text=True,
                           timeout=4, creationflags=_CNOW)
        m = _NSLOOKUP_RE.search(r.stdout + r.stderr)
        if m:
            first_seg = m.group(1).strip().split(".")[0]
    except Exception as e:
        wlog("nslookup " + ip + " 失敗：" + str(e))
    if first_seg:
        name, matched_key = _lookup_name(first_seg)
        display = (name + " (" + matched_key + ")") if name else ("未知 (" + first_seg + ")")
    with _ip_cache_lock:
        _ip_name_cache[ip] = display
    return display

# ══════════════════════════════════════════════════════════════
# DB helper
# ══════════════════════════════════════════════════════════════
def _build_svc_names_map():
    return {s["id"]: s.get("name", s["id"]) for s in load_services()}

def _get_db():
    if not os.path.isfile(DB_PATH):
        return None
    try:
        return sqlite3.connect(DB_PATH, timeout=5)
    except Exception:
        return None

def _ensure_db_table():
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        db = sqlite3.connect(DB_PATH, timeout=5)
        db.execute("""
            CREATE TABLE IF NOT EXISTS access_log (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp      TEXT,
                service_id     TEXT,
                client_ip      TEXT,
                request_path   TEXT,
                request_ms     REAL,
                sql_text       TEXT,
                query_ms       REAL,
                rows_affected  INTEGER,
                error          TEXT,
                status_code    INTEGER
            )
        """)
        db.commit()
        db.close()
    except Exception as e:
        wlog("_ensure_db_table error: " + str(e))

def _proxy_write_log(service_id, client_ip, path, status_code, elapsed_ms, error=None):
    def _write():
        try:
            db = sqlite3.connect(DB_PATH, timeout=5)
            db.execute(
                "INSERT INTO access_log "
                "(timestamp, service_id, client_ip, request_path, request_ms, error) "
                "VALUES (datetime('now','localtime'), ?, ?, ?, ?, ?)",
                (service_id, client_ip, path, round(elapsed_ms, 1),
                 error if error else None)
            )
            db.commit()
            db.close()
        except Exception as ex:
            wlog("proxy_write_log error: " + str(ex))
    threading.Thread(target=_write, daemon=True).start()

# ══════════════════════════════════════════════════════════════
# 每日 07:00 自動清空 Log
# ══════════════════════════════════════════════════════════════
def _daily_clear_scheduler():
    while True:
        now = time.localtime()
        secs_since_midnight = now.tm_hour * 3600 + now.tm_min * 60 + now.tm_sec
        secs_to_target = 7 * 3600 - secs_since_midnight
        if secs_to_target <= 0:
            secs_to_target += 86400
        time.sleep(secs_to_target)
        try:
            db = sqlite3.connect(DB_PATH, timeout=5)
            db.execute("DELETE FROM access_log")
            db.commit()
            db.close()
            wlog("每日自動清空 access_log（07:00 排程）")
        except Exception as e:
            wlog("每日自動清空失敗：" + str(e))

# ══════════════════════════════════════════════════════════════
# Thread-local async session
# ══════════════════════════════════════════════════════════════
def _get_thread_loop():
    """每個 waitress worker thread 維持自己的 event loop（不跨 thread 共用）"""
    if not hasattr(_thread_local, "loop") or _thread_local.loop is None or _thread_local.loop.is_closed():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        _thread_local.loop = loop
    return _thread_local.loop

def _get_thread_session(loop):
    """每個 thread 維持自己的 aiohttp session，session 關閉時自動重建"""
    sess = getattr(_thread_local, "session", None)
    if sess is None or sess.closed:
        connector = aiohttp.TCPConnector(
            limit=PROXY_POOL_SIZE, limit_per_host=PROXY_POOL_CONN,
            ttl_dns_cache=300
        )
        _thread_local.session = aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=PROXY_TIMEOUT)
        )
    return _thread_local.session

# ══════════════════════════════════════════════════════════════
# Async Proxy
# ══════════════════════════════════════════════════════════════
async def _proxy_request_async(session, service_id, target_host, target_port,
                                method, path, query_string, req_headers, data, client_ip):
    target_url = "http://" + target_host + ":" + str(target_port) + "/" + path
    if query_string:
        target_url += "?" + query_string
    start_time  = time.time()
    status_code = 502
    try:
        async with session.request(method, target_url, headers=req_headers,
                                   data=data, ssl=False, allow_redirects=False) as resp:
            status_code = resp.status
            elapsed_ms  = (time.time() - start_time) * 1000
            content     = await resp.read()
            skip_log = path in ("favicon.ico", "favicon") or path.startswith("static/")
            if not skip_log:
                _proxy_write_log(service_id, client_ip, "/" + path, status_code, elapsed_ms)
            excluded = {"content-encoding", "content-length", "transfer-encoding", "connection"}
            out_headers = [(k, v) for k, v in resp.headers.items() if k.lower() not in excluded]
            return content, status_code, out_headers
    except asyncio.TimeoutError:
        elapsed_ms = (time.time() - start_time) * 1000
        err = "Proxy timeout (" + str(PROXY_TIMEOUT) + "s)"
        _proxy_write_log(service_id, client_ip, "/" + path, 504, elapsed_ms, error=err)
        wlog("[" + service_id + "] " + err)
        return err.encode(), 504, []
    except Exception as ex:
        elapsed_ms = (time.time() - start_time) * 1000
        err = str(ex)
        _proxy_write_log(service_id, client_ip, "/" + path, status_code, elapsed_ms, error=err)
        wlog("[" + service_id + "] Proxy error: " + err)
        return ("Proxy Error: " + err).encode(), status_code, []

def _make_proxy_app(service_id, target_host, target_port):
    proxy = Flask("proxy_" + service_id)

    @proxy.route("/", defaults={"path": ""}, methods=["GET","POST","PUT","DELETE","PATCH","HEAD","OPTIONS"])
    @proxy.route("/<path:path>",             methods=["GET","POST","PUT","DELETE","PATCH","HEAD","OPTIONS"])
    def _proxy_handler(path):
        client_ip    = request.headers.get("X-Forwarded-For", request.remote_addr) or ""
        query_string = request.query_string.decode("utf-8", errors="replace")
        req_headers  = {k: v for k, v in request.headers if k.lower() != "host"}
        data         = request.get_data()
        try:
            loop    = _get_thread_loop()
            session = _get_thread_session(loop)
            coro = _proxy_request_async(session, service_id, target_host, target_port,
                                        request.method, path, query_string, req_headers, data, client_ip)
            content, status_code, out_headers = loop.run_until_complete(coro)
        except RuntimeError as ex:
            # event loop 被汙染時重建，重試一次
            wlog("[" + service_id + "] loop error, rebuilding: " + str(ex))
            try:
                _thread_local.loop = None
                _thread_local.session = None
                loop    = _get_thread_loop()
                session = _get_thread_session(loop)
                coro = _proxy_request_async(session, service_id, target_host, target_port,
                                            request.method, path, query_string, req_headers, data, client_ip)
                content, status_code, out_headers = loop.run_until_complete(coro)
            except Exception as ex2:
                wlog("[" + service_id + "] handler retry error: " + str(ex2))
                content, status_code, out_headers = ("Internal error: " + str(ex2)).encode(), 502, []
        except Exception as ex:
            wlog("[" + service_id + "] handler error: " + str(ex))
            content, status_code, out_headers = ("Internal error: " + str(ex)).encode(), 502, []
        return Response(content, status_code, out_headers)

    return proxy

def _start_proxy_thread(svc):
    sid       = svc["id"]
    app_port  = svc["port"]
    real_port = svc.get("real_port", app_port)
    _proxy_real_port_map[sid] = real_port
    _ensure_db_table()
    proxy_app = _make_proxy_app(sid, "127.0.0.1", app_port)
    def _run():
        wlog("Proxy [" + sid + "] 對外 :" + str(real_port) + " → app :" + str(app_port))
        from waitress import serve
        serve(
            proxy_app,
            host="0.0.0.0",
            port=real_port,
            threads=16,
            channel_timeout=60,
            cleanup_interval=10,
            asyncore_use_poll=True,
        )
    threading.Thread(target=_run, daemon=True, name="proxy_" + sid).start()

def _init_all_proxies():
    for svc in load_services():
        if svc.get("proxy_log", False):
            _start_proxy_thread(svc)

# ══════════════════════════════════════════════════════════════
# Auto-start
# ══════════════════════════════════════════════════════════════
def _start_one(svc):
    sid = svc["id"]
    if sid in running_services:
        proc = running_services[sid].get("proc")
        if proc and proc.poll() is None:
            return
    try:
        script = svc["script"]
        cwd    = svc.get("cwd", os.path.dirname(script))
        python = svc.get("python", sys.executable)
        if python == "auto":
            python = sys.executable
        env = os.environ.copy()
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = SHARED_LIB + (os.pathsep + existing if existing else "")
        env["PYTHONIOENCODING"] = "utf-8"
        _port = svc.get("port")
        if _port:
            kill_port(int(_port))
        proc, log_path = _start_proc_with_log(sid, python, script, cwd, env)
        running_services[sid] = {"proc": proc, "log_file": log_path}
        wlog("Auto-start: " + sid + " pid=" + str(proc.pid))
    except Exception as e:
        wlog("Auto-start failed [" + sid + "]: " + str(e))

def _auto_start_services():
    def _run():
        time.sleep(2)
        svcs = [s for s in load_services() if s.get("auto_start", False)]
        if not svcs:
            wlog("Auto-start: 無需啟動的服務（services.json 中無 auto_start:true）")
            return
        wlog("Auto-start: 開始啟動 " + str(len(svcs)) + " 個服務...")
        for svc in svcs:
            _start_one(svc)
            time.sleep(0.5)
        wlog("Auto-start: 完成")
    threading.Thread(target=_run, daemon=True, name="auto_start").start()

# ══════════════════════════════════════════════════════════════
# ★ v2.9.3 新增：proxy 服務從 DB 查活躍連線數
# ══════════════════════════════════════════════════════════════
def _get_proxy_active_conns(sid):
    """查詢最近 2 分鐘內有幾個不同 IP 存取過該服務（與連線摘要「活躍」定義一致）"""
    try:
        db = _get_db()
        if not db:
            return 0
        cur = db.execute(
            "SELECT COUNT(DISTINCT client_ip) FROM access_log "
            "WHERE service_id = ? "
            "  AND client_ip NOT IN ('127.0.0.1', '::1', '') "
            "  AND timestamp >= datetime('now', '-2 minutes', 'localtime')",
            (sid,)
        )
        count = cur.fetchone()[0] or 0
        db.close()
        return count
    except Exception:
        return 0

# ── Routes ───────────────────────────────────────────────────
@app.route("/")
def index():
    html_path = os.path.join(BASE_DIR, "dashboard.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return f.read()

@app.route("/api/info")
def api_info():
    is_public = (sys.executable.lower().startswith(r"\\") or
                 "tw100049" in sys.executable.lower())
    return jsonify({"python_path": sys.executable,
                    "version": sys.version.split()[0],
                    "is_public": is_public})

@app.route("/api/services")
def api_services():
    result = []
    for svc in load_services():
        sid        = svc["id"]
        is_proxy   = svc.get("proxy_log", False)
        running, cpu, mem, conns = False, 0.0, 0, 0
        if sid in running_services:
            proc = running_services[sid].get("proc")
            if proc and proc.poll() is None:
                running = True
                cpu, mem = proc_stats(proc.pid)
                # ★ v2.9.3：proxy 服務從 DB 查活躍 IP 數；非 proxy 用 psutil
                if is_proxy:
                    conns = _get_proxy_active_conns(sid)
                else:
                    try:
                        _ps   = psutil.Process(proc.pid)
                        conns = len(set(
                            c.raddr.ip for c in _ps.connections(kind="tcp")
                            if c.status == "ESTABLISHED" and c.raddr
                        ))
                    except Exception:
                        conns = 0
        result.append({
            "id":        sid,
            "name":      svc.get("name", sid),
            "port":      svc.get("real_port", svc.get("port", "")),
            "url":       svc.get("url", ""),
            "running":   running,
            "cpu":       cpu,
            "mem":       mem,
            "conns":     conns,
            "proxy_log": is_proxy,
            "auto_start": svc.get("auto_start", False),
        })
    return jsonify(result)

@app.route("/api/start/<sid>", methods=["POST"])
def api_start(sid):
    svc = next((s for s in load_services() if s["id"] == sid), None)
    if not svc:
        return jsonify({"ok": False, "msg": "Service not found"}), 404
    if sid in running_services:
        proc = running_services[sid].get("proc")
        if proc and proc.poll() is None:
            return jsonify({"ok": True, "msg": "Already running"})
    try:
        script = svc["script"]
        cwd    = svc.get("cwd", os.path.dirname(script))
        python = svc.get("python", sys.executable)
        if python == "auto":
            python = sys.executable
        env = os.environ.copy()
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = SHARED_LIB + (os.pathsep + existing if existing else "")
        env["PYTHONIOENCODING"] = "utf-8"
        proc, log_path = _start_proc_with_log(sid, python, script, cwd, env)
        running_services[sid] = {"proc": proc, "log_file": log_path}
        wlog("Started " + sid + " pid=" + str(proc.pid))
        return jsonify({"ok": True, "msg": "Started", "pid": proc.pid})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)}), 500

@app.route("/api/stop/<sid>", methods=["POST"])
def api_stop(sid):
    info = running_services.pop(sid, None)
    if info:
        proc = info.get("proc")
        if proc and proc.poll() is None:
            kill_tree(proc.pid)
        wlog("Stopped " + sid)
    return jsonify({"ok": True, "msg": "Stopped"})

@app.route("/api/restart/<sid>", methods=["POST"])
def api_restart(sid):
    api_stop(sid)
    time.sleep(1)
    return api_start(sid)

@app.route("/api/log/<sid>")
def api_log(sid):
    log_file = os.path.join(LOG_DIR, sid + ".log")
    if not os.path.isfile(log_file):
        return jsonify({"log": "(no log yet)"})
    try:
        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        return jsonify({"log": "".join(lines[-150:])})
    except Exception as e:
        return jsonify({"log": str(e)})

@app.route("/api/heartbeat", methods=["POST"])
def api_heartbeat():
    last_heartbeat[0] = time.time()
    return jsonify({"ok": True})

@app.route("/api/shutdown", methods=["POST"])
def api_shutdown():
    shutdown_all()
    threading.Thread(target=lambda: (time.sleep(1), os._exit(0)), daemon=True).start()
    return jsonify({"ok": True})

@app.route("/api/open_when_ready", methods=["POST"])
def api_open_when_ready():
    data = request.get_json(silent=True) or {}
    url  = data.get("url", "")
    if not url:
        return jsonify({"ok": False, "msg": "no url"})
    def _wait_and_open():
        for _ in range(30):
            try:
                import http.client, urllib.parse as _up
                _p = _up.urlparse(url)
                _c = http.client.HTTPConnection(_p.netloc, timeout=1)
                _c.request("HEAD", _p.path or "/")
                _c.getresponse(); _c.close()
                break
            except Exception:
                time.sleep(1)
        subprocess.Popen(["cmd", "/c", "start", "", url])
        wlog("Browser opened: " + url)
    threading.Thread(target=_wait_and_open, daemon=True).start()
    return jsonify({"ok": True})

# ══════════════════════════════════════════════════════════════
# Log 監控 & 連線摘要 API
# ══════════════════════════════════════════════════════════════
@app.route("/api/access_stats")
def api_access_stats():
    db = _get_db()
    if not db:
        return jsonify([])
    try:
        SVC_NAMES_MAP = _build_svc_names_map()
        cur = db.execute("""
            SELECT service_id,
                   COUNT(*)                                  AS total_requests,
                   COUNT(DISTINCT client_ip)                 AS unique_ips,
                   SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS error_count,
                   ROUND(AVG(CASE WHEN query_ms > 0 THEN query_ms END), 1) AS avg_query_ms,
                   ROUND(MAX(query_ms), 1)                  AS max_query_ms
            FROM access_log
            WHERE timestamp >= datetime('now', '-7 days', 'localtime')
            GROUP BY service_id
            ORDER BY total_requests DESC
        """)
        rows = cur.fetchall()
        db.close()
        result = []
        for r in rows:
            sid = r[0]
            result.append({
                "service_id":     sid,
                "service_name":   SVC_NAMES_MAP.get(sid, sid),
                "total_requests": r[1],
                "unique_ips":     r[2],
                "error_count":    r[3],
                "avg_query_ms":   r[4],
                "max_query_ms":   r[5],
            })
        return jsonify(result)
    except Exception as e:
        wlog("api_access_stats error: " + str(e))
        return jsonify([])

@app.route("/api/access_logs")
def api_access_logs():
    limit       = min(int(request.args.get("limit", 300)), 1000)
    errors_only = request.args.get("errors_only", "0") == "1"
    service     = request.args.get("service", "")
    db = _get_db()
    if not db:
        return jsonify([])
    try:
        where  = ["1=1"]
        params = []
        if errors_only:
            where.append("error IS NOT NULL AND error != ''")
        if service:
            where.append("service_id = ?")
            params.append(service)
        sql = ("SELECT id, timestamp, service_id, client_ip, request_path, "
               "request_ms, sql_text, query_ms, rows_affected, error, status_code "
               "FROM access_log WHERE " + " AND ".join(where) +
               " ORDER BY id DESC LIMIT ?")
        params.append(limit)
        cur  = db.execute(sql, params)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        db.close()
        return jsonify(rows)
    except Exception as e:
        wlog("api_access_logs error: " + str(e))
        return jsonify([])

@app.route("/api/log/ip_summary")
def api_ip_summary():
    db = _get_db()
    if not db:
        return jsonify([])
    try:
        SVC_NAMES_MAP = _build_svc_names_map()
        cur = db.execute("""
            SELECT client_ip,
                   service_id,
                   COUNT(*)        AS total_requests,
                   MAX(timestamp)  AS last_seen,
                   MIN(timestamp)  AS first_seen,
                   SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS error_count
            FROM access_log
            WHERE client_ip NOT IN ('127.0.0.1','::1','')
              AND timestamp >= datetime('now', '-7 days', 'localtime')
            GROUP BY client_ip, service_id
            ORDER BY last_seen DESC
            LIMIT 200
        """)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        db.close()
        result = []
        for r in rows:
            row = dict(zip(cols, r))
            ip  = row["client_ip"]
            sid = row["service_id"]
            with _ip_cache_lock:
                display = _ip_name_cache.get(ip)
            if display is None:
                threading.Thread(target=resolve_hostname, args=(ip,), daemon=True).start()
                display = ip
            row["display_name"] = display
            row["service_name"] = SVC_NAMES_MAP.get(sid, sid)
            result.append(row)
        return jsonify(result)
    except Exception as e:
        wlog("api_ip_summary error: " + str(e))
        return jsonify([])

@app.route("/api/log/reload_name_map", methods=["POST"])
def api_reload_name_map():
    n = load_name_map()
    with _ip_cache_lock:
        _ip_name_cache.clear()
    return jsonify({"ok": True, "count": n})

@app.route("/api/reload_names", methods=["POST"])
def api_reload_names():
    return api_reload_name_map()

@app.route("/api/log/clear", methods=["POST"])
def api_log_clear():
    try:
        db = sqlite3.connect(DB_PATH, timeout=5)
        cur = db.execute("SELECT COUNT(*) FROM access_log")
        count = cur.fetchone()[0]
        db.execute("DELETE FROM access_log")
        db.commit()
        db.close()
        wlog("手動清空 access_log，共清除 " + str(count) + " 筆")
        return jsonify({"ok": True, "deleted": count})
    except Exception as e:
        wlog("api_log_clear error: " + str(e))
        return jsonify({"ok": False, "msg": str(e)}), 500

@app.route("/api/version")
def api_version():
    updated = []
    for svc in load_services():
        sid    = svc.get("id", "")
        script = svc.get("script", "")
        if not script or not os.path.isfile(script):
            continue
        info = running_services.get(sid)
        if not info:
            continue
        proc = info.get("proc")
        if not proc or proc.poll() is not None:
            continue
        try:
            mtime = os.path.getmtime(script)
            start = proc.create_time()
            if mtime > start:
                updated.append(svc.get("name", sid))
        except Exception:
            pass
    return jsonify({"updated": updated})

# ── Main ──────────────────────────────────────────────────────
def main():
    if not check_lock():
        print("HTA launcher already running.")
        return

    load_name_map()
    _init_all_proxies()
    _auto_start_services()

    threading.Thread(target=_daily_clear_scheduler, daemon=True, name="daily_clear").start()
    wlog("每日 07:00 自動清空排程已啟動")

    wlog("=" * 60)
    wlog("HTA Work Platform Launcher v2.9.3")
    wlog("Management @ http://localhost:" + str(MGMT_PORT))
    wlog("=" * 60)

    kill_port(MGMT_PORT)
    try:
        app.run(host="127.0.0.1", port=MGMT_PORT,
                debug=False, use_reloader=False, threaded=True)
    except KeyboardInterrupt:
        wlog("Interrupted by user.")
        shutdown_all()

if __name__ == "__main__":
    main()
