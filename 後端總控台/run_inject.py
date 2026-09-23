from backend_editor import BackendEditor

editor = BackendEditor()

# 移除舊的錯誤注入，重新在正確位置插入
for svc_id in ["roller_mark", "lv3", "lv3keyin", "yield_query"]:
    editor.remove_line(svc_id, "_hta_logger.register(app)")
    editor.inject_after(svc_id, 
        find="app = Flask(__name__)",
        insert="_hta_logger.register(app)  # HTA auto-middleware"
    )

editor.save_all()