"""
許願池 - FastAPI 後端
部署路徑: \\tw100049089\00_MyAgent\許願池

[修改] 新增心跳機制：網頁關閉後自動結束伺服器
"""

import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import List
from pydantic import BaseModel

# ───────────────────────────────────────────
# 設定
# ───────────────────────────────────────────
ADMIN_PASSWORD = "999"          # ← 管理者密碼，自行修改
DB_PATH = Path(__file__).parent / "wishes.db"
STATIC_DIR = Path(".")               # index.html 放同一層

# ── 心跳設定 ──────────────────────────────
HEARTBEAT_TIMEOUT = 20   # 超過幾秒沒有心跳就關閉伺服器
HEARTBEAT_GRACE   = 30   # 啟動後多少秒才開始檢查（等瀏覽器開啟）
_last_heartbeat: float = 0.0
_heartbeat_lock = threading.Lock()

app = FastAPI(title="許願池")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ───────────────────────────────────────────
# 資料庫初始化（含 Write Lock）
# ───────────────────────────────────────────
_db_lock = threading.Lock()

def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS wishes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                wish        TEXT    NOT NULL,
                status      TEXT    NOT NULL DEFAULT 'pending',
                progress    INTEGER NOT NULL DEFAULT 0,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT    NOT NULL,
                completed_at TEXT
            );
        """)

init_db()

@contextmanager
def locked_db():
    """確保同一時間只有一個寫入操作，其他排隊等待"""
    with _db_lock:
        conn = get_db()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

# ───────────────────────────────────────────
# 心跳 Watchdog（背景執行緒）
# ───────────────────────────────────────────
def _heartbeat_watchdog():
    """
    啟動後先等待 GRACE 秒，讓瀏覽器有時間開啟並發送第一次心跳。
    之後每 5 秒檢查一次，若超過 TIMEOUT 秒沒收到心跳則關閉伺服器。
    """
    global _last_heartbeat
    print(f"[心跳] 等待 {HEARTBEAT_GRACE} 秒後開始監控...")
    time.sleep(HEARTBEAT_GRACE)

    with _heartbeat_lock:
        _last_heartbeat = time.time()   # 重置，避免誤判

    print(f"[心跳] 監控中（超過 {HEARTBEAT_TIMEOUT} 秒無心跳則自動關閉）")
    while True:
        time.sleep(5)
        with _heartbeat_lock:
            elapsed = time.time() - _last_heartbeat
        if elapsed > HEARTBEAT_TIMEOUT:
            print("\n[心跳] 網頁已關閉，伺服器自動結束。再見！👋")
            os._exit(0)

threading.Thread(target=_heartbeat_watchdog, daemon=True).start()

# ───────────────────────────────────────────
# Pydantic Models
# ───────────────────────────────────────────
class WishCreate(BaseModel):
    name: str
    wish: str

class AdminAuth(BaseModel):
    password: str

class ProgressUpdate(BaseModel):
    password: str
    progress: int          # 0–100

class StatusUpdate(BaseModel):
    password: str
    status: str            # pending / in_progress / completed

class OrderUpdate(BaseModel):
    password: str
    ordered_ids: List[int] # 依序傳入 id 陣列，代表新的排序

class DeleteWish(BaseModel):
    password: str

# ───────────────────────────────────────────
# 工具函式
# ───────────────────────────────────────────
def verify_admin(password: str):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="密碼錯誤")

def wish_to_dict(row) -> dict:
    return dict(row)

# ───────────────────────────────────────────
# 靜態檔案 & 首頁
# ───────────────────────────────────────────
@app.get("/")
def serve_index():
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html 不存在")
    return FileResponse(str(index_path))

# ───────────────────────────────────────────
# ★ 心跳 API（網頁每 5 秒呼叫一次）
# ───────────────────────────────────────────
@app.post("/api/heartbeat")
def heartbeat():
    """前端定期呼叫，告訴伺服器網頁還開著"""
    global _last_heartbeat
    with _heartbeat_lock:
        _last_heartbeat = time.time()
    return {"ok": True}

# ───────────────────────────────────────────
# ★ 關閉 API（網頁關閉時主動通知，加快關閉速度）
# ───────────────────────────────────────────
@app.post("/api/shutdown")
def shutdown():
    """網頁 beforeunload 時呼叫，立即結束伺服器"""
    def _do_shutdown():
        time.sleep(0.5)   # 讓 response 先送出
        print("\n[關閉] 收到網頁關閉通知，伺服器結束。再見！👋")
        os._exit(0)
    threading.Thread(target=_do_shutdown, daemon=True).start()
    return {"ok": True}

# ───────────────────────────────────────────
# API：許願（所有人）
# ───────────────────────────────────────────
@app.post("/api/wish")
def create_wish(body: WishCreate):
    """送出許願，自動排到待處理最後面"""
    name = body.name.strip()
    wish = body.wish.strip()
    if not name or not wish:
        raise HTTPException(status_code=400, detail="姓名與願望不可空白")

    with locked_db() as conn:
        row = conn.execute(
            "SELECT MAX(sort_order) as max_order FROM wishes WHERE status='pending'"
        ).fetchone()
        next_order = (row["max_order"] or 0) + 1
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute(
            "INSERT INTO wishes (name, wish, status, progress, sort_order, created_at) VALUES (?,?,?,?,?,?)",
            (name, wish, "pending", 0, next_order, now)
        )
    return {"ok": True, "message": "許願成功！"}

# ───────────────────────────────────────────
# API：取得願望列表（所有人）
# ───────────────────────────────────────────
@app.get("/api/wishes")
def get_wishes():
    """取得所有狀態的願望，前端依 status 分頁顯示"""
    with _db_lock:
        conn = get_db()
        rows = conn.execute(
            "SELECT * FROM wishes ORDER BY sort_order ASC, created_at ASC"
        ).fetchall()
        conn.close()
    return [wish_to_dict(r) for r in rows]

# ───────────────────────────────────────────
# API：管理者驗證
# ───────────────────────────────────────────
@app.post("/api/admin/verify")
def admin_verify(body: AdminAuth):
    verify_admin(body.password)
    return {"ok": True}

# ───────────────────────────────────────────
# API：刪除願望（管理者）
# ───────────────────────────────────────────
@app.delete("/api/wish/{wish_id}")
def delete_wish(wish_id: int, body: DeleteWish):
    verify_admin(body.password)
    with locked_db() as conn:
        result = conn.execute("DELETE FROM wishes WHERE id=?", (wish_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="找不到該願望")
    return {"ok": True}

# ───────────────────────────────────────────
# API：更新進度（管理者）
# ───────────────────────────────────────────
@app.patch("/api/wish/{wish_id}/progress")
def update_progress(wish_id: int, body: ProgressUpdate):
    verify_admin(body.password)
    progress = max(0, min(100, body.progress))
    with locked_db() as conn:
        conn.execute(
            "UPDATE wishes SET progress=? WHERE id=?",
            (progress, wish_id)
        )
    return {"ok": True, "progress": progress}

# ───────────────────────────────────────────
# API：更新狀態（管理者）
# ───────────────────────────────────────────
@app.patch("/api/wish/{wish_id}/status")
def update_status(wish_id: int, body: StatusUpdate):
    verify_admin(body.password)
    valid = ("pending", "in_progress", "completed")
    if body.status not in valid:
        raise HTTPException(status_code=400, detail="無效狀態")

    now = datetime.now().isoformat(timespec="seconds")
    completed_at = now if body.status == "completed" else None

    with locked_db() as conn:
        if body.status == "in_progress":
            conn.execute(
                "UPDATE wishes SET status=?, completed_at=?, progress=MAX(progress,1) WHERE id=?",
                (body.status, completed_at, wish_id)
            )
        else:
            conn.execute(
                "UPDATE wishes SET status=?, completed_at=? WHERE id=?",
                (body.status, completed_at, wish_id)
            )
    return {"ok": True}

# ───────────────────────────────────────────
# API：調整排序（管理者）
# ───────────────────────────────────────────
@app.patch("/api/wishes/reorder")
def reorder_wishes(body: OrderUpdate):
    verify_admin(body.password)
    with locked_db() as conn:
        for idx, wish_id in enumerate(body.ordered_ids):
            conn.execute(
                "UPDATE wishes SET sort_order=? WHERE id=?",
                (idx + 1, wish_id)
            )
    return {"ok": True}

# ───────────────────────────────────────────
# 啟動入口
# ───────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
