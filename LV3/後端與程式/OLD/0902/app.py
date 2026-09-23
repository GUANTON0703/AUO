#!/usr/bin/env python3







# -*- coding: utf-8 -*-















"""







LV3 資料查詢系統 - V9.7







★ V9.5：Excel COM 改用 DispatchEx，不影響用戶自己開的 Excel







★ V9.6：DEFECT 支援逗號分隔多選







★ V9.7：修正 DEFECT 搜尋邏輯 — 保留原始字母順序模糊匹配，同時支援逗號多選







  例：CPC,CFM → 每個關鍵字各自做模糊匹配，任一符合即通過







      CPC 能找到 CELL PARTICLE CLUSTER（C...P...C 字母順序出現）







"""















import os







import sys







import json







import re







import webbrowser







import subprocess







import shutil







from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer







from urllib.parse import urlparse, parse_qs, quote







from pathlib import Path







import sqlite3







import io







import threading







import time















try:







    from PIL import Image, ImageGrab







    PIL_AVAILABLE = True







except ImportError:







    Image = None







    ImageGrab = None







    PIL_AVAILABLE = False















try:







    import chardet







except ImportError:







    chardet = None















# ===== 配置 =====







PORT = 5103







BASE_PATH = r'\\tw100049089\ML8BC1\LV3\L8B_LV3\Daily Report'







TXT_PATH = os.path.join(BASE_PATH, '文字檔')















FALLBACK_PNG = (







    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"







    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc````\x00"







    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"







)















def get_exe_directory():







    if hasattr(sys, 'frozen') and hasattr(sys, '_MEIPASS'):







        exe_dir = os.path.dirname(sys.executable)







        print(f"📍 偵測到 PyInstaller 環境")







        print(f"   EXE 位置: {sys.executable}")







        print(f"   EXE 資料夾: {exe_dir}\n")







        return exe_dir







    else:







        exe_dir = os.path.dirname(os.path.abspath(__file__))







        print(f"📍 開發環境")







        print(f"   程式位置: {__file__}\n")







        return exe_dir















EXE_DIR = get_exe_directory()















excel_cache = {}







excel_app = None















try:







    import win32com.client







    EXCEL_COM_AVAILABLE = True







    print("✅ pywin32 已安裝，可使用 Excel COM\n")







except ImportError:







    EXCEL_COM_AVAILABLE = False







    print("⚠️  pywin32 未安裝")







    print("   請執行: pip install pywin32\n")















if PIL_AVAILABLE:







    print("✅ Pillow 已安裝，可使用快照圖片處理\n")







else:







    print("⚠️  Pillow 未安裝，快照功能將降級")







    print("   請執行: pip install pillow\n")















if chardet is None:







    print("⚠️  chardet 未安裝，文字檔編碼偵測將使用 utf-8 預設")







    print("   建議執行: pip install chardet\n")















def load_html():







    candidates = ['index.html', 'lindex.html']







    print("🔍 尋找 HTML 檔案...")







    print(f"   搜尋資料夾: {EXE_DIR}")







    for name in candidates:







        html_file = os.path.join(EXE_DIR, name)







        print(f"   嘗試: {html_file}")







        if os.path.exists(html_file):







            try:







                with open(html_file, 'r', encoding='utf-8') as f:







                    content = f.read()







                    print(f"✅ 成功讀取 {name}")







                    print(f"✅ 檔案大小: {len(content)} 字元\n")







                    return content







            except Exception as e:







                print(f"⚠️  讀取 {name} 失敗: {e}\n")







    print("❌ 找不到可用 HTML（index.html / lindex.html）")







    return get_default_html()















def get_local_html_path():







    for name in ('index.html', 'lindex.html'):







        html_file = os.path.join(EXE_DIR, name)







        if os.path.exists(html_file):







            return html_file







    return None















def open_url_prefer_modern_browser(url):







    browser_candidates = []







    for cmd in ('msedge', 'chrome'):







        exe = shutil.which(cmd)







        if exe:







            browser_candidates.append(exe)







    local_appdata = os.environ.get('LOCALAPPDATA', '')







    program_files = os.environ.get('ProgramFiles', 'C:\\Program Files')







    program_files_x86 = os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)')







    browser_candidates.extend([







        os.path.join(local_appdata, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),







        os.path.join(program_files, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),







        os.path.join(program_files_x86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),







        os.path.join(local_appdata, 'Google', 'Chrome', 'Application', 'chrome.exe'),







        os.path.join(program_files, 'Google', 'Chrome', 'Application', 'chrome.exe'),







        os.path.join(program_files_x86, 'Google', 'Chrome', 'Application', 'chrome.exe'),







    ])







    tried = set()







    for exe in browser_candidates:







        if not exe:







            continue







        exe_norm = os.path.normpath(exe)







        if exe_norm in tried:







            continue







        tried.add(exe_norm)







        if os.path.exists(exe_norm):







            try:







                subprocess.Popen([exe_norm, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)







                print(f"🌐 已用瀏覽器開啟: {exe_norm}")







                return True







            except Exception as e:







                print(f"⚠️  瀏覽器啟動失敗: {exe_norm} ({e})")







    try:







        webbrowser.open(url)







        print("🌐 已用系統預設瀏覽器開啟")







        return True







    except Exception as e:







        print(f"⚠️  系統預設瀏覽器開啟失敗: {e}")







        return False















def get_default_html():







    return """<!DOCTYPE html><html><head><meta charset="UTF-8"><title>LV3 系統</title><style>body { font-family: Microsoft JhengHei, Arial; background: #1e1e1e; color: #fff; padding: 30px; line-height: 1.8; }</style></head><body><h1>❌ 找不到 index.html</h1><p>請將 index.html 複製到 EXE 同資料夾</p></body></html>"""















# HTML 改為動態讀取（每次 request 都讀 index.html，不快取）







# HTML_CONTENT = load_html()  ← 已移除















# ===== 工具函數 =====















def get_encoding(file_path):







    if chardet is None:







        return 'utf-8'







    try:







        with open(file_path, 'rb') as f:







            data = f.read(10000)







            result = chardet.detect(data)







            return result.get('encoding', 'utf-8') or 'utf-8'







    except:







        return 'utf-8'















def scan_years():







    if not os.path.exists(TXT_PATH):







        return []







    years = []







    try:







        for item in os.listdir(TXT_PATH):







            item_path = os.path.join(TXT_PATH, item)







            if os.path.isdir(item_path):







                txt_count = len([f for f in os.listdir(item_path) if f.endswith('.txt')])







                db_count  = len([f for f in os.listdir(item_path) if f.endswith('.db')])







                if txt_count > 0 or db_count > 0:







                    years.append({'year': item, 'fileCount': txt_count + db_count})







    except Exception as e:







        print(f"⚠️  掃描年份時出錯: {e}")







    return sorted(years, key=lambda x: x['year'], reverse=True)















def load_month_data(year, month):







    month_str = str(month).zfill(2)







    month_file = os.path.join(TXT_PATH, year, f'{year}{month_str}.txt')







    records = []







    if os.path.exists(month_file):







        try:







            encoding = get_encoding(month_file)







            with open(month_file, 'r', encoding=encoding, errors='ignore') as f:







                for line in f:







                    parts = line.strip().split('\t')







                    if len(parts) >= 7:







                        records.append({







                            'id':     parts[0],







                            'name':   parts[1],







                            'date':   parts[2],







                            'model':  parts[3],







                            'defect': parts[4],







                            'jnd':    parts[5],







                            'source': parts[6]







                        })







        except Exception as e:







            print(f'讀取 {month_file} 失敗: {e}')







    records.extend(load_month_data_db(year, month))







    return records















def load_month_data_db(year, month):







    month_str = str(month).zfill(2)







    db_file = os.path.join(TXT_PATH, year, f'{year}{month_str}.db')







    if not os.path.exists(db_file):







        return []







    records = []







    try:







        conn = sqlite3.connect(db_file)







        conn.row_factory = sqlite3.Row







        cursor = conn.cursor()







        # Fix-7: SELECT * 相容新舊 DB

        def _row_get(row, col, default=''):

            try:

                v = row[col]

                return v if v is not None else default

            except (IndexError, KeyError):

                return default

        cursor.execute('SELECT * FROM records')







        for row in cursor.fetchall():







            records.append({







                'id':          row['chip_id'],







                'name':        row['user'],







                'date':        row['date'],







                'model':       row['model']       or '',







                'grade':       row['grade']       or '',







                'defect':      row['defect']      or '',







                'jnd':         row['jnd']         or '',







                'description': row['description'] or '',







                'judgment':    row['judgment']    or '',







                'tool_id':     row['tool_id']     or '',







                'pol':         row['pol']         or '',







                'x_start':     row['x_start']     or '',







                'x_end':       row['x_end']       or '',







                'y_start':     row['y_start']     or '',







                'y_end':       row['y_end']       or '',







                'source':      row['image_path']  or '',







                'sketch_path': row['sketch_path'] or '',



                'image_path_2': _row_get(row, 'image_path_2'),



                'image_path_3': _row_get(row, 'image_path_3')







            })







        conn.close()







    except Exception as e:







        print(f'[DB] 讀取失敗 {db_file}: {e}')







    return records















# 支援的圖片副檔名







_IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp')















def parse_source(source_str):







    if source_str:







        s = source_str.strip()







        if s.lower().endswith(_IMAGE_EXTS):







            return {'file_path': s, 'sheet_name': '', 'row_num': 0}







    try:







        parts = [p.strip() for p in source_str.split('|')]







        if len(parts) >= 3:







            file_path = parts[0]







            sheet_name = parts[1]







            row_str = parts[2].replace('Row', '').strip()







            row_num = int(row_str)







            return {'file_path': file_path, 'sheet_name': sheet_name, 'row_num': row_num}







    except:







        pass







    return None















# ===== 進階篩選函數 =====















def fuzzy_match_defect(text, keyword):







    """







    ★ 原始模糊匹配邏輯（保留）：







    keyword 的每個字母要按順序出現在 text 中，忽略大小寫和空白。







    例：CPC → CELL PARTICLE CLUSTER ✅（C...P...C 按順序出現）







        TPP → TOP PF PARTICLE ✅（T...P...P 按順序出現）







    """







    if not keyword:







        return True







    t = text.upper().replace(' ', '')







    k = keyword.upper().replace(' ', '')







    ti = 0







    for ch in k:







        found = t.find(ch, ti)







        if found == -1:







            return False







        ti = found + 1







    return True















def extract_numbers_from_jnd(jnd_str):







    nums = re.findall(r'\d+\.?\d*', jnd_str)







    return [float(n) for n in nums]















def match_jnd(jnd_str, op, threshold):







    if not op:







        return True







    raw = jnd_str.strip()







    cell_ops = re.findall(r'([><=])\s*(\d+\.?\d*)', raw)







    if cell_ops:







        for c_op, c_val in cell_ops:







            c_num = float(c_val)







            if op == '>':







                if c_op == '>' and c_num >= threshold:







                    return True







                if c_op in ('=', '') and c_num > threshold:







                    return True







            elif op == '<':







                if c_op == '<' and c_num <= threshold:







                    return True







                if c_op in ('=', '') and c_num < threshold:







                    return True







            elif op == '=':







                if c_num == threshold:







                    return True







        return False







    nums = extract_numbers_from_jnd(raw)







    if not nums:







        return False







    for num in nums:







        if op == '>' and num > threshold:







            return True







        elif op == '<' and num < threshold:







            return True







        elif op == '=' and num == threshold:







            return True







    return False















def apply_adv_filter(record, adv_filter):







    """







    套用進階篩選條件，全部通過才回傳 True







    """







    if not adv_filter:







        return True















    # 第4欄：型號多選







    models = adv_filter.get('models', [])







    if models:







        if record['model'].strip() not in models:







            return False















    # ★ V9.7 修正：第5欄 DEFECT 逗號分隔多選 + 保留原始模糊匹配邏輯







    # 每個逗號分隔的關鍵字都用 fuzzy_match_defect（字母順序匹配），任一符合即通過







    # 例：CPC,CFM → CPC 或 CFM 任一能在 DEFECT 中找到字母順序匹配即通過







    defect_kw = adv_filter.get('defect_keyword', '').strip()







    if defect_kw:







        keywords = [k.strip() for k in defect_kw.split(',') if k.strip()]







        if not any(fuzzy_match_defect(record['defect'], kw) for kw in keywords):







            return False















    # 第6欄：JND 數值篩選







    jnd_op = adv_filter.get('jnd_op', '')







    jnd_value = adv_filter.get('jnd_value')







    if jnd_op and jnd_value is not None:







        try:







            threshold = float(jnd_value)







            if not match_jnd(record['jnd'], jnd_op, threshold):







                return False







        except (ValueError, TypeError):







            pass















    return True















# ===== 取得第4欄所有不重複型號（只保留9碼）=====















def scan_all_models(query_periods):







    model_set = set()







    for year_item, month in query_periods:







        records = load_month_data(year_item, month)







        for r in records:







            m = r['model'].strip()







            if m and len(m) == 9:







                model_set.add(m)







    return sorted(model_set)















# ===== Excel 快照相關 =====















def get_or_open_workbook(file_path, retry_count=3):
    global excel_app

    # ── 試用快取 ──────────────────────────────────────
    if file_path in excel_cache:
        try:
            _ = excel_cache[file_path].Name        # 測試物件是否還活著
            print(f"   📂 使用快取: {os.path.basename(file_path)}")
            return excel_cache[file_path]
        except:
            del excel_cache[file_path]             # 快取壞了，移除

    # ── 重試迴圈（每次都確保 excel_app 健在）──────────
    last_error = None
    for attempt in range(retry_count):
        try:
            # 若 excel_app 不存在或已被重置，重建一個新的
            if excel_app is None:
                print(f"   ⏳ 啟動獨立 Excel instance... (第 {attempt+1} 次)")
                import win32com.client
                # ★ V9.5：DispatchEx 建立獨立 process，不影響用戶自己開的 Excel
                excel_app = win32com.client.DispatchEx("Excel.Application")
                excel_app.Visible = False
                excel_app.DisplayAlerts = False
                print(f"   ✅ 已建立獨立 Excel process（不影響用戶已開啟的 Excel）")

            print(f"   ⏳ 開啟檔案: {os.path.basename(file_path)}")
            workbook = excel_app.Workbooks.Open(
                file_path,
                UpdateLinks=False,
                ReadOnly=True,
                IgnoreReadOnlyRecommended=True,
                Notify=False
            )
            excel_cache[file_path] = workbook
            print(f"   ✅ 已開啟（第 {attempt+1} 次嘗試）")
            return workbook

        except Exception as e:
            last_error = e
            err_str    = str(e)

            # ── 偵測 COM 斷連 / RPC 錯誤 ──────────────
            # -2147220995 = RPC_E_DISCONNECTED
            # -2147023170 = RPC_S_SERVER_UNAVAILABLE
            # -2147418113 = CO_E_OBJNOTCONNECTED
            hresult = getattr(e, 'hresult', None) or getattr(e, 'hr', None)
            is_com_dead = (
                hresult in (-2147220995, -2147023170, -2147418113)
                or '物件未連接' in err_str
                or 'disconnected'       in err_str.lower()
                or 'rpc'                in err_str.lower()
                or 'server unavailable' in err_str.lower()
            )

            if is_com_dead:
                print(f"   ⚠️  COM 斷連（{hresult}），重置 Excel 實例...")
                try:
                    if excel_app is not None:
                        excel_app.Quit()
                except:
                    pass
                excel_app = None        # 強制重建
                excel_cache.clear()     # 清除所有過時快取
            else:
                print(f"   ⚠️  第 {attempt+1} 次嘗試失敗: {e}")

            if attempt < retry_count - 1:
                wait_time = (attempt + 1) * 1.5
                print(f"   ⏳ 等待 {wait_time}s 後重試...")
                time.sleep(wait_time)

    raise Exception(f"無法開啟檔案（重試 {retry_count} 次）: {last_error}")
def find_worksheet_with_fuzzy_match(workbook, original_sheet_name):







    try:







        stripped_sheet_name = original_sheet_name.strip()







        sheet_count = workbook.Sheets.Count







        for i in range(1, sheet_count + 1):







            current_sheet = workbook.Sheets(i)







            if current_sheet.Name.strip() == stripped_sheet_name:







                return current_sheet







        raise Exception(f"找不到分頁: {original_sheet_name}")







    except Exception as e:







        raise















def generate_snapshot_with_pywin32(file_path, sheet_name, row_num):







    try:







        import pythoncom







        pythoncom.CoInitialize()







    except Exception:







        pass







    if not EXCEL_COM_AVAILABLE:







        return create_error_image("❌ pywin32 未安裝", "請執行: pip install pywin32")







    if not PIL_AVAILABLE:







        return create_error_image("❌ Pillow 未安裝", "請執行: pip install pillow")







    try:







        print(f"\n📸 生成快照 (pywin32 COM + 剪貼簿):")







        print(f"   檔案: {file_path}")







        print(f"   分頁: '{sheet_name}'")







        print(f"   列號: {row_num}")







        if not os.path.exists(file_path):







            return create_error_image(f"❌ 找不到檔案", file_path)







        try:







            workbook = get_or_open_workbook(file_path, retry_count=3)







        except Exception as e:







            error_msg = str(e)







            if "已在使用" in error_msg or "permission" in error_msg.lower():







                return create_error_image("❌ 檔案被占用", "可能其他用戶正在使用此檔案，請稍候後重試")







            else:







                return create_error_image(f"❌ 檔案開啟失敗", error_msg[:60])







        try:







            worksheet = find_worksheet_with_fuzzy_match(workbook, sheet_name)







        except Exception as e:







            return create_error_image(f"❌ 找不到分頁", f"'{sheet_name}'")







        try:







            cell_range = worksheet.Range(f"B{row_num}:Q{row_num}")







        except:







            return create_error_image(f"❌ 列號超出範圍", f"Row {row_num}")







        cell_range.Copy()







        time.sleep(0.8)







        img = ImageGrab.grabclipboard()







        if img is None:







            return create_error_image("❌ 剪貼簿為空", "複製可能失敗")







        print(f"   ✅ 成功擷取圖片: {img.size[0]}x{img.size[1]}px")







        output = io.BytesIO()







        img.save(output, format='PNG')







        output.seek(0)







        print(f"   ✅ 快照生成成功 ({len(output.getvalue())} bytes)")
        result_bytes = output.getvalue()
        # ★ Fix-Issue3b: 用完立即關閉，避免後端殘留大量 Excel 開啟
        try:
            workbook.Close(False)
            global excel_cache
            if file_path in excel_cache:
                del excel_cache[file_path]
            print(f"   🔒 workbook 已關閉: {os.path.basename(file_path)}")
        except Exception as _ce:
            print(f"   ⚠️  關閉失敗 (不影響結果): {_ce}")
        return result_bytes







    except Exception as e:







        print(f"   ❌ 快照生成失敗: {e}")







        import traceback







        traceback.print_exc()







        return create_error_image(f"❌ 生成失敗", str(e)[:50])















def create_error_image(title, detail):







    if not PIL_AVAILABLE:







        return FALLBACK_PNG







    img = Image.new('RGB', (800, 150), color='#ffebee')







    try:







        from PIL import ImageDraw, ImageFont







        draw = ImageDraw.Draw(img)







        try:







            font = ImageFont.truetype("msyh.ttc", 14)







            small_font = ImageFont.truetype("msyh.ttc", 10)







        except:







            try:







                font = ImageFont.truetype("arial.ttf", 14)







                small_font = ImageFont.truetype("arial.ttf", 10)







            except:







                font = ImageFont.load_default()







                small_font = font







        draw.text((20, 30), title, font=font, fill='#d32f2f')







        draw.text((20, 65), detail[:80], font=small_font, fill='#999999')







    except:







        pass







    output = io.BytesIO()







    img.save(output, format='PNG')







    output.seek(0)







    return output.getvalue()















def cleanup_excel():







    global excel_app, excel_cache







    print("\n⏹️  清理 Excel 資源...")







    for file_path, wb in list(excel_cache.items()):







        try:







            wb.Close(False)







            print(f"   ✅ 已關閉: {os.path.basename(file_path)}")







        except:







            pass







    excel_cache.clear()







    if excel_app is not None:







        try:







            excel_app.Quit()







            print(f"   ✅ 已關閉獨立 Excel process")







        except:







            pass







        excel_app = None















# ===== 解析查詢期間輔助 =====















def parse_periods(periods_raw):







    result = []







    if not isinstance(periods_raw, list):







        return result







    for item in periods_raw:







        if isinstance(item, str):







            m = re.match(r'^(\d{4})[-/]?(\d{1,2})$', item.strip())







            if m:







                y = m.group(1)







                mm = int(m.group(2))







                if 1 <= mm <= 12:







                    result.append((y, mm))







        elif isinstance(item, dict):







            y = str(item.get('year', '')).strip()







            try:







                mm = int(item.get('month', 0))







            except:







                mm = 0







            if re.match(r'^\d{4}$', y) and 1 <= mm <= 12:







                result.append((y, mm))







    return sorted(set(result), key=lambda x: (x[0], x[1]))























# ===== 個人日報 API 輔助函數 =====















def scan_all_names(query_periods):







    """掃描指定期間內所有不重複的人員名稱"""







    name_set = set()







    for year_item, month in query_periods:







        records = load_month_data(year_item, month)







        for r in records:







            n = r.get('name', '').strip()







            if n:







                name_set.add(n)







    return sorted(name_set)























def normalize_date(d):







    """







    標準化日期為 YYYYMMDD（8碼）







    舊 TXT 格式：YYYYMMMMDD（10碼，月份重複，例：2025070701 → 20250701）







    新 DB  格式：YYYYMMDD（8碼，例：20260826）







    """







    d = d.strip()







    if len(d) == 10:          # 舊 TXT：YYYY MM MM DD







        return d[0:6] + d[8:10]   # 取 YYYYMM + DD，跳過重複月份







    elif len(d) >= 8:







        return d[:8]          # 新 DB 或其他格式，取前8碼







    return d















def query_daily_report(date_str, name_str, query_periods):







    """依日期與人員名稱查詢當天資料，date_str 格式為 YYYYMMDD"""







    results = []







    for year_item, month in query_periods:







        records = load_month_data(year_item, month)







        for r in records:







            if normalize_date(r.get('date', '')) != date_str:







                continue







            if name_str and r.get('name', '').strip() != name_str:







                continue







            source_info = parse_source(r.get('source', ''))







            parsed_src = source_info or {'file_path': '', 'sheet_name': '', 'row_num': 0}







            results.append({







                'id':          r['id'],







                'model':       r['model'],







                'defect':      r['defect'],







                'jnd':         r['jnd'],







                'name':        r['name'],







                'date':        r['date'],







                'year':        year_item,







                'month':       month,







                'file_path':   parsed_src['file_path'],







                'sheet_name':  parsed_src['sheet_name'],







                'row_num':     parsed_src['row_num'],







                'grade':       r.get('grade', ''),







                'description': r.get('description', ''),







                'judgment':    r.get('judgment', ''),







                'tool_id':     r.get('tool_id', ''),







                'pol':         r.get('pol', ''),







                'x_start':     r.get('x_start', ''),







                'x_end':       r.get('x_end', ''),







                'y_start':     r.get('y_start', ''),







                'y_end':       r.get('y_end', ''),







                'sketch_path': r.get('sketch_path', ''),
                'image_path_2': r.get('image_path_2', ''),  # Fix-8C
                'image_path_3': r.get('image_path_3', ''),
            })







    return results















# ===== HTTP 處理器 =====















class RequestHandler(BaseHTTPRequestHandler):















    def send_cors_headers(self):







        self.send_header('Access-Control-Allow-Origin', '*')







        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')







        self.send_header('Access-Control-Allow-Headers', 'Content-Type')















    def do_OPTIONS(self):







        self.send_response(204)







        self.send_cors_headers()







        self.end_headers()







    def do_GET(self):







        parsed = urlparse(self.path)







        path = parsed.path







        query = parse_qs(parsed.query)















        if path == '/':







            self.send_response(200)







            self.send_cors_headers()







            self.send_header('Content-Type', 'text/html; charset=utf-8')







            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')







            self.send_header('Pragma', 'no-cache')







            self.end_headers()







            self.wfile.write(load_html().encode('utf-8'))















        elif path == '/api/years':







            years = scan_years()







            self.send_json({'success': True, 'years': years})















        elif path == '/api/names':







            try:







                year_qs  = query.get('year',  [''])[0].strip()







                month_qs = query.get('month', ['0'])[0].strip()







                if year_qs and month_qs.isdigit():







                    periods = [(year_qs, int(month_qs))]







                else:







                    periods = [(str(y['year']), m) for y in scan_years() for m in range(1, 13)]







                names = scan_all_names(periods)







                self.send_json({'success': True, 'names': names})







            except Exception as e:







                self.send_json({'success': False, 'error': str(e)})















        elif path == '/api/snapshot/':







            file_path = query.get('file_path', [''])[0]







            sheet_name = query.get('sheet_name', [''])[0]







            row_num_str = query.get('row_num', ['0'])[0]







            try:







                row_num = int(row_num_str)







            except:







                row_num = 0







            if file_path and sheet_name and row_num > 0:







                png_data = generate_snapshot_with_pywin32(file_path, sheet_name, row_num)







                self.send_response(200)







                self.send_cors_headers()







                self.send_header('Content-Type', 'image/png')







                self.send_header('Cache-Control', 'no-cache')







                self.end_headers()







                self.wfile.write(png_data)







            else:







                png_data = create_error_image("❌ 參數不完整", "")







                self.send_response(400)







                self.send_cors_headers()







                self.send_header('Content-Type', 'image/png')







                self.end_headers()







                self.wfile.write(png_data)















        elif path == '/api/image':







            qs = parse_qs(parsed.query)







            img_path = (qs.get('path', [''])[0]).strip()







            # ── AB-patch debug ──







            print(f'[/api/image] 收到路徑: {repr(img_path)}')







            print(f'[/api/image] 檔案存在: {os.path.exists(img_path)}')







            # 嘗試列出父目錄（只印前5個，方便比對）







            try:







                parent = os.path.dirname(img_path)







                if os.path.isdir(parent):







                    files = os.listdir(parent)







                    print(f'[/api/image] 父目錄內容(前5): {files[:5]}')







                else:







                    print(f'[/api/image] 父目錄不存在: {repr(parent)}')







            except Exception as _de:







                print(f'[/api/image] 列目錄失敗: {_de}')







            # ── end debug ──







            if not img_path or not os.path.exists(img_path):







                self.send_response(404)







                self.send_cors_headers()







                self.end_headers()







                return







            try:







                with open(img_path, 'rb') as f:







                    img_data = f.read()







                # 依副檔名決定 Content-Type







                ext = os.path.splitext(img_path)[1].lower()







                mime_map = {







                    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',







                    '.png': 'image/png',  '.gif': 'image/gif',







                    '.bmp': 'image/bmp',  '.webp': 'image/webp',







                }







                mime = mime_map.get(ext, 'image/jpeg')







                self.send_response(200)







                self.send_cors_headers()







                self.send_header('Content-Type', mime)







                self.send_header('Cache-Control', 'no-cache')







                self.end_headers()







                self.wfile.write(img_data)







            except Exception as e:







                self.send_response(500)







                self.send_cors_headers()







                self.end_headers()















        else:







            self.send_response(404)







            self.send_cors_headers()







            self.end_headers()















    def do_POST(self):







        content_length = int(self.headers.get('Content-Length', 0))







        body = self.rfile.read(content_length)















        if self.path == '/api/query':







            try:







                data = json.loads(body.decode('utf-8'))







                query_id   = data.get('query_id', '')







                year       = data.get('year', '')







                months     = data.get('months', [])







                periods    = data.get('periods', [])







                adv_filter = data.get('adv_filter', {})















                if isinstance(query_id, str):







                    query_ids = [query_id] if query_id.strip() else []







                elif isinstance(query_id, list):







                    query_ids = [q for q in query_id if q.strip()]







                else:







                    query_ids = []















                query_id_set = {qid.upper() for qid in query_ids}







                query_periods = parse_periods(periods)















                try:







                    months = [int(m) for m in months]







                except:







                    months = []







                if not query_periods and year and months:







                    for mm in months:







                        if 1 <= mm <= 12:







                            query_periods.append((str(year), mm))







                    query_periods = sorted(set(query_periods), key=lambda x: (x[0], x[1]))















                print(f"\n📍 查詢請求: ID={query_ids}, Periods={query_periods}, AdvFilter={adv_filter}")















                results = []







                for year_item, month in query_periods:







                    records = load_month_data(year_item, month)







                    for record in records:







                        if query_id_set and record['id'].upper() not in query_id_set:







                            continue







                        if not apply_adv_filter(record, adv_filter):







                            continue







                        source_info = parse_source(record['source'])
                        parsed_src = source_info or {'file_path': record.get('source', ''), 'sheet_name': '', 'row_num': 0}














                        results.append({







                            'id':         record['id'],







                            'model':      record['model'],







                            'defect':     record['defect'],







                            'jnd':        record['jnd'],







                            'name':       record['name'],







                            'date':       record['date'],







                            'year':       year_item,







                            'month':      month,







                            'file_path':  parsed_src['file_path'],







                            'sheet_name': parsed_src['sheet_name'],







                            'row_num':    parsed_src['row_num'],







                            'grade':       record.get('grade', ''),







                            'description': record.get('description', ''),







                            'judgment':    record.get('judgment', ''),







                            'tool_id':     record.get('tool_id', ''),







                            'pol':         record.get('pol', ''),







                            'x_start':     record.get('x_start', ''),







                            'x_end':       record.get('x_end', ''),







                            'y_start':     record.get('y_start', ''),







                            'y_end':       record.get('y_end', ''),







                            'sketch_path': record.get('sketch_path', ''),



                            'image_path_2': record.get('image_path_2', ''),



                            'image_path_3': record.get('image_path_3', '')







                        })















                print(f"   ✅ 找到 {len(results)} 筆結果")







                self.send_json({'success': True, 'results': results})















            except Exception as e:







                print(f"   ❌ 查詢錯誤: {e}")







                self.send_json({'success': False, 'error': str(e)})















        elif self.path == '/api/daily':















            try:















                data = json.loads(body.decode('utf-8'))















                date_str = data.get('date', '').strip()   # YYYYMMDD















                name_str = data.get('name', '').strip()















                periods_raw = data.get('periods', [])















                query_periods = parse_periods(periods_raw)















                if not query_periods:















                    # 若前端未傳 periods，掃描 date 對應的年月















                    if len(date_str) == 8 and date_str.isdigit():















                        y = date_str[:4]; m = int(date_str[4:6])















                        query_periods = [(y, m)]















                    else:















                        self.send_json({'success': False, 'error': '日期格式錯誤，請用 YYYYMMDD'})















                        return















                print(f'\n📅 個人日報查詢: date={date_str}, name={name_str}, periods={query_periods}')















                results = query_daily_report(date_str, name_str, query_periods)















                print(f'   找到 {len(results)} 筆')















                self.send_json({'success': True, 'results': results})















            except Exception as e:















                print(f'   ❌ 個人日報查詢錯誤: {e}')















                self.send_json({'success': False, 'error': str(e)})































        elif self.path == '/api/models':







            try:







                data = json.loads(body.decode('utf-8'))







                periods = data.get('periods', [])







                query_periods = parse_periods(periods)







                print(f"\n📍 型號列表請求: Periods={query_periods}")







                models = scan_all_models(query_periods)







                print(f"   ✅ 找到 {len(models)} 個不重複9碼型號")







                self.send_json({'success': True, 'models': models})







            except Exception as e:







                print(f"   ❌ 型號列表錯誤: {e}")







                self.send_json({'success': False, 'error': str(e)})















        elif self.path == '/api/snapshot/finish':







            try:







                cleanup_excel()







                self.send_json({'success': True})







            except Exception as e:







                print(f"   ❌ 快照收尾失敗: {e}")







                self.send_json({'success': False, 'error': str(e)})















        else:







            self.send_response(404)







            self.send_cors_headers()







            self.end_headers()















    def send_json(self, data):







        self.send_response(200)







        self.send_cors_headers()







        self.send_header('Content-Type', 'application/json; charset=utf-8')







        self.end_headers()







        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))















    def log_message(self, format, *args):







        pass















# ===== 啟動伺服器 =====















def start_server():







    host = '0.0.0.0'







    active_port = PORT







    try:







        server = ThreadingHTTPServer((host, active_port), RequestHandler)







    except OSError as e:







        print('FAIL Port', active_port, 'cannot bind:', e)







        return















    print("\n" + "="*70)







    print("🚀 LV3 資料查詢系統 - V9.7（DEFECT 模糊匹配 + 逗號多選）")







    print("="*70)







    print(f"📍 API 位址: http://{host}:{active_port}")







    print(f"📂 資料路徑: {TXT_PATH}")







    print(f"⏹️  按 Ctrl+C 停止伺服器")







    print("="*70 + "\n")















    print("✨ 版本說明：")







    print("   ✅ V9.5：Excel COM 改用 DispatchEx，不影響用戶自己開的 Excel")







    print("   ✅ V9.6：DEFECT 支援逗號分隔多選")







    print("   ✅ V9.7：修正 DEFECT 搜尋 — 保留字母順序模糊匹配 + 逗號多選")







    print("            CPC → 能找到 CELL PARTICLE CLUSTER")







    print("            CPC,CFM → CPC 或 CFM 任一模糊匹配即通過\n")















    if os.path.exists(TXT_PATH):







        print("✅ TXT 路徑驗證成功\n")







    else:







        print("⚠️  警告: TXT 資料路徑不存在\n")















    if EXCEL_COM_AVAILABLE:







        print("✅ pywin32 已就緒\n")







    else:







        print("❌ 快照功能無法使用\n")















    try:







        server.serve_forever()







    except KeyboardInterrupt:







        print("\n")







    finally:







        try:







            server.server_close()







        except:







            pass







        cleanup_excel()







        print("⏹️  伺服器已停止\n")







        sys.exit(0)































# ── HTA Logger (auto-patched) ─────────────────────────────







import time as _hta_time







from hta_logger import HTALogger







_hta_logger = HTALogger("lv3")















_hta_orig_setup = RequestHandler.__dict__.get('setup')







def _hta_setup(self):







    if _hta_orig_setup:







        _hta_orig_setup(self)







    else:







        import socketserver







        socketserver.StreamRequestHandler.setup(self)







    self._hta_t0 = _hta_time.time()







RequestHandler.setup = _hta_setup















def _hta_log_request(self, code='-', size='-'):







    from http.server import BaseHTTPRequestHandler as _BHRH







    _BHRH.log_request(self, code, size)







    try:







        _ms = int((_hta_time.time() - getattr(self, '_hta_t0', _hta_time.time())) * 1000)







        _code = int(str(code)) if str(code).isdigit() else 0







        _hta_logger.log_request(







            client_ip     = self.client_address[0],







            request_path  = getattr(self, 'path', ''),







            request_ms    = _ms,







            response_code = _code,







        )







    except Exception:







        pass







RequestHandler.log_request = _hta_log_request







# ── End HTA Logger ───────────────────────────────────────────















if __name__ == '__main__':







    start_server()







