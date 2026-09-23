import warnings
import logging
warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)
logging.getLogger('zeep').setLevel(logging.CRITICAL)
logging.getLogger('zeep.wsdl').setLevel(logging.CRITICAL)
logging.getLogger('zeep.xsd').setLevel(logging.CRITICAL)
logging.getLogger('lxml').setLevel(logging.CRITICAL)
logging.getLogger('urllib3').setLevel(logging.CRITICAL)
logging.getLogger('requests').setLevel(logging.CRITICAL)

import json
import html as html_lib
import xml.etree.ElementTree as ET
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from zeep import Client
from zeep.transports import Transport
import requests as req_lib
from lxml import etree as lxml_etree

# ── lxml patch ──────────────────────────────────────────────────────────────
_original_fromstring = lxml_etree.fromstring

def safe_fromstring(text, *args, **kwargs):
    parser = lxml_etree.XMLParser(huge_tree=True, recover=True)
    if isinstance(text, bytes):
        return _original_fromstring(text, parser=parser)
    else:
        return _original_fromstring(text.encode('utf-8'), parser=parser)

lxml_etree.fromstring = safe_fromstring
# ────────────────────────────────────────────────────────────────────────────

WSDL_URL = 'http://hlwbs001:8250/L8BOlapWebService/L8BServices.asmx?wsdl'
TABLE    = 'CELODS.H_DAX_FBK_MASTER_ODS'
PORT     = 5110

# HTML 檔案路徑（與 api.py 同目錄）
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
HTML_FILE = os.path.join(BASE_DIR, '大片換中小片ID_v4.html')


def _build_client():
    session = req_lib.Session()
    session.verify = False
    transport = Transport(session=session, timeout=120)
    return Client(WSDL_URL, transport=transport)


def _call_service(sql):
    client = _build_client()
    raw = client.service.getCelODSBySql(selSql=sql)
    return raw if isinstance(raw, str) else str(raw)


def xml_to_list(raw_str):
    if '&lt;' in raw_str or '&amp;' in raw_str:
        raw_str = html_lib.unescape(raw_str)
    xml_string = raw_str.strip().lstrip('\ufeff')
    try:
        root = ET.fromstring(xml_string)
    except ET.ParseError:
        return []
    rows = []
    for table_elem in root.findall('.//Table'):
        row = {col.tag.split('}')[-1].strip(): col.text for col in table_elem}
        if row:
            rows.append(row)
    return rows


def handle_lookup(chip_ids):
    safe_ids = [cid.strip().upper() for cid in chip_ids if cid.strip()]
    for cid in safe_ids:
        if not all(c.isalnum() or c in '-_' for c in cid):
            return None, f'ID 格式不合法：{cid}'

    id_list = ','.join(f"'{cid}'" for cid in safe_ids)
    sql = (
        f"SELECT TFT_CHIP_ID, TFT_GLASS_ID, CF_GLASS_ID "
        f"FROM {TABLE} "
        f"WHERE TFT_CHIP_ID IN ({id_list})"
    )

    xml_str = _call_service(sql)
    rows = xml_to_list(xml_str)

    db_map = {}
    for r in rows:
        cid = (r.get('TFT_CHIP_ID') or '').strip().upper()
        if cid and cid not in db_map:
            db_map[cid] = {
                'TFT_GLASS_ID': r.get('TFT_GLASS_ID') or '',
                'CF_GLASS_ID':  r.get('CF_GLASS_ID')  or '',
            }

    results = []
    for cid in safe_ids:
        if cid in db_map:
            results.append({
                'chip_id':      cid,
                'TFT_GLASS_ID': db_map[cid]['TFT_GLASS_ID'],
                'CF_GLASS_ID':  db_map[cid]['CF_GLASS_ID'],
                'found':        True,
            })
        else:
            results.append({
                'chip_id': cid,
                'TFT_GLASS_ID': '',
                'CF_GLASS_ID':  '',
                'found':        False,
            })
    return results, None


class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # 靜音 request log

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    # ── ✅ 新增：處理瀏覽器 GET 請求，直接回傳 HTML 頁面 ──────────────
    def do_GET(self):
        if self.path in ('/', '/index.html', '/大片換中小片ID_v4.html'):
            try:
                with open(HTML_FILE, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content)
            except FileNotFoundError:
                self._send_json(404, {'error': f'找不到 HTML 檔案：{HTML_FILE}'})
        else:
            self._send_json(404, {'error': 'Not found'})
    # ──────────────────────────────────────────────────────────────────────

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path != '/api/lookup':
            self._send_json(404, {'error': 'Not found'})
            return

        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            self._send_json(400, {'error': 'JSON 解析失敗'})
            return

        chip_ids = data.get('chip_ids', [])
        if not chip_ids:
            self._send_json(400, {'error': '未提供 chip_ids'})
            return

        try:
            results, err = handle_lookup(chip_ids)
            if err:
                self._send_json(400, {'error': err})
            else:
                self._send_json(200, {'results': results})
        except Exception as e:
            self._send_json(500, {'error': f'資料庫查詢失敗：{str(e)}'})\


if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f'API 已啟動，監聽 port {PORT}')
    print('按 Ctrl+C 停止')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
