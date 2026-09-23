"""
hta_logger.py — HTA Access Logger
自動攔截所有 Flask / FastAPI request，寫入 SQLite DB
放在 SharedLib 資料夾，各後端 import 使用
"""

import sqlite3
import time
import threading
from datetime import datetime
from pathlib import Path

# ── DB 路徑（固定在後端總控台 LOG 資料夾）──────────────────────────
_DB_PATH = r"U:\GPT\小工具轉換\後端總控台\LOG\hta_access.db"

# ── Thread-local SQLite 連線 ────────────────────────────────────────
_local = threading.local()

def _get_conn():
    if not hasattr(_local, "conn") or _local.conn is None:
        Path(_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
        _local.conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
        _local.conn.execute("""
            CREATE TABLE IF NOT EXISTS access_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          TEXT    NOT NULL,
                service     TEXT    NOT NULL,
                method      TEXT,
                path        TEXT,
                status      INTEGER,
                duration_ms REAL,
                client_ip   TEXT,
                user_agent  TEXT
            )
        """)
        _local.conn.execute("CREATE INDEX IF NOT EXISTS idx_ts      ON access_log(ts)")
        _local.conn.execute("CREATE INDEX IF NOT EXISTS idx_service ON access_log(service)")
        _local.conn.commit()
    return _local.conn


class HTALogger:
    def __init__(self, service_name: str):
        self.service = service_name
        print(f"[hta_logger] '{service_name}' → {_DB_PATH}")

    # ── 核心寫入 ──────────────────────────────────────────────────
    def log(self, method: str, path: str, status: int,
            duration_ms: float, client_ip: str = "-", user_agent: str = "-"):
        try:
            conn = _get_conn()
            conn.execute(
                "INSERT INTO access_log"
                " (ts, service, method, path, status, duration_ms, client_ip, user_agent)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                 self.service, method, path, status,
                 round(duration_ms, 2), client_ip, user_agent)
            )
            conn.commit()
        except Exception as e:
            print(f"[hta_logger] ⚠️ 寫入失敗：{e}")

    # ── 舊版手動呼叫（向下相容）──────────────────────────────────
    def log_request(self, client_ip="-", request_path="/",
                    method="GET", status=200, duration_ms=0, user_agent="-"):
        self.log(method, request_path, status, duration_ms, client_ip, user_agent)

    # ── 自動 Middleware 掛載（Flask & FastAPI）────────────────────
    def register(self, app):
        """
        一行自動攔截所有 request。
        Flask:   _hta_logger.register(app)   ← app = Flask(...)
        FastAPI: _hta_logger.register(app)   ← app = FastAPI(...)
        """
        app_type = type(app).__name__

        # ── Flask ────────────────────────────────────────────────
        if app_type == "Flask":
            logger = self

            @app.before_request
            def _before():
                from flask import g
                g._hta_start = time.time()

            @app.after_request
            def _after(response):
                from flask import request, g
                duration = (time.time() - getattr(g, "_hta_start", time.time())) * 1000
                ip = request.headers.get("X-Forwarded-For", request.remote_addr or "-")
                ua = request.headers.get("User-Agent", "-")
                logger.log(request.method, request.path,
                           response.status_code, duration, ip, ua)
                return response

            print(f"[hta_logger] ✅ Flask middleware 已掛載 → {self.service}")

        # ── FastAPI / Starlette ───────────────────────────────────
        elif app_type in ("FastAPI", "Starlette"):
            from starlette.middleware.base import BaseHTTPMiddleware
            from starlette.requests import Request
            logger = self

            class _HTAMiddleware(BaseHTTPMiddleware):
                async def dispatch(self, request: Request, call_next):
                    start = time.time()
                    response = await call_next(request)
                    duration = (time.time() - start) * 1000
                    ip = request.headers.get("x-forwarded-for",
                                             getattr(request.client, "host", "-"))
                    ua = request.headers.get("user-agent", "-")
                    logger.log(request.method, request.url.path,
                               response.status_code, duration, ip, ua)
                    return response

            app.add_middleware(_HTAMiddleware)
            print(f"[hta_logger] ✅ FastAPI middleware 已掛載 → {self.service}")

        else:
            print(f"[hta_logger] ⚠️ 不認識的框架類型：{app_type}，跳過掛載")
