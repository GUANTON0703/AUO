from backend_editor import BackendEditor

editor = BackendEditor()

# 看 HTALogger 附近各 10 行的上下文
targets = {
    "roller_mark": 181,   # _hta_logger = HTALogger("roller_mark")
    "lv3":         7145,  # _hta_logger = HTALogger("lv3")
    "lv3keyin":    1195,  # _hta_logger = HTALogger("lv3keyin")
    "yield_query": 722,   # _hta_logger = HTALogger("yield_query")
}

for sid, line_no in targets.items():
    print(f"\n{'='*60}")
    print(f"  {sid}  (L{line_no-10} ~ L{line_no+5})")
    print(f"{'='*60}")
    editor.show(sid, start=max(1, line_no-10), end=line_no+5)
