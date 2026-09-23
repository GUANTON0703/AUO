"""
check_editor_attrs.py
印出 BackendEditor 物件的所有屬性與型別，幫助確認 source 存在哪個欄位
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from backend_editor import BackendEditor

editor = BackendEditor()

print("── BackendEditor 所有屬性 ──")
for attr in sorted(vars(editor).keys()):
    val = getattr(editor, attr)
    t   = type(val).__name__
    if isinstance(val, dict):
        sample_keys = list(val.keys())[:5]
        print(f"  {attr:30s}  dict  keys={sample_keys}")
    elif isinstance(val, list):
        print(f"  {attr:30s}  list  len={len(val)}")
    else:
        print(f"  {attr:30s}  {t}")
