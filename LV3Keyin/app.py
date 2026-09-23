"""
LV3 快速 KEYIN 系統 — 後端伺服器 (SQLite 版本 - 按月份存放)
建立：2026/08/03  更新：202608051800
修改：INDEX_HTML 改為 \\tw100049089\\00_MyAgent\\LV3Keyin\\index_lv3.html
修改：改回用 http://localhost:5000/ 開啟（file:// 有 CORS preflight 拖慢速度）
新增：/api/defect-lookup — 讀取 DEFECT.txt，依 Defect code 自動帶入呈象描述與判定畫面
"""

import os
import json
import html
import base64
import logging
import warnings
import webbrowser
import time
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from pathlib import Path

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)
for _n in ('zeep','zeep.wsdl','zeep.xsd','lxml','urllib3','requests'):
    logging.getLogger(_n).setLevel(logging.CRITICAL)

try:
    from lxml import etree as lxml_etree
    _orig_fs = lxml_etree.fromstring
    def _safe_fromstring(text, *a, **kw):
        parser = lxml_etree.XMLParser(huge_tree=True, recover=True)
        if isinstance(text, str):
            text = text.encode('utf-8')
        return _orig_fs(text, parser=parser)
    lxml_etree.fromstring = _safe_fromstring
except ImportError:
    pass

import requests as req_lib
from zeep import Client
from zeep.transports import Transport

# ═══════════════════════════════════════════════════
# ★ 設定區
# ═══════════════════════════════════════════════════
WSDL_URL   = "http://hlwbs001:8250/L8BOlapWebService/L8BServices.asmx?wsdl"
PORT       = int(os.environ.get('MOD_PORT', 5104))
TZ         = timezone(timedelta(hours=8))

# ★ 本地 HTML 路徑（Python 伺服器會讀取並 serve 給瀏覽器）
INDEX_HTML = os.environ.get(
    'LV3_INDEX_HTML',
    r'\\tw100049089\00_MyAgent\LV3Keyin\index_lv3.html'
)

# SQLite 資料庫基礎路徑 (按月份放置)
DB_BASE_PATH = r'\\tw100049089\ML8BC1\LV3\L8B_LV3\Daily Report\文字檔'
PIC_BASE = r'\\tw100049089\ML8BC1\LV3\L8B_LV3\Daily Report\文字檔\PIC'

# ★ DEFECT.txt 路徑
DEFECT_TXT = r'\\tw100049089\ML8BC1\LV3\L8B_LV3\Daily Report\文字檔\DEFECT.txt'

# 全部 7 位用戶
NAMES = ['陳凱年', '林千', '余秋月', '李奕寬', '陳怡君', '黃美珠', '大寶']
ADMIN_USER = '大寶'

DEFAULT_USERS = {n: '000' for n in NAMES}

# 標題預設值
DEFAULT_TITLE = 'OCT覆判'

# ═══════════════════════════════════════════════════


# ───────────────────────────────────────────────────
# 資料庫路徑管理
# ───────────────────────────────────────────────────
def _get_db_path(date_str: str = None) -> str:
    if date_str is None:
        date_str = datetime.now(TZ).strftime('%Y%m%d')
    year = date_str[:4]
    month = date_str[4:6]
    folder = os.path.join(DB_BASE_PATH, year)
    os.makedirs(folder, exist_ok=True)
    db_name = f'{year}{month}.db'
    db_path = os.path.join(folder, db_name)
    return db_path


def _init_db(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user TEXT NOT NULL,
            chip_id TEXT NOT NULL,
            date TEXT NOT NULL,
            model TEXT,
            grade TEXT,
            defect TEXT,
            jnd TEXT,
            description TEXT,
            judgment TEXT,
            tool_id TEXT,
            pol TEXT,
            x_start TEXT,
            x_end TEXT,
            y_start TEXT,
            y_end TEXT,
            title TEXT,
            image_path TEXT,
            sketch_path TEXT,
            image_path_2 TEXT,
            image_path_3 TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user, chip_id, date)
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            name TEXT PRIMARY KEY,
            password TEXT NOT NULL
        )
    ''')
    for name, pwd in DEFAULT_USERS.items():
        try:
            cursor.execute('INSERT INTO users (name, password) VALUES (?, ?)', (name, pwd))
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    conn.close()



def _migrate_db(db_path: str):
    """為既有 DB 自動補上新欄（ALTER TABLE IF NOT EXISTS 替代）"""
    for _col_def in ["sketch_path TEXT", "image_path_2 TEXT", "image_path_3 TEXT"]:
        _col_name = _col_def.split()[0]
        _conn = None
        try:
            _conn = sqlite3.connect(db_path)
            _conn.cursor().execute(f"ALTER TABLE records ADD COLUMN {_col_def}")
            _conn.commit()
            _conn.close()
            print(f'[DB] migration: 已新增 {_col_name} 欄 ({db_path})')
        except sqlite3.OperationalError:
            if _conn:
                try: _conn.close()
                except: pass

def _get_db(date_str: str = None):
    db_path = _get_db_path(date_str)
    if not os.path.exists(db_path):
        print(f'[DB] 建立新資料庫: {db_path}')
        _init_db(db_path)
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    _migrate_db(db_path)  # 確保新欄存在
    return conn, db_path


# ───────────────────────────────────────────────────
# 使用者個人設定（欄寬、列高…）
# ───────────────────────────────────────────────────
def _settings_dir() -> str:
    d = os.path.join(DB_BASE_PATH, 'user_settings')
    os.makedirs(d, exist_ok=True)
    return d

def _settings_file(user: str) -> str:
    safe = user.replace('/', '_').replace('\\', '_')
    return os.path.join(_settings_dir(), f'{safe}.json')

def _load_user_settings(user: str) -> dict:
    fp = _settings_file(user)
    if not os.path.exists(fp):
        return {}
    try:
        with open(fp, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def _save_user_settings(user: str, settings: dict):
    fp = _settings_file(user)
    try:
        with open(fp, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f'[SETTINGS] 儲存失敗: {e}')

def _global_settings_file() -> str:
    return os.path.join(_settings_dir(), 'global.json')

def _load_global_settings() -> dict:
    fp = _global_settings_file()
    if not os.path.exists(fp): return {}
    try:
        with open(fp, 'r', encoding='utf-8') as f: return json.load(f)
    except Exception: return {}

def _save_global_settings(settings: dict):
    fp = _global_settings_file()
    try:
        with open(fp, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f'[SETTINGS] 儲存全域設定失敗: {e}')

# ───────────────────────────────────────────────────
# 使用者管理
# ───────────────────────────────────────────────────
def _load_users() -> dict:
    try:
        conn, _ = _get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT name, password FROM users')
        users = {row['name']: row['password'] for row in cursor.fetchall()}
        conn.close()
        return users if users else DEFAULT_USERS.copy()
    except Exception as e:
        print(f'[USERS] 讀取失敗: {e}')
        return DEFAULT_USERS.copy()


def _save_password(user: str, password: str):
    try:
        year = datetime.now(TZ).strftime('%Y')
        folder = os.path.join(DB_BASE_PATH, year)
        if os.path.exists(folder):
            for db_file in os.listdir(folder):
                if db_file.endswith('.db'):
                    db_path = os.path.join(folder, db_file)
                    conn = sqlite3.connect(db_path)
                    cursor = conn.cursor()
                    cursor.execute('UPDATE users SET password = ? WHERE name = ?', (password, user))
                    conn.commit()
                    conn.close()
    except Exception as e:
        print(f'[USERS] 儲存失敗: {e}')


# ───────────────────────────────────────────────────
# ★ DEFECT.txt 讀取
# ───────────────────────────────────────────────────


# ── 除帳 SCRP 查詢 ──
def query_chip_scrp(chip_id):
    sql = (
        "WITH latest AS ("
        "    SELECT cassette_id, MAX(trans_timestamp) AS latest_time"
        "    FROM celods.h_chip_trans_ods"
        "    WHERE sheet_id_chip_id = '{}'" .format(chip_id) +
        "      AND trans_id = 'SCRP'"
        "    GROUP BY cassette_id"
        ") "
        "SELECT b.sheet_id_chip_id,"
        "       TO_CHAR(b.trans_timestamp,'YYYY/MM/DD HH24:MI:SS') AS trans_timestamp,"
        "       b.cassette_id, b.sheet_id, b.op_id, b.wo_id,"
        "       b.trans_id, b.trans_user, SUBSTR(b.model_no,1,9) AS model_no"
        " FROM celods.h_chip_trans_ods b"
        " JOIN latest a"
        "   ON b.cassette_id = a.cassette_id"
        "  AND b.trans_timestamp BETWEEN a.latest_time - INTERVAL '2' MINUTE"
        "                            AND a.latest_time + INTERVAL '2' MINUTE"
        " WHERE b.trans_id = 'SCRP'"
        " ORDER BY b.trans_timestamp"
    )
    rows = query_ws(sql)
    result = []
    for row in rows:
        result.append({
            'SHEET_ID_CHIP_ID': (row.get('SHEET_ID_CHIP_ID') or '').strip(),
            'TRANS_TIMESTAMP':  (row.get('TRANS_TIMESTAMP') or '').strip(),
            'CASSETTE_ID':      (row.get('CASSETTE_ID') or '').strip(),
            'SHEET_ID':         (row.get('SHEET_ID') or '').strip(),
            'OP_ID':            (row.get('OP_ID') or '').strip(),
            'WO_ID':            (row.get('WO_ID') or '').strip(),
            'TRANS_ID':         (row.get('TRANS_ID') or '').strip(),
            'TRANS_USER':       (row.get('TRANS_USER') or '').strip(),
            'MODEL_NO':         (row.get('MODEL_NO') or '').strip(),
        })
    return result

def _load_defect_txt() -> dict:
    """
    讀取 DEFECT.txt，回傳 {defect_code: {description, judgment}} dict。
    格式：Tab 或逗號分隔三欄 → Defect | 呈象描述 | 判定畫面
    支援 UTF-8 BOM / Big5 自動偵測。
    """
    result = {}
    if not os.path.exists(DEFECT_TXT):
        print(f'[DEFECT] 找不到檔案: {DEFECT_TXT}')
        return result
    for enc in ('utf-8-sig', 'utf-8', 'big5', 'cp950'):
        try:
            with open(DEFECT_TXT, 'r', encoding=enc) as f:
                lines = f.readlines()
            break
        except (UnicodeDecodeError, LookupError):
            continue
    else:
        print(f'[DEFECT] 無法解碼: {DEFECT_TXT}')
        return result

    for i, line in enumerate(lines):
        line = line.rstrip('\r\n')
        if not line:
            continue
        parts = line.split('\t') if '\t' in line else line.split(',')
        if len(parts) < 3:
            continue
        defect_code = parts[0].strip()
        description = parts[1].strip()
        judgment    = parts[2].strip()
        if i == 0 and defect_code.lower() in ('defect', 'defect_code', 'defect code'):
            continue
        if defect_code:
            result[defect_code] = {'description': description, 'judgment': judgment}
    print(f'[DEFECT] 讀取完成，共 {len(result)} 筆')
    return result


# ───────────────────────────────────────────────────
# WebService 核心
# ───────────────────────────────────────────────────
def _build_client():
    s = req_lib.Session()
    s.verify = False
    return Client(WSDL_URL, transport=Transport(session=s, timeout=120))


def _xml_to_list(raw: str) -> list:
    if not raw or not raw.strip():
        return []
    if '&lt;' in raw or '&amp;' in raw:
        raw = html.unescape(raw)
    raw = raw.strip().lstrip('\ufeff')
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        try:
            from lxml import etree as lxml_etree
            parser = lxml_etree.XMLParser(huge_tree=True, recover=True)
            root = lxml_etree.fromstring(raw.encode('utf-8'), parser=parser)
        except Exception as e:
            print(f'[XML] 解析失敗: {e}')
            return []
    return [
        {col.tag.split('}')[-1].strip(): (col.text or '').strip()
         for col in table}
        for table in root.findall('.//Table')
    ]


def query_ws(sql: str) -> list:
    print(f'[SQL] {sql[:120]}...' if len(sql) > 120 else f'[SQL] {sql}')
    try:
        client = _build_client()
        raw = client.service.getCelODSBySql(selSql=sql)
        rows = _xml_to_list(str(raw) if not isinstance(raw, str) else raw)
        print(f'[SQL] 回傳 {len(rows)} 筆')
        return rows
    except Exception as e:
        print(f'[SQL] 查詢失敗: {e}')
        return []


# ───────────────────────────────────────────────────
# SQL 建構
# ───────────────────────────────────────────────────
def _esc(s: str) -> str:
    return s.strip().replace("'", "''")


def sql_search_cassette(cassette_id: str) -> str:
    cid = _esc(cassette_id)
    return (
        "SELECT DISTINCT SHEET_ID_CHIP_ID "
        "FROM CELODS.R_CHIP_WIP_ODS "
        f"WHERE CASSETTE_ID = '{cid}'"
    )


def sql_search_yield(oracle_date: str, grades: list, first_yield_flag: str = 'Y') -> str:
    grade_sql = "','".join(_esc(g) for g in grades if g.strip())
    flag_val  = 'Y' if first_yield_flag.upper() == 'Y' else 'N'
    return (
        "SELECT DISTINCT TFT_CHIP_ID, PRODUCT_CODE, GRADE, DEFECT_CODE_DESC, SHIFT "
        "FROM CELODS.H_DAX_FBK_TEST_ODS "
        "WHERE SITE_ID = 'L8B' "
        "AND PROCESS_STAGE = 'BEOL' "
        "AND (TOOL_ID LIKE '%OCT%' OR OP_ID LIKE '%OCT%') "
        f"AND MFG_DAY = TO_DATE('{oracle_date}','YYYY/MM/DD') "
        f"AND GRADE IN ('{grade_sql}') "
        f"AND FIRST_YIELD_FLAG = '{flag_val}'"
    )


def sql_chip_detail(chip_id: str) -> str:
    cid = _esc(chip_id)
    return (
        "SELECT PRODUCT_CODE, GRADE, DEFECT_CODE_DESC, DEFECT_VALUE, TOOL_ID, OP_ID "
        "FROM ("
        "  SELECT PRODUCT_CODE, GRADE, DEFECT_CODE_DESC, DEFECT_VALUE, TOOL_ID, OP_ID "
        "  FROM CELODS.H_DAX_FBK_TEST_ODS "
        f"  WHERE TFT_CHIP_ID = '{cid}' "
        "  AND SITE_ID = 'L8B' "
        "  ORDER BY TEST_TIME DESC"
        ") WHERE ROWNUM = 1"
    )


def sql_coordinates(chip_id: str, defect_code: str) -> str:
    cid = _esc(chip_id)
    dcd = _esc(defect_code)
    return (
        "SELECT TEST_SIGNAL_NO, TEST_GATE_NO "
        "FROM ("
        "  SELECT TEST_SIGNAL_NO, TEST_GATE_NO "
        "  FROM CELODS.H_DAX_FBK_DEFECT_ODS "
        f"  WHERE TFT_CHIP_ID = '{cid}' "
        f"  AND DEFECT_CODE_DESC = '{dcd}' "
        "  AND SITE_ID = 'L8B' "
        "  ORDER BY TEST_TIME DESC"
        ") WHERE ROWNUM = 1"
    )


# ───────────────────────────────────────────────────
# 圖片工具
# ───────────────────────────────────────────────────
def _img_folder(name: str, date_str: str) -> str:
    year, month, day = date_str[:4], date_str[4:6], date_str[6:8]
    folder = os.path.join(PIC_BASE, year, month, day)
    os.makedirs(folder, exist_ok=True)
    return folder


def _save_image(name: str, date_str: str, chip_id: str, b64_str: str, suffix: str = '') -> str:
    folder    = _img_folder(name, date_str)
    safe_name = name.replace('/', '_').replace('\\', '_')
    # ★ 偵測格式：jpeg → .jpg，其餘 → .png
    ext = '.jpg' if 'jpeg' in b64_str.split(',')[0] else '.png'
    filename  = f'{safe_name}_{date_str}_{chip_id}{suffix}{ext}'
    filepath  = os.path.join(folder, filename)
    raw = b64_str.split(',')[-1]
    with open(filepath, 'wb') as f:
        f.write(base64.b64decode(raw))
    return filepath


def _save_sketch(name: str, date_str: str, chip_id: str, b64_str: str) -> str:
    folder    = _img_folder(name, date_str)
    safe_name = name.replace('/', '_').replace('\\', '_')
    # ★ 偵測格式：jpeg → .jpg，其餘 → .png
    ext = '.jpg' if 'jpeg' in b64_str.split(',')[0] else '.png'
    filename  = f'{safe_name}_{date_str}_{chip_id}_sketch{ext}'
    filepath  = os.path.join(folder, filename)
    raw = b64_str.split(',')[-1]
    with open(filepath, 'wb') as f:
        f.write(base64.b64decode(raw))
    return filepath

def _delete_image(path: str):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception as e:
            print(f'[IMG] 刪除失敗: {e}')


# ───────────────────────────────────────────────────
# 資料庫 CRUD
# ───────────────────────────────────────────────────
def save_record(record: dict, image_b64: str = None, sketch_b64: str = None,
               image2_b64: str = None, image3_b64: str = None) -> tuple:
    name     = record.get('姓名', '').strip()
    chip_id  = record.get('Chip_ID', '').strip()
    date_str = record.get('日期', datetime.now(TZ).strftime('%Y%m%d')).strip()
    title    = record.get('標題', DEFAULT_TITLE).strip() or DEFAULT_TITLE

    try:
        conn, db_path = _get_db(date_str)
        cursor = conn.cursor()

        image_path  = None
        image2_path = None
        image3_path = None
        sketch_path = None
        if image_b64:
            image_path = _save_image(name, date_str, chip_id, image_b64)
        if image2_b64:
            image2_path = _save_image(name, date_str, chip_id, image2_b64, '_2')
        if image3_b64:
            image3_path = _save_image(name, date_str, chip_id, image3_b64, '_3')
        if sketch_b64:
            sketch_path = _save_sketch(name, date_str, chip_id, sketch_b64)

        cursor.execute(
            'SELECT id, image_path, image_path_2, image_path_3, sketch_path FROM records WHERE user = ? AND chip_id = ? AND date = ?',
            (name, chip_id, date_str)
        )
        existing = cursor.fetchone()

        form = {
            'model':    record.get('Model', ''),
            'grade':    record.get('Grade', ''),
            'defect':   record.get('Defect', ''),
            'jnd':      record.get('JND', ''),
            'appearance': record.get('呈象描述', ''),
            'judgment': record.get('判定畫面', ''),
            'tool_id':  record.get('機台', ''),
            'pol':      record.get('POL', ''),
            'x_start':  record.get('X_start', ''),
            'x_end':    record.get('X_end', ''),
            'y_start':  record.get('Y_start', ''),
            'y_end':    record.get('Y_end', ''),
        }

        if existing:
            old_path = existing['image_path']
            if image_path and old_path and old_path != image_path:
                _delete_image(old_path)
            final_image_path = image_path if image_path else old_path
            # sketch_path：有新傳入就覆蓋，否則保留原值
            existing_sketch = existing['sketch_path'] if 'sketch_path' in existing.keys() else None
            final_sketch_path = sketch_path if sketch_path else existing_sketch
            # image_path_2 / image_path_3（有新值就更新，否則保留舊值）
            _old2 = existing['image_path_2'] if 'image_path_2' in existing.keys() else None
            _old3 = existing['image_path_3'] if 'image_path_3' in existing.keys() else None
            if image2_path and _old2 and _old2 != image2_path: _delete_image(_old2)
            if image3_path and _old3 and _old3 != image3_path: _delete_image(_old3)
            final_image2_path = image2_path if image2_path else _old2
            final_image3_path = image3_path if image3_path else _old3
            cursor.execute('''
                UPDATE records SET
                    model=?, grade=?, defect=?, jnd=?,
                    description=?, judgment=?,
                    tool_id=?, pol=?,
                    x_start=?, x_end=?, y_start=?, y_end=?,
                    title=?, image_path=?, image_path_2=?, image_path_3=?, sketch_path=?,
                    updated_at=CURRENT_TIMESTAMP
                WHERE user=? AND chip_id=? AND date=?
            ''', (
                form['model'], form['grade'], form['defect'], form['jnd'],
                form['appearance'], form['judgment'],
                form['tool_id'], form['pol'],
                form['x_start'], form['x_end'], form['y_start'], form['y_end'],
                title, final_image_path, final_image2_path, final_image3_path, final_sketch_path,
                name, chip_id, date_str
            ))
            msg = '✓ 記錄已更新'
        else:
            cursor.execute('''
                INSERT INTO records
                    (user, chip_id, date, model, grade, defect, jnd,
                     description, judgment, tool_id, pol,
                     x_start, x_end, y_start, y_end, title,
                     image_path, image_path_2, image_path_3, sketch_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                name, chip_id, date_str,
                form.get('model', ''), form.get('grade', ''),
                form.get('defect', ''), form.get('jnd', ''),
                form.get('appearance', ''), form.get('judgment', ''),
                form.get('tool_id', ''), form.get('pol', ''),
                form.get('x_start', ''), form.get('x_end', ''),
                form.get('y_start', ''), form.get('y_end', ''),
                title, image_path, image2_path, image3_path, sketch_path
            ))
            msg = '✓ 記錄已新增'
        conn.commit()
        print(f'[DB] {msg} ({db_path})')
        return True, msg
    except Exception as e:
        print(f'[DB] 儲存失敗: {e}')
        return False, str(e)
    finally:
        conn.close()


def delete_record(chip_id: str, name: str, date_str: str = None) -> tuple:
    if date_str is None:
        date_str = datetime.now(TZ).strftime('%Y%m%d')
    try:
        conn, db_path = _get_db(date_str)
        cursor = conn.cursor()
        cursor.execute(
            'SELECT image_path FROM records WHERE user = ? AND chip_id = ? AND date = ?',
            (name, chip_id, date_str)
        )
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False, '記錄不存在'
        if row['image_path']:
            _delete_image(row['image_path'])
        cursor.execute(
            'DELETE FROM records WHERE user = ? AND chip_id = ? AND date = ?',
            (name, chip_id, date_str)
        )
        conn.commit()
        conn.close()
        print(f'[DB] 記錄已刪除 ({db_path})')
        return True, '✓ 記錄已刪除'
    except Exception as e:
        print(f'[DB] 刪除失敗: {e}')
        return False, str(e)


def get_keyed_chips_by_user(user: str, date_str: str) -> list:
    try:
        conn, _ = _get_db(date_str)
        cursor = conn.cursor()
        cursor.execute(
            'SELECT DISTINCT chip_id FROM records WHERE user = ? AND date = ?',
            (user, date_str)
        )
        result = [row['chip_id'] for row in cursor.fetchall()]
        conn.close()
        return result
    except Exception as e:
        print(f'[DB] 查詢失敗: {e}')
        return []


def get_report_groups(user: str, date_str: str) -> dict:
    try:
        conn, _ = _get_db(date_str)
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM records WHERE user = ? AND date = ? ORDER BY title, chip_id',
            (user, date_str)
        )
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        converted_rows = []
        for row in rows:
            converted = {
                '姓名': row.get('user', ''),
                'Chip_ID': row.get('chip_id', ''),
                '日期': row.get('date', ''),
                'Model': row.get('model', ''),
                'Grade': row.get('grade', ''),
                'Defect': row.get('defect', ''),
                'JND': row.get('jnd', ''),
                '呈象描述': row.get('description', ''),
                '判定畫面': row.get('judgment', ''),
                '機台': row.get('tool_id', ''),
                'POL': row.get('pol', ''),
                'X_start': row.get('x_start', ''),
                'X_end': row.get('x_end', ''),
                'Y_start': row.get('y_start', ''),
                'Y_end': row.get('y_end', ''),
                '標題': row.get('title', ''),
                '圖片路徑': row.get('image_path', ''),
                '圖片路徑_2': row.get('image_path_2', ''),
                '圖片路徑_3': row.get('image_path_3', ''),
                '示意圖路徑': row.get('sketch_path', ''),
            }
            converted_rows.append(converted)
        groups = {}
        for row in converted_rows:
            title = row.get('標題') or '(無標題)'
            if title not in groups:
                groups[title] = []
            groups[title].append(row)
        print(f'[DB] 報告查詢: {user} {date_str} — 回傳 {len(converted_rows)} 筆')
        return groups
    except Exception as e:
        print(f'[DB] 查詢失敗: {e}')
        return {}


def get_all_titles() -> list:
    return [DEFAULT_TITLE]


# ═══════════════════════════════════════════════════
# HTTP 請求處理
# ═══════════════════════════════════════════════════
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, code: int, data: dict):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors()
        self.end_headers()
        try:

            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

        except (ConnectionAbortedError, BrokenPipeError):

            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/' or parsed.path == '/index':
            if os.path.exists(INDEX_HTML):
                with open(INDEX_HTML, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self._cors()
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
            else:
                self._json(404, {'error': f'找不到 HTML：{INDEX_HTML}'})
            return

        if parsed.path == '/api/users' or parsed.path == '/api/names':
            self._json(200, {'users': NAMES, 'names': NAMES})
            return

        if parsed.path == '/api/today':
            now = datetime.now(TZ)
            self._json(200, {'date': now.strftime('%Y%m%d'), 'display': now.strftime('%Y/%m/%d')})
            return

        if parsed.path == '/api/titles':
            self._json(200, {'titles': get_all_titles()})
            return

        # ★ DEFECT.txt 查詢 API
        if parsed.path == '/api/defect-list':
            mapping = _load_defect_txt()
            defects = [
                {'code': k, 'description': v['description'], 'judgment': v['judgment']}
                for k, v in mapping.items()
            ]
            self._json(200, {'defects': defects})
            return

        if parsed.path == '/api/defect-lookup':
            qs = parse_qs(parsed.query)
            defect_code = (qs.get('defect', [''])[0]).strip()
            if not defect_code:
                self._json(400, {'error': '請提供 defect 參數'})
                return
            mapping = _load_defect_txt()
            if defect_code in mapping:
                self._json(200, {
                    'found': True,
                    'defect': defect_code,
                    'description': mapping[defect_code]['description'],
                    'judgment':    mapping[defect_code]['judgment'],
                })
            else:
                matched = None
                for key in mapping:
                    if key and (key in defect_code or defect_code in key):
                        matched = key
                        break
                if matched:
                    self._json(200, {
                        'found': True,
                        'defect': matched,
                        'description': mapping[matched]['description'],
                        'judgment':    mapping[matched]['judgment'],
                    })
                else:
                    self._json(200, {'found': False, 'defect': defect_code})
            return

        if parsed.path == '/api/settings/global':
            self._json(200, {'settings': _load_global_settings()})
            return

        if parsed.path == '/api/settings':
            qs = parse_qs(parsed.query)
            user = (qs.get('user', [''])[0]).strip()
            if not user:
                self._json(400, {'error': '請提供 user 參數'})
                return
            self._json(200, {'settings': _load_user_settings(user)})
            return

        if parsed.path == '/api/image':
            qs = parse_qs(parsed.query)
            img_path = (qs.get('path', [''])[0]).strip()
            if not img_path or not os.path.exists(img_path):
                self._json(404, {'error': '圖片不存在'})
                return
            try:
                with open(img_path, 'rb') as f:
                    img_data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self._cors()
                self.end_headers()
                self.wfile.write(img_data)
            except Exception as e:
                self._json(500, {'error': str(e)})
            return

        if parsed.path.startswith('/api/report'):
            qs = parse_qs(parsed.query)
            user = (qs.get('user', [''])[0]).strip()
            date_str = (qs.get('date', [datetime.now(TZ).strftime('%Y%m%d')])[0]).strip()
            self._json(200, {'user': user, 'date': date_str, 'groups': get_report_groups(user, date_str)})
            return

        if parsed.path == '/html2canvas.js':
            _js = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'html2canvas.min.js')
            if os.path.exists(_js):
                with open(_js, 'rb') as _jf:
                    _jd = _jf.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript; charset=utf-8')
                self.send_header('Content-Length', str(len(_jd)))
                self._cors()
                self.end_headers()
                self.wfile.write(_jd)
            return


        if parsed.path == '/api/chip-records':
            qs = parse_qs(parsed.query)
            chip_ids_raw = (qs.get('chip_ids', [''])[0]).strip()
            date_from = (qs.get('date_from', [''])[0]).strip()
            date_to   = (qs.get('date_to',   [''])[0]).strip()
            if not chip_ids_raw:
                self._json(400, {'error': '請提供 chip_ids'})
                return
            chip_ids = [c.strip() for c in chip_ids_raw.split(',') if c.strip()]
            today_str  = datetime.now(TZ).strftime('%Y%m%d')
            yest_str   = (datetime.now(TZ) - timedelta(days=1)).strftime('%Y%m%d')
            d_from = date_from or yest_str
            d_to   = date_to   or today_str

            # 建立日期清單
            from_dt = datetime.strptime(d_from, '%Y%m%d')
            to_dt   = datetime.strptime(d_to,   '%Y%m%d')
            delta   = (to_dt - from_dt).days + 1
            dates   = [(from_dt + timedelta(days=i)).strftime('%Y%m%d') for i in range(delta)]
            # 固定搜尋當月 + 上月（確保跨月資料都找得到）
            _now_dt  = datetime.now(TZ)
            _prev_dt = (_now_dt.replace(day=1) - timedelta(days=1))
            months   = list(dict.fromkeys([_now_dt.strftime('%Y%m'), _prev_dt.strftime('%Y%m')]))

            found_map = {}  # chip_id → record dict
            for month in months:
                fake_date = month + '01'
                try:
                    conn, _ = _get_db(fake_date)
                    cursor = conn.cursor()
                    ph_ids   = ','.join(['?'] * len(chip_ids))
                    ph_dates = ','.join(['?'] * len(dates))
                    cursor.execute(
                        f'SELECT * FROM records WHERE chip_id IN ({ph_ids}) ORDER BY date DESC',
                        chip_ids
                    )
                    for row in cursor.fetchall():
                        rd = dict(row)
                        cid = rd.get('chip_id','')
                        if cid in chip_ids and cid not in found_map:
                            found_map[cid] = {
                                'found':       True,
                                'model':       rd.get('model',''),
                                'grade':       rd.get('grade',''),
                                'defect':      rd.get('defect',''),
                                'description': rd.get('description',''),
                                'judgment':    rd.get('judgment',''),
                                'tool_id':     rd.get('tool_id',''),
                                'pol':         rd.get('pol',''),
                                'jnd':         rd.get('jnd',''),
                                'x_start':     rd.get('x_start',''),
                                'x_end':       rd.get('x_end',''),
                                'y_start':     rd.get('y_start',''),
                                'y_end':       rd.get('y_end',''),
                                'from_user':   rd.get('user',''),
                                'from_date':   rd.get('date',''),
                            }
                    conn.close()
                except Exception as e:
                    print(f'[DB] chip-records error: {e}')

            records = []
            for cid in chip_ids:
                if cid in found_map:
                    records.append({'chip_id': cid, **found_map[cid]})
                else:
                    records.append({'chip_id': cid, 'found': False})
            self._json(200, {'records': records})
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)

        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            self._json(400, {'error': 'JSON 格式錯誤'})
            return

        if parsed.path == '/api/login':
            name = (data.get('name') or '').strip()
            password = (data.get('password') or '').strip()
            users = _load_users()
            if name not in users:
                self._json(401, {'success': False, 'error': '用戶不存在'})
                return
            if users[name] != password:
                self._json(401, {'success': False, 'error': '密碼錯誤'})
                return
            self._json(200, {'success': True, 'user': name})

        elif parsed.path == '/api/change-password':
            name = (data.get('name') or '').strip()
            old_pwd = (data.get('old_password') or '').strip()
            new_pwd = (data.get('new_password') or '').strip()
            if not new_pwd:
                self._json(400, {'success': False, 'error': '新密碼不可為空'})
                return
            users = _load_users()
            if name not in users or users[name] != old_pwd:
                self._json(401, {'success': False, 'error': '舊密碼錯誤'})
                return
            _save_password(name, new_pwd)
            self._json(200, {'success': True, 'message': '密碼已更改'})

        elif parsed.path == '/api/check-chips':
            chip_ids = data.get('chip_ids', [])
            user = (data.get('user') or '').strip()
            date_str = (data.get('date') or '').strip() or datetime.now(TZ).strftime('%Y%m%d')
            keyed = get_keyed_chips_by_user(user, date_str)
            self._json(200, {'keyed': [c for c in chip_ids if c in keyed]})

        elif parsed.path == '/api/delete':
            chip_id = (data.get('chip_id') or '').strip()
            name = (data.get('name') or '').strip()
            date_str = (data.get('date') or datetime.now(TZ).strftime('%Y%m%d')).strip()
            if not chip_id or not name:
                self._json(400, {'error': '缺少 chip_id 或 name'})
                return
            ok, msg = delete_record(chip_id, name, date_str)
            if ok:
                self._json(200, {'success': True, 'message': msg, 'groups': get_report_groups(name, date_str)})
            else:
                self._json(404, {'success': False, 'error': msg})

        elif parsed.path == '/api/search-cassette':
            cassette_id = (data.get('cassette_id') or '').strip()
            if not cassette_id:
                self._json(400, {'error': '請輸入箱號'})
                return
            rows = query_ws(sql_search_cassette(cassette_id))
            chip_ids = [r.get('SHEET_ID_CHIP_ID', '') for r in rows if r.get('SHEET_ID_CHIP_ID')]
            self._json(200, {'chip_ids': chip_ids})

        elif parsed.path == '/api/search-yield':
            date_raw = (data.get('date') or '').strip()
            grades   = data.get('grades', [])
            fyf      = (data.get('first_yield_flag') or 'Y').strip()
            if not date_raw or not grades:
                self._json(400, {'error': '請提供日期與等級'})
                return
            if len(date_raw) == 8 and date_raw.isdigit():
                oracle_date = f'{date_raw[:4]}/{date_raw[4:6]}/{date_raw[6:8]}'
            else:
                oracle_date = date_raw
            rows = query_ws(sql_search_yield(oracle_date, grades, fyf))
            chips = [
                {
                    'chip_id': r.get('TFT_CHIP_ID', ''),
                    'model':   r.get('PRODUCT_CODE', ''),
                    'grade':   r.get('GRADE', ''),
                    'defect':  r.get('DEFECT_CODE_DESC', ''),
                    'shift':   r.get('SHIFT', ''),
                }
                for r in rows if r.get('TFT_CHIP_ID')
            ]
            self._json(200, {'chips': chips})

        elif parsed.path == '/api/chip-detail-batch':
            # 批次查詢 Oracle 測試資料庫（跟單筆 chip-detail 相同來源）
            chip_ids = data.get('chip_ids', [])
            if not chip_ids:
                self._json(400, {'error': '請提供 chip_ids'})
                return
            results = []
            for _cid in chip_ids:
                _cid = _cid.strip()
                if not _cid:
                    continue
                try:
                    rows = query_ws(sql_chip_detail(_cid))
                    if not rows:
                        results.append({'chip_id': _cid, 'found': False})
                        continue
                    rv = rows[0]
                    defect = rv.get('DEFECT_CODE_DESC', '')
                    coord_rows = query_ws(sql_coordinates(_cid, defect)) if defect else []
                    x_start = coord_rows[0].get('TEST_SIGNAL_NO', '') if coord_rows else ''
                    y_start = coord_rows[0].get('TEST_GATE_NO', '') if coord_rows else ''
                    results.append({
                        'chip_id':  _cid,
                        'found':    True,
                        'model':    rv.get('PRODUCT_CODE', ''),
                        'grade':    rv.get('GRADE', ''),
                        'defect':   defect,
                        'jnd':      rv.get('DEFECT_VALUE', ''),
                        'pol':      rv.get('OP_ID', ''),
                        'tool_id':  rv.get('TOOL_ID', ''),
                        'x_start':  x_start,
                        'y_start':  y_start,
                    })
                except Exception as _e:
                    results.append({'chip_id': _cid, 'found': False, 'error': str(_e)})
            self._json(200, {'results': results})
            return

        elif parsed.path == '/api/chip-scrp':
            chip_id = (data.get('chip_id') or '').strip().upper()
            if not chip_id:
                self._json(400, {'error': '請提供 chip_id'})
                return
            try:
                rows = query_chip_scrp(chip_id)
                self._json(200, {'data': rows, 'count': len(rows)})
            except Exception as e:
                self._json(500, {'error': '查詢失敗：{}'.format(str(e))})

        elif parsed.path == '/api/chip-detail':
            chip_id = (data.get('chip_id') or '').strip()
            if not chip_id:
                self._json(400, {'error': '請提供 chip_id'})
                return
            rows = query_ws(sql_chip_detail(chip_id))
            if not rows:
                self._json(200, {'found': False})
                return
            r = rows[0]
            defect = r.get('DEFECT_CODE_DESC', '')
            coord_rows = query_ws(sql_coordinates(chip_id, defect)) if defect else []
            x_start = coord_rows[0].get('TEST_SIGNAL_NO', '') if coord_rows else ''
            y_start = coord_rows[0].get('TEST_GATE_NO', '') if coord_rows else ''
            self._json(200, {
                'found':   True,
                'model':   r.get('PRODUCT_CODE', ''),
                'grade':   r.get('GRADE', ''),
                'defect':  defect,
                'jnd':     r.get('DEFECT_VALUE', ''),
                'tool_id': r.get('TOOL_ID', ''),
                'pol':     r.get('OP_ID', ''),
                'x_start': x_start,
                'y_start': y_start,
            })

        elif parsed.path == '/api/save':
            form_raw = data.get('form', {})
            name     = (form_raw.get('name') or '').strip()
            chip_id  = (form_raw.get('chip_id') or '').strip()
            date_str = (form_raw.get('date') or datetime.now(TZ).strftime('%Y%m%d')).strip()
            record = {
                '姓名':    name,
                'Chip_ID': chip_id,
                '日期':    date_str,
                'Model':   (form_raw.get('model') or '').strip(),
                'Grade':   (form_raw.get('grade') or '').strip(),
                'Defect':  (form_raw.get('defect') or '').strip(),
                'JND':     (form_raw.get('jnd') or '').strip(),
                '呈象描述': (form_raw.get('appearance') or '').strip(),
                '判定畫面': (form_raw.get('judgment') or '').strip(),
                '機台':    (form_raw.get('tool_id') or '').strip(),
                'POL':     (form_raw.get('pol') or '').strip(),
                'X_start': (form_raw.get('x_start') or '').strip(),
                'X_end':   (form_raw.get('x_end') or '').strip(),
                'Y_start': (form_raw.get('y_start') or '').strip(),
                'Y_end':   (form_raw.get('y_end') or '').strip(),
                '標題':    (form_raw.get('title') or DEFAULT_TITLE).strip(),
            }
            if not record['Chip_ID']:
                self._json(400, {'error': '請先選擇 Chip ID'})
                return
            if not record['姓名']:
                self._json(400, {'error': '請選擇姓名'})
                return
            ok, msg = save_record(record, data.get('image'), data.get('sketch'),
                                  data.get('image2'), data.get('image3'))
            if ok:
                self._json(200, {'success': True, 'message': msg, 'groups': get_report_groups(record['姓名'], record['日期'])})
            else:
                self._json(400, {'success': False, 'error': msg})

        elif parsed.path == '/api/settings/save':
            user     = (data.get('user') or '').strip()
            settings = data.get('settings')
            if not user or not isinstance(settings, dict):
                self._json(400, {'error': '缺少 user 或 settings'})
                return
            _save_user_settings(user, settings)
            self._json(200, {'success': True})

        elif parsed.path == '/api/settings/push-global':
            settings = data.get('settings')
            if not isinstance(settings, dict):
                self._json(400, {'error': '缺少 settings'})
                return
            _save_global_settings(settings)
            print(f'[SETTINGS] 全域預設已更新')
            self._json(200, {'success': True})

        elif parsed.path == '/api/defect-add':

            defect_code = (data.get('defect_code') or '').strip()

            description = (data.get('description') or '').strip()

            judgment    = (data.get('judgment') or '').strip()

            if not defect_code:

                self._json(400, {'error': '請輸入 Defect Code'})

                return

            mapping = _load_defect_txt()

            if defect_code in mapping:

                self._json(400, {'error': defect_code + ' 已存在於 DEFECT.txt'})

                return

            try:

                line = '\r\n' + defect_code + '\t' + description + '\t' + judgment

                                # 偵測 DEFECT.txt 原始編碼，保持一致避免亂碼
                _file_enc = 'utf-8'
                for _enc in ('utf-8-sig', 'utf-8', 'big5', 'cp950'):
                    try:
                        with open(DEFECT_TXT, 'r', encoding=_enc) as _f:
                            _f.read()
                        _file_enc = 'utf-8' if _enc == 'utf-8-sig' else _enc
                        break
                    except (UnicodeDecodeError, LookupError):
                        continue
                with open(DEFECT_TXT, 'a', encoding=_file_enc) as f:

                    f.write(line)

                self._json(200, {'success': True, 'message': '✓ ' + defect_code + ' 已新增到 DEFECT.txt'})

            except Exception as e:

                self._json(400, {'success': False, 'error': str(e)})
            else:
                self.send_response(404)
                self.end_headers()
                print('[WARN] html2canvas.min.js 不存在，請放到 app.py 同層目錄')

        else:

            self.send_response(404)

            self.end_headers()


# ═══════════════════════════════════════════════════
# 啟動
# ═══════════════════════════════════════════════════



_hta_orig_setup = Handler.__dict__.get('setup')
def _hta_setup(self):
    if _hta_orig_setup:
        _hta_orig_setup(self)
    else:
        import socketserver
        socketserver.StreamRequestHandler.setup(self)
    self._hta_t0 = _hta_time.time()
Handler.setup = _hta_setup

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
Handler.log_request = _hta_log_request
# ── End HTA Logger ───────────────────────────────────────────

if __name__ == '__main__':
    try:
        os.makedirs(DB_BASE_PATH, exist_ok=True)
    except Exception as e:
        print(f'⚠ 警告：無法存取 {DB_BASE_PATH}: {e}')
        print('  將使用本地路徑')
        DB_BASE_PATH = '.'

    _get_db()

    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)

    print('=' * 52)
    print('  LV3 快速 KEYIN 系統  v202608051800')
    print('  (SQLite 版本 - 按月份放置)')
    print('=' * 52)
    print(f'✓ 伺服器啟動於 http://localhost:{PORT}/')
    print(f'  HTML 路徑：{INDEX_HTML}')
    print(f'  資料庫路徑：{DB_BASE_PATH}')
    print(f'  DEFECT.txt：{DEFECT_TXT}')

    # ★ 改回 http://localhost 開啟（避免 file:// CORS preflight 拖慢速度）
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
        print('\n伺服器已停止。')

# ── HTA Logger ──────────────────────────────────────
from hta_logger import HTALogger
_hta_logger = HTALogger("lv3keyin")

# ── HTA Logger patch (log_request) ──────────────────────
_orig_log_lv3keyin_Handler = Handler.log_request
def _hta_log_lv3keyin_Handler(self, code='-', size='-'):
    _orig_log_lv3keyin_Handler(self, code, size)
    try:
        import time as _t
        _hta_logger.log(
            method     = getattr(self, 'command', 'GET') or 'GET',
            path       = getattr(self, 'path', '/') or '/',
            status     = int(str(code).split()[0]) if str(code) != '-' else 0,
            duration_ms= 0,
            client_ip  = (self.client_address[0] if self.client_address else '-'),
            user_agent = (self.headers.get('User-Agent', '-') if self.headers else '-'),
        )
    except Exception:
        pass
Handler.log_request = _hta_log_lv3keyin_Handler
# ── end HTA Logger ───────────────────────────────────────

