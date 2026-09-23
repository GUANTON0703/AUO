"""
PI_Proxy — Flask 後端
修改版：202609081121.py

變更內容：
  1. BASE_DIR 改為 \\tw100049089\00_MyAgent\PI INSP
     （前端 HTML / CSS / JS 放在這裡）
  2. IMG_DIR 改為 \\tw100049089\00_MyAgent\PI INSP\底圖
     （底圖 PNG 放在這裡）
  3. STATIC_FILES 加入 pi_layout.js

目錄結構：
  \\tw100049089\00_MyAgent\PI INSP\
    PI_proxy_PIINSP.py          ← 本檔（後端）
    PI_Insp_Map_main.html
    pi_style.css
    pi_main.js
    pi_patches.js
    pi_patch2.js
    pi_layout.js
    底圖\
      T430QVN10_ABCD.png
      T550QVN10_ABCDEF.png
      ... (其餘底圖)

啟動：
  python PI_proxy_PIINSP.py

安裝依賴：
  pip install flask flask-cors requests beautifulsoup4
"""

import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from urllib.parse import urljoin

app = Flask(__name__)
CORS(app)

# ── 前端檔案目錄（HTML / CSS / JS 同層）─────────────────────
BASE_DIR = r'\\tw100049089\00_MyAgent\PI INSP'

# ── 底圖目錄（BASE_DIR 下的 底圖 子資料夾）──────────────────
IMG_DIR = os.path.join(BASE_DIR, '底圖')

# ── PI 圖片查詢設定 ───────────────────────────────────────────
QUERY_URL  = "http://tw100049089/L8BN0/PI_Image/PI_All_Image_Query.aspx"
IMAGE_BASE = "http://tw100049089/L8BN0/PI_Image/PI_Insp_Image.aspx"
QUERY_BASE = "http://tw100049089/L8BN0/PI_Image/"

# ── L8BCEL 資料庫查詢設定 ─────────────────────────────────────
DB_QUERY_URL = "http://tw100049342.corpnet.auo.com/L8BC1/CInt_Query_System/SQL_Query.aspx"
DB_NAME      = "L8BCEL"

# ── 允許直接存取的靜態檔案（新增 pi_layout.js）───────────────
STATIC_FILES = {
    'pi_style.css',
    'pi_main.js',
    'pi_patches.js',
    'pi_patch2.js',
    'pi_layout.js',   # ← 新增
}

# ────────────────────────────────────────────────────────────


def default_dates():
    today = datetime.today()
    start = today - timedelta(days=90)
    return start.strftime("%Y/%m/%d"), today.strftime("%Y/%m/%d")


# ══════════════════════════════════════════════════════════════
# 靜態檔案服務
# ══════════════════════════════════════════════════════════════

@app.route('/')
def index():
    """主入口：回傳 PI_Insp_Map_main.html"""
    return send_from_directory(BASE_DIR, 'PI_Insp_Map_main.html')


@app.route('/<path:filename>')
def static_file(filename):
    """CSS / JS / PNG 靜態資源"""
    # ── CSS / JS ──
    if filename in STATIC_FILES:
        return send_from_directory(BASE_DIR, filename)

    # ── 底圖 PNG（從底圖子資料夾讀取，僅允許純檔名，防路徑穿越）──
    if filename.lower().endswith('.png') and '/' not in filename and '\\' not in filename:
        img_path = os.path.join(IMG_DIR, filename)
        if os.path.isfile(img_path):
            return send_from_directory(IMG_DIR, filename)
        return '', 404

    return jsonify({"error": "Not found"}), 404


# ══════════════════════════════════════════════════════════════
# /identify — 查 L8BCEL 判斷 TFT / CF
# GET /identify?ids=K85Q0829AQ,K85Q0829AB
# ══════════════════════════════════════════════════════════════

def _get_db_viewstate(sess):
    resp = sess.get(DB_QUERY_URL, timeout=15, verify=False)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    def val(id_):
        tag = soup.find("input", {"id": id_})
        return tag["value"] if tag else ""

    return {
        "__EVENTTARGET":        "",
        "__EVENTARGUMENT":      "",
        "__VIEWSTATE":          val("__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": val("__VIEWSTATEGENERATOR"),
        "__EVENTVALIDATION":    val("__EVENTVALIDATION"),
    }


def _query_l8bcel(sql: str):
    sess = requests.Session()
    vs   = _get_db_viewstate(sess)

    form_data = {k: v for k, v in vs.items() if v}
    form_data.update({
        "DB":       DB_NAME,
        "TextBox1": sql,
        "Button1":  "查詢",
    })

    resp = sess.post(DB_QUERY_URL, data=form_data, timeout=30, verify=False)
    resp.encoding = "utf-8"
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    grid = soup.find("table", {"id": "GridView1"})
    if not grid:
        return []

    rows = grid.find_all("tr")
    if len(rows) < 2:
        return []

    headers = [th.get_text(strip=True) for th in rows[0].find_all("th")]
    result  = []
    for tr in rows[1:]:
        cells = tr.find_all("td")
        if not cells:
            continue
        result.append({
            headers[i]: cells[i].get_text(strip=True)
            for i in range(min(len(headers), len(cells)))
        })
    return result


@app.route("/identify", methods=["GET"])
def identify():
    raw_ids = request.args.get("ids", "").strip()
    if not raw_ids:
        return jsonify({"error": "ids 參數不可為空，格式：?ids=ID1,ID2,ID3"}), 400

    id_list = list(dict.fromkeys(
        i.strip() for i in raw_ids.replace("\n", ",").split(",") if i.strip()
    ))
    if not id_list:
        return jsonify({"error": "解析不到任何 ID"}), 400

    in_clause = ", ".join("'" + i + "'" for i in id_list)

    # ★ 改用 H_DAX_EQPUNIT_ODS（SHEET_ID_CHIP_ID + ABBR_CAT 判斷 TFT/CF）
    sql = (
        "SELECT SHEET_ID_CHIP_ID, PRODUCT_CODE, ABBR_CAT "
        "FROM ( "
        "  SELECT SHEET_ID_CHIP_ID, PRODUCT_CODE, ABBR_CAT, "
        "    ROW_NUMBER() OVER (PARTITION BY SHEET_ID_CHIP_ID ORDER BY EQP_ID) AS rn "
        "  FROM CELODS.H_DAX_EQPUNIT_ODS "
        "  WHERE UNIT_NAME = 'RECIPE' "
        "    AND SHEET_ID_CHIP_ID IN (" + in_clause + ") "
        "    AND EQP_ID LIKE '%1' "
        ") WHERE rn = 1"
    )

    try:
        db_rows = _query_l8bcel(sql)
    except requests.RequestException as e:
        return jsonify({"error": "無法連線至 L8BCEL 查詢系統：" + str(e)}), 502
    except Exception as e:
        return jsonify({"error": "查詢發生錯誤：" + str(e)}), 500

    # ★ ABBR_CAT 對應 side：'CF' → CF，其餘（'TFT','ARRAY'...）→ TFT
    lookup = {}
    for row in db_rows:
        sid   = row.get("SHEET_ID_CHIP_ID", "").strip()
        abbr  = row.get("ABBR_CAT", "").strip().upper()
        pcode = row.get("PRODUCT_CODE", "").strip()
        if not sid or sid in lookup:
            continue
        if abbr == "CF":
            side = "CF"
        elif abbr in ("TFT", "ARRAY", "TFT_ARRAY"):
            side = "TFT"
        else:
            side = "unknown"
        lookup[sid] = {
            "side":         side,
            "abbr_cat":     abbr,
            "product_code": pcode,
            "tft_glass_id": "",
            "cf_glass_id":  "",
            "create_dtm":   "",
        }

    results = []
    for id_ in id_list:
        if id_ in lookup:
            results.append({"id": id_, **lookup[id_]})
        else:
            results.append({
                "id": id_, "side": "unknown",
                "abbr_cat":     "",
                "tft_glass_id": "", "cf_glass_id": "",
                "product_code": "", "create_dtm":  "",
            })

    return jsonify({"count": len(id_list), "results": results})


# ══════════════════════════════════════════════════════════════
# 原有路由（保留不動）
# ══════════════════════════════════════════════════════════════

@app.route("/debug", methods=["GET"])
def debug():
    try:
        resp = requests.get(QUERY_URL, timeout=10, verify=False)
        resp.encoding = "utf-8"
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 502

    soup   = BeautifulSoup(resp.text, "html.parser")
    fields = []
    for tag in soup.find_all(["input", "select", "textarea", "button"]):
        fields.append({
            "tag":   tag.name,
            "type":  tag.get("type", "—"),
            "name":  tag.get("name", "（無 name）"),
            "id":    tag.get("id", ""),
            "value": tag.get("value", ""),
        })
    form = soup.find("form")
    return jsonify({
        "form_action": form.get("action") if form else "找不到 form",
        "form_method": form.get("method") if form else "—",
        "fields":      fields,
    })



@app.route("/debug_query", methods=["GET"])
def debug_query():
    """
    診斷用：查詢 PI 頁面並回傳所有 table 的結構資訊
    用法：http://10.36.38.240:5106/debug_query?sheet_id=XXXXX
    """
    sheet_id = request.args.get("sheet_id", "").strip()
    if not sheet_id:
        return jsonify({"error": "請帶 ?sheet_id=XXXXX"}), 400

    d_start, d_end = default_dates()
    try:
        sess  = requests.Session()
        resp0 = sess.get(QUERY_URL, timeout=30, verify=False)
        soup0 = BeautifulSoup(resp0.text, "html.parser")
        def v(name):
            tag = soup0.find("input", {"name": name})
            return tag["value"] if tag else ""
        form_data = {
            "__VIEWSTATE":          v("__VIEWSTATE"),
            "__VIEWSTATEGENERATOR": v("__VIEWSTATEGENERATOR"),
            "__EVENTVALIDATION":    v("__EVENTVALIDATION"),
            "START_DATE": d_start, "END_DATE": d_end,
            "TextBox1": sheet_id, "RBL_IMG": "INSP", "RBL_ID": "SHEET",
            "Button1": "Query",
        }
        resp = sess.post(QUERY_URL, data=form_data, timeout=45, verify=False)
        resp.encoding = "utf-8"
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 502

    soup = BeautifulSoup(resp.text, "html.parser")
    tables_info = []
    for i, t in enumerate(soup.find_all("table")):
        trs = t.find_all("tr")
        sample = []
        for tr in trs[:3]:
            tds = tr.find_all("td", recursive=False)
            sample.append([td.get_text(strip=True)[:30] for td in tds])
        tables_info.append({
            "index":    i,
            "id":       t.get("id", ""),
            "class":    " ".join(t.get("class", [])),
            "tr_count": len(trs),
            "sample_rows": sample,
        })

    all_trs = soup.find_all("tr")
    valid_trs = []
    for tr in all_trs:
        cells = tr.find_all("td", recursive=False)
        if len(cells) >= 6:
            valid_trs.append([td.get_text(strip=True)[:30] for td in cells[:6]])

    return jsonify({
        "total_tables": len(tables_info),
        "tables":       tables_info,
        "valid_tr_count": len(valid_trs),
        "valid_tr_samples": valid_trs[:5],
        "html_snippet": resp.text[:2000],
    })

@app.route("/query", methods=["GET"])
def query_pi():
    sheet_id   = request.args.get("sheet_id",   "").strip()
    start_date = request.args.get("start_date", "").strip()
    end_date   = request.args.get("end_date",   "").strip()
    image_type = request.args.get("image_type", "INSP").strip()
    id_type    = request.args.get("id_type",    "SHEET").strip()

    if not sheet_id:
        return jsonify({"error": "sheet_id 不可為空"}), 400

    d_start, d_end = default_dates()
    if not start_date: start_date = d_start
    if not end_date:   end_date   = d_end

    # ★ retry：網路不穩定時自動重試，最多嘗試 3 次
    last_err = None
    resp     = None
    for attempt in range(3):
        try:
            sess  = requests.Session()
            resp0 = sess.get(QUERY_URL, timeout=30, verify=False)
            soup0 = BeautifulSoup(resp0.text, "html.parser")

            def v(name):
                tag = soup0.find("input", {"name": name})
                return tag["value"] if tag else ""

            form_data = {
                "__VIEWSTATE":          v("__VIEWSTATE"),
                "__VIEWSTATEGENERATOR": v("__VIEWSTATEGENERATOR"),
                "__EVENTVALIDATION":    v("__EVENTVALIDATION"),
                "START_DATE": start_date,
                "END_DATE":   end_date,
                "TextBox1":   sheet_id,
                "RBL_IMG":    image_type,
                "RBL_ID":     id_type,
                "Button1":    "Query",
            }

            resp = sess.post(QUERY_URL, data=form_data, timeout=45, verify=False)
            resp.encoding = "utf-8"
            last_err = None
            break   # 成功就跳出重試
        except requests.RequestException as e:
            last_err = e
            continue   # 失敗繼續下一次

    if last_err is not None:
        return jsonify({"error": "無法連線（重試3次失敗）：" + str(last_err)}), 502

    soup      = BeautifulSoup(resp.text, "html.parser")
    points    = []
    seen_keys = set()   # key = (sheet_id, x, y)，最終防重複

    # ★ 直接找 GridView1（debug 已確認 id 固定為此），取其直接子 tr
    #   若找不到才 fallback 掃全部 tr
    grid = soup.find("table", id="GridView1")
    trs  = grid.find_all("tr") if grid else soup.find_all("tr")

    for tr in trs:
        cells = tr.find_all("td", recursive=False)   # 只取直接子 td
        if len(cells) < 6:
            continue
        try:
            mfg_day = cells[1].get_text(strip=True)
            a_tag   = cells[2].find("a")
            s_id    = cells[2].get_text(strip=True)
            href    = a_tag["href"] if a_tag and a_tag.get("href") else ""
            href    = urljoin(QUERY_BASE, href) if href else ""
            line_id = cells[3].get_text(strip=True)
            x       = float(cells[4].get_text(strip=True))
            y       = float(cells[5].get_text(strip=True))
            if not href:
                href = (IMAGE_BASE + "?SHEET_ID=" + s_id
                        + "&MFG_DAY=" + mfg_day
                        + "&X_CORD=" + str(int(x))
                        + "&Y_CORD=" + str(int(y)))
            _key = (s_id, str(x), str(y))
            if _key in seen_keys:
                continue
            seen_keys.add(_key)
            points.append({
                "sheet_id": s_id,
                "mfg_day":  mfg_day,
                "line_id":  line_id,
                "x":        x,
                "y":        y,
                "url":      href,
            })
        except (ValueError, TypeError, KeyError):
            continue

    if not points:
        return jsonify({
            "count":        0,
            "points":       [],
            "warning":      "解析到 0 筆，可能查詢無結果或頁面結構有異",
            "html_snippet": resp.text[:3000],
        })

    return jsonify({"count": len(points), "points": points})



@app.route("/query_batch", methods=["GET"])
def query_batch():
    """
    批次查詢：接受多個 sheet_id（逗號分隔），依序查詢後合併回傳
    前端只需發 1 個 fetch，不再有平行超時競爭問題
    用法：/query_batch?sheet_ids=ID1,ID2&start_date=...&end_date=...&image_type=INSP&id_type=SHEET
    """
    raw_ids    = request.args.get("sheet_ids",  "").strip()
    start_date = request.args.get("start_date", "").strip()
    end_date   = request.args.get("end_date",   "").strip()
    image_type = request.args.get("image_type", "INSP").strip()
    id_type    = request.args.get("id_type",    "SHEET").strip()

    if not raw_ids:
        return jsonify({"error": "sheet_ids 不可為空，格式：?sheet_ids=ID1,ID2"}), 400

    sheet_ids = [s.strip() for s in raw_ids.replace("\n", ",").split(",") if s.strip()]
    if not sheet_ids:
        return jsonify({"error": "解析不到任何 ID"}), 400

    d_start, d_end = default_dates()
    if not start_date: start_date = d_start
    if not end_date:   end_date   = d_end

    all_points = []
    errors     = []
    seen_keys  = set()   # 跨 ID 也去重

    def _query_one(sid):
        """查詢單一 sheet_id，GET VIEWSTATE 最多重試 2 次，POST 最多重試 2 次"""
        # GET VIEWSTATE（最多2次）
        resp0 = None
        for i in range(2):
            try:
                sess_inner = requests.Session()
                resp0 = sess_inner.get(QUERY_URL, timeout=20, verify=False)
                break
            except requests.RequestException:
                if i == 1:
                    raise
        soup0 = BeautifulSoup(resp0.text, "html.parser")

        def v(name):
            tag = soup0.find("input", {"name": name})
            return tag["value"] if tag else ""

        form_data = {
            "__VIEWSTATE":          v("__VIEWSTATE"),
            "__VIEWSTATEGENERATOR": v("__VIEWSTATEGENERATOR"),
            "__EVENTVALIDATION":    v("__EVENTVALIDATION"),
            "START_DATE": start_date,
            "END_DATE":   end_date,
            "TextBox1":   sid,
            "RBL_IMG":    image_type,
            "RBL_ID":     id_type,
            "Button1":    "Query",
        }

        # POST 查詢（最多2次）
        resp = None
        for i in range(2):
            try:
                resp = sess_inner.post(QUERY_URL, data=form_data, timeout=30, verify=False)
                resp.encoding = "utf-8"
                break
            except requests.RequestException:
                if i == 1:
                    raise
        return resp

    for sid in sheet_ids:
        try:
            resp = _query_one(sid)
        except requests.RequestException as e:
            errors.append(sid + "：" + str(e))
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        grid = soup.find("table", id="GridView1")
        trs  = grid.find_all("tr") if grid else soup.find_all("tr")

        for tr in trs:
            cells = tr.find_all("td", recursive=False)
            if len(cells) < 6:
                continue
            try:
                mfg_day = cells[1].get_text(strip=True)
                a_tag   = cells[2].find("a")
                s_id    = cells[2].get_text(strip=True)
                href    = a_tag["href"] if a_tag and a_tag.get("href") else ""
                href    = urljoin(QUERY_BASE, href) if href else ""
                line_id = cells[3].get_text(strip=True)
                x       = float(cells[4].get_text(strip=True))
                y       = float(cells[5].get_text(strip=True))
                if not href:
                    href = (IMAGE_BASE + "?SHEET_ID=" + s_id
                            + "&MFG_DAY=" + mfg_day
                            + "&X_CORD=" + str(int(x))
                            + "&Y_CORD=" + str(int(y)))
                _key = (s_id, str(x), str(y))
                if _key in seen_keys:
                    continue
                seen_keys.add(_key)
                all_points.append({
                    "sheet_id": s_id,
                    "mfg_day":  mfg_day,
                    "line_id":  line_id,
                    "x":        x,
                    "y":        y,
                    "url":      href,
                })
            except (ValueError, TypeError, KeyError):
                continue

    result = {"count": len(all_points), "points": all_points}
    if errors:
        result["errors"] = errors
    if not all_points and errors:
        result["warning"] = "所有 ID 均查詢失敗"
    return jsonify(result)

@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "ok", "message": "PI Proxy 運作中 🟢"})


# ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings()

    print("=" * 55)
    print(f"  前端目錄：{BASE_DIR}")

    # 確認前端目錄可存取
    if os.path.isdir(BASE_DIR):
        print("  前端目錄 OK ✓")
    else:
        print("  ⚠️  前端目錄不可存取！請確認網路磁碟機已連接")

    # 確認底圖目錄可存取
    if os.path.isdir(IMG_DIR):
        png_count = len([f for f in os.listdir(IMG_DIR) if f.lower().endswith('.png')])
        print(f"  底圖目錄 OK：{png_count} 個 PNG ✓")
    else:
        print(f"  ⚠️  底圖目錄不可存取：{IMG_DIR}")
        print("     （底圖功能將回傳 404，其餘功能不受影響）")

    print("=" * 55)
    print("PI Proxy 啟動中...  PORT: 5106")
    print("  網頁入口：  http://10.36.38.240:5106/")
    print("  PI 查詢：   http://10.36.38.240:5106/query")
    print("  ID 判別：   http://10.36.38.240:5106/identify?ids=ID1,ID2")
    print("  Ping：      http://10.36.38.240:5106/ping")
    print("=" * 55)
    app.run(host="0.0.0.0", port=5106, debug=False)
