"""
良率查詢 — 後端伺服器
修改紀錄 202608241215：
  - query_fma 改用新連線方式（L8BCEL Oracle）
  - 新增 query_door 門禁查詢（HLDoor Oracle）
  - 新增 /api/door 路由
依賴：pip install requests beautifulsoup4 zeep lxml python-dateutil
"""

import os
import html
import json
import logging
import warnings
import xml.etree.ElementTree as ET
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

import requests as req_lib
from bs4 import BeautifulSoup
from dateutil.relativedelta import relativedelta
from lxml import etree as lxml_etree
from zeep import Client
from zeep.transports import Transport

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

_orig_fromstring = lxml_etree.fromstring
def _safe_fromstring(text, *args, **kwargs):
    parser = lxml_etree.XMLParser(huge_tree=True, recover=True)
    if isinstance(text, str):
        text = text.encode('utf-8')
    return _orig_fromstring(text, parser=parser)
lxml_etree.fromstring = _safe_fromstring


# ============================================================
# 設定區塊
# ============================================================

WSDL_URL       = "http://hlwbs001:8250/L8BOlapWebService/L8BServices.asmx?wsdl"
LV3_BASE_PATH  = r"\\tw100049089\ML8BC1\LV3\L8B_LV3\Daily Report\文字檔"
HOST           = "0.0.0.0"
PORT           = 5105
WS_TIMEOUT     = 120
BATCH_SIZE_WIP = 3000
BATCH_SIZE_FMA = 3000
WEB_QUERY_URL  = "http://tw100049342.corpnet.auo.com/L8BC1/CInt_Query_System/SQL_Query.aspx"
FMA_BATCH      = 50

INDEX_HTML_PATH = os.environ.get(
    'SDATA_INDEX_HTML',
    r'\\tw100049089\00_MyAgent\LV3\良率\index.html'
)


# ============================================================
# 新連線方式：HTTP POST -> tw100049342 網頁介面
# ============================================================

_web_session = req_lib.Session()
_web_session.verify = False

def _web_get_viewstate():
    resp = _web_session.get(WEB_QUERY_URL, timeout=15)
    soup = BeautifulSoup(resp.text, 'html.parser')
    def val(id_):
        tag = soup.find('input', {'id': id_})
        return tag['value'] if tag else ''
    return {
        '__EVENTTARGET':        '',
        '__EVENTARGUMENT':      '',
        '__VIEWSTATE':          val('__VIEWSTATE'),
        '__VIEWSTATEGENERATOR': val('__VIEWSTATEGENERATOR'),
        '__EVENTVALIDATION':    val('__EVENTVALIDATION'),
    }

def _web_query(db_name, sql):
    vs = _web_get_viewstate()
    form_data = {k: v for k, v in vs.items() if v}
    form_data['DB']       = db_name
    form_data['TextBox1'] = sql
    form_data['Button1']  = '\u67e5\u8a62'
    resp = _web_session.post(WEB_QUERY_URL, data=form_data, timeout=60)
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'html.parser')
    grid = soup.find('table', {'id': 'GridView1'})
    if not grid:
        return []
    rows = grid.find_all('tr')
    if len(rows) < 2:
        return []
    headers = [th.get_text(strip=True) for th in rows[0].find_all('th')]
    return [
        {headers[i]: td.get_text(strip=True) for i, td in enumerate(tr.find_all('td'))}
        for tr in rows[1:]
        if tr.find_all('td')
    ]


# ============================================================
# WebService 工具（保留給主查詢 / CASSETTE / SCRP）
# ============================================================

def _build_client():
    session = req_lib.Session()
    session.verify = False
    transport = Transport(session=session, timeout=WS_TIMEOUT)
    return Client(WSDL_URL, transport=transport)

def _xml_to_list(raw):
    if not raw:
        return []
    if '&lt;' in raw or '&amp;' in raw:
        raw = html.unescape(raw)
    raw = raw.strip().lstrip('\ufeff')
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        try:
            parser = lxml_etree.XMLParser(huge_tree=True, recover=True)
            if isinstance(raw, str):
                raw = raw.encode('utf-8')
            lxml_root = lxml_etree.fromstring(raw, parser=parser)
            rows = []
            for table_elem in lxml_root.findall('.//Table'):
                row = {col.tag.split('}')[-1].strip(): (col.text or '') for col in table_elem}
                if row:
                    rows.append(row)
            return rows
        except Exception:
            return []
    rows = []
    for table_elem in root.findall('.//Table'):
        row = {col.tag.split('}')[-1].strip(): (col.text or '') for col in table_elem}
        if row:
            rows.append(row)
    return rows

def query_webservice(sql):
    client = _build_client()
    raw = client.service.getCelODSBySql(selSql=sql)
    raw_str = str(raw) if not isinstance(raw, str) else raw
    return _xml_to_list(raw_str)

def build_in_chunks(ids, batch_size):
    chunks = []
    for i in range(0, len(ids), batch_size):
        chunk = ids[i:i + batch_size]
        in_str = ','.join("'" + cid + "'" for cid in chunk)
        chunks.append('(' + in_str + ')')
    return chunks


# ============================================================
# F02 — 主資料查詢（WebService）
# ============================================================

def query_main_data(start_date, end_date):
    sql = (
        "SELECT PRODUCT_CODE, GRADE, TOOL_ID, DEFECT_CODE_DESC,"
        " FIRST_YIELD_FLAG, TFT_CHIP_ID, DEFECT_VALUE,"
        " TEST_USER, SHIFT,"
        " to_char(TEST_TIME,'YYYY/MM/DD HH24:MI:SS') as TEST_TIME"
        " FROM celods.h_dax_fbk_test_ods"
        " WHERE MFG_DAY >= TO_DATE('" + start_date + "','YYYY/MM/DD')"
        " AND MFG_DAY <= TO_DATE('" + end_date + "','YYYY/MM/DD')"
        " AND SITE_ID = 'L8B'"
        " AND PROCESS_STAGE = 'BEOL'"
        " AND (TOOL_ID like '%OCT%' OR OP_ID like '%OCT%')"
        " AND GRADE IN ('V','S')"
    )
    return query_webservice(sql)


# ============================================================
# F03 — CASSETTE 批次查詢（WebService）
# ============================================================

def query_cassette(chip_ids):
    if not chip_ids:
        return {}
    result = {}
    for in_clause in build_in_chunks(chip_ids, BATCH_SIZE_WIP):
        sql = (
            "SELECT SHEET_ID_CHIP_ID, CASSETTE_ID"
            " FROM CELODS.R_CHIP_WIP_ODS"
            " WHERE SHEET_ID_CHIP_ID IN " + in_clause
        )
        for row in query_webservice(sql):
            cid = (row.get('SHEET_ID_CHIP_ID') or '').strip()
            cst = (row.get('CASSETTE_ID') or '').strip()
            if cid:
                result[cid] = cst
    print('[CASSETTE] 查到 ' + str(len(result)) + ' 筆，共 ' + str(len(chip_ids)) + ' 個 chip_id')
    return result


# ============================================================
# F04 — FMA 批次查詢（★ 已改用新連線方式 L8BCEL）
# ============================================================

def query_fma(chip_ids):
    if not chip_ids:
        return {}
    raw_rows = []
    for i in range(0, len(chip_ids), FMA_BATCH):
        batch  = chip_ids[i:i + FMA_BATCH]
        in_str = ','.join("'" + cid + "'" for cid in batch)
        sql = (
            "SELECT TFT_CHIP_ID, DEFECT_CODE_DESC, FMA_DEFECT_CODE_DESC,"
            " DEFECT_LOCATION, LOCATION_FLAG, NOTE, FMA_USER"
            " FROM CELODS.H_DAX_FBK_FMA_ODS"
            " WHERE TFT_CHIP_ID IN (" + in_str + ")"
            " ORDER BY TFT_CHIP_ID, FMA_TIME"
        )
        batch_rows = _web_query('L8BCEL', sql)
        raw_rows.extend(batch_rows)
    result = {}
    for row in raw_rows:
        cid = (row.get('TFT_CHIP_ID') or '').strip()
        if cid:
            result[cid] = {
                'fma_user': (row.get('FMA_USER') or '').strip(),
                'fma_code': (row.get('FMA_DEFECT_CODE_DESC') or '').strip(),
            }
    print('[FMA] 查到 ' + str(len(result)) + ' 筆，共 ' + str(len(chip_ids)) + ' 個 chip_id')
    return result


# ============================================================
# F05 — LV3 TXT 讀取
# ============================================================

def _clean_key(s):
    return s.replace('\ufeff', '').replace('\ufffe', '').strip().upper()

def _get_months_between(start_date, end_date):
    s = datetime.strptime(start_date, "%Y/%m/%d").replace(day=1)
    e = datetime.strptime(end_date,   "%Y/%m/%d")
    months, cur = [], s
    while cur <= e:
        months.append((cur.year, cur.month))
        cur += relativedelta(months=1)
    return months

def query_lv3(start_date, end_date):
    months   = _get_months_between(start_date, end_date)
    combined = {}
    for year, month in months:
        filename = '{}{:02d}.txt'.format(year, month)
        filepath = os.path.join(LV3_BASE_PATH, str(year), filename)
        if not os.path.exists(filepath):
            print('[LV3] 找不到檔案：' + filepath)
            continue
        success = False
        for enc in ('utf-8-sig', 'utf-8', 'cp950', 'big5'):
            try:
                with open(filepath, 'r', encoding=enc) as f:
                    for line in f:
                        fields = line.split('\t')
                        if len(fields) >= 2:
                            clean_k = _clean_key(fields[0])
                            clean_v = fields[1].strip()
                            if clean_k:
                                combined[clean_k] = clean_v
                success = True
                print('[LV3] 讀取成功：' + filename + ' (' + enc + ') 共 ' + str(len(combined)) + ' 筆')
                break
            except (UnicodeDecodeError, UnicodeError):
                continue
        if not success:
            print('[LV3] 無法讀取：' + filepath)
    return combined


# ============================================================
# F06 — 資料整合
# ============================================================

def merge_all(f02_rows, cassette_map, fma_map, lv3_map):
    result = []
    for row in f02_rows:
        chip    = (row.get('TFT_CHIP_ID') or '').strip()
        chip_up = chip.upper()
        fma     = fma_map.get(chip, {})
        result.append({
            'PRODUCT_CODE':     (row.get('PRODUCT_CODE')     or '').strip(),
            'TOOL_ID':          (row.get('TOOL_ID')          or '').strip(),
            'DEFECT_CODE_DESC': (row.get('DEFECT_CODE_DESC') or '').strip(),
            'DEFECT_VALUE':     (row.get('DEFECT_VALUE')     or '').strip(),
            'TFT_CHIP_ID':      chip,
            'CASSETTE_ID':      (cassette_map.get(chip)      or '').strip(),
            'FMA_USER2':        (fma.get('fma_user')         or '').strip(),
            'FMA_CODE':         (fma.get('fma_code')         or '').strip(),
            'LV3_PERSON':       (lv3_map.get(chip_up)        or ''),
            'GRADE':            (row.get('GRADE')            or '').strip(),
            'SHIFT':            (row.get('SHIFT')            or '').strip(),
            'FIRST_YIELD_FLAG': (row.get('FIRST_YIELD_FLAG') or '').strip(),
        })
    return result


# ============================================================
# P2 — Chip SCRP 報廢查詢（WebService）
# ============================================================

def query_chip_scrp(chip_id):
    sql = (
        "WITH latest AS ("
        "    SELECT cassette_id, MAX(trans_timestamp) AS latest_time"
        "    FROM celods.h_chip_trans_ods"
        "    WHERE sheet_id_chip_id = '" + chip_id + "'"
        "      AND trans_id = 'SCRP'"
        "    GROUP BY cassette_id"
        ") "
        "SELECT b.sheet_id_chip_id,"
        "       TO_CHAR(b.trans_timestamp,'YYYY/MM/DD HH24:MI:SS') AS trans_timestamp,"
        "       b.cassette_id, b.sheet_id, b.op_id, b.wo_id,"
        "       b.trans_id, b.trans_user, SUBSTR(b.model_no,1,9) AS model_no "
        "FROM celods.h_chip_trans_ods b "
        "JOIN latest a "
        "  ON b.cassette_id = a.cassette_id "
        " AND b.trans_timestamp BETWEEN a.latest_time - INTERVAL '2' MINUTE "
        "                           AND a.latest_time + INTERVAL '2' MINUTE "
        "WHERE b.trans_id = 'SCRP'"
    )
    rows = query_webservice(sql)
    result = []
    for row in rows:
        result.append({
            'SHEET_ID_CHIP_ID': (row.get('SHEET_ID_CHIP_ID') or row.get('sheet_id_chip_id') or '').strip(),
            'TRANS_TIMESTAMP':  (row.get('TRANS_TIMESTAMP')  or row.get('trans_timestamp')  or '').strip(),
            'CASSETTE_ID':      (row.get('CASSETTE_ID')      or row.get('cassette_id')      or '').strip(),
            'SHEET_ID':         (row.get('SHEET_ID')         or row.get('sheet_id')         or '').strip(),
            'OP_ID':            (row.get('OP_ID')            or row.get('op_id')            or '').strip(),
            'WO_ID':            (row.get('WO_ID')            or row.get('wo_id')            or '').strip(),
            'TRANS_ID':         (row.get('TRANS_ID')         or row.get('trans_id')         or '').strip(),
            'TRANS_USER':       (row.get('TRANS_USER')       or row.get('trans_user')       or '').strip(),
            'MODEL_NO':         (row.get('MODEL_NO')         or row.get('model_no')         or '').strip(),
        })
    return result


# ============================================================
# P3 — 門禁查詢（★ 新功能，使用新連線方式 HLDoor Oracle）
# ============================================================

def query_door(work_id):
    sql = (
        "SELECT TO_CHAR(INTIME,'YYYY/MM/DD HH24:MI:SS') AS INTIME,"
        " TO_CHAR(OUTTIME,'YYYY/MM/DD HH24:MI:SS') AS OUTTIME"
        " FROM DOORCTL.T_CRHISTORY"
        " WHERE WORKID = '" + work_id + "'"
        " AND INTIME >= TRUNC(SYSDATE) - 20"
        " ORDER BY INTIME DESC"
    )
    return _web_query('HLDoor', sql)



# ============================================================
# P2b — 箱號完整查詢（新連線方式 L8BCEL）
# ============================================================

def query_cassette_full(cassette_id):
    """
    Step1: 現貨(R_CHIP_WIP_ODS) → 取現有 chip 與基本資訊
    Step2: 找最早 TRANS_TIME（鎖定原始批次時間點）
    Step3: ±5 分找同批次全部 chip（含已除帳）
    Step4: 每片取最後一筆 TRANS 記錄
    Step5: 聚合 HLDC/SCRP 旗標 + HOLD_COMMENTS
    Step6: FMA 資料
    Step7: 合併輸出
    """
    cst = cassette_id.strip().upper()

    # ── Step1: 現貨 ─────────────────────────────────────────
    wip_rows = _web_query('L8BCEL',
        "SELECT PRODUCT_CODE,CASSETTE_ID,SHEET_ID_CHIP_ID,GRADE,OP_ID,CHIP_STATUS"
        " FROM CELODS.R_CHIP_WIP_ODS"
        " WHERE CASSETTE_ID='" + cst + "'"
    )
    wip_map = {}
    for r in wip_rows:
        cid = (r.get('SHEET_ID_CHIP_ID') or '').strip()
        if cid:
            wip_map[cid] = {
                'grade':       (r.get('GRADE')       or '').strip(),
                'chip_status': (r.get('CHIP_STATUS') or '').strip(),
                'product':     (r.get('PRODUCT_CODE') or '').strip(),
            }
    current_chips = list(wip_map.keys())
    print('[箱號] 現貨 ' + str(len(current_chips)) + ' 片')
    if not current_chips:
        return {'error': '現貨表查無此箱號：' + cst}

    # ── Step2: 最早 TRANS_TIME ───────────────────────────────
    in50 = ','.join("'" + c + "'" for c in current_chips[:50])
    t_rows = _web_query('L8BCEL',
        "SELECT TO_CHAR(MIN(TRANS_TIME),'YYYY/MM/DD HH24:MI:SS') AS EARLIEST"
        " FROM CELODS.H_CHIP_TRANS_ODS"
        " WHERE CASSETTE_ID='" + cst + "'"
        " AND SHEET_ID_CHIP IN (" + in50 + ")"
    )
    earliest_str = (t_rows[0].get('EARLIEST') or '').strip() if t_rows else ''
    if not earliest_str:
        return {'error': '歷史記錄查無此箱號，請確認箱號正確'}
    print('[箱號] 原始批次時間：' + earliest_str)

    # ── Step3: ±5 分內同批次全部 chip ───────────────────────
    batch_rows = _web_query('L8BCEL',
        "SELECT DISTINCT SHEET_ID_CHIP"
        " FROM CELODS.H_CHIP_TRANS_ODS"
        " WHERE CASSETTE_ID='" + cst + "'"
        " AND TRANS_TIME BETWEEN"
        " TO_DATE('" + earliest_str + "','YYYY/MM/DD HH24:MI:SS')-5/1440"
        " AND TO_DATE('" + earliest_str + "','YYYY/MM/DD HH24:MI:SS')+5/1440"
    )
    all_chips = list({
        (r.get('SHEET_ID_CHIP') or '').strip()
        for r in batch_rows
        if (r.get('SHEET_ID_CHIP') or '').strip()
    })
    if not all_chips:
        all_chips = current_chips
    print('[箱號] 原始批次 ' + str(len(all_chips)) + ' 片（現貨 ' + str(len(current_chips)) + '）')

    # ── Step4: 最後一筆 TRANS（ORDER DESC，取 first per chip）
    latest_map = {}
    for i in range(0, len(all_chips), 50):
        batch  = all_chips[i:i+50]
        in_str = ','.join("'" + c + "'" for c in batch)
        rows   = _web_query('L8BCEL',
            "SELECT PRODUCT_CODE,CASSETTE_ID,SHEET_ID_CHIP,OP_ID,"
            " TRANS_ID,TRANS_REASON,TRANS_COMMENTS,"
            " TO_CHAR(TRANS_TIME,'YYYY/MM/DD HH24:MI:SS') AS TRANS_TIME"
            " FROM CELODS.H_CHIP_TRANS_ODS"
            " WHERE CASSETTE_ID='" + cst + "'"
            " AND SHEET_ID_CHIP IN (" + in_str + ")"
            " ORDER BY SHEET_ID_CHIP,TRANS_TIME DESC"
        )
        for r in rows:
            cid = (r.get('SHEET_ID_CHIP') or '').strip()
            if cid and cid not in latest_map:
                latest_map[cid] = r

    # ── Step5: HLDC / SCRP 聚合 ─────────────────────────────
    hs_map = {}
    for i in range(0, len(all_chips), 50):
        batch  = all_chips[i:i+50]
        in_str = ','.join("'" + c + "'" for c in batch)
        rows   = _web_query('L8BCEL',
            "SELECT SHEET_ID_CHIP,TRANS_ID,TRANS_REASON,TRANS_COMMENTS"
            " FROM CELODS.H_CHIP_TRANS_ODS"
            " WHERE CASSETTE_ID='" + cst + "'"
            " AND SHEET_ID_CHIP IN (" + in_str + ")"
            " AND TRANS_ID IN ('HLDC','SCRP')"
        )
        for r in rows:
            cid = (r.get('SHEET_ID_CHIP') or '').strip()
            if not cid:
                continue
            if cid not in hs_map:
                hs_map[cid] = {'is_hold':'','is_scrp':'','hold_comments':''}
            tid    = (r.get('TRANS_ID')       or '').strip()
            reason = (r.get('TRANS_REASON')   or '').strip().upper()
            cmt    = (r.get('TRANS_COMMENTS') or '').strip()
            if tid == 'HLDC':
                hs_map[cid]['is_hold'] = 'Y'
                if 'HOLD FOR' in reason and cmt:
                    hs_map[cid]['hold_comments'] = cmt
            elif tid == 'SCRP':
                hs_map[cid]['is_scrp'] = 'Y'

    # ── Step6: FMA ──────────────────────────────────────────
    fma_map = {}
    for i in range(0, len(all_chips), 50):
        batch  = all_chips[i:i+50]
        in_str = ','.join("'" + c + "'" for c in batch)
        rows   = _web_query('L8BCEL',
            "SELECT TFT_CHIP_ID,DEFECT_CODE_DESC,FMA_USER,"
            " LOCATION_FLAG,DEFECT_LOCATION"
            " FROM CELODS.H_DAX_FBK_FMA_ODS"
            " WHERE TFT_CHIP_ID IN (" + in_str + ")"
        )
        for r in rows:
            cid = (r.get('TFT_CHIP_ID') or '').strip()
            if cid:
                fma_map[cid] = {
                    'defect_code':     (r.get('DEFECT_CODE_DESC') or '').strip(),
                    'fma_user':        (r.get('FMA_USER')         or '').strip(),
                    'location_flag':   (r.get('LOCATION_FLAG')    or '').strip(),
                    'defect_location': (r.get('DEFECT_LOCATION')  or '').strip(),
                }
    print('[箱號] FMA 命中 ' + str(len(fma_map)) + ' 片')

    # ── Step7: 合併 ─────────────────────────────────────────
    result = []
    for cid in all_chips:
        lt  = latest_map.get(cid, {})
        wip = wip_map.get(cid, {})
        hs  = hs_map.get(cid, {})
        fma = fma_map.get(cid, {})
        prod = (lt.get('PRODUCT_CODE') or wip.get('product') or '').strip()
        # 現況：現貨有 → CHIP_STATUS；若已除帳 → 除帳；其他 → 空
        if cid in wip_map:
            status = wip.get('chip_status','')
        elif hs.get('is_scrp') == 'Y':
            status = '已除帳'
        else:
            status = '不在現貨'
        result.append({
            'MODEL':         prod,
            'CASSETTE_ID':   cst,
            'ID':            cid,
            'GRADE':         wip.get('grade',''),
            'OP_ID':         (lt.get('OP_ID')        or '').strip(),
            'CHIP_STATUS':   status,
            'TRANS_TIME':    (lt.get('TRANS_TIME')   or '').strip(),
            'TRANS_ID':      (lt.get('TRANS_ID')     or '').strip(),
            'IS_HOLD':       hs.get('is_hold',''),
            'IS_SCRP':       hs.get('is_scrp',''),
            'HOLD_COMMENTS': hs.get('hold_comments',''),
            'FMA_DEFECT':    fma.get('defect_code',''),
            'FMA_USER':      fma.get('fma_user',''),
            'FMA_LOCATION':  fma.get('location_flag',''),
            'FMA_POSITION':  fma.get('defect_location',''),
        })
    return {
        'data':     result,
        'count':    len(result),
        'current':  len(current_chips),
        'earliest': earliest_str,
    }

# ============================================================
# HTTP 請求處理
# ============================================================

class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

    def _send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, filepath, content_type):
        if filepath == 'index.html':
            filepath = INDEX_HTML_PATH
        try:
            with open(filepath, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path

        if path in ('/', '/index.html'):
            self._send_file('index.html', 'text/html; charset=utf-8')

        elif path == '/main.js':
            self._send_file('main.js', 'application/javascript; charset=utf-8')

        elif path == '/api/ping':
            self._send_json(200, {'status': 'ok'})

        elif path == '/api/debug-lv3':
            qs = parse_qs(parsed.query)
            date_str = (qs.get('date', [''])[0] or '').strip()
            if not date_str:
                self._send_json(400, {'error': '請提供 ?date=YYYY-MM-DD 參數'})
                return
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                sd = ed = dt.strftime("%Y/%m/%d")
                lv3_map = query_lv3(sd, ed)
                sample  = list(lv3_map.items())[:30]
                self._send_json(200, {
                    'total_lv3_keys': len(lv3_map),
                    'sample_keys': [
                        {'chip_id': k, 'person': v, 'len': len(k), 'repr': repr(k)}
                        for k, v in sample
                    ]
                })
            except Exception as e:
                self._send_json(500, {'error': str(e)})



        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)

        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            self._send_json(400, {'error': 'JSON 格式錯誤'})
            return

        # ── P1 主查詢 ──────────────────────────────────────
        if parsed.path == '/api/query':
            start_raw = (data.get('start_date') or '').strip()
            end_raw   = (data.get('end_date')   or '').strip()
            try:
                start_dt = datetime.strptime(start_raw, "%Y-%m-%d")
                end_dt   = datetime.strptime(end_raw,   "%Y-%m-%d")
            except ValueError:
                self._send_json(400, {'error': '日期格式錯誤，請使用 YYYY-MM-DD'})
                return
            if start_dt > end_dt:
                self._send_json(400, {'error': '起始日期不可晚於結束日期'})
                return
            start_date = start_dt.strftime("%Y/%m/%d")
            end_date   = end_dt.strftime("%Y/%m/%d")
            try:
                f02_rows = query_main_data(start_date, end_date)
                if not f02_rows:
                    self._send_json(200, {'data': [], 'count': 0})
                    return
                chip_ids = list({
                    (r.get('TFT_CHIP_ID') or '').strip()
                    for r in f02_rows
                    if (r.get('TFT_CHIP_ID') or '').strip()
                })
                print('[P1] 主資料 ' + str(len(f02_rows)) + ' 筆，unique chip_id ' + str(len(chip_ids)) + ' 個')
                cassette_map = query_cassette(chip_ids)
                fma_map      = query_fma(chip_ids)
                lv3_map      = query_lv3(start_date, end_date)
                if lv3_map:
                    chip_ups  = [c.upper() for c in chip_ids]
                    matched   = [c for c in chip_ups if c in lv3_map]
                    unmatched = [c for c in chip_ups if c not in lv3_map]
                    print('[LV3] TXT ' + str(len(lv3_map)) + ' | DB ' + str(len(chip_ids)) + ' | 命中 ' + str(len(matched)) + ' | 未命中 ' + str(len(unmatched)))
                merged = merge_all(f02_rows, cassette_map, fma_map, lv3_map)
                self._send_json(200, {'data': merged, 'count': len(merged)})
            except Exception as e:
                self._send_json(500, {'error': '查詢失敗：' + str(e)})

        # ── P2 SCRP 報廢查詢 ───────────────────────────────
        elif parsed.path == '/api/chip-scrp':
            chip_id = (data.get('chip_id') or '').strip().upper()
            if not chip_id:
                self._send_json(400, {'error': '請提供 chip_id'})
                return
            try:
                rows = query_chip_scrp(chip_id)
                self._send_json(200, {'data': rows, 'count': len(rows)})
            except Exception as e:
                self._send_json(500, {'error': '查詢失敗：' + str(e)})

        # ── P3 門禁查詢 ────────────────────────────────────
        elif parsed.path == '/api/door':
            work_id = (data.get('work_id') or '').strip()
            if not work_id or not work_id.isdigit() or len(work_id) > 20:
                self._send_json(400, {'error': '請輸入有效工號（純數字）'})
                return
            try:
                rows = query_door(work_id)
                self._send_json(200, {'data': rows, 'count': len(rows)})
            except Exception as e:
                self._send_json(500, {'error': '查詢失敗：' + str(e)})


        # ── P4 箱號完整查詢 ───────────────────────────────
        elif parsed.path == '/api/cassette-full':
            cst = (data.get('cassette_id') or '').strip().upper()
            if not cst:
                self._send_json(400, {'error': '請輸入箱號'})
                return
            try:
                res = query_cassette_full(cst)
                if 'error' in res:
                    self._send_json(404, res)
                else:
                    self._send_json(200, res)
            except Exception as e:
                self._send_json(500, {'error': '查詢失敗：' + str(e)})
        else:
            self.send_response(404)
            self.end_headers()


# ============================================================
# 啟動
# ============================================================




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
    server = HTTPServer((HOST, PORT), Handler)
    print('=' * 48)
    print('  良率查詢系統')
    print('  http://localhost:' + str(PORT))
    print('  index.html：' + INDEX_HTML_PATH)
    print('  按 Ctrl+C 停止')
    print('=' * 48)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n伺服器已停止。')
        server.server_close()

# ── HTA Logger ──────────────────────────────────────
from hta_logger import HTALogger
_hta_logger = HTALogger("yield_query")

# ── HTA Logger patch (log_request) ──────────────────────
_orig_log_yield_query_Handler = Handler.log_request
def _hta_log_yield_query_Handler(self, code='-', size='-'):
    _orig_log_yield_query_Handler(self, code, size)
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
Handler.log_request = _hta_log_yield_query_Handler
# ── end HTA Logger ───────────────────────────────────────

