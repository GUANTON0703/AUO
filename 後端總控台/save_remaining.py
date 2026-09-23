"""
save_remaining.py
- 補存 roller_mark, lv3keyin, yield_query
- 同時修正 lv3（BaseHTTPServer 用 start_server，找 Handler class 再 patch）
"""

import sys, re
sys.path.insert(0, ".")
from backend_editor import BackendEditor

editor = BackendEditor()

# ── lv3：找 Handler class 名稱並注入 log_request patch ──
print("\n── [lv3] 查找 Handler class ──")
lv3_code = editor.sources.get("lv3", "")

# 找 BaseHTTPRequestHandler 子類別
handler_match = re.search(r"class\s+(\w+)\s*\(.*?BaseHTTPRequestHandler.*?\)", lv3_code)
if handler_match:
    cls_name = handler_match.group(1)
    print(f"  找到 class: {cls_name}")

    # 移除舊的空白注入殘骸
    editor.remove_line("lv3", "_hta_logger.register(app)")

    # 重新注入 log_request patch
    patch = f"""
# ── HTA Logger log_request patch ──────────────────────────
_hta_orig_log = {cls_name}.__dict__.get('log_request')
def _hta_log_request(self, code='-', size='-'):
    if _hta_orig_log:
        _hta_orig_log(self, code, size)
    try:
        method  = getattr(self, 'command', 'GET')
        path    = getattr(self, 'path', '/')
        status  = int(str(code)) if str(code).isdigit() else 200
        _hta_logger.log(method, path, status)
    except Exception:
        pass
{cls_name}.log_request = _hta_log_request
# ───────────────────────────────────────────────────────────
"""
    # 插在 HTALogger 那行後面
    lines = editor.sources["lv3"].splitlines(keepends=True)
    insert_at = None
    for i, line in enumerate(lines):
        if '_hta_logger = HTALogger("lv3")' in line:
            insert_at = i + 1
            break

    if insert_at:
        lines.insert(insert_at, patch)
        editor.sources["lv3"] = "".join(lines)
        editor._dirty.add("lv3")
        print(f"  ✅ lv3 patch 已注入（class: {cls_name}）")
    else:
        print("  ⚠️  找不到 HTALogger 行，跳過")
else:
    print("  ⚠️  找不到 BaseHTTPRequestHandler 子類別，手動確認 lv3 的 Handler 名稱")

# ── 存檔（只存這四個）──
print("\n── 存檔 ──")
for sid in ["roller_mark", "lv3", "lv3keyin", "yield_query"]:
    try:
        editor.save(sid)
    except PermissionError as e:
        print(f"[❌ PermissionError] {sid}：{e}")
        print(f"   → 請先關閉該後端再重試！")
    except Exception as e:
        print(f"[❌ Error] {sid}：{e}")

print("\n完成 ✅")
