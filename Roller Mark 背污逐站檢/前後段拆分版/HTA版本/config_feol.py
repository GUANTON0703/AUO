import os

# ===== FEOL 內網共享路徑 =====
NETWORK_PATH = r'\\TW100049089\ml8bc1\逐站檢資料'

# ===== TXT 紀錄目錄（JSON Lines，每月一個檔）=====
TXT_DIR = os.path.join(NETWORK_PATH, 'records')

# ===== 照片目錄 =====
PHOTOS_DIR = os.path.join(NETWORK_PATH, 'pic')

# ===== 機台資料 TXT =====
MACHINE_TXT = os.path.join(NETWORK_PATH, 'machine', 'machine_data.txt')

# ===== 初始化 =====
try:
    os.makedirs(TXT_DIR,    exist_ok=True)
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(MACHINE_TXT), exist_ok=True)
    print(f'✅ [FEOL] 資料夾初始化成功')
    print(f'   TXT_DIR:     {TXT_DIR}')
    print(f'   PHOTOS_DIR:  {PHOTOS_DIR}')
    print(f'   MACHINE_TXT: {MACHINE_TXT}')
except Exception as e:
    print(f'❌ [FEOL] 資料夾初始化失敗：{e}')
