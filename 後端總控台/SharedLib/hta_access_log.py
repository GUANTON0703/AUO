"""
hta_access_log.py - HTA Work Platform Access Logger
放入 SharedLib，各後端一行接入：

    from hta_access_log import register_access_log
    register_access_log(app, "lv3")

寫入 hta_access.db，Dashboard Log監控 & 連線摘要即時顯示。
"""

import os
import sqlite3
import threading
import time

# ── DB 路徑（與 launcher.py 一致）──────────────────────────
_DB_PATH = r"U:\GPT\小工具轉換\後端總控台\LOG\hta_access.db"

# ── 不記錄的路徑前綴（health check / static 雜訊）──────────
_SKIP_PREFIXES = (
    "/favicon.ico",
    "/static/",
    "/health",
    "/ping",
    "/heartbeat",
)

# ── 不記錄的 HTTP Method ────────────────────────────────────
_SKIP_METHODS = {"HEAD", "OPTIONS"}

_lock = threading.Lock()
_table_ready = False


def _ensure_table():
    global _table_ready
    if _table_ready:
        return
    try:
        db = sqlite3.connect(_DB_PATH, timeout=5)
        db.execute("""
            CREATE TABLE IF NOT EXISTS access_log (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp      TEXT,
                service_id     TEXT,
                client_ip      TEXT,
                request_path   TEXT,
                request_method TEXT,
                status_code    INTEGER,
                request_ms     REAL,
                sql_text       TEXT,
                query_ms       REAL,
                rows_affected  INTEGER,
                error          TEXT
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_ts  ON access_log(timestamp)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_svc ON access_log(service_id)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_ip  ON access_log(client_ip)")
        db.commit()
        db.close()
        _table_ready = True
    except Exception as e:
        print("[hta_access_log] DB init error:", e)


def _write(service_id, client_ip, path, method, status, ms, error=None):
    """非同步寫入（不阻塞 request）"""
    _ensure_table()
    try:
        with _lock:
            db = sqlite3.connect(_DB_PATH, timeout=3)
            db.execute("""
                INSERT INTO access_log
                  (timestamp, service_id, client_ip, request_path,
                   request_method, status_code, request_ms, error)
                VALUES (datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?)
            """, (service_id, client_ip, path, method, status, ms, error))
            db.commit()
            db.close()
    except Exception as e:
        print("[hta_access_log] write error:", e)


def register_access_log(app, service_id: str):
    """
    Flask app 上掛 access log middleware。

    用法：
        from hta_access_log import register_access_log
        register_access_log(app, "lv3")

    service_id 對應 services.json 的 id 欄位：
        wish_pool / roller_mark / lv3 / lv3keyin /
        yield_query / id_convert / boss_site /
        fma_trend / yield_dashboard / pi_insp
    """
    _ensure_table()

    try:
        from flask import g, request as _req
    except ImportError:
        print("[hta_access_log] Flask not found, skipping middleware registration.")
        return

    @app.before_request
    def _before():
        g._hta_t = time.time()

    @app.after_request
    def _after(resp):
        try:
            path   = _req.path
            method = _req.method

            # 跳過雜訊
            if method in _SKIP_METHODS:
                return resp
            if any(path.startswith(p) for p in _SKIP_PREFIXES):
                return resp

            ms     = round((time.time() - g._hta_t) * 1000, 1)
            ip     = (_req.headers.get("X-Forwarded-For") or
                      _req.headers.get("X-Real-IP") or
                      _req.remote_addr or "")
            ip     = ip.split(",")[0].strip()
            status = resp.status_code
            error  = None if status < 400 else f"HTTP {status}"

            threading.Thread(
                target=_write,
                args=(service_id, ip, path, method, status, ms, error),
                daemon=True
            ).start()
        except Exception:
            pass
        return resp

    print(f"[hta_access_log] '{service_id}' access logging → {_DB_PATH}")
