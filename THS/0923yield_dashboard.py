"""
yield_dashboard.py  v20
LCD 面板良率分析儀表板  http://localhost:5203
base: V14 — 修正：圖1 target 不轉換 / 圖2 getNvsTgt 補回 100-raw / model 名稱匹配精確化
  * L8BC_MST.C_PRODUCT_YIELD_TARGET 無 PERIOD 欄，移除 ORDER BY PERIOD
  * 欄位值為 0 視為不適用，回傳 None（前端不畫 Target 線）
  * DB 存良率(%)，回傳前換算成GMIS(%) = 100 - 值
  GRADE 欄位對應:
    TH_Z  → TH_Z / ARRAY_ZP / CELL_ZP / MDL_Z
    TH_ZP → TH_ZP / ARRAY_ZP / CELL_ZP / MDL_ZP
    TH_S  → 不查 DB，改用 target.json
"""
import subprocess, sys, json, traceback, pathlib, os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from collections import defaultdict

def _ensure(pkg):
    try: __import__(pkg)
    except ImportError:
        print(f'[setup] pip install {pkg}')
        subprocess.check_call([sys.executable,'-m','pip','install',pkg,'--quiet'])

_ensure('pymysql')
import pymysql, pymysql.cursors

WEB_PORT  = 5203
DB_CONFIG = dict(host='TW100049342', port=3306, user='L8BC1_AGENT', password='c1agent',
                 charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor, connect_timeout=30)

FIXED_WEIGHTS = {
    'ARRAY S':           {'ARRAY':1.0,'CF':0.0,'CELL':0.0},
    'InlineScrap(CF)':   {'ARRAY':0.0,'CF':1.0,'CELL':0.0},
    'InlineScrap(CELL)': {'ARRAY':0.0,'CF':0.0,'CELL':1.0},
    'InlineScrap(TFT)':  {'ARRAY':1.0,'CF':0.0,'CELL':0.0},
}
DEFAULT_WEIGHT = {'ARRAY':0.34,'CF':0.33,'CELL':0.33}
DEFECT_GRADE_MAP = {'TH_Z':'PNVS','TH_ZP':'NVS','TH_S':'VS'}

TARGET_FILE = pathlib.Path(__file__).parent / 'target.json'
DEFAULT_TARGETS = {
    "yield":{
        "T85":     {"TH_S":5.48,"ARRAY_S":2.04,"CELL_S":2.54,"MDL_S":0.98},
        "4K-Nt85": {"TH_S":4.33,"ARRAY_S":1.46,"CELL_S":2.14,"MDL_S":0.62},
        "AHVA":    {"TH_S":4.20,"ARRAY_S":1.49,"CELL_S":2.14,"MDL_S":0.62},
    },
    "three_family":{
        "T85":     {"TH_S":5.47,"ARRAY":3.01,"CF":1.30,"CELL":1.17},
        "4K-Nt85": {"TH_S":4.33,"ARRAY":2.38,"CF":1.03,"CELL":0.92},
        "AHVA":    {"TH_S":4.20,"ARRAY":2.40,"CF":1.00,"CELL":0.89},
    }
}
GRADE_YIELD_COLS = {
    'TH_S':  {'th':'through_s',     'arr':'array_yield','inv':True,  'cell':'cell_s',  'mdl':'module_s'},
    'TH_Z':  {'th':'through_z_new', 'arr':'array_yield','inv':False, 'cell':'cell_zp', 'mdl':'module_zp2z_new'},
    'TH_ZP': {'th':'through_zp_new','arr':'array_yield','inv':False, 'cell':'cell_zp', 'mdl':'module_zp2zp_new'},
}
GRADE_TARGET_COLS = {
    'TH_Z':  {'TH_S':'TH_Z', 'ARRAY_S':'ARRAY_ZP','CELL_S':'CELL_ZP','MDL_S':'MDL_Z'},
    'TH_ZP': {'TH_S':'TH_ZP','ARRAY_S':'ARRAY_ZP','CELL_S':'CELL_ZP','MDL_S':'MDL_ZP'},
}

def load_targets():
    if TARGET_FILE.exists():
        try: return json.loads(TARGET_FILE.read_text('utf-8'))
        except: pass
    return DEFAULT_TARGETS

def save_targets(d):
    TARGET_FILE.write_text(json.dumps(d,ensure_ascii=False,indent=2),'utf-8')

def get_conn(): return pymysql.connect(**DB_CONFIG)
def fetch(sql,args=None):
    with get_conn() as c:
        with c.cursor() as cur:
            cur.execute(sql,args or ()); return cur.fetchall()
def fetch_one(sql,args=None):
    with get_conn() as c:
        with c.cursor() as cur:
            cur.execute(sql,args or ()); return cur.fetchone()
def sf(v,d=0.0):
    try: return float(v) if v is not None else d
    except: return d
def sfn(v):
    """float 轉換，值為 0 或 None 都回傳 None（0 = 不適用）"""
    try:
        fv = float(v) if v is not None else None
        return fv if fv else None
    except: return None

def get_models():
    return [r['model'] for r in fetch(
        "SELECT DISTINCT model FROM GMIS.H_GMIS_YIELD ORDER BY model")]

def get_periods(model, limit=24):
    rows = fetch("""SELECT DISTINCT period FROM GMIS.H_GMIS_YIELD
        WHERE model=%s AND report_date_type IN ('MONTHLY','MTD')
        GROUP BY period ORDER BY period DESC LIMIT %s""", (model, limit))
    return [str(r['period']) for r in rows]

def get_yield_data(model, pf, pt, grade='TH_S'):
    cols = GRADE_YIELD_COLS.get(grade, GRADE_YIELD_COLS['TH_S'])
    tc,ac,cc,mc,inv = cols['th'],cols['arr'],cols['cell'],cols['mdl'],cols['inv']
    sql = f"""SELECT y.period,
               SUM(y.array_output) AS ao, SUM(y.cell_output) AS co,
               SUM(y.module_output) AS mo,
               AVG(y.{tc}) AS tv, AVG(y.{ac}) AS av,
               AVG(y.{cc}) AS cv, AVG(y.{mc}) AS mv
        FROM GMIS.H_GMIS_YIELD y
        WHERE y.model=%s AND y.period BETWEEN %s AND %s
          AND y.report_date_type IN ('MONTHLY','MTD')
          AND y.report_date=(
              SELECT MAX(y2.report_date) FROM GMIS.H_GMIS_YIELD y2
              WHERE y2.model=y.model AND y2.period=y.period
                AND y2.report_date_type IN ('MONTHLY','MTD'))
        GROUP BY y.period ORDER BY y.period"""
    rows = fetch(sql,(model,pf,pt))
    out = []
    for r in rows:
        av = sf(r['av'])
        out.append({'period':str(r['period']),
            'array_output':sf(r['ao']),'cell_output':sf(r['co']),'module_output':sf(r['mo']),
            'TH_S':round(sf(r['tv']),4),
            'ARRAY_S':round(100-av if inv else av,4),
            'CELL_S':round(sf(r['cv']),4),'MDL_S':round(sf(r['mv']),4)})
    return out

def get_db_target(model, grade):
    """
    查 L8BC_MST.C_PRODUCT_YIELD_TARGET。
    - 無 PERIOD 欄，直接 WHERE PRODUCT_CODE=%s
    - 值為 0 → None（不適用）
    - DB 存良率(%)，換算成GMIS(%) = 100 - 值
    - TH_S → use_local=True，前端改用 target.json
    """
    col_map = GRADE_TARGET_COLS.get(grade)
    if not col_map:
        return {'use_local': True}
    try:
        row = fetch_one(
            "SELECT * FROM L8BC_MST.C_PRODUCT_YIELD_TARGET WHERE PRODUCT_CODE=%s LIMIT 1",
            (model,))
        if row:
            th_v   = sfn(row.get(col_map['TH_S']))
            arr_v  = sfn(row.get(col_map['ARRAY_S']))
            cell_v = sfn(row.get(col_map['CELL_S']))
            mdl_v  = sfn(row.get(col_map['MDL_S']))
            if th_v is None:
                return {'use_local': True, 'note': f'{model} 無 {grade} Target'}
            # 圖1直接用DB原始值比對，不做 100-x 轉換
            # 圖2的 getNvsTgt 會自行做 100-raw 換成損失%
            return {
                'TH_S':   th_v,
                'ARRAY_S':arr_v,
                'CELL_S': cell_v,
                'MDL_S':  mdl_v,
                'grade':  grade, 'product_code': model
            }
        return {'use_local': True, 'note': f'{model} 不在 Target TABLE'}
    except Exception as e:
        print(f'[get_db_target] {e}')
        return {'error': str(e)}

def _normalize_weight(aw,cfw,cew):
    total = aw+cfw+cew
    if total<=0: return DEFAULT_WEIGHT['ARRAY'],DEFAULT_WEIGHT['CF'],DEFAULT_WEIGHT['CELL']
    if abs(total-100)<5: return aw/100,cfw/100,cew/100
    if abs(total-1)<0.1: return aw,cfw,cew
    return aw/total,cfw/total,cew/total

def _get_nvs_grade(grade, model):
    if grade in ('TH_Z', 'TH_ZP'): return 'NVS'
    if model:
        m = model.upper()
        if 'AHVA' in m: return 'NVS'
        if len(model) == 9 and m[5] == 'A': return 'NVS'
    return 'VS'

def _build_desc(reasons_ordered, defect_group):
    seen = set(); dg_lower = defect_group.strip().lower(); result = []
    for r in reasons_ordered:
        rs = (r or '').strip()
        if not rs: continue
        rs_lower = rs.lower()
        if rs_lower == dg_lower or rs_lower in seen: continue
        seen.add(rs_lower); result.append(rs)
        if len(result) >= 3: break
    return ', '.join(result)

def get_defect_data(model, sel_period, grade, pf='', pt=''):
    pa = get_periods(model, 24)
    if not pa:
        return {'periods':[],'chart2':[],'chart3':{},'chart4':[],'top10':[],'last_period':''}
    lp = sel_period if sel_period in pa else pa[0]
    idx = pa.index(lp); five = sorted(pa[idx:idx+5])
    if pf and pt: c2_periods = sorted([p for p in pa if pf <= p <= pt])
    else: c2_periods = five
    defect_grade = DEFECT_GRADE_MAP.get(grade,'VS')
    nvs_grade    = _get_nvs_grade(grade, model)
    all_needed = sorted(set(c2_periods) | set(five))
    ph = ','.join(['%s']*len(all_needed))
    rows_def = fetch(f"""
        SELECT PERIOD2, DEFECT_GROUP, DEFECT_RATIO FROM GMIS.H_GMIS_DEFECT_SUM
        WHERE PRODUCT_CODE=%s AND PERIOD='MONTHLY' AND PERIOD2 IN ({ph}) AND GRADE=%s
        ORDER BY PERIOD2, DEFECT_RATIO DESC
    """, [model]+all_needed+[defect_grade])
    pd2 = defaultdict(dict); alls = set()
    for r in rows_def:
        pd2[str(r['PERIOD2'])][r['DEFECT_GROUP']] = sf(r['DEFECT_RATIO'])
        alls.add(r['DEFECT_GROUP'])
    last = pd2.get(lp,{}); top10 = sorted(last, key=lambda x:last[x], reverse=True)[:10]
    weights_by_period = defaultdict(dict)
    if alls:
        ph2 = ','.join(['%s']*len(alls))
        try:
            rows_w = fetch(f"""
                SELECT PERIOD2,DEFECT_GROUP,NEW_ARRAY_WEIGHT,NEW_CF_WEIGHT,NEW_CELL_WEIGHT
                FROM GMIS.H_FINAL_NVS_RES
                WHERE PRODUCT_CODE=%s AND PERIOD2 IN ({ph}) AND GRADE=%s AND DEFECT_GROUP IN ({ph2})
                ORDER BY PERIOD2
            """, [model]+all_needed+[nvs_grade]+list(alls))
            for r in rows_w:
                a,cf,ce = _normalize_weight(sf(r['NEW_ARRAY_WEIGHT']),sf(r['NEW_CF_WEIGHT']),sf(r['NEW_CELL_WEIGHT']))
                weights_by_period[str(r['PERIOD2'])][r['DEFECT_GROUP']] = {'ARRAY':a,'CF':cf,'CELL':ce}
        except Exception as e: print(f'[nvs_weights] {e}')
    def get_w(period, dg):
        if dg in FIXED_WEIGHTS: return FIXED_WEIGHTS[dg]
        return weights_by_period.get(period,{}).get(dg, DEFAULT_WEIGHT)
    chart2 = []
    for p in c2_periods:
        a=cf=ce=0.0
        for dg,rt in pd2.get(p,{}).items():
            w=get_w(p,dg); a+=rt*w['ARRAY']; cf+=rt*w['CF']; ce+=rt*w['CELL']
        chart2.append({'period':p,'ARRAY':round(a,4),'CF':round(cf,4),'CELL':round(ce,4)})
    chart3 = {'top10':top10,'five_periods':five,'last_period':lp,
        'data':{p:{dg:round(pd2.get(p,{}).get(dg,0),4) for dg in top10} for p in five}}
    chart4 = []
    for dg in top10:
        rt=last.get(dg,0); w=get_w(lp,dg)
        chart4.append({'DEFECT_GROUP':dg,'DEFECT_RATIO':round(rt,4),
            'ARRAY_W':round(w['ARRAY']*100,1),'CF_W':round(w['CF']*100,1),'CELL_W':round(w['CELL']*100,1),
            'ARRAY_ABS':round(rt*w['ARRAY'],4),'CF_ABS':round(rt*w['CF'],4),'CELL_ABS':round(rt*w['CELL'],4),
            'DESCRIPTION':''})
    cell_type = 'CELL_VS' if grade == 'TH_S' else 'CELL_NVS'
    if top10:
        try:
            desc_map = {}
            if 'ARRAY S' in top10:
                rows_a = fetch("""SELECT REASON,REASON_RANK FROM GMIS.H_GMIS_COMMENT
                    WHERE MODEL=%s AND PERIOD2=%s AND TYPE='ARRAY' AND DEFECT_GROUP='TOP REASON'
                    ORDER BY REASON_RANK""", [model, lp])
                desc_map['ARRAY S'] = _build_desc([r['REASON'] for r in rows_a], 'ARRAY S')
            others = [dg for dg in top10 if dg != 'ARRAY S']
            if others:
                ph_o = ','.join(['%s']*len(others))
                rows_o = fetch(f"""SELECT DEFECT_GROUP,REASON,REASON_RANK FROM GMIS.H_GMIS_COMMENT
                    WHERE MODEL=%s AND PERIOD2=%s AND TYPE=%s AND DEFECT_GROUP IN ({ph_o})
                    ORDER BY DEFECT_GROUP,REASON_RANK""", [model, lp, cell_type]+others)
                by_dg = defaultdict(list)
                for r in rows_o:
                    if r['REASON']: by_dg[r['DEFECT_GROUP']].append(r['REASON'])
                for dg in others: desc_map[dg] = _build_desc(by_dg[dg], dg)
            for row in chart4: row['DESCRIPTION'] = desc_map.get(row['DEFECT_GROUP'], '')
        except Exception as e: print(f'[comment_v14] {e}')
    return {'c2_periods':c2_periods,'periods':five,'last_period':lp,'top10':top10,
            'chart2':chart2,'chart3':chart3,'chart4':chart4,
            'defect_grade':defect_grade,'nvs_grade':nvs_grade}

def jresp(d): return json.dumps(d,ensure_ascii=False,default=str).encode('utf-8')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,f,*a): print(f'[{self.address_string()}] {f%a}')
    def send_json(self,d,s=200):
        b=jresp(d); self.send_response(s)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',len(b))
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers(); self.wfile.write(b)
    def send_html(self,h):
        b=h.encode('utf-8'); self.send_response(200)
        self.send_header('Content-Type','text/html; charset=utf-8')
        self.send_header('Content-Length',len(b)); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self):
        self.send_response(204)
        for k,v in [('Access-Control-Allow-Origin','*'),
                    ('Access-Control-Allow-Methods','GET,POST,OPTIONS'),
                    ('Access-Control-Allow-Headers','Content-Type')]:
            self.send_header(k,v)
        self.end_headers()
    def do_GET(self):
        ps=urlparse(self.path); p=parse_qs(ps.query); path=ps.path
        g=lambda k,d='': p.get(k,[d])[0]
        try:
            if   path=='/':                self.send_html(HTML)
            elif path=='/api/models':      self.send_json(get_models())
            elif path=='/api/periods':     self.send_json(get_periods(g('model')))
            elif path=='/api/yield':       self.send_json(get_yield_data(g('model'),g('period_from'),g('period_to'),g('grade','TH_S')))
            elif path=='/api/db_target':   self.send_json(get_db_target(g('model'),g('grade')))
            elif path=='/api/local_target':self.send_json(load_targets())
            elif path=='/api/defect':
                self.send_json(get_defect_data(g('model'),g('period'),g('grade'),g('pf'),g('pt')))
            elif path=='/echarts.min.js':
                _js = r'\\tw100049089\00_MyAgent\THS\echarts.min.js'
                if os.path.exists(_js):
                    with open(_js,'rb') as _jf: _jd=_jf.read()
                    self.send_response(200)
                    self.send_header('Content-Type','application/javascript; charset=utf-8')
                    self.send_header('Content-Length',str(len(_jd)))
                    self.end_headers(); self.wfile.write(_jd)
                else: self.send_json({'error':'echarts.min.js not found'},404)
            else: self.send_json({'error':'not found'},404)
        except Exception as e: traceback.print_exc(); self.send_json({'error':str(e)},500)
    def do_POST(self):
        path=urlparse(self.path).path
        try:
            body=self.rfile.read(int(self.headers.get('Content-Length',0)))
            if path=='/api/local_target':
                d=json.loads(body); ex=load_targets()
                for s in ('yield','three_family'):
                    if s in d: ex.setdefault(s,{}).update(d[s])
                save_targets(ex); self.send_json({'status':'ok'})
            else: self.send_json({'error':'not found'},404)
        except Exception as e: traceback.print_exc(); self.send_json({'error':str(e)},500)

# ── HTML + JS (完整，單一連續字串，結構與 V13 完全相同) ──────────────
HTML = r"""<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>LCD 良率儀表板</title>
<script src="/echarts.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#f0f2f5;font-size:13px}
h2{font-size:14px;font-weight:600;padding:7px 12px;background:#005087;color:#fff;border-radius:4px 4px 0 0}
.fb{display:flex;align-items:center;flex-wrap:wrap;gap:8px;background:#fff;padding:8px 14px;
    border-bottom:2px solid #005087;position:sticky;top:0;z-index:100;box-shadow:0 2px 4px #0001}
.fb label{font-weight:600;font-size:12px;color:#555}
.fb select,.fb input[type=text]{padding:3px 7px;border:1px solid #ccc;border-radius:4px;font-size:12px}
.btn{padding:4px 14px;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;background:#005087;color:#fff}
.btn:hover{background:#003d6b}
.main{padding:10px;display:grid;gap:10px}
.row-charts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.row2{display:grid;grid-template-columns:3fr 1fr;gap:10px;align-items:start}
.row3{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.card{background:#fff;border-radius:6px;box-shadow:0 1px 4px #0001;overflow:hidden}
.cb{height:340px}
.mt{width:100%;border-collapse:collapse;font-size:12px}
.mt th{background:#005087;color:#fff;padding:5px 8px;text-align:center}
.mt td{padding:4px 8px;border-bottom:1px solid #eee;text-align:right}
.mt td:first-child{text-align:left;font-weight:600}
.red{color:#d32f2f;font-weight:700}
.tb{width:100%;border-collapse:collapse;font-size:11px}
.tb th{background:#005087;color:#fff;padding:4px 6px;text-align:center;white-space:nowrap}
.tb td{padding:4px 6px;border-bottom:1px solid #eee;text-align:center}
.tb td:first-child{text-align:left;font-weight:600}
.tb td.desc{text-align:left;font-size:10px}
.tb tr:last-child td{font-weight:700;background:#f5f5f5}
.tp{background:#fff;border-radius:6px;padding:12px;box-shadow:0 1px 4px #0001}
.tbl-tgt{border-collapse:collapse;font-size:12px;white-space:nowrap}
.tbl-tgt th{background:#005087;color:#fff;padding:5px 10px;text-align:center;font-weight:600}
.tbl-tgt td{padding:4px 6px;border-bottom:1px solid #eee;text-align:center;vertical-align:middle}
.tbl-tgt td.model-cell{font-weight:700;color:#005087;text-align:left;padding-left:10px}
.tbl-tgt td.new-cell input.new-model{
  width:88px;padding:3px 6px;border:1.5px dashed #005087;border-radius:4px;
  font-size:12px;font-weight:600;color:#005087;text-align:center;background:#f0f7ff}
.tbl-tgt input[type=number]{
  width:68px;padding:3px 5px;border:1px solid #ccc;border-radius:3px;
  font-size:12px;text-align:right}
.tbl-tgt tr.new-row td{background:#f0f7ff}
.tbl-tgt tr:hover td{background:#fafcff}
.badge{font-size:10px;padding:1px 6px;border-radius:10px;background:#e3f0fb;color:#005087;font-weight:600}
.sep{color:#bbb;font-size:14px;padding:0 2px}
</style></head><body>
<div class="fb">
  <label>Model</label><select id="sm" style="width:150px"></select>
  <label>Period</label>
  <input id="spf" type="text" placeholder="202602" style="width:78px">
  <span class="sep">～</span>
  <input id="spt" type="text" placeholder="202609" style="width:78px">
  <label>GRADE</label>
  <select id="sg" onchange="onGC()">
    <option value="TH_S">TH_S</option>
    <option value="TH_Z">TH_Z</option>
    <option value="TH_ZP">TH_ZP</option>
  </select>
  <span id="gbadge" class="badge"></span>
  <button class="btn" onclick="loadAll()">套用</button>
  <span id="stt" style="margin-left:6px;font-size:11px;color:#888"></span>
</div>
<div class="main">
  <div class="row-charts">
    <div class="row2">
      <div class="card">
        <h2 id="h1">良率趨勢</h2>
        <div style="padding:3px 10px;background:#f9f9f9;border-bottom:1px solid #eee">
          <label style="font-size:11px"><input type="checkbox" id="ct1" checked onchange="rC1()"> 顯示 Target</label>
        </div>
        <div id="c1" class="cb"></div>
      </div>
      <div class="card" style="padding:0">
        <h2>MTD Gap — GMIS</h2>
        <table class="mt" id="m1"><thead><tr><th>ITEM</th><th>最新值</th><th>Target</th><th>GAP</th></tr></thead><tbody></tbody></table>
      </div>
    </div>
    <div class="row2">
      <div class="card">
        <h2 id="h2">三家分責趨勢</h2>
        <div style="padding:3px 10px;background:#f9f9f9;border-bottom:1px solid #eee">
          <label style="font-size:11px"><input type="checkbox" id="ct2" checked onchange="rC2()"> 顯示 Target</label>
        </div>
        <div id="c2" class="cb"></div>
      </div>
      <div class="card" style="padding:0">
        <h2>MTD Gap — 三家分責</h2>
        <table class="mt" id="m2"><thead><tr><th>ITEM</th><th>最新值</th><th>Target</th><th>GAP</th></tr></thead><tbody></tbody></table>
      </div>
    </div>
  </div>
  <div class="row3">
    <div class="card"><h2 id="h3">Defect TOP10</h2><div id="c3" style="height:370px"></div></div>
    <div class="card">
      <h2 id="h4">Summary Table</h2>
      <div style="overflow-x:auto;padding:8px">
        <table class="tb" id="tb4">
          <thead><tr><th>DEFECT GROUP</th><th>RATIO%</th><th>ARY%</th><th>CF%</th><th>CEL%</th><th>ARY責%</th><th>CF責%</th><th>CEL責%</th><th>Description</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </div>
  <div class="tp">
    <h3 style="font-size:13px;font-weight:700;margin-bottom:10px;color:#005087">⚙️ Target 設定（TH_S / 存於本機 target.json）</h3>
    <div style="margin-bottom:14px">
      <div style="font-weight:600;color:#444;margin-bottom:6px;font-size:12px">GMIS Target（圖1）</div>
      <div style="overflow-x:auto"><table class="tbl-tgt" id="tgy"></table></div>
    </div>
    <div style="margin-bottom:10px">
      <div style="font-weight:600;color:#444;margin-bottom:6px;font-size:12px">三家分責 Target（圖2）</div>
      <div style="overflow-x:auto"><table class="tbl-tgt" id="tg3"></table></div>
    </div>
    <div style="margin-top:10px">
      <button class="btn" onclick="saveTgt()">💾 儲存 Target</button>
      <span id="ss" style="margin-left:10px;font-size:12px;color:green"></span>
    </div>
  </div>
</div>
"""

HTML += r"""<script>
let G={model:'',pf:'',pt:'',grade:'TH_S'};
let D={yield:[],target:{},localTgt:{},defect:{}};
let CH={c1:null,c2:null,c3:null};
let _selLine={c1:null,c2:null};
function _doSel(k,n){
  if(_selLine[k]===n)_selLine[k]=null;else _selLine[k]=n;
  if(k==='c1')rC1();else rC2();
}
const $=id=>document.getElementById(id);
const fmt=(v,d=2)=>(v==null||v===''||isNaN(Number(v)))?'-':Number(v).toFixed(d);
async function api(url){const r=await fetch(url);if(!r.ok)throw new Error(r.status+' '+url);return r.json();}
const C={TH_S:{line:'#005087',width:3.5,sym:9},ARRAY_S:{line:'#E6A50F',bar:'#B0EEF8'},CELL_S:{line:'#643C96',bar:'#FFF2B0'},MDL_S:{line:'#328732',bar:'#DDD0EE'},barOut:{arr:'#147891',cell:'#E6A50F',mod:'#643C96'}};
const MONTH_COLORS=['#64DCF0','#FFE664','#B491D7','#87DC64','#E6A50F']; // AUO Color List Row2
const SITE_RATIO={'4K-nPD':{ARRAY:0.510,CF:0.230,CELL:0.260},'4K-nT85':{ARRAY:0.508,CF:0.230,CELL:0.262},'4K2K':{ARRAY:0.508,CF:0.230,CELL:0.262},'n-4K':{ARRAY:0.373,CF:0.350,CELL:0.277},'n-4K-PD':{ARRAY:0.373,CF:0.350,CELL:0.277},'P430QVN04':{ARRAY:0.508,CF:0.230,CELL:0.262},'P430QVR01':{ARRAY:0.508,CF:0.230,CELL:0.262},'P550HVN06':{ARRAY:0.490,CF:0.230,CELL:0.280},'P550QVN05':{ARRAY:0.508,CF:0.230,CELL:0.262},'P550QVN06':{ARRAY:0.508,CF:0.230,CELL:0.262},'P550QVN07':{ARRAY:0.508,CF:0.230,CELL:0.262},'P550QVR01':{ARRAY:0.508,CF:0.230,CELL:0.262},'P650QVN02':{ARRAY:0.508,CF:0.230,CELL:0.262},'T430HVN01':{ARRAY:0.500,CF:0.200,CELL:0.300},'T430QVN03':{ARRAY:0.508,CF:0.230,CELL:0.262},'T430QVN04':{ARRAY:0.508,CF:0.230,CELL:0.262},'T430QVN05':{ARRAY:0.508,CF:0.230,CELL:0.262},'T43Q3':{ARRAY:0.508,CF:0.230,CELL:0.262},'T550QVN07':{ARRAY:0.508,CF:0.230,CELL:0.262},'T550QVN10':{ARRAY:0.508,CF:0.230,CELL:0.262},'T550QVR08':{ARRAY:0.508,CF:0.230,CELL:0.262},'T55Q7':{ARRAY:0.508,CF:0.230,CELL:0.262},'T65':{ARRAY:0.508,CF:0.230,CELL:0.262},'T650QVN07':{ARRAY:0.508,CF:0.230,CELL:0.262},'T85':{ARRAY:0.508,CF:0.230,CELL:0.262},'T850QVN03':{ARRAY:0.508,CF:0.230,CELL:0.262},'T850QVN04':{ARRAY:0.508,CF:0.230,CELL:0.262},'P215HVN01':{ARRAY:0.400,CF:0.300,CELL:0.300},'P215HVN02':{ARRAY:0.373,CF:0.350,CELL:0.277},'AHVA':{ARRAY:0.417,CF:0.183,CELL:0.400},'AHVA-DT':{ARRAY:0.417,CF:0.183,CELL:0.400},'AHVA-MP':{ARRAY:0.515,CF:0.190,CELL:0.295},'B156':{ARRAY:0.515,CF:0.190,CELL:0.295},'B156HAN02':{ARRAY:0.515,CF:0.190,CELL:0.295},'B156HANAA':{ARRAY:0.515,CF:0.190,CELL:0.295},'G238HAN01':{ARRAY:0.417,CF:0.183,CELL:0.400},'M215HVN02':{ARRAY:0.440,CF:0.240,CELL:0.320},'M236HVR01':{ARRAY:0.440,CF:0.240,CELL:0.320},'M238HAN03':{ARRAY:0.417,CF:0.183,CELL:0.400},'M238HAN05':{ARRAY:0.417,CF:0.183,CELL:0.400},'M270DAN11':{ARRAY:0.452,CF:0.245,CELL:0.303},'M270DAN12':{ARRAY:0.417,CF:0.183,CELL:0.400},'M270DAN13':{ARRAY:0.417,CF:0.183,CELL:0.400},'M270HAN01':{ARRAY:0.417,CF:0.183,CELL:0.400},'M270HVR01':{ARRAY:0.440,CF:0.240,CELL:0.320},'M270HVR03':{ARRAY:0.440,CF:0.240,CELL:0.320},'M315DVR01':{ARRAY:0.440,CF:0.240,CELL:0.320},'M315HVR01':{ARRAY:0.440,CF:0.240,CELL:0.320},'M430QVN02':{ARRAY:0.440,CF:0.240,CELL:0.320},'M490AVR01':{ARRAY:0.400,CF:0.170,CELL:0.430},'n-AHVA':{ARRAY:0.440,CF:0.240,CELL:0.320},'P490QAR01':{ARRAY:0.400,CF:0.170,CELL:0.430},'T215(全)':{ARRAY:0.440,CF:0.240,CELL:0.320},'T215HVN05':{ARRAY:0.440,CF:0.240,CELL:0.320},'T215HVN05(含PD)':{ARRAY:0.440,CF:0.240,CELL:0.320}};
function lookupSiteRatio(model){if(!model)return null;if(SITE_RATIO[model])return SITE_RATIO[model];const mu=model.toUpperCase();const k=Object.keys(SITE_RATIO).find(k=>k.toUpperCase()===mu);if(k)return SITE_RATIO[k];const k2=Object.keys(SITE_RATIO).find(k=>mu.includes(k.toUpperCase())||k.toUpperCase().includes(mu));return k2?SITE_RATIO[k2]:null;}
function thLabel(){return G.grade==='TH_S'?'TH_S':G.grade;}
function th2Label(){return G.grade==='TH_Z'?'PNVS':G.grade==='TH_ZP'?'NVS':'TH_S';}
function thVal(raw){return G.grade==='TH_S'?raw:100-raw;}
function calcDefaultPeriods(periods){if(!periods||!periods.length)return{pf:'',pt:''};return{pt:periods[0],pf:periods[Math.min(7,periods.length-1)]};}
window.onload=async()=>{
  CH.c1=echarts.init($('c1'));CH.c2=echarts.init($('c2'));CH.c3=echarts.init($('c3'));
  window.addEventListener('resize',()=>{CH.c1.resize();CH.c2.resize();CH.c3.resize();});
  CH.c1.on('click','series',p=>{if(!p.seriesName.endsWith(' Tgt'))_doSel('c1',p.seriesName);});
  CH.c2.on('click','series',p=>{if(!p.seriesName.endsWith(' Tgt'))_doSel('c2',p.seriesName);});
  const models=await api('/api/models');const sm=$('sm');sm.innerHTML='';
  models.forEach(m=>{const o=document.createElement('option');o.value=o.textContent=m;sm.appendChild(o);});
  const defModel=models.find(m=>m.toUpperCase().includes('4K')&&m.toUpperCase().includes('NT85'))||models.find(m=>m.toUpperCase().includes('4K'))||models[0]||'';
  sm.value=defModel;G.model=defModel;
  const periods=await api(`/api/periods?model=${encodeURIComponent(G.model)}`);
  const dp=calcDefaultPeriods(periods);$('spf').value=dp.pf;$('spt').value=dp.pt;
  onGC();await loadAll();
};
function onGC(){const dm={'TH_S':'VS','TH_Z':'PNVS','TH_ZP':'NVS'};$('gbadge').textContent='DEFECT GRADE: '+(dm[$('sg').value]||'VS');}
async function loadAll(){
  G.model=$('sm').value;G.grade=$('sg').value;
  const pf=($('spf').value||'').trim().replace(/\D/g,'');
  const pt=($('spt').value||'').trim().replace(/\D/g,'');
  G.pf=pf;G.pt=pt;$('stt').textContent='載入中…';
  try{
    const [yld,dbTgt,localTgt]=await Promise.all([
      api(`/api/yield?model=${encodeURIComponent(G.model)}&period_from=${pf}&period_to=${pt}&grade=${G.grade}`),
      api(`/api/db_target?model=${encodeURIComponent(G.model)}&grade=${G.grade}`),
      api('/api/local_target'),
    ]);
    D.yield=yld;D.target=dbTgt;D.localTgt=localTgt;
    const lastP=yld.length?yld[yld.length-1].period:'';
    D.defect=await api(`/api/defect?model=${encodeURIComponent(G.model)}&period=${encodeURIComponent(lastP)}&grade=${G.grade}&pf=${pf}&pt=${pt}`);
    renderAll();$('stt').textContent=`✅ ${new Date().toLocaleTimeString()}`;
  }catch(e){$('stt').textContent='❌ '+e.message;console.error(e);}
}
function renderAll(){renderTargetInputs();rC1();rC2();rC3();rC4();}
function getTgt(key,model){
  if(G.grade!=='TH_S'){
    // TH_Z / TH_ZP：只信 DB target，找不到就 null（不 fallback 至 local）
    if(D.target&&!D.target.use_local&&!D.target.error&&D.target[key]!=null)return D.target[key];
    return null;
  }
  // TH_S：用 local target.json
  const lt=D.localTgt?.yield||{};const mu=(model||'').toUpperCase();
  const mk=Object.keys(lt).sort((a,b)=>b.length-a.length).find(k=>mu===k.toUpperCase()||mu.includes(k.toUpperCase()));
  if(mk)return lt[mk]?.[key]??null;return null;
}
function get3Tgt(key,model){const lt=D.localTgt?.three_family||{};const mu=(model||'').toUpperCase();const mk=Object.keys(lt).sort((a,b)=>b.length-a.length).find(k=>mu===k.toUpperCase()||mu.includes(k.toUpperCase()));if(mk)return lt[mk]?.[key]??null;return null;}
function getNvsTgt(){if(G.grade==='TH_S')return null;if(!D.target||D.target.use_local||D.target.error)return null;// D.target.TH_S 是 DB 原始良率%，圖2需轉成損失% = 100 - 良率%
const raw=D.target.TH_S;return(raw!=null)?100-raw:null;}
function getNvsSiteTgt(site){const thTgt=getNvsTgt();if(thTgt==null)return null;const ratio=lookupSiteRatio(G.model);if(!ratio)return null;return Math.round(thTgt*(ratio[site]||0)*10000)/10000;}
function rC1(){
  if(!D.yield||!D.yield.length){CH.c1.clear();return;}
  const showTgt=$('ct1').checked;const n=D.yield.length;
  const realPeriods=D.yield.map(r=>String(r.period));
  const xData=showTgt?[...realPeriods,'Target']:realPeriods;const thl=thLabel();
  $('h1').textContent=`${G.model} ${G.grade} 良率趨勢`;const series=[];
  [{key:'array_output',name:'Array Output',color:C.ARRAY_S.bar},{key:'cell_output',name:'Cell Output',color:C.CELL_S.bar},{key:'module_output',name:'Module Output',color:C.MDL_S.bar}].forEach(b=>{
    const bd=D.yield.map(r=>r[b.key]??null);if(showTgt)bd.push(null);
    series.push({name:b.name,type:'bar',yAxisIndex:0,data:bd,itemStyle:{color:b.color},barMaxWidth:28,barGap:'5%'});
  });
  [{name:thl,key:'TH_S',color:C.TH_S.line,w:C.TH_S.width,sym:C.TH_S.sym},{name:'ARRAY_S',key:'ARRAY_S',color:C.ARRAY_S.line,w:2,sym:5},{name:'CELL_S',key:'CELL_S',color:C.CELL_S.line,w:2,sym:5},{name:'MDL_S',key:'MDL_S',color:C.MDL_S.line,w:2,sym:5}].forEach(l=>{
    const ld=D.yield.map(r=>r[l.key]??null);if(showTgt)ld.push(null);
    const isTH=(l.name===thl);
    const isSel=(_selLine.c1===l.name);
    const hasSel=(_selLine.c1!==null);
    const lw=isTH?C.TH_S.width:(isSel?3:l.w);
    const op=(hasSel&&!isSel&&!isTH)?0.2:1;
    const ssz=isSel?8:l.sym;
    series.push({name:l.name,type:'line',yAxisIndex:1,data:ld,symbol:'circle',symbolSize:ssz,
      lineStyle:{color:l.color,width:lw,opacity:op},itemStyle:{color:l.color,opacity:op},
      label:{show:isTH||isSel,position:'top',fontSize:isTH?10:9,color:l.color,
             formatter:p=>p.value!=null&&p.dataIndex<D.yield.length?fmt(p.value,2):''},
      connectNulls:false});
    if(showTgt){const tv=getTgt(l.key,G.model);if(tv==null)return;const lastVal=D.yield[n-1]?.[l.key]??null;const td=xData.map((_,i)=>i===n?tv:i===n-1?lastVal:null);
      series.push({name:l.name+' Tgt',type:'line',yAxisIndex:1,data:td,connectNulls:true,lineStyle:{color:l.color,width:1.5,type:'dashed',opacity:op},itemStyle:{color:l.color,opacity:op},symbol:(v,p)=>p.dataIndex===n?'diamond':'none',symbolSize:9,label:{show:true,formatter:p=>p.dataIndex===n?fmt(tv,2):'',position:'right',fontSize:10,color:l.color,fontWeight:'bold'}});}
  });
  // ── 圖1 TH_Z/ZP 右軸動態縮放 ──
  let _yMin=undefined,_yMax=undefined;
  if(G.grade!=='TH_S'){
    const _vs=D.yield.flatMap(r=>['TH_S','ARRAY_S','CELL_S','MDL_S'].map(k=>r[k]).filter(v=>v!=null&&v>0));
    if(_vs.length){const _mn=Math.min(..._vs),_mx=Math.max(..._vs);
      const _pd=Math.max((_mx-_mn)*0.6,1);
      _yMin=Math.max(0,Math.round((_mn-_pd)*10)/10);
      _yMax=Math.min(100,Math.round((_mx+_pd)*10)/10);}}
  CH.c1.setOption({tooltip:{trigger:'axis',axisPointer:{type:'cross'},
    formatter:params=>{
      const hdr=params[0]?.axisValueLabel||'';
      const lines=params
        .filter(p=>!p.seriesName.endsWith(' Tgt')&&p.value!=null)
        .map(p=>{
        const isOut=p.seriesName.includes('Output');
        const vStr=isOut?Math.round(Number(p.value)).toString():Number(p.value).toFixed(2);
        return`${p.marker}${p.seriesName}&nbsp;&nbsp;<b>${vStr}</b>`;});
      return[hdr,...lines].join('<br/>');}},
  legend:{top:4,type:'scroll',textStyle:{fontSize:10},data:[thl,'ARRAY_S','CELL_S','MDL_S','Array Output','Cell Output','Module Output']},grid:{left:65,right:80,top:55,bottom:40},xAxis:{type:'category',data:xData,axisLabel:{fontSize:10,rotate:30,rich:{tgt:{color:'#d32f2f',fontWeight:'bold'}},formatter:v=>v==='Target'?'{tgt|'+v+'}':v}},yAxis:[{type:'value',name:'片數',nameTextStyle:{fontSize:10},axisLabel:{fontSize:10},position:'left'},{type:'value',name:'GMIS%',nameTextStyle:{fontSize:10},axisLabel:{fontSize:10},position:'right',splitLine:{show:false},min:_yMin,max:_yMax}],series},true);
  const last=D.yield[D.yield.length-1]||{};const tb=$('m1').querySelector('tbody');tb.innerHTML='';
  [{item:thl,key:'TH_S'},{item:'ARY',key:'ARRAY_S'},{item:'CELL',key:'CELL_S'},{item:'MDL',key:'MDL_S'}].forEach(it=>{
    const v=last[it.key]??null,t=getTgt(it.key,G.model);const gap=(v!=null&&t!=null)?+(v-t).toFixed(4):null;
    tb.innerHTML+=`<tr><td>${it.item}</td><td>${fmt(v)}</td><td>${t!=null?fmt(t):'-'}</td><td class="${gap!=null&&gap>0?'red':''}">${gap!=null?fmt(gap):'-'}</td></tr>`;
  });
}
function rC2(){
  const c2d=(D.defect||{}).chart2||[];if(!c2d.length){CH.c2.clear();return;}
  const showTgt=$('ct2').checked;const realPeriods=c2d.map(r=>String(r.period));
  const xData=showTgt?[...realPeriods,'Target']:realPeriods;const n=realPeriods.length;
  $('h2').textContent=`${G.model} ${G.grade} 三家分責`;
  const C2={TH_S:'#005087',ARRAY:'#E6A50F',CF:'#643C96',CELL:'#328732'};const series=[];const th2lbl=th2Label();
  const thData=realPeriods.map(p=>{const r=D.yield.find(y=>String(y.period)===p);return r!=null?thVal(r.TH_S):null;});
  const thArr=[...thData];if(showTgt)thArr.push(null);
  const hasSel2Th=(_selLine.c2!==null&&_selLine.c2!==th2lbl);const op2Th=hasSel2Th?0.2:1;
  series.push({name:th2lbl,type:'line',data:thArr,connectNulls:true,
    lineStyle:{color:C2.TH_S,width:3.5,opacity:op2Th},
    itemStyle:{color:C2.TH_S,opacity:op2Th},symbol:'circle',symbolSize:9,
    label:{show:true,position:'top',fontSize:10,color:C2.TH_S,
           formatter:p=>p.value!=null&&p.dataIndex<c2d.length?fmt(p.value,2):''}});
  ['ARRAY','CF','CELL'].forEach(k=>{
    const arr=[...c2d.map(r=>r[k]??null)];if(showTgt)arr.push(null);
    const isSel2=(_selLine.c2===k+'%');
    const hasSel2=(_selLine.c2!==null&&_selLine.c2!==th2lbl);
    const op2=(hasSel2&&!isSel2)?0.2:1;
    series.push({name:k+'%',type:'line',data:arr,
      lineStyle:{color:C2[k],width:isSel2?3:2,opacity:op2},
      itemStyle:{color:C2[k],opacity:op2},
      symbol:'circle',symbolSize:isSel2?8:5,
      label:{show:isSel2,position:'top',fontSize:9,color:C2[k],
             formatter:p=>p.value!=null&&p.dataIndex<c2d.length?fmt(p.value,2):''}});
  });
  if(showTgt){
    if(G.grade!=='TH_S'){
      const thTgt=getNvsTgt();const arrTgt=getNvsSiteTgt('ARRAY');const cfTgt=getNvsSiteTgt('CF');const ceTgt=getNvsSiteTgt('CELL');
      [{label:th2lbl+' Tgt',tv:thTgt,col:C2.TH_S,lastVal:thData[n-1]},{label:'ARR Tgt',tv:arrTgt,col:C2.ARRAY,lastVal:(c2d[n-1]||{}).ARRAY},{label:'CF Tgt',tv:cfTgt,col:C2.CF,lastVal:(c2d[n-1]||{}).CF},{label:'CELL Tgt',tv:ceTgt,col:C2.CELL,lastVal:(c2d[n-1]||{}).CELL}].forEach(t=>{
        if(t.tv==null)return;const td=xData.map((_,i)=>i===n?t.tv:i===n-1?t.lastVal??null:null);
        series.push({name:t.label,type:'line',data:td,connectNulls:true,lineStyle:{color:t.col,width:1.5,type:'dashed'},itemStyle:{color:t.col},symbol:(v,p)=>p.dataIndex===n?'diamond':'none',symbolSize:9,label:{show:true,formatter:p=>p.dataIndex===n?fmt(t.tv,2):'',position:'right',fontSize:10,color:t.col,fontWeight:'bold'}});
      });
    }else{
      [{label:'TH_S Tgt',key:'TH_S',src:'yield',lastVal:thData[n-1]},{label:'ARR Tgt',key:'ARRAY',src:'3f',lastVal:(c2d[n-1]||{}).ARRAY},{label:'CF Tgt',key:'CF',src:'3f',lastVal:(c2d[n-1]||{}).CF},{label:'CELL Tgt',key:'CELL',src:'3f',lastVal:(c2d[n-1]||{}).CELL}].forEach(t=>{
        const tv=t.src==='yield'?getTgt(t.key,G.model):get3Tgt(t.key,G.model);if(tv==null)return;
        const col=C2[t.key]||C2.TH_S;const td=xData.map((_,i)=>i===n?tv:i===n-1?t.lastVal??null:null);
        series.push({name:t.label,type:'line',data:td,connectNulls:true,lineStyle:{color:col,width:1.5,type:'dashed'},itemStyle:{color:col},symbol:(v,p)=>p.dataIndex===n?'diamond':'none',symbolSize:9,label:{show:true,formatter:p=>p.dataIndex===n?fmt(tv,2):'',position:'right',fontSize:10,color:col,fontWeight:'bold'}});
      });
    }
  }
  CH.c2.setOption({tooltip:{trigger:'axis',
  formatter:params=>{
    const hdr=params[0]?.axisValueLabel||'';
    const lines=params
      .filter(p=>!p.seriesName.endsWith(' Tgt')&&p.value!=null)
      .map(p=>`${p.marker}${p.seriesName}&nbsp;&nbsp;<b>${Number(p.value).toFixed(2)}</b>`);
    return[hdr,...lines].join('<br/>');}},
legend:{top:4,type:'scroll',textStyle:{fontSize:10},data:[th2lbl,'ARRAY%','CF%','CELL%']},grid:{left:50,right:60,top:55,bottom:40},xAxis:{type:'category',data:xData,axisLabel:{fontSize:10,rotate:30,rich:{tgt:{color:'#d32f2f',fontWeight:'bold'}},formatter:v=>v==='Target'?'{tgt|'+v+'}':v}},yAxis:{type:'value',name:'%',axisLabel:{fontSize:10}},series},true);
  const last2=c2d[c2d.length-1]||{};const thRawLast=D.yield.find(y=>String(y.period)===String(last2.period));const thValLast=thRawLast!=null?thVal(thRawLast.TH_S):null;
  const tb2=$('m2').querySelector('tbody');tb2.innerHTML='';
  let rows2;
  if(G.grade!=='TH_S'){rows2=[{item:th2Label(),val:thValLast,tgt:getNvsTgt()},{item:'ARRAY',val:last2.ARRAY,tgt:getNvsSiteTgt('ARRAY')},{item:'CF',val:last2.CF,tgt:getNvsSiteTgt('CF')},{item:'CELL',val:last2.CELL,tgt:getNvsSiteTgt('CELL')}];}
  else{rows2=[{item:'TH_S',val:thValLast,tgt:getTgt('TH_S',G.model)},{item:'ARRAY',val:last2.ARRAY,tgt:get3Tgt('ARRAY',G.model)},{item:'CF',val:last2.CF,tgt:get3Tgt('CF',G.model)},{item:'CELL',val:last2.CELL,tgt:get3Tgt('CELL',G.model)}];}
  rows2.forEach(it=>{const gap=(it.val!=null&&it.tgt!=null)?+(it.val-it.tgt).toFixed(4):null;tb2.innerHTML+=`<tr><td>${it.item}</td><td>${fmt(it.val)}</td><td>${it.tgt!=null?fmt(it.tgt):'-'}</td><td class="${gap!=null&&gap>0?'red':''}">${gap!=null?fmt(gap):'-'}</td></tr>`;});
}
function rC3(){
  const c3d=(D.defect||{}).chart3||{};if(!c3d.top10||!c3d.top10.length){CH.c3.clear();return;}
  const{top10,five_periods,last_period,data}=c3d;
  $('h3').textContent=`${G.model} GMIS A/C/M Defect TOP10  (基準月：${last_period})`;
  const series=five_periods.map((p,pi)=>({name:p,type:'bar',barGap:'5%',data:top10.map(dg=>{const v=(data[p]||{})[dg]||0;return{value:v,label:{show:p===last_period&&v>0,position:'top',fontSize:11,fontWeight:'bold',formatter:()=>fmt(v,2)+'%'}};}),itemStyle:{color:MONTH_COLORS[pi%MONTH_COLORS.length]}}));
  CH.c3.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'},formatter:params=>{let s=`<b>${params[0].axisValue}</b><br/>`;params.forEach(p=>{s+=`${p.marker}${p.seriesName}: ${fmt(p.value,2)}%<br/>`;});return s;}},legend:{top:2,type:'scroll',textStyle:{fontSize:10}},grid:{left:55,right:15,top:45,bottom:80},xAxis:{type:'category',data:top10,axisLabel:{fontSize:9,rotate:25,interval:0,overflow:'truncate',width:80}},yAxis:{type:'value',name:'Ratio %',axisLabel:{fontSize:10,formatter:v=>v.toFixed(1)+'%'}},series},true);
}
function rC4(){
  const c4=(D.defect||{}).chart4||[];const lp=(D.defect||{}).last_period||'';
  $('h4').textContent=`${G.model} ${G.grade} ${lp} Summary Table`;
  const tb=$('tb4').querySelector('tbody');tb.innerHTML='';if(!c4.length)return;
  let sa=0,scf=0,sce=0;
  c4.forEach(r=>{sa+=r.ARRAY_ABS||0;scf+=r.CF_ABS||0;sce+=r.CELL_ABS||0;
    tb.innerHTML+=`<tr><td>${r.DEFECT_GROUP}</td><td>${fmt(r.DEFECT_RATIO,2)}%</td><td>${fmt(r.ARRAY_W,1)}%</td><td>${fmt(r.CF_W,1)}%</td><td>${fmt(r.CELL_W,1)}%</td><td>${fmt(r.ARRAY_ABS,2)}%</td><td>${fmt(r.CF_ABS,2)}%</td><td>${fmt(r.CELL_ABS,2)}%</td><td class="desc">${r.DESCRIPTION||''}</td></tr>`;
  });
  tb.innerHTML+=`<tr><td>Total</td><td>-</td><td>-</td><td>-</td><td>-</td><td>${fmt(sa,2)}%</td><td>${fmt(scf,2)}%</td><td>${fmt(sce,2)}%</td><td></td></tr>`;
}
const SEC_FIELDS={yield:['TH_S','ARRAY_S','CELL_S','MDL_S'],three_family:['TH_S','ARRAY','CF','CELL']};
function renderTargetInputs(){
  const tgt=D.localTgt||{};
  ['yield','three_family'].forEach(sec=>{
    const el=$(sec==='yield'?'tgy':'tg3');const data=tgt[sec]||{};const fields=SEC_FIELDS[sec];const models=Object.keys(data);
    let html=`<thead><tr><th style="min-width:90px">MODEL</th>${fields.map(f=>`<th>${f}</th>`).join('')}</tr></thead><tbody>`;
    models.forEach(m=>{const vals=data[m]||{};html+=`<tr><td class="model-cell">${m}</td>${fields.map(f=>`<td><input type="number" step="0.01" id="ti_${sec}_${m.replace(/[^a-zA-Z0-9]/g,'_')}_${f}" value="${vals[f]??''}"></td>`).join('')}</tr>`;});
    html+=`<tr class="new-row"><td class="new-cell"><input type="text" class="new-model" id="newm_${sec}" placeholder="新增 MODEL"></td>${fields.map(f=>`<td><input type="number" step="0.01" id="newv_${sec}_${f}" value=""></td>`).join('')}</tr>`;
    html+='</tbody>';el.innerHTML=html;
  });
}
async function saveTgt(){
  const tgt={yield:{},three_family:{}};
  ['yield','three_family'].forEach(sec=>{
    const data=(D.localTgt||{})[sec]||{};const fields=SEC_FIELDS[sec];
    Object.keys(data).forEach(m=>{tgt[sec][m]={};const safeM=m.replace(/[^a-zA-Z0-9]/g,'_');fields.forEach(f=>{const el=$(`ti_${sec}_${safeM}_${f}`);tgt[sec][m][f]=el?parseFloat(el.value)||0:0;});});
    const newM=($(`newm_${sec}`)?.value||'').trim();
    if(newM){tgt[sec][newM]={};fields.forEach(f=>{const el=$(`newv_${sec}_${f}`);tgt[sec][newM][f]=el?parseFloat(el.value)||0:0;});}
  });
  const r=await fetch('/api/local_target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(tgt)});
  const j=await r.json();$('ss').textContent=j.status==='ok'?'✅ 已儲存':'❌ 儲存失敗';
  D.localTgt=tgt;setTimeout(()=>$('ss').textContent='',3000);renderAll();
}
</script></body></html>
"""

if __name__=='__main__':
    print(f'[啟動] http://localhost:{WEB_PORT}   (Ctrl+C 停止)')
    try: HTTPServer(('',WEB_PORT),Handler).serve_forever()
    except KeyboardInterrupt: print('[停止]')
    finally: input('按 Enter 關閉...')
