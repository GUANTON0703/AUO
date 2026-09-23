"""
fix_inject_v3.py
修正 BaseHTTPRequestHandler 後端的 HTA Logger 注入
以及 wish_pool (FastAPI) 的 register(app) 注入
"""
from backend_editor import BackendEditor
import re

editor = BackendEditor()

# ══════════════════════════════════════════════════════════
#  1. wish_pool → FastAPI register(app)
# ══════════════════════════════════════════════════════════
print("\n── [1] wish_pool：補上 FastAPI register(app) ──")
editor.remove_line("wish_pool", "_hta_logger.register(app)")
editor.inject_after(
    "wish_pool",
    find="app = FastAPI(",
    insert="_hta_logger.register(app)  # HTA auto-middleware"
)

# ══════════════════════════════════════════════════════════
#  2. BaseHTTPRequestHandler 後端 — 正確 patch log_request
#     roller_mark  → handler class: BeiwuAPIHandler
#     lv3keyin     → handler class: Handler
#     yield_query  → handler class: Handler
# ══════════════════════════════════════════════════════════
http_backends = {
    "roller_mark": "BeiwuAPIHandler",
    "lv3keyin":    "Handler",
    "yield_query": "Handler",
}

PATCH_TEMPLATE = """\
# ── HTA Logger patch (log_request) ──────────────────────
_orig_log_{safe}_{cls} = {cls}.log_request
def _hta_log_{safe}_{cls}(self, code='-', size='-'):
    _orig_log_{safe}_{cls}(self, code, size)
    try:
        import time as _t
        _hta_logger.log(
            method     = getattr(self, 'command', 'GET') or 'GET',
            path       = getattr(self, 'path', '/') or '/',
            status     = int(str(code).split()[0]) if str(code) != '-' else 0,
            duration_ms= 0,
            client_ip  = (self.client_address[0] if self.client_address else '-'),
            user_agent = (self.headers.get('User-Agent', '-') if self.headers else '-'),
        )
    except Exception:
        pass
{cls}.log_request = _hta_log_{safe}_{cls}
# ── end HTA Logger ───────────────────────────────────────
"""

for sid, cls in http_backends.items():
    print(f"\n── [2] {sid}：修正 BaseHTTPRequestHandler patch ──")

    # 先移除舊的錯誤注入（整個 HTA Logger 區塊）
    code = editor._code.get(sid, "")
    if not code:
        print(f"  ⚠️  {sid} 未載入，跳過")
        continue

    lines = code.splitlines(keepends=True)

    # 找到 HTA Logger 區塊起始行（含 from hta_logger import 的那行前面）
    # 移除從 "# ── HTA Logger" 或 "import time as _hta_time" 開始到區塊結尾
    clean_lines = []
    skip = False
    for line in lines:
        stripped = line.strip()
        # 舊注入區塊開始標記
        if ("import time as _hta_time" in stripped or
            "# ── HTA Logger (auto-patched)" in stripped):
            skip = True
        # 舊注入區塊的已知結尾：碰到空行連續出現後的非 patch 程式碼
        # 用更保守的方式：只跳過明確的舊 patch 程式碼
        if skip:
            if any(kw in stripped for kw in [
                "import time as _hta_time",
                "# ── HTA Logger (auto-patched)",
                "from hta_logger import HTALogger",
                "_hta_logger = HTALogger",
                "_hta_orig_setup",
                "_hta_setup",
                "_hta_orig_handle",
                "_hta_handle",
                "HTALogger(",
                ".setup = _hta_setup",
                ".handle_one_request = _hta_handle",
            ]):
                continue  # 跳過舊注入行
            else:
                skip = False  # 遇到非 patch 行，結束跳過

        clean_lines.append(line)

    # 新 patch 加到檔案末尾
    safe = sid.replace("-", "_")
    new_block = "\n" + PATCH_TEMPLATE.format(cls=cls, safe=safe)
    new_block += "\n"

    # 加上正確的 from hta_logger import HTALogger（如果被移除了）
    full_block = (
        "\n# ── HTA Logger ──────────────────────────────────────\n"
        "from hta_logger import HTALogger\n"
        f'_hta_logger = HTALogger("{sid}")\n'
        + new_block
    )

    editor._dirty[sid] = "".join(clean_lines).rstrip("\n") + "\n" + full_block
    print(f"  ✅ {sid} 已重新注入 log_request patch（class: {cls}）")

# ══════════════════════════════════════════════════════════
#  3. lv3 — 先看結尾 50 行，確認框架再處理
# ══════════════════════════════════════════════════════════
print("\n── [3] lv3：查看結尾 30 行 ──")
code_lv3 = editor._code.get("lv3", "")
lines_lv3 = code_lv3.splitlines()
for i, line in enumerate(lines_lv3[-30:], start=len(lines_lv3)-29):
    print(f"L{i:>5}: {line}")

# ══════════════════════════════════════════════════════════
#  存檔
# ══════════════════════════════════════════════════════════
print("\n── 存檔 ──")
editor.save_all()
