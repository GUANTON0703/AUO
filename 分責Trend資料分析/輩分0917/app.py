"""
L8B FMA Proxy Server (Python 3.8+)
Port: 5050

【優化紀錄】
  - 加入 ThreadingMixIn：多執行緒同時服務多用戶，DB 查詢不再卡住別人的頁面載入
  - 靜態 HTML 加 in-memory 快取（60 秒 TTL）：減少磁碟 IO
  - 回傳靜態 HTML 加 gzip 壓縮：63.6KB → ~15KB，傳輸加速 4 倍
  - Cache-Control: public, max-age=60：瀏覽器快取，後續訪問瞬間開
  - Vary: Accept-Encoding：確保 CDN/Proxy 正確快取 gzip 版本

FMA:     MySQL CELODS.H_FMA_COMPOSITION
RAWDATA: MySQL RESPONSE.H_FIRST_RHNVS LEFT JOIN OPER.H_SHEET_OPER_FEOL (PA/PA_DAY)
"""
import json
import os
import gzip as _gzip
import time
import threading
import urllib.request, ssl
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from html.parser import HTMLParser
import pymysql, pymysql.cursors

PORT      = 5050
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
HTML_FILE = os.path.join(BASE_DIR, "L8B_DEFECT_Monitor_v12.html")

MYSQL_HOST = 'TW100049342'
MYSQL_USER = 'L8BC1_AGENT'
MYSQL_PWD  = 'c1agent'

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode    = ssl.CERT_NONE

# ── ★ 靜態 HTML 記憶體快取（TTL 60 秒）────────────────────
_HTML_CACHE: dict = {}          # {filepath: (body_bytes, gzip_bytes, mtime, expire_ts)}
_HTML_CACHE_LOCK = threading.Lock()
HTML_CACHE_TTL = 60             # 秒


def _load_html_cached(filepath: str):
    """
    回傳 (raw_bytes, gzip_bytes) 並以 60 秒 TTL 快取。
    多執行緒安全。
    """
    now = time.time()
    with _HTML_CACHE_LOCK:
        entry = _HTML_CACHE.get(filepath)
        if entry:
            raw, gz, mtime, expire_ts = entry
            if now < expire_ts:
                return raw, gz            # ← 快取命中
    # 快取過期或不存在 → 重新讀檔
    with open(filepath, "rb") as f:
        raw = f.read()
    gz = _gzip.compress(raw, compresslevel=6)
    mtime = os.path.getmtime(filepath)
    with _HTML_CACHE_LOCK:
        _HTML_CACHE[filepath] = (raw, gz, mtime, now + HTML_CACHE_TTL)
    return raw, gz


# ── HTML select value -> DB DEFECT_GROUP mapping ─────────
def map_defect_group(dg: str) -> str:
    if not dg: return dg
    if '_' in dg: return dg.split('_')[0]
    return dg


def get_conn(db='CELODS'):
    return pymysql.connect(
        host=MYSQL_HOST, user=MYSQL_USER, password=MYSQL_PWD,
        database=db, charset='utf8mb4', connect_timeout=30,
        cursorclass=pymysql.cursors.DictCursor
    )


# ── FMA 查詢 ──────────────────────────────────────────────
def query_fma(chip_ids: list, product_code: str) -> dict:
    BATCH = 200
    result = {}
    conn = get_conn('CELODS')
    try:
        with conn.cursor() as cur:
            for i in range(0, len(chip_ids), BATCH):
                batch = chip_ids[i:i+BATCH]
                ph    = ','.join(['%s']*len(batch))
                sql = f"""
SELECT TFT_CHIP_ID, PRODUCT_CODE, DEFECT_LOCATION, LVL,
       DATE_FORMAT(FMA_TIME,'%%Y/%%m/%%d %%H:%%i:%%S') AS FMA_TIME,
       SIGNAL_NO, GATE_NO, LOCATION_FLAG, NOTE,
       DEFECT_CODE_DESC, FMA_DEFECT_CODE_DESC,
       FMA_RESPONSE_SITE, FMA_RESPONSE_DEPT, COORD_X, COORD_Y
FROM H_FMA_COMPOSITION
WHERE TFT_CHIP_ID IN ({ph})"""
                cur.execute(sql, batch)
                for row in cur.fetchall():
                    cid = (row.get('TFT_CHIP_ID') or '').strip()
                    if not cid: continue
                    ft = (row.get('FMA_TIME') or '').strip()
                    def s(k): v=row.get(k); return str(v).strip() if v is not None else ''
                    result[cid] = {
                        'DEFECT_LOCATION':      s('DEFECT_LOCATION'),
                        'TEST_TYPE':            s('LVL'),
                        'FMA_TIME':             ft, 'LVL': '91',
                        'SIGNAL_NO':            s('SIGNAL_NO'),
                        'GATE_NO':              s('GATE_NO'),
                        'LOCATION_FLAG':        s('LOCATION_FLAG'),
                        'NOTE':                 s('NOTE'),
                        'DEFECT_CODE_DESC':     s('DEFECT_CODE_DESC'),
                        'FMA_DEFECT_CODE_DESC': s('FMA_DEFECT_CODE_DESC'),
                        'FMA_RESPONSE_SITE':    s('FMA_RESPONSE_SITE'),
                        'FMA_RESPONSE_DEPT':    s('FMA_RESPONSE_DEPT'),
                        'COORD_X':              s('COORD_X'),
                        'COORD_Y':              s('COORD_Y'),
                        'IMAGE_URL': (
                            f"http://tw100049089/L8BC1/CInt_FMA/FMA_Image.aspx"
                            f"?TFT_CHIP_ID={cid}&LVL=91&LM_TIME={ft}"
                        ) if ft else '',
                    }
    finally:
        conn.close()
    return result


# ── RAW DATA 欄位 ─────────────────────────────────────────
RAWDATA_COLS = [
    'TFT_CHIP_ID', 'TFT_GLASS_ID', 'CF_GLASS_ID', 'MFG_DAY',
    'DEFECT_GROUP', 'PRODUCT_CODE', 'MODEL_NO',
    'PIC', 'PIC_DAY', 'PIC_WEEK',
    'PA', 'PA_DAY',
    'ODF', 'ODF_DAY', 'ODF_WEEK',
    'CGL', 'CGL_DAY', 'CGL_WEEK',
    'GRADE', 'DEFECT_CODE', 'DEFECT_CODE_DESC',
    'RESPONSE_TYPE', 'RESPONSE_SITE', 'RESPONSE_DEPT',
    'ALIGN_DEFECT_CODE', 'REWORK_DEFECT_CODE_DESC',
    'FMA_RESPONSE_SITE', 'FMA_RESPONSE_DEPT',
    'FMA_DEFECT_CODE_DESC', 'LOCATION_FLAG',
    'COORD_X', 'COORD_Y',
]
_A_COLS = [c for c in RAWDATA_COLS if c not in ('PA', 'PA_DAY')]


def query_rawdata_db(products, periods, period_type, defect_group):
    dg_mapped = map_defect_group(defect_group)
    prod_ph   = ','.join(['%s']*len(products))
    per_ph    = ','.join(['%s']*len(periods))
    dg_f      = "AND A.DEFECT_GROUP = %s" if dg_mapped else ""

    if period_type == 'MONTHLY':
        period_filter = f"AND DATE_FORMAT(A.PIC_DAY,'%%Y%%m') IN ({per_ph})"
    else:
        period_filter = f"AND A.PIC_WEEK IN ({per_ph})"

    params = products + periods + ([dg_mapped] if dg_mapped else [])

    a_select  = ', '.join(f'A.{c}' for c in _A_COLS)
    select_sql = f"{a_select}, B.PA, B.PA_DAY"

    sql = f"""
SELECT {select_sql}
FROM RESPONSE.H_FIRST_RHNVS A
LEFT JOIN OPER.H_SHEET_OPER_FEOL B ON A.TFT_GLASS_ID = B.TFT_GLASS_ID
WHERE A.PRODUCT_CODE IN ({prod_ph})
{period_filter}
{dg_f}
ORDER BY A.PIC_DAY, A.TFT_CHIP_ID
"""
    conn = get_conn('RESPONSE')
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    finally:
        conn.close()

    lines = ['\t'.join(RAWDATA_COLS)]
    for row in rows:
        lines.append('\t'.join(
            str(row.get(c)) if row.get(c) is not None else ''
            for c in RAWDATA_COLS
        ))
    return '\n'.join(lines)


# ── RAW DATA HTTP scraping (fallback) ────────────────────
class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self._row, self._cell, self._in = [], None, None, False
    def handle_starttag(self, tag, attrs):
        if tag=='tr': self._row=[]
        elif tag in('td','th') and self._row is not None: self._cell, self._in = [], True
    def handle_endtag(self, tag):
        if tag in('td','th') and self._in:
            self._row.append(''.join(self._cell).strip()); self._cell, self._in = None, False
        elif tag=='tr' and self._row is not None:
            if any(c.strip() for c in self._row): self.rows.append(self._row)
            self._row = None
    def handle_data(self, data):
        if self._in: self._cell.append(data)

def fetch_rawdata_http(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        ct = resp.headers.get('Content-Type','')
        charset = ct.split('charset=')[-1].strip() if 'charset=' in ct else 'utf-8'
        raw_html = resp.read().decode(charset, errors='replace')
    p = TableParser(); p.feed(raw_html)
    rows = p.rows
    if not rows: return []
    if '總筆數' in ' '.join(rows[0]): rows = rows[1:]
    return rows


# ── ★ 多執行緒 HTTP Server ────────────────────────────────
class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """每個 request 在獨立 thread 處理，DB 查詢不阻塞其他人載入頁面"""
    daemon_threads = True          # 主程式結束時自動終止子執行緒
    allow_reuse_address = True


# ── HTTP Handler ──────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{self.address_string()}] {fmt % args}")

    def send_json(self, code, obj):
        try:
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type",   "application/json;charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin",  "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def send_html(self, filepath):
        """
        ★ 優化版：
        1. 從記憶體快取讀取（避免重複磁碟 IO）
        2. 支援 gzip 壓縮（Accept-Encoding: gzip）
        3. 加 Cache-Control: public, max-age=60（瀏覽器快取 60 秒）
        """
        try:
            raw, gz = _load_html_cached(filepath)

            accept_enc = self.headers.get("Accept-Encoding", "")
            use_gzip   = "gzip" in accept_enc

            body = gz if use_gzip else raw

            self.send_response(200)
            self.send_header("Content-Type",    "text/html;charset=utf-8")
            self.send_header("Content-Length",  str(len(body)))
            self.send_header("Cache-Control",   "public, max-age=60")
            self.send_header("Vary",            "Accept-Encoding")
            self.send_header("Access-Control-Allow-Origin", "*")
            if use_gzip:
                self.send_header("Content-Encoding", "gzip")
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass
        except FileNotFoundError:
            self.send_json(404, {"error": "file not found: " + os.path.basename(filepath)})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST,GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0].rstrip('/')

        if path == "/health":
            self.send_json(200, {"status": "ok"})
            return

        if path in ("", "/", "/index.html"):
            self.send_html(HTML_FILE)
            return

        if path.endswith(".html"):
            filename = os.path.basename(path)
            filepath = os.path.join(BASE_DIR, filename)
            self.send_html(filepath)
            return

        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        n    = int(self.headers.get("Content-Length", 0))
        raw  = self.rfile.read(n)
        path = self.path.split('?')[0].rstrip('/')

        try:
            body = json.loads(raw) if raw else {}
        except Exception:
            self.send_json(400, {"error": "invalid JSON"})
            return

        if path == "/api/fma":
            chip_ids = body.get("chip_ids", [])
            pc       = body.get("product_code", "")
            if not chip_ids:
                self.send_json(200, {"data":{}, "error":"chip_ids is empty"}); return
            try:
                self.send_json(200, {"data": query_fma(chip_ids, pc), "error": None})
            except Exception as e:
                self.send_json(200, {"data":{}, "error": str(e)})

        elif path == "/api/rawdata_db":
            products     = body.get("products", [])
            periods      = body.get("periods",  [])
            period_type  = body.get("period_type", "MONTHLY")
            defect_group = body.get("defect_group", "")
            if not products or not periods:
                self.send_json(200, {"data":"", "error":"missing params"}); return
            try:
                self.send_json(200, {"data": query_rawdata_db(products, periods, period_type, defect_group), "error": None})
            except Exception as e:
                self.send_json(200, {"data":"", "error": str(e)})

        elif path == "/api/rawdata_http":
            url = body.get("url", "")
            if not url:
                self.send_json(200, {"data":[], "error":"missing url"}); return
            try:
                self.send_json(200, {"data": fetch_rawdata_http(url), "error": None})
            except Exception as e:
                self.send_json(200, {"data":[], "error": str(e)})

        else:
            self.send_json(404, {"error": "endpoint not found"})


if __name__ == "__main__":
    # ★ 使用 ThreadingHTTPServer 取代原本的 HTTPServer
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"✓ Server running on port {PORT}  (multi-threaded ★)")
    print(f"✓ GET  /                       → L8B_DEFECT_Monitor_v12.html")
    print(f"✓ GET  /<name>.html            → 同目錄 HTML 靜態檔（iframe 用）")
    print(f"✓ GET  /health                 → status check")
    print(f"✓ POST /api/fma               → query FMA data")
    print(f"✓ POST /api/rawdata_db        → query RESPONSE DB")
    print(f"✓ POST /api/rawdata_http      → parse HTTP table")
    print(f"✓ HTML cache TTL: {HTML_CACHE_TTL}s  gzip: enabled")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n✓ Server shutdown.")
