import os

# ===== BEOL 內網共享路徑 =====
NETWORK_PATH = r'\\TW100049089\ml8bc1\逐站檢資料'

# ===== TXT 紀錄目錄（JSON Lines，每月一個檔）=====
BEOL_TXT_DIR = os.path.join(NETWORK_PATH, 'records_beol')

# ===== 照片目錄 =====
BEOL_PHOTOS_DIR = os.path.join(NETWORK_PATH, 'pic_beol')

# ===== 初始化 =====
try:
    os.makedirs(BEOL_TXT_DIR,    exist_ok=True)
    os.makedirs(BEOL_PHOTOS_DIR, exist_ok=True)
    print(f'✅ [BEOL] 資料夾初始化成功')
    print(f'   BEOL_TXT_DIR:    {BEOL_TXT_DIR}')
    print(f'   BEOL_PHOTOS_DIR: {BEOL_PHOTOS_DIR}')
except Exception as e:
    print(f'❌ [BEOL] 資料夾初始化失敗：{e}')
