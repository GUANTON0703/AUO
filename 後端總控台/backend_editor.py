"""
backend_editor.py — 後端總控台
自動讀取 services.json，載入所有後端程式碼，支援備份 + 修改 + 寫回
"""

import json
import shutil
import re
from pathlib import Path
from datetime import datetime

# ── 設定 ────────────────────────────────────────────────────────────
SERVICES_JSON = Path(__file__).parent / "services.json"
TIMESTAMP     = datetime.now().strftime("%Y%m%d_%H%M%S")


class BackendEditor:
    def __init__(self):
        self._services = {}   # id → service dict
        self._code     = {}   # id → str (原始碼)
        self._dirty    = {}   # id → str (修改後，待存)
        self._load_services()

    # ══════════════════════════════════════════════════════════════
    #  載入 services.json
    # ══════════════════════════════════════════════════════════════
    def _load_services(self):
        with open(SERVICES_JSON, encoding="utf-8") as f:
            data = json.load(f)

        services = data if isinstance(data, list) else data.get("services", [])
        for svc in services:
            sid = svc.get("id") or svc.get("name")
            self._services[sid] = svc

        print(f"[BackendEditor] 已載入 {len(self._services)} 個後端服務")
        self.list()
        self.read_all()

    # ══════════════════════════════════════════════════════════════
    #  列表
    # ══════════════════════════════════════════════════════════════
    def list(self):
        header = f"{'ID':<20} {'名稱':<30} {'Port':<6}  {'Script'}"
        print(header)
        print("─" * 80)
        for sid, svc in self._services.items():
            print(f"{sid:<20} {svc.get('name',''):<30} {str(svc.get('port','')):<6}   {svc.get('script','')}")

    # ══════════════════════════════════════════════════════════════
    #  讀取所有後端原始碼
    # ══════════════════════════════════════════════════════════════
    def read_all(self):
        print("\n── 搜尋現有 HTA Logger 狀態 ──")
        for sid, svc in self._services.items():
            path = svc.get("script", "")
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    self._code[sid] = f.read()
                print(f"[read] {sid} ← {path}")
            except Exception as e:
                print(f"[read_all] ⚠️  {sid} 讀取失敗：{e}")

        # 掃描 HTALogger 現況
        self._grep_all("HTALogger")

    # ══════════════════════════════════════════════════════════════
    #  顯示單個後端原始碼
    # ══════════════════════════════════════════════════════════════
    def show(self, sid: str, start: int = 1, end: int = None):
        code = self._dirty.get(sid) or self._code.get(sid)
        if not code:
            print(f"[show] ⚠️  {sid} 未載入")
            return
        lines = code.splitlines()
        for i, line in enumerate(lines[start-1:end], start=start):
            print(f"L{i:>5}: {line}")

    # ══════════════════════════════════════════════════════════════
    #  搜尋關鍵字
    # ══════════════════════════════════════════════════════════════
    def grep(self, keyword: str, sid: str = None):
        targets = [sid] if sid else list(self._services.keys())
        found_any = False
        for s in targets:
            code = self._dirty.get(s) or self._code.get(s, "")
            hits = [(i+1, line) for i, line in enumerate(code.splitlines()) if keyword in line]
            if hits:
                found_any = True
                print(f"\n── {s} ──")
                for lineno, line in hits:
                    print(f"  L{lineno:>5}: {line}")
        if not found_any:
            print(f"[grep] 所有後端都找不到 '{keyword}'")

    def _grep_all(self, keyword: str):
        self.grep(keyword)

    # ══════════════════════════════════════════════════════════════
    #  字串取代
    # ══════════════════════════════════════════════════════════════
    def replace(self, sid: str, old: str, new: str):
        code = self._dirty.get(sid) or self._code.get(sid)
        if not code:
            print(f"[replace] ⚠️  {sid} 未載入")
            return
        if old not in code:
            print(f"[replace] ⚠️  {sid} 找不到目標字串")
            return
        self._dirty[sid] = code.replace(old, new, 1)
        print(f"[replace] {sid} ✅")

    # ══════════════════════════════════════════════════════════════
    #  刪除包含關鍵字的行
    # ══════════════════════════════════════════════════════════════
    def remove_line(self, sid: str, keyword: str):
        code = self._dirty.get(sid) or self._code.get(sid)
        if not code:
            print(f"[remove_line] ⚠️  {sid} 未載入")
            return
        lines = code.splitlines(keepends=True)
        new_lines = [l for l in lines if keyword not in l]
        removed = len(lines) - len(new_lines)
        self._dirty[sid] = "".join(new_lines)
        print(f"[remove_line] {sid} 移除 {removed} 行含 '{keyword}'")

    # ══════════════════════════════════════════════════════════════
    #  在指定行後面插入新行
    # ══════════════════════════════════════════════════════════════
    def inject_after(self, sid: str, find: str, insert: str):
        """在第一個包含 find 的行後面插入 insert（精確行插入）"""
        code = self._dirty.get(sid) or self._code.get(sid)
        if not code:
            print(f"[inject_after] ⚠️  {sid} 未載入")
            return False
        lines = code.splitlines(keepends=True)
        for i, line in enumerate(lines):
            if find in line:
                # 取得縮排
                indent = re.match(r"(\s*)", line).group(1)
                lines.insert(i + 1, f"{indent}{insert}\n")
                self._dirty[sid] = "".join(lines)
                print(f"[inject_after] {sid} ✅ 在 L{i+1} 後插入")
                return True
        print(f"[inject_after] ⚠️  {sid} 找不到 '{find}'")
        return False

    # ══════════════════════════════════════════════════════════════
    #  一鍵加 HTA Logger（智慧注入）
    # ══════════════════════════════════════════════════════════════
    def add_hta_logger_all(self):
        print("\n" + "─" * 60)
        print("  開始注入 HTA Logger")
        print("─" * 60)

        stats = {"new": [], "register": [], "skip": [], "fail": []}

        for sid, svc in self._services.items():
            code = self._code.get(sid)
            if not code:
                print(f"[inject] {sid}：讀取失敗，跳過")
                stats["fail"].append(sid)
                continue

            has_logger   = "HTALogger" in code
            has_register = ".register(app)" in code

            # ── 已完整 ──────────────────────────────────────────
            if has_logger and has_register:
                print(f"[inject] ⏭️  {sid}：已完整，跳過")
                stats["skip"].append(sid)
                continue

            # ── 判斷框架 ────────────────────────────────────────
            is_flask   = "Flask(__name__)" in code or "Flask(__name__ )" in code
            is_fastapi = "FastAPI()" in code or "FastAPI(" in code

            if not is_flask and not is_fastapi:
                print(f"[inject] ⚠️  {sid}：無法判斷框架（非 Flask/FastAPI），跳過")
                stats["fail"].append(sid)
                continue

            framework = "Flask" if is_flask else "FastAPI"

            # ── 有 HTALogger 但缺 register ───────────────────────
            if has_logger and not has_register:
                # 先移除舊的錯誤位置（如果有）
                self.remove_line(sid, "_hta_logger.register(app)")
                # 在 app = Flask(...) 或 app = FastAPI(...) 後面插入
                find_str = "Flask(__name__)" if is_flask else "FastAPI("
                ok = self.inject_after(sid,
                    find=find_str,
                    insert="_hta_logger.register(app)  # HTA auto-middleware"
                )
                if ok:
                    print(f"[inject] {sid}：✅ 補上 .register(app)（位置正確）")
                    stats["register"].append(sid)
                else:
                    print(f"[inject] ⚠️  {sid}：找不到 app 建立點，跳過")
                    stats["fail"].append(sid)
                continue

            # ── 全新注入 ─────────────────────────────────────────
            find_str = "Flask(__name__)" if is_flask else "FastAPI("
            # 先注入 HTALogger 初始化（在 import flask/fastapi 後）
            import_kw = "from flask import" if is_flask else "from fastapi import"
            if import_kw not in code:
                import_kw = "import flask" if is_flask else "import fastapi"

            # 在 app = Flask/FastAPI 那行後面插入
            code_work = self._dirty.get(sid) or self._code.get(sid)
            lines = code_work.splitlines(keepends=True)
            inserted = False
            for i, line in enumerate(lines):
                if find_str in line:
                    indent = re.match(r"(\s*)", line).group(1)
                    lines.insert(i + 1, (
                        f"{indent}# ── HTA Logger ──\n"
                        f"{indent}from hta_logger import HTALogger\n"
                        f"{indent}_hta_logger = HTALogger(\"{sid}\")\n"
                        f"{indent}_hta_logger.register(app)  # HTA auto-middleware\n"
                    ))
                    self._dirty[sid] = "".join(lines)
                    print(f"[inject] {sid}：✅ {framework} 全新注入")
                    stats["new"].append(sid)
                    inserted = True
                    break
            if not inserted:
                print(f"[inject] ⚠️  {sid}：找不到 app 建立點，跳過")
                stats["fail"].append(sid)

        # ── 統計 ────────────────────────────────────────────────
        print("\n" + "─" * 60)
        print(f"  🆕 全新注入：{len(stats['new'])} 個  → {stats['new']}")
        print(f"  🔧 補 register：{len(stats['register'])} 個  → {stats['register']}")
        print(f"  ⏭️  已完整略過：{len(stats['skip'])} 個  → {stats['skip']}")
        print(f"  ❌ 失敗/跳過：{len(stats['fail'])} 個  → {stats['fail']}")
        print("─" * 60)

        pending = len(stats["new"]) + len(stats["register"])
        if pending:
            print(f"\n✏️  共 {pending} 個後端待存，確認後執行 editor.save_all()")

    # ══════════════════════════════════════════════════════════════
    #  存回單個後端（自動備份）
    # ══════════════════════════════════════════════════════════════
    def save(self, sid: str):
        if sid not in self._dirty:
            print(f"[save] {sid} 無修改，略過")
            return
        path = Path(self._services[sid]["script"])
        # 備份
        bak_name = f"{path.stem}.{TIMESTAMP}.bak{path.suffix}"
        bak_path = path.parent / bak_name
        shutil.copy2(path, bak_path)
        print(f"[backup] {sid} → {bak_name}")
        # 寫回
        with open(path, "w", encoding="utf-8") as f:
            f.write(self._dirty[sid])
        print(f"[save] {sid} → {path} ✅")
        # 同步 _code
        self._code[sid] = self._dirty.pop(sid)

    # ══════════════════════════════════════════════════════════════
    #  存回所有有修改的後端
    # ══════════════════════════════════════════════════════════════
    def save_all(self):
        targets = list(self._dirty.keys())
        if not targets:
            print("[save_all] 沒有待存的後端")
            return
        for sid in targets:
            self.save(sid)
        print(f"\n[save_all] 完成，共寫回 {len(targets)} 個後端 ✅")
