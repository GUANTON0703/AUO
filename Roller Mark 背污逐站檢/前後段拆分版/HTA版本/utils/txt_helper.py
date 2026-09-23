"""
TXT 紀錄讀寫工具
格式：JSON Lines（每行一筆 JSON）
路徑：base_dir / 年 / 年-月.txt
例：records/2026/2026-07.txt

★ 新增：delete() 方法
"""
import json
import os


class TxtHelper:
    def __init__(self, base_dir):
        self.base_dir = base_dir

    # ===== 儲存一筆 =====
    def save(self, record):
        year_month = record['date'][:7]
        year       = record['date'][:4]
        txt_dir    = os.path.join(self.base_dir, year)
        os.makedirs(txt_dir, exist_ok=True)
        txt_path   = os.path.join(txt_dir, f'{year_month}.txt')
        with open(txt_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')


    # ===== 更新一筆（根據 createdAt 定位）=====
    def update(self, created_at, original_date, new_record):
        """
        根據 createdAt 找到原始那一筆，替換為 new_record
        original_date：原始日期（用來定位檔案位置）
        回傳 (True, '更新成功') 或 (False, '原因')
        """
        if not original_date or not created_at:
            return False, 'createdAt 或 original_date 不可為空'

        year_month = original_date[:7]
        year       = original_date[:4]
        txt_path   = os.path.join(self.base_dir, year, f'{year_month}.txt')

        if not os.path.exists(txt_path):
            return False, f'找不到檔案：{txt_path}'

        lines = []
        found = False
        try:
            with open(txt_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                        if rec.get('createdAt') == created_at:
                            lines.append(json.dumps(new_record, ensure_ascii=False))
                            found = True
                        else:
                            lines.append(line)
                    except Exception:
                        lines.append(line)
        except Exception as e:
            return False, f'讀取失敗：{e}'

        if not found:
            return False, f'找不到 createdAt={created_at} 的資料'

        try:
            with open(txt_path, 'w', encoding='utf-8') as f:
                for line in lines:
                    f.write(line + '\n')
        except Exception as e:
            return False, f'寫入失敗：{e}'

        return True, '更新成功'

    # ===== ★ 新增：刪除一筆 =====
    def delete(self, created_at, date):
        """
        根據 createdAt 刪除指定筆數
        date：原始日期（用來定位檔案位置），格式 YYYY-MM-DD
        回傳 (True, '刪除成功') 或 (False, '原因')
        """
        if not date or not created_at:
            return False, 'createdAt 或 date 不可為空'

        year_month = date[:7]
        year       = date[:4]
        txt_path   = os.path.join(self.base_dir, year, f'{year_month}.txt')

        if not os.path.exists(txt_path):
            return False, f'找不到檔案：{txt_path}'

        lines = []
        found = False
        try:
            with open(txt_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                        if rec.get('createdAt') == created_at:
                            found = True  # 跳過這一筆（即刪除）
                        else:
                            lines.append(line)
                    except Exception:
                        lines.append(line)
        except Exception as e:
            return False, f'讀取失敗：{e}'

        if not found:
            return False, f'找不到 createdAt={created_at} 的資料'

        try:
            with open(txt_path, 'w', encoding='utf-8') as f:
                for line in lines:
                    f.write(line + '\n')
        except Exception as e:
            return False, f'寫入失敗：{e}'

        return True, '刪除成功'

    # ===== 批次儲存 =====
    def save_batch(self, records):
        for record in records:
            self.save(record)

    # ===== 搜尋（支援日期範圍 + 欄位篩選）=====
    def search(self, filters=None, date_from='', date_to=''):
        results = []
        f = filters or {}

        for root, dirs, files in os.walk(self.base_dir):
            for file in sorted(files):
                if not file.endswith('.txt'):
                    continue

                # 快速跳過：年月不在範圍內直接略過整個檔案
                year_month = file.replace('.txt', '')
                if date_from and year_month < date_from[:7]:
                    continue
                if date_to and year_month > date_to[:7]:
                    continue

                txt_path = os.path.join(root, file)
                try:
                    with open(txt_path, encoding='utf-8') as fp:
                        for line in fp:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                rec = json.loads(line)
                            except Exception:
                                continue

                            # 日期精確篩選
                            d = rec.get('date', '')
                            if date_from and d < date_from:
                                continue
                            if date_to and d > date_to:
                                continue

                            # 欄位篩選
                            if f.get('model') and rec.get('model', '') != f['model']:
                                continue
                            if f.get('station'):
                                # ★ 站點比對：去空格+大寫，支援 PA後/PA 後 等格式
                                r_st = rec.get('station', '').strip().upper().replace(' ', '')
                                f_st = f['station'].strip().upper().replace(' ', '')
                                if r_st != f_st:
                                    continue
                            if f.get('line') and rec.get('line', '') != f['line']:
                                continue
                            if f.get('tc') and rec.get('tc', '') != f['tc']:
                                continue
                            if f.get('lv'):
                                r_lv = rec.get('lv', '')
                                if r_lv != f['lv']:
                                    try:  # 支援 '2' == '2.0' 等浮點格式差異
                                        if abs(float(r_lv) - float(f['lv'])) > 0.0001:
                                            continue
                                    except (ValueError, TypeError):
                                        continue
                            if f.get('empId') and rec.get('empId', '') != f['empId']:
                                continue
                            if f.get('sheetId') and rec.get('sheetId', '') != f['sheetId']:
                                continue

                            results.append(rec)
                except Exception as e:
                    print(f'⚠️ 讀取 TXT 失敗 {txt_path}：{e}')

        return results
