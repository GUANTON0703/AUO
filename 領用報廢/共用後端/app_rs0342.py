"""
RS0342 Scrap Cost Dashboard - Backend
PORT: 5202
Tables:
  GMIS.H_SCRAP_EXCEL_RS0342
  GMIS.H_SCRAP_EXCEL_BCS_DETAIL
PERIOD 格式：YYYYMM (e.g. 202508)
"""
import subprocess, sys

def _ensure(pkg, import_name=None):
    try:
        __import__(import_name or pkg)
    except ImportError:
        print(f'[setup] Installing {pkg}...')
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', pkg, '--quiet'])

_ensure('pymysql')

import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import pymysql, pymysql.cursors
from datetime import date

PORT = 5202

DB_CONFIG = {
    'host':        'TW100049342',
    'user':        'L8BC1_AGENT',
    'password':    'c1agent',
    'database':    'GMIS',
    'charset':     'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
    'connect_timeout': 30,
}

def get_conn():
    return pymysql.connect(**DB_CONFIG)

def run_query(sql):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()
    finally:
        conn.close()

# ─── Period 工具函數 ─────────────────────────────────────────────
def mcode_to_db(mcode: str) -> str:
    """'2508' → '202508'"""
    return '20' + mcode

def mcode_to_label(mcode: str) -> str:
    _ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    yy = mcode[:2]
    mm = int(mcode[2:])
    return f"{_ABBR[mm-1]}'{yy}"

def mcode_list(start: str, end: str) -> list:
    s_yy, s_mm = int(start[:2]), int(start[2:])
    e_yy, e_mm = int(end[:2]),   int(end[2:])
    result = []
    yy, mm = s_yy, s_mm
    while (yy, mm) <= (e_yy, e_mm):
        result.append(f"{yy:02d}{mm:02d}")
        mm += 1
        if mm > 12:
            mm = 1
            yy += 1
    return result

def default_period_range() -> tuple:
    """
    2號後（含）：結束=上月；2號前：結束=上上月
    開始=結束往前12個月
    """
    today = date.today()
    if today.day > 2:                          # ← 原本是 > 5，改為 > 2
        end_y, end_m = today.year, today.month - 1
    else:
        end_y, end_m = today.year, today.month - 2
    if end_m <= 0:
        end_m += 12
        end_y -= 1
    start_m = end_m + 1
    start_y = end_y - 1
    if start_m > 12:
        start_m -= 12
        start_y += 1
    return (f"{start_y % 100:02d}{start_m:02d}",
            f"{end_y   % 100:02d}{end_m:02d}")

# ─── SQL 構造 ───────────────────────────────────────────────────
# SIZE：FG & Cell_Sub → SUBSTRING(ITEM_NAME,4,2)；Glass → '2200*2500'
SIZE_EXPR = """CASE
  WHEN TYPE IN ('FG','Cell_Sub') THEN SUBSTRING(ITEM_NAME, 4, 2)
  WHEN TYPE = 'Glass'            THEN '2200*2500'
  ELSE SUBSTRING(ITEM_NAME, 4, 2)
END"""

def build_period_in(periods: list) -> str:
    return ', '.join(f"'{mcode_to_db(p)}'" for p in periods)

def build_scrap_sql(periods: list, types: list = None) -> str:
    """
    主查詢：RS0342 LEFT JOIN BCS_DETAIL
    QTY 使用 ALLOCATED_QTY（非 PRIMARY_QTY）
    """
    period_in = build_period_in(periods)
    type_filter = ""
    if types:
        tlist = ', '.join(f"'{t}'" for t in types)
        type_filter = f"AND r.TYPE IN ({tlist})"

    return f"""
SELECT
  r.PERIOD,
  r.TYPE,
  {SIZE_EXPR}                      AS SIZE,
  r.COST_CENTER                    AS DEPT,
  r.STAGE,
  SUM(r.ALLOCATED_QTY)             AS QTY,
  COALESCE(SUM(b.AMT_LOCAL), 0)    AS AMT
FROM GMIS.H_SCRAP_EXCEL_RS0342 r
LEFT JOIN (
  SELECT FORM_NO, SUM(AMT_LOCAL) AS AMT_LOCAL
  FROM GMIS.H_SCRAP_EXCEL_BCS_DETAIL
  GROUP BY FORM_NO
) b ON r.TRX_REF = b.FORM_NO
WHERE r.PERIOD IN ({period_in})
  {type_filter}
GROUP BY r.PERIOD, r.TYPE, SIZE, r.COST_CENTER, r.STAGE
ORDER BY r.PERIOD, r.TYPE, SIZE, r.STAGE, r.COST_CENTER
"""

def build_yield_sql(periods: list) -> str:
    period_in = build_period_in(periods)
    return f"""
SELECT
  PERIOD,
  MAX(ARRAY_OUTPUT)   AS ARRAY_OUTPUT,
  MAX(CELL_OUTPUT)    AS CELL_OUTPUT,
  MAX(MODULE_OUTPUT)  AS MDL_OUTPUT
FROM GMIS.H_SCRAP_EXCEL_RS0342
WHERE PERIOD IN ({period_in})
GROUP BY PERIOD
ORDER BY PERIOD
"""

# ─── HTTP Handler ───────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _serve_html(self, filepath):
        import os
        try:
            with open(filepath, 'rb') as f:
                body = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except FileNotFoundError:
            self._send_json({'error': 'HTML file not found'}, 404)

    def do_GET(self):
        import os
        if self.path in ('/', '/index.html', '/rs0342.html'):
            # 與 app_rs0342.py 同目錄的 rs0342.html
            here = os.path.dirname(os.path.abspath(__file__))
            self._serve_html(os.path.join(here, 'rs0342.html'))
        elif self.path == '/api/rs0342/health':
            self._send_json({'status': 'ok', 'port': PORT})
        elif self.path == '/api/rs0342/default_period':
            start, end = default_period_range()
            self._send_json({'start': start, 'end': end})
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        try:
            body = self._read_body()

            if self.path == '/api/rs0342/combo':
                period_start = body.get('period_start')
                period_end   = body.get('period_end')
                types        = body.get('types', [])
                if not period_start or not period_end:
                    return self._send_json({'error': 'Missing period_start / period_end'}, 400)

                periods = mcode_list(period_start, period_end)
                db_to_mcode = {mcode_to_db(p): p for p in periods}

                scrap_sql = build_scrap_sql(periods, types or None)
                yield_sql = build_yield_sql(periods)

                print(f"[COMBO SCRAP SQL]\n{scrap_sql}\n")
                scrap_rows = run_query(scrap_sql)
                for r in scrap_rows:
                    r['MCODE'] = db_to_mcode.get(str(r.get('PERIOD')), str(r.get('PERIOD')))

                print(f"[COMBO YIELD SQL]\n{yield_sql}\n")
                yield_rows = run_query(yield_sql)
                for r in yield_rows:
                    r['MCODE'] = db_to_mcode.get(str(r.get('PERIOD')), str(r.get('PERIOD')))

                self._send_json({
                    'scrap':       scrap_rows,
                    'yield':       yield_rows,
                    'periods':     periods,
                    'scrap_count': len(scrap_rows),
                    'yield_count': len(yield_rows),
                })

            elif self.path == '/api/rs0342/scrap':
                period_start = body.get('period_start')
                period_end   = body.get('period_end')
                types        = body.get('types', [])
                if not period_start or not period_end:
                    return self._send_json({'error': 'Missing period_start / period_end'}, 400)
                periods = mcode_list(period_start, period_end)
                sql = build_scrap_sql(periods, types or None)
                print(f"[SCRAP SQL]\n{sql}\n")
                rows = run_query(sql)
                db_to_mcode = {mcode_to_db(p): p for p in periods}
                for r in rows:
                    r['MCODE'] = db_to_mcode.get(str(r.get('PERIOD')), str(r.get('PERIOD')))
                self._send_json({'rows': rows, 'count': len(rows), 'periods': periods})

            elif self.path == '/api/rs0342/yield':
                period_start = body.get('period_start')
                period_end   = body.get('period_end')
                if not period_start or not period_end:
                    return self._send_json({'error': 'Missing period_start / period_end'}, 400)
                periods = mcode_list(period_start, period_end)
                sql = build_yield_sql(periods)
                print(f"[YIELD SQL]\n{sql}\n")
                rows = run_query(sql)
                db_to_mcode = {mcode_to_db(p): p for p in periods}
                for r in rows:
                    r['MCODE'] = db_to_mcode.get(str(r.get('PERIOD')), str(r.get('PERIOD')))
                self._send_json({'rows': rows, 'count': len(rows)})

            else:
                self._send_json({'error': 'Not found'}, 404)

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'error': str(e)}, 500)


# ─── Main ───────────────────────────────────────────────────────
if __name__ == '__main__':
    start, end = default_period_range()
    print("=" * 55)
    print("  RS0342 Scrap Cost Dashboard Backend")
    print(f"  DB  : {DB_CONFIG['host']} / {DB_CONFIG['database']}")
    print(f"  PORT: {PORT}")
    print(f"  預設期間: {mcode_to_label(start)} ~ {mcode_to_label(end)}")
    print("=" * 55)
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f"  Listening on http://0.0.0.0:{PORT}")
    server.serve_forever()
