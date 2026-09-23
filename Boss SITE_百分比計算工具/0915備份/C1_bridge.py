"""
C1 橋接程式 v17

【v17 優化】
  1. GET 隱藏欄位只做 1 次，5 個平台共用（減少 4 次 GET）
  2. ThreadPoolExecutor 並行抓取 5 個平台（序列→並行，速度提升 ~5x）
  3. 移除 time.sleep(0.5)（省 2 秒）

【v16 新增】
  本機 serve xlsx.full.min.js，解決瀏覽器第一次開啟頁面需要從 CDN 下載 900KB 很慢的問題。

【v15】
  根路徑 "/" 直接回傳 Boss_SITE_百分比計算工具.html。

【v14】
  修正：每筆 row 補 bu / platform 欄位，前端才能正確對應 BU 欄位。
  日期：UI 填 YYYYMMDD → 自動轉 TB_PERIOD2=YYYYMM + StartDate=YYYY/MM/DD
"""

import subprocess, sys

def _ensure(*pkgs):
    for pkg in pkgs:
        try:
            __import__(pkg.split("[")[0].replace("-","_"))
        except ImportError:
            print(f"  [自動安裝] {pkg} ...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

_ensure("requests", "beautifulsoup4", "lxml", "html5lib", "pandas")

import json, re, os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from io import StringIO
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup
import pandas as pd

BASE_URL = "http://tw100049089/L8BC1/GMIS/GMIS_YIELD_NEW.aspx"

PLATFORM_MAP = {
    "n-4K-PD": {"bu": "TV", "platform": "Non4K8K", "rbl_value": "n-4K-PD"},
    "4K2K":    {"bu": "TV", "platform": "4K",       "rbl_value": "4K2K"},
    "AHVA-DT": {"bu": "DT", "platform": "AHVA",     "rbl_value": "AHVA-DT"},
    "n-AHVA":  {"bu": "DT", "platform": "NonAHVA",  "rbl_value": "n-AHVA"},
    "AHVA-MP": {"bu": "MP", "platform": "AHVA",     "rbl_value": "AHVA-MP"},
}

TARGET_COLS = {
    "RES_SITE":    "stage",
    "SITE_RATIO":  "site_ratio",
    "RES_DEPT2":   "function",
    "DEPT2_RATIO": "dept_ratio",
}

_NORM_MAP = {
    s.lower().replace("_","").replace(" ",""): t
    for s, t in TARGET_COLS.items()
}


def _norm(s):
    return str(s).lower().replace("_","").replace(" ","").strip()


def _parse_date(date_str):
    """YYYYMMDD / YYYY/MM/DD / YYYYMM → (yyyymm='202608', start_date='2026/08/02')"""
    if not date_str:
        return None, None
    digits = re.sub(r"[^0-9]", "", date_str)
    if len(digits) >= 8:
        y, m, d = digits[:4], digits[4:6], digits[6:8]
    elif len(digits) == 6:
        y, m, d = digits[:4], digits[4:6], "01"
    else:
        return digits, None
    return f"{y}{m}", f"{y}/{m}/{d}"


# ── ★ v17：GET 隱藏欄位只做一次 ──────────────────────────
def _get_hidden_fields():
    """向 GMIS 發一次 GET，取得 ASP.NET 隱藏欄位（ViewState 等）"""
    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0"})
    r = sess.get(BASE_URL, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    hidden = {}
    for inp in soup.find_all("input", {"type": "hidden"}):
        n = inp.get("name", ""); v = inp.get("value", "")
        if n: hidden[n] = v
    return hidden


# ── ★ v17：POST 改為接受預先取得的 hidden，不再自己 GET ──
def _post_query(hidden, platform_key, mode, date_str):
    """用已取得的 hidden 欄位，直接對 GMIS 發 POST"""
    rbl_val  = PLATFORM_MAP[platform_key]["rbl_value"]
    period   = "Monthly" if "month" in mode.lower() else "Weekly"
    yyyymm, start_date = _parse_date(date_str)

    data = dict(hidden)   # 複製避免多執行緒競爭
    data["__EVENTTARGET"]   = ""
    data["__EVENTARGUMENT"] = ""
    data["RBL_PRODUCT"]     = rbl_val
    data["RBL_PERIOD"]      = period
    data["Button2"]         = "QUERY"
    if yyyymm:     data["TB_PERIOD2"] = yyyymm
    if start_date: data["StartDate"]  = start_date

    print(f"    POST: RBL_PRODUCT={rbl_val}  RBL_PERIOD={period}  "
          f"TB_PERIOD2={yyyymm}  StartDate={start_date}")

    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0"})
    r2 = sess.post(BASE_URL, data=data, timeout=120)
    r2.raise_for_status()
    print(f"    HTTP {r2.status_code}  len={len(r2.text):,}")
    return r2.text


def parse_response(html, bu, platform):
    """
    解析 HTML，回傳 rows 列表。
    每筆 row 包含：bu / platform / stage / site_ratio / function / dept_ratio
    """
    soup   = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")
    print(f"    頁面共有 {len(tables)} 個 <table>")

    target_df = None

    for ti, tbl in enumerate(tables):
        all_rows = tbl.find_all("tr")
        hits = 0
        for tr in all_rows[:10]:
            cells  = [td.get_text(strip=True) for td in tr.find_all(["th","td"])]
            normed = [_norm(c) for c in cells]
            h = sum(1 for nk in _NORM_MAP if nk in normed)
            if h > hits: hits = h

        if hits < 4:
            if hits > 0:
                print(f"    table[{ti}]: 欄位命中 {hits}/4，跳過")
            continue

        print(f"    table[{ti}]: 欄位命中 4/4 ✓  嘗試解析...")

        try:
            dfs = pd.read_html(StringIO(str(tbl)), flavor="lxml")
        except Exception:
            try:
                dfs = pd.read_html(StringIO(str(tbl)), flavor="html5lib")
            except Exception as e:
                print(f"    table[{ti}]: pandas 解析失敗 {e}")
                continue

        if not dfs: continue
        df = dfs[0]

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [
                "_".join(str(c) for c in col if str(c) != "nan").strip("_")
                for col in df.columns
            ]

        col_rename = {}
        for col in df.columns:
            nk = _norm(str(col))
            if nk in _NORM_MAP:
                col_rename[col] = _NORM_MAP[nk]

        if len(col_rename) < 4:
            print(f"    table[{ti}]: pandas 欄位對應 {len(col_rename)}/4，跳過")
            print(f"      columns: {list(df.columns)[:10]}")
            continue

        df = df.rename(columns=col_rename)[
            ["stage","site_ratio","function","dept_ratio"]
        ].copy()

        df["stage"]      = df["stage"].ffill()
        df["site_ratio"] = df["site_ratio"].ffill()

        df = df[df["function"].notna()]
        df = df[df["function"].astype(str).str.strip() != ""]
        df = df[~df["function"].astype(str).str.strip().isin(
            ["RES_DEPT2","function","DEPT2"])]
        df = df[~df["stage"].astype(str).str.strip().isin(
            ["RES_SITE","stage","SITE"])]
        df = df.drop_duplicates()

        df["site_ratio"] = pd.to_numeric(df["site_ratio"], errors="coerce")
        df["dept_ratio"] = pd.to_numeric(df["dept_ratio"], errors="coerce")

        print(f"    ✅ table[{ti}]: {len(df)} 列有效資料")
        target_df = df
        break

    if target_df is None:
        print("    [DEBUG] 各 table 摘要：")
        for ti, tbl in enumerate(tables):
            rows = tbl.find_all("tr")
            cells_r0 = [td.get_text(strip=True)[:15]
                        for td in (rows[0].find_all(["th","td"]) if rows else [])]
            print(f"      table[{ti}]: {len(rows)} 列  首列={cells_r0[:6]}")
        raise RuntimeError(
            f"頁面 {len(tables)} 個 table 均未找到 4 個目標欄位。"
        )

    rows = []
    for _, row in target_df.iterrows():
        rows.append({
            "bu":         bu,
            "platform":   platform,
            "stage":      str(row["stage"]).strip(),
            "site_ratio": None if pd.isna(row["site_ratio"]) else float(row["site_ratio"]),
            "function":   str(row["function"]).strip(),
            "dept_ratio": None if pd.isna(row["dept_ratio"]) else float(row["dept_ratio"]),
        })

    print(f"    解析完成：{len(rows)} 筆（bu={bu}, platform={platform}）")
    return rows


# ── ★ v17：單一平台任務（給 ThreadPoolExecutor 呼叫）───────
def _fetch_one(pk, hidden, mode, date_str):
    info = PLATFORM_MAP[pk]
    print(f"\n  ⬇  抓取 {pk}（BU={info['bu']} Platform={info['platform']}）...", flush=True)
    html = _post_query(hidden, pk, mode, date_str)
    rows = parse_response(html, bu=info["bu"], platform=info["platform"])
    print(f"  ✅ {len(rows)} 筆")
    return pk, {**info, "rows": rows}


# ── HTTP Server ───────────────────────────────────────────────────
_THIS_DIR  = os.path.dirname(os.path.abspath(__file__))
_HTML_FILE = os.path.join(_THIS_DIR, "Boss_SITE_百分比計算工具.html")
_XLSX_JS   = os.path.join(_THIS_DIR, "xlsx.full.min.js")


def _serve_file(handler, filepath, content_type):
    """通用靜態檔案回傳"""
    try:
        with open(filepath, "rb") as f:
            body = f.read()
        handler.send_response(200)
        handler._cors()
        handler.send_header("Content-Type", content_type)
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("Cache-Control", "public, max-age=604800")
        handler.end_headers()
        handler.wfile.write(body)
    except FileNotFoundError:
        msg = f"找不到檔案：{filepath}".encode("utf-8")
        handler.send_response(404)
        handler._cors()
        handler.send_header("Content-Type", "text/plain; charset=utf-8")
        handler.send_header("Content-Length", str(len(msg)))
        handler.end_headers()
        handler.wfile.write(msg)
    except Exception as e:
        msg = str(e).encode("utf-8")
        handler.send_response(500)
        handler._cors()
        handler.send_header("Content-Type", "text/plain; charset=utf-8")
        handler.send_header("Content-Length", str(len(msg)))
        handler.end_headers()
        handler.wfile.write(msg)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        # ── 根路徑：回傳 HTML 工具頁面 ────────────────────────
        if parsed.path in ("/", ""):
            _serve_file(self, _HTML_FILE, "text/html; charset=utf-8")
            return

        # ── v16：本機 serve xlsx.full.min.js ─────────────────
        if parsed.path == "/xlsx.full.min.js":
            _serve_file(self, _XLSX_JS, "application/javascript")
            return

        # ── /fetch：抓取 GMIS 資料（★ v17 並行化）───────────
        if parsed.path == "/fetch":
            mode     = params.get("mode",  ["Monthly"])[0]
            date_str = params.get("date",  [None])[0]
            result   = {}
            errors   = {}

            # ★ v17：只 GET 一次隱藏欄位
            print(f"\n[fetch] mode={mode} date={date_str}")
            print("  ⏳ 取得 GMIS 隱藏欄位（1 次 GET）...")
            try:
                hidden = _get_hidden_fields()
                print(f"  ✅ 隱藏欄位取得完成（{len(hidden)} 個欄位）")
            except Exception as e:
                body = json.dumps({"ok": False, "error": f"GET 隱藏欄位失敗：{e}"},
                                  ensure_ascii=False).encode("utf-8")
                self._respond(body)
                return

            # ★ v17：5 個平台並行 POST
            print(f"  🚀 並行抓取 {len(PLATFORM_MAP)} 個平台...")
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = {
                    executor.submit(_fetch_one, pk, hidden, mode, date_str): pk
                    for pk in PLATFORM_MAP
                }
                for future in as_completed(futures):
                    pk = futures[future]
                    try:
                        pk_result, data = future.result()
                        result[pk_result] = data
                    except Exception as e:
                        info = PLATFORM_MAP[pk]
                        errors[pk] = str(e)
                        result[pk] = {**info, "rows": []}
                        print(f"  ❌ {pk}: {e}")

            total = sum(len(result[pk].get("rows", [])) for pk in result)
            print(f"\n  ── 5 個平台合計 {total} 筆 ──")
            body = json.dumps({"ok": True, "data": result, "errors": errors},
                              ensure_ascii=False).encode("utf-8")

        # ── /debug：除錯用 ───────────────────────────────────
        elif parsed.path == "/debug":
            pk       = params.get("platform", ["4K2K"])[0]
            mode     = params.get("mode",     ["Monthly"])[0]
            date_str = params.get("date",     [None])[0]
            print(f"\n[DEBUG] platform={pk} mode={mode} date={date_str}")
            try:
                info = PLATFORM_MAP.get(pk, {"bu":"?","platform":pk,"rbl_value":pk})
                hidden = _get_hidden_fields()
                html = _post_query(hidden, pk, mode, date_str)
                soup = BeautifulSoup(html, "lxml")
                tables = soup.find_all("table")
                out = {"table_count": len(tables), "tables": []}
                for ti, tbl in enumerate(tables):
                    all_rows = tbl.find_all("tr"); n = len(all_rows)
                    preview = []; hits = 0
                    for tr in all_rows[:10]:
                        cells = [td.get_text(strip=True) for td in tr.find_all(["th","td"])]
                        if any(cells): preview.append(cells)
                        normed = [_norm(c) for c in cells]
                        h = sum(1 for nk in _NORM_MAP if nk in normed)
                        if h > hits: hits = h
                    out["tables"].append({
                        "index": ti, "total_rows": n,
                        "col_hits": f"{hits}/4",
                        "first_rows": preview[:5]
                    })
                body = json.dumps(out, ensure_ascii=False, indent=2).encode("utf-8")
            except Exception as e:
                import traceback
                body = json.dumps({"error": str(e), "trace": traceback.format_exc()},
                                  ensure_ascii=False).encode("utf-8")

        else:
            self.send_response(404); self._cors(); self.end_headers(); return

        self._respond(body)

    def _respond(self, body):
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def run():
    port   = 5731
    server = HTTPServer(("0.0.0.0", port), Handler)
    print("=" * 60)
    print(f"  C1 橋接程式 v17 已啟動  (port {port})")
    print()
    print(f"  [工具] http://10.36.38.240:{port}/")
    print(f"  [JS  ] http://10.36.38.240:{port}/xlsx.full.min.js")
    print(f"  [抓取] http://10.36.38.240:{port}/fetch?mode=Monthly&date=20260802")
    print(f"  [除錯] http://10.36.38.240:{port}/debug?platform=4K2K&date=20260802")
    print()
    xlsx_js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xlsx.full.min.js")
    if os.path.exists(xlsx_js_path):
        size_kb = os.path.getsize(xlsx_js_path) // 1024
        print(f"  ✅ xlsx.full.min.js 已找到（{size_kb} KB），本機模式啟用")
    else:
        print(f"  ⚠️  找不到 xlsx.full.min.js！")
        print(f"     請下載後放到：{xlsx_js_path}")
        print(f"     下載網址：https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js")
    print("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n橋接程式已停止。")


if __name__ == "__main__":
    run()
