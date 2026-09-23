import os
from pathlib import Path
from datetime import datetime
import base64

def ensure_photo_dirs(base_path, date_str):
    """確保照片資料夾存在"""
    # 不再按日期分層，直接存在 pic 資料夾
    os.makedirs(base_path, exist_ok=True)
    return base_path

def save_photo_from_bytes(file_data, filename, base_path, date_str):
    """從二進制資料儲存照片 - 直接存在 pic 資料夾"""
    try:
        os.makedirs(base_path, exist_ok=True)
        
        file_path = os.path.join(base_path, filename)
        with open(file_path, 'wb') as f:
            f.write(file_data)
        
        print(f'✅ 照片已儲存：{filename}')
        return True, file_path
    except Exception as e:
        print(f'❌ 照片儲存失敗：{e}')
        return False, str(e)

def get_excel_path(base_path, date_str):
    """取得 Excel 檔案路徑 - 直接存在逐站檢資料資料夾"""
    # 檔案名稱格式：{日期}.xlsx
    os.makedirs(base_path, exist_ok=True)
    return os.path.join(base_path, f'{date_str}.xlsx')

def decode_base64_image(dataUrl):
    """解碼 Base64 圖片"""
    try:
        if ',' not in dataUrl:
            return None
        header, data_str = dataUrl.split(',', 1)
        file_data = base64.b64decode(data_str)
        return file_data
    except Exception as e:
        print(f'❌ Base64 解碼失敗：{e}')
        return None
