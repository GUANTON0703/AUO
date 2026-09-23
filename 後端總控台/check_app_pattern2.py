from backend_editor import BackendEditor

editor = BackendEditor()

# 搜尋各種可能的 app 建立寫法
patterns = [
    "app=Flask",      # 無空格
    "APP = Flask",    # 大寫
    "APP=Flask",      # 大寫無空格
    "app = Flask",    # 標準（上次已找到 pi_insp）
    "app = FastAPI",  # FastAPI 標準
    "APP = FastAPI",  # FastAPI 大寫
    "= Flask(",       # 任何變數名
    "= FastAPI(",     # 任何變數名
]

for p in patterns:
    print(f"\n── 搜尋 '{p}' ──")
    editor.grep(p)
