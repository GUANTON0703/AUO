from backend_editor import BackendEditor

editor = BackendEditor()

print("\n── 搜尋 app = ──")
editor.grep("app = ")

print("\n── 搜尋 create_app ──")
editor.grep("create_app")

print("\n── 搜尋 Flask( ──")
editor.grep("Flask(")
