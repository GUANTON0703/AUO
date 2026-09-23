"""
fix_final.py — 使用正確的 _code 屬性，重新 patch + 存檔
修正對象：roller_mark, lv3, lv3keyin, yield_query
"""
import re, sys
sys.path.insert(0, ".")
from backend_editor import BackendEditor

editor = BackendEditor()

# ── patch 模板 ─────────────────────────────────────────────────────────────
def make_patch(class_name: str, logger_name: str) -> str:
    return f"""
# ── HTA Logger log_request patch ──────────────────────────────────────────
import time as _hta_time
from hta_logger import HTALogger
_hta_logger = HTALogger("{logger_name}")

_hta_orig_log = {class_name}.__dict__.get('log_request')
def _hta_log_request(self, code='-', size='-'):
    if _hta_orig_log:
        _hta_orig_log(self, code, size)
    try:
        method  = getattr(self, 'command', 'GET')
        path    = getattr(self, 'path', '/')
        elapsed = getattr(self, '_hta_elapsed', 0.0)
        _hta_logger.log(method=method, path=path, status=int(code), elapsed=elapsed)
    except Exception:
        pass
{class_name}.log_request = _hta_log_request

_hta_orig_setup = {class_name}.__dict__.get('setup')
def _hta_setup(self):
    if _hta_orig_setup:
        _hta_orig_setup(self)
    self._hta_t0 = _hta_time.time()
{class_name}.setup = _hta_setup

_hta_orig_finish = {class_name}.__dict__.get('finish')
def _hta_finish(self):
    elapsed = _hta_time.time() - getattr(self, '_hta_t0', _hta_time.time())
    self._hta_elapsed = elapsed
    if _hta_orig_finish:
        _hta_orig_finish(self)
{class_name}.finish = _hta_finish
"""

# ── 清除舊的 HTA 區塊（完整移除 # ── HTA Logger 到底） ────────────────────
HTA_START = "# ── HTA Logger"

def strip_old_hta(code: str) -> str:
    lines = code.splitlines(keepends=True)
    out, inside = [], False
    for ln in lines:
        if HTA_START in ln:
            inside = True
        if not inside:
            out.append(ln)
    return "".join(out)

# ── 找 class 名稱（BaseHTTPRequestHandler 子類） ──────────────────────────
def find_handler_class(code: str) -> str:
    m = re.search(r'^class\s+(\w+)\s*\(.*?BaseHTTPRequestHandler.*?\)', code, re.MULTILINE)
    if m:
        return m.group(1)
    # fallback: 找任何 Handler class
    m = re.search(r'^class\s+(\w+Handler)\b', code, re.MULTILINE)
    if m:
        return m.group(1)
    return None

# ══════════════════════════════════════════════════════════════════════════
# 處理每個後端
# ══════════════════════════════════════════════════════════════════════════

targets = {
    "roller_mark": "BeiwuAPIHandler",   # 已知
    "lv3keyin":    "Handler",           # 已知
    "yield_query": "Handler",           # 已知
    "lv3":         None,                # 自動偵測
}

for sid, class_name in targets.items():
    code = editor._code.get(sid)
    if code is None:
        print(f"[skip] {sid} 不在 _code 裡")
        continue

    # 自動偵測 class 名稱
    if class_name is None:
        class_name = find_handler_class(code)
        if class_name is None:
            print(f"[ERROR] {sid} 找不到 Handler class！請手動確認")
            continue
        print(f"[auto] {sid} → class: {class_name}")
    else:
        print(f"[known] {sid} → class: {class_name}")

    # 移除舊區塊
    code = strip_old_hta(code)

    # 在結尾追加新 patch
    code = code.rstrip() + "\n\n" + make_patch(class_name, sid) + "\n"

    # 寫回 _code
    editor._code[sid] = code
    print(f"[patch] {sid} ✅")

# ── 存檔 ───────────────────────────────────────────────────────────────────
print("\n── 存檔 ──")
for sid in targets:
    if sid in editor._code:
        try:
            editor.save(sid)
        except Exception as e:
            print(f"[ERROR] {sid} 存檔失敗：{e}")

# ── 驗證 ───────────────────────────────────────────────────────────────────
print("\n── 驗證 HTALogger 位置 ──")
editor2 = BackendEditor()
editor2.grep("HTALogger")
