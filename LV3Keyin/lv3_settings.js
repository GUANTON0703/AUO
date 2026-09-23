/* ══════════════════════════════════════════════
   lv3_settings.js — 欄位寬度 / 字體 / 列高設定
   依賴：lv3_helpers.js（post/get/showS）、lv3_vars_init.js（_u）
══════════════════════════════════════════════ */

/* ── 欄位定義（預設寬度 px / 字體 px）── */
var COL_DEFS = [
  {key:'no',     label:'NO',       w:45,  fs:13},
  {key:'date',   label:'日期',     w:58,  fs:13},
  {key:'model',  label:'Model',    w:100, fs:13},
  {key:'chip',   label:'CHIP ID',  w:95,  fs:13},
  {key:'grade',  label:'Grade',    w:55,  fs:13},
  {key:'defect', label:'Defect',   w:110, fs:13},
  {key:'app',    label:'呈象描述', w:130, fs:13},
  {key:'jdg',    label:'判定畫面', w:85,  fs:13},
  {key:'jnd',    label:'JND',      w:70,  fs:13},
  {key:'xs',     label:'由左至右', w:85,  fs:13},
  {key:'ys',     label:'由上而下', w:85,  fs:13},
  {key:'tool',   label:'機台',     w:95,  fs:13},
  {key:'pol',    label:'POL',      w:65,  fs:13},
  {key:'ph',     label:'照片',     w:90,  fs:13}
];

var COL_LS_KEY = 'lv3_col_settings_v3'; /* v3：含 rowH / imgH */
var _SETTINGS  = null; /* 快取 */

function _defaultSettings() {
  return {
    cols: COL_DEFS.map(function(c) { return {key: c.key, w: c.w, fs: c.fs}; }),
    rowH: 36,
    imgH: 120
  };
}

/* ── 讀取設定（同步，從 localStorage 快取）── */
function loadFullSettings() {
  if (_SETTINGS) return _SETTINGS;
  try {
    var raw = JSON.parse(localStorage.getItem(COL_LS_KEY) || 'null');
    if (raw && raw.cols && raw.cols.length === COL_DEFS.length) {
      _SETTINGS = {cols: raw.cols, rowH: raw.rowH || 36, imgH: raw.imgH || 120};
    } else if (Array.isArray(raw) && raw.length === COL_DEFS.length) {
      _SETTINGS = {cols: raw, rowH: 36, imgH: 120}; /* 相容舊 v2 */
    } else {
      _SETTINGS = _defaultSettings();
    }
  } catch(e) { _SETTINGS = _defaultSettings(); }
  return _SETTINGS;
}
/* 舊 API 相容 */
function loadColSettings() { return loadFullSettings().cols; }

/* ── 儲存設定（localStorage + 非同步 push 到 server）── */
function saveFullSettings(s) {
  _SETTINGS = s;
  try { localStorage.setItem(COL_LS_KEY, JSON.stringify(s)); } catch(e) {}
  if (typeof _u !== 'undefined' && _u) {
    post('/api/settings/save', {user: _u, settings: s}).catch(function() {});
  }
}
function saveColSettings(cols) {
  var s = loadFullSettings();
  s.cols = cols;
  saveFullSettings(s);
}

/* ── 從伺服器同步：先讀 global 預設，再讀個人（個人優先）── */
async function syncSettingsFromServer() {
  if (!_u) return;
  try {
    var base = _defaultSettings();
    /* 1. 全域預設 */
    try {
      var rg = await get('/api/settings/global');
      if (rg.settings && rg.settings.cols && rg.settings.cols.length === COL_DEFS.length)
        base = {cols: rg.settings.cols, rowH: rg.settings.rowH || 36, imgH: rg.settings.imgH || 120};
    } catch(eg) {}
    /* 2. 個人設定（有則覆蓋 global）*/
    try {
      var rp = await get('/api/settings?user=' + encodeURIComponent(_u));
      if (rp.settings && rp.settings.cols && rp.settings.cols.length === COL_DEFS.length)
        _SETTINGS = {cols: rp.settings.cols, rowH: rp.settings.rowH || 36, imgH: rp.settings.imgH || 120};
      else
        _SETTINGS = base;
    } catch(ep) { _SETTINGS = base; }
    try { localStorage.setItem(COL_LS_KEY, JSON.stringify(_SETTINGS)); } catch(e) {}
    applyColStyle();
  } catch(e) {}
}

/* ── admin 推送全員預設值 ── */
async function pushGlobalSettings() {
  if (!confirm('確定將目前設定推送為全員預設值？\n（其他人下次登入將自動套用）')) return;
  var s = loadFullSettings();
  try {
    var r = await post('/api/settings/push-global', {settings: s});
    if (r.success) showS('✅ 已推送為全員預設值！', 'ok');
    else showS('❌ 推送失敗：' + (r.error || ''), 'err');
  } catch(e) { showS('❌ 連線失敗', 'err'); }
}

/* ── 套用 CSS ── */
function applyColStyle() {
  var s    = loadFullSettings();
  var cs   = s.cols;
  var rowH = s.rowH || 36;
  var imgH = s.imgH || 120;
  var css  = '';
  cs.forEach(function(c, i) {
    var n = i + 1;
    css += 'table.rt th:nth-child(' + n + '){width:' + c.w + 'px!important;min-width:' + c.w + 'px!important;max-width:' + c.w + 'px!important;font-size:' + c.fs + 'px!important;}';
    var _wrap = (COL_DEFS[i] && (COL_DEFS[i].key === 'app' || COL_DEFS[i].key === 'jdg' || COL_DEFS[i].key === 'defect'))
      ? 'white-space:normal!important;word-break:break-word!important;overflow-wrap:break-word!important;' : '';
    css += 'table.rt td:nth-child(' + n + '){width:' + c.w + 'px!important;min-width:' + c.w + 'px!important;max-width:' + c.w + 'px!important;font-size:' + c.fs + 'px!important;' + _wrap + '}';
  });
  /* 列高 */
  css += 'table.rt tbody tr{height:' + rowH + 'px;}';
  /* 縮圖尺寸 */
  css += 'table.rt td.ph-td,table.rt td.sk-td,table.rt td.ph-td2,table.rt td.ph-td3{height:' + rowH + 'px!important;padding:0!important;}';
  css += 'table.rt img.th{display:block!important;width:100%!important;height:' + rowH + 'px!important;max-width:none!important;max-height:none!important;object-fit:cover!important;}';
  var el = document.getElementById('col-dyn-style');
  if (!el) { el = document.createElement('style'); el.id = 'col-dyn-style'; document.head.appendChild(el); }
  el.textContent = css;
}

/* ── 欄位設定面板 ── */
function buildColPanel() {
  var s     = loadFullSettings();
  var cs    = s.cols;
  var inner = document.getElementById('col-panel-inner');
  if (!inner) return;
  inner.innerHTML = '';

  /* 全域設定列（列高 / 縮圖高）*/
  var gDiv = document.createElement('div');
  gDiv.className = 'col-set-item';
  gDiv.style.cssText = 'background:var(--ia);border-radius:4px;padding:2px 4px;margin-bottom:4px';
  gDiv.innerHTML =
    '<div class="col-set-lbl" style="font-weight:700;color:var(--bp)">全域</div>'
    + '<div class="col-set-inp">'
    + '<span>列高</span>'
    + '<input type="number" min="20" max="300" value="' + s.rowH + '" data-prop="rowH" onchange="onGlobalChange(this)" title="表格每列最小高度（px）">'
    + '<span>縮圖高</span>'
    + '<input type="number" min="40" max="500" value="' + s.imgH + '" data-prop="imgH" onchange="onGlobalChange(this)" title="照片/示意圖縮圖最大高度（px）">'
    + '</div>';
  inner.appendChild(gDiv);

  var hr = document.createElement('hr');
  hr.style.cssText = 'border:none;border-top:1px solid var(--bd);margin:3px 0 5px';
  inner.appendChild(hr);

  /* 各欄設定 */
  COL_DEFS.forEach(function(def, i) {
    var c   = cs[i];
    var div = document.createElement('div');
    div.className = 'col-set-item';
    div.innerHTML =
      '<div class="col-set-lbl" title="' + def.label + '">' + def.label + '</div>'
      + '<div class="col-set-inp">'
      + '<span>寬</span>'
      + '<input type="number" min="20" max="500" value="' + c.w + '" data-idx="' + i + '" data-prop="w" onchange="onColChange(this)">'
      + '<span>字</span>'
      + '<input type="number" min="8" max="24" value="' + c.fs + '" data-idx="' + i + '" data-prop="fs" onchange="onColChange(this)">'
      + '</div>';
    inner.appendChild(div);
  });

  /* 大寶（admin）推送按鈕 */
  if (typeof _u !== 'undefined' && _u === '大寶') {
    var pbtn = document.createElement('button');
    pbtn.textContent = '[推送] 全員預設值';
    pbtn.title = '將目前欄位設定寫入 global.json，其他人登入後會自動套用';
    pbtn.style.cssText = 'margin-top:8px;width:100%;padding:5px 0;background:#e67e22;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:700';
    pbtn.onclick = pushGlobalSettings;
    inner.appendChild(pbtn);
  }
}

function onColChange(input) {
  var idx  = parseInt(input.dataset.idx);
  var prop = input.dataset.prop;
  var val  = parseInt(input.value);
  if (isNaN(val) || val <= 0) return;
  var s = loadFullSettings();
  s.cols[idx][prop] = val;
  saveFullSettings(s);
  applyColStyle();
}

function onGlobalChange(input) {
  var prop = input.dataset.prop; /* rowH | imgH */
  var val  = parseInt(input.value);
  if (isNaN(val) || val <= 0) return;
  var s = loadFullSettings();
  s[prop] = val;
  saveFullSettings(s);
  applyColStyle();
}

function resetColSettings() {
  if (!confirm('確定重置欄位設定？將回到管理員推送的預設值（若尚未設定則回程式預設）')) return;
  _SETTINGS = null;
  localStorage.removeItem(COL_LS_KEY);
  if (typeof _u !== 'undefined' && _u)
    post('/api/settings/save', {user: _u, settings: {}}).catch(function() {});
  syncSettingsFromServer().then(function() { buildColPanel(); });
}

var _colPanelOpen = false;
function toggleColPanel() {
  _colPanelOpen = !_colPanelOpen;
  var panel = document.getElementById('col-panel');
  var btn   = document.getElementById('colbtn');
  if (panel) panel.style.display = _colPanelOpen ? 'block' : 'none';
  if (btn) {
    btn.textContent = _colPanelOpen ? '⚙️ 收起' : '⚙️ 欄位';
    btn.style.background = _colPanelOpen ? 'var(--bp)' : '#7f8c8d';
  }
  if (_colPanelOpen) { buildColPanel(); }
}

/* 頁面載入後立即套用儲存的設定 */
document.addEventListener('DOMContentLoaded', function() {
  applyColStyle();
  if (typeof _applyPhColCSS === 'function') _applyPhColCSS();
});
