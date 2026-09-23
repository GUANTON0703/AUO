"""
PI_Proxy — Flask 後端
原檔：202609041057.py
修改：202609041121.py

變更內容：
  1. 新增 IMG_DIR 指向底圖資料夾 \\tw100049089\00_MyAgent\PI INSP\底圖
  2. static_file 路由新增 .png 分支，從 IMG_DIR serve 底圖

目錄結構（同一資料夾）：
  202609041121.py
  PI_Insp_Map_main.html
  pi_style.css
  pi_main.js
  pi_patches.js
  底圖（\\tw100049089\00_MyAgent\PI INSP\底圖，不需複製到本機）

啟動：
  python 202609041121.py

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

# ── 本腳本所在目錄（HTML / CSS / JS 同層）────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── 底圖目錄（網路磁碟機，PNG 從此讀取）─────────────────────
IMG_DIR = r'\\tw100049089\00_MyAgent\PI INSP\底圖'

# ── PI 圖片查詢設定 ───────────────────────────────────────────
QUERY_URL  = "http://tw100049089/L8BN0/PI_Image/PI_All_Image_Query.aspx"
IMAGE_BASE = "http://tw100049089/L8BN0/PI_Image/PI_Insp_Image.aspx"
QUERY_BASE = "http://tw100049089/L8BN0/PI_Image/"

# ── L8BCEL 資料庫查詢設定 ─────────────────────────────────────
DB_QUERY_URL = "http://tw100049342.corpnet.auo.com/L8BC1/CInt_Query_System/SQL_Query.aspx"
DB_NAME      = "L8BCEL"

# ── 允許直接存取的靜態檔案 ────────────────────────────────────
STATIC_FILES = {
    'pi_style.css',
    'pi_main.js',
    'pi_patches.js',
    'pi_patch2.js',
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

    # ── 底圖 PNG（從網路磁碟機讀取，僅允許純檔名，防路徑穿越）──
    if filename.lower().endswith('.png') and '/' not in filename and '\\' not in filename:
        img_path = os.path.join(IMG_DIR, filename)
        if os.path.isfile(img_path):
            return send_from_directory(IMG_DIR, filename)
        # 找不到底圖：回傳 404（不噴錯誤，讓前端靜默處理）
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

    sql = (
        "SELECT CREATE_DTM, ARRAY_PRODUCT_CODE, TFT_GLASS_ID, CF_GLASS_ID "
        "FROM ( "
        "  SELECT "
        "    CREATE_DTM, ARRAY_PRODUCT_CODE, TFT_GLASS_ID, CF_GLASS_ID, "
        "    ROW_NUMBER() OVER (PARTITION BY TFT_GLASS_ID, CF_GLASS_ID "
        "                       ORDER BY CREATE_DTM DESC) AS rn "
        "  FROM CELODS.H_DAX_FBK_MASTER_ODS "
        "  WHERE TFT_GLASS_ID IN (" + in_clause + ") "
        "     OR CF_GLASS_ID  IN (" + in_clause + ") "
        ") WHERE rn = 1"
    )

    try:
        db_rows = _query_l8bcel(sql)
    except requests.RequestException as e:
        return jsonify({"error": "無法連線至 L8BCEL 查詢系統：" + str(e)}), 502
    except Exception as e:
        return jsonify({"error": "查詢發生錯誤：" + str(e)}), 500

    lookup = {}
    for row in db_rows:
        tft = row.get("TFT_GLASS_ID", "").strip()
        cf  = row.get("CF_GLASS_ID",  "").strip()
        meta = {
            "tft_glass_id": tft,
            "cf_glass_id":  cf,
            "product_code": row.get("ARRAY_PRODUCT_CODE", ""),
            "create_dtm":   row.get("CREATE_DTM", ""),
        }
        if tft and tft not in lookup:
            lookup[tft] = {"side": "TFT", **meta}
        if cf and cf not in lookup:
            lookup[cf]  = {"side": "CF",  **meta}

    results = []
    for id_ in id_list:
        if id_ in lookup:
            results.append({"id": id_, **lookup[id_]})
        else:
            results.append({
                "id": id_, "side": "unknown",
                "tft_glass_id": "", "cf_glass_id": "",
                "product_code": "", "create_dtm": "",
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

    try:
        sess  = requests.Session()
        resp0 = sess.get(QUERY_URL, timeout=10, verify=False)
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

        resp = sess.post(QUERY_URL, data=form_data, timeout=15, verify=False)
        resp.encoding = "utf-8"

    except requests.RequestException as e:
        return jsonify({"error": "無法連線：" + str(e)}), 502

    soup   = BeautifulSoup(resp.text, "html.parser")
    points = []

    for table in soup.find_all("table"):
        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
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


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "ok", "message": "PI Proxy 運作中 🟢"})


# ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings()

    # 啟動前確認底圖目錄可存取
    if os.path.isdir(IMG_DIR):
        png_count = len([f for f in os.listdir(IMG_DIR) if f.lower().endswith('.png')])
        print(f"  底圖目錄 OK：{png_count} 個 PNG")
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
    app.run(host="0.0.0.0", port=5106, debug=True)
