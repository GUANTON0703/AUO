/* ══════════════════════════════════════════════
   lv3_vars_init.js — 全域變數、init、登入/登出、主題、標題
   依賴：lv3_helpers.js
══════════════════════════════════════════════ */

/* ── 全域狀態變數 ── */
let _u = '', _lt = '', _imgs = [null, null, null], _imgIdx = 0,
    _curModel = '', _nextPhotoMode = false, _chips = [],
    _dark = false, _today = '', _ecid = null, _rg = {},
    _repDate = '', _editOwner = '';

/* ── 人名清單（本地 fallback，伺服器連線失敗時使用）── */
const NAMES_FB = ['陳凱年', '林千', '余秋月', '李奕寬', '陳怡君', '黃美珠', '大寶'];

/* ── 主題切換 ── */
function toggleTheme() {
  _dark = !_dark;
  document.body.classList.toggle('dark', _dark);
  document.getElementById('thbtn').textContent = _dark ? '☀️' : '🌙';
  localStorage.setItem('lv3-dark', _dark ? '1' : '');
}

/* ── 人名填入下拉選單 ── */
function fillNames(names) {
  var au = document.getElementById('all-users');
  if (au) {
    au.innerHTML =
      '<div style="margin-bottom:5px;display:flex;gap:4px">'
      + '<button onclick="allUsrSel(true)" style="padding:2px 8px;font-size:11px;background:var(--bp);color:#fff;border:none;border-radius:3px;cursor:pointer;font-family:inherit">全選</button>'
      + '<button onclick="allUsrSel(false)" style="padding:2px 8px;font-size:11px;background:#7f8c8d;color:#fff;border:none;border-radius:3px;cursor:pointer;font-family:inherit">取消全選</button>'
      + '</div>'
      + names.map(function (n) {
          return '<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer">'
            + '<input type="checkbox" value="' + n + '" checked style="accent-color:var(--bp)"> ' + n + '</label>';
        }).join('');
  }
  ['lname', 'cpname'].forEach(id => {
    const s = document.getElementById(id);
    while (s.options.length > 1) s.remove(1);
    names.forEach(n => s.appendChild(new Option(n, n)));
  });
}

/* ── Init（頁面載入後執行）── */
async function init() {
  if (localStorage.getItem('lv3-dark') === '1') {
    _dark = true;
    document.body.classList.add('dark');
  }
  /* 日期 */
  try {
    const nd = await get('/api/today');
    _today = nd.date;
    document.getElementById('fdate').value = nd.display;
    document.getElementById('ydate').value =
      nd.date.slice(0, 4) + '-' + nd.date.slice(4, 6) + '-' + nd.date.slice(6, 8);
  } catch {
    const n = new Date();
    _today = n.getFullYear() + p2(n.getMonth() + 1) + p2(n.getDate());
    document.getElementById('fdate').value =
      _today.slice(0, 4) + '/' + _today.slice(4, 6) + '/' + _today.slice(6, 8);
  }
  /* 人名清單 */
  try {
    const nd = await get('/api/names');
    fillNames(nd.names || NAMES_FB);
  } catch {
    fillNames(NAMES_FB);
  }
  /* 自動登入 */
  const su = localStorage.getItem('lv3_user');
  if (su) {
    try { await get('/api/today'); _u = su; showMain(); }
    catch { localStorage.removeItem('lv3_user'); document.getElementById('lov').style.display = 'flex'; }
  } else {
    document.getElementById('lov').style.display = 'flex';
  }
}

function showMain() {
  document.getElementById('lov').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('tbar').style.display = 'flex';
  document.getElementById('uname').textContent = '👤 ' + _u;
  document.getElementById('ubadge').textContent = '登入者：' + _u;
  loadTitles(); loadReport(); syncSettingsFromServer(); unlockAll();
}

/* ── 登入 / 登出 ── */
async function doLogin() {
  const n = document.getElementById('lname').value,
        p = document.getElementById('lpwd').value;
  if (!n) { document.getElementById('lerr').textContent = '請選擇姓名'; return; }
  try {
    const r = await post('/api/login', { name: n, password: p });
    if (!r.success) { document.getElementById('lerr').textContent = r.error || '密碼錯誤'; return; }
    _u = n; localStorage.setItem('lv3_user', n); showMain();
  } catch (e) {
    document.getElementById('lerr').textContent = '連線失敗：請確認 Python 伺服器已啟動';
  }
}

function doLogout() {
  if (!confirm('確定登出？')) return;
  localStorage.removeItem('lv3_user');
  _u = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('tbar').style.display = 'none';
  document.getElementById('lov').style.display = 'flex';
  document.getElementById('lpwd').value = '';
  document.getElementById('lerr').textContent = '';
}

function showCP() {
  document.getElementById('lform').style.display = 'none';
  document.getElementById('cpform').style.display = '';
}
function showLogin() {
  document.getElementById('cpform').style.display = 'none';
  document.getElementById('lform').style.display = '';
}

async function doCP() {
  const n   = document.getElementById('cpname').value,
        o   = document.getElementById('cpold').value,
        nw  = document.getElementById('cpnew').value,
        cf  = document.getElementById('cpcfm').value;
  if (!n) { document.getElementById('cperr').textContent = '請選擇姓名'; return; }
  if (nw !== cf) { document.getElementById('cperr').textContent = '新密碼不一致'; return; }
  try {
    const r = await post('/api/change-password', { name: n, old_password: o, new_password: nw });
    if (!r.success) { document.getElementById('cperr').textContent = r.error || '失敗'; return; }
    document.getElementById('cperr').style.color = '#155724';
    document.getElementById('cperr').textContent = '✅ 密碼已更改';
    setTimeout(showLogin, 1500);
  } catch (e) { document.getElementById('cperr').textContent = '連線失敗'; }
}

/* ── 標題 ── */
async function loadTitles() {
  try {
    const d = await get('/api/titles');
    const sel = document.getElementById('ftsel');
    while (sel.options.length > 2) sel.remove(1);
    const last = sel.options[sel.options.length - 1];
    (d.titles || []).forEach(t => sel.insertBefore(new Option(t, t), last));
    var _lsT = JSON.parse(localStorage.getItem('lv3_local_titles') || '[]');
    var _svT = d.titles || [];
    _lsT.forEach(function (t) {
      if (!_svT.includes(t)) sel.insertBefore(new Option('[本機] ' + t, t), last);
    });
    if (d.titles && d.titles.includes('OCT覆判')) {
      sel.value = 'OCT覆判';
      document.getElementById('ftsel').style.display = '';
      document.getElementById('ftn').style.display = 'none';
    }
    if (_lt) setTV(_lt);
  } catch {}
}

function onTC() {
  const s = document.getElementById('ftsel'), i = document.getElementById('ftn');
  if (s.value === '__new__') { s.style.display = 'none'; i.style.display = 'block'; i.focus(); }
}
function onTB() {
  const i = document.getElementById('ftn');
  if (!i.value.trim()) {
    i.style.display = 'none';
    document.getElementById('ftsel').style.display = '';
    document.getElementById('ftsel').value = '';
  }
}
function getT() {
  const i = document.getElementById('ftn');
  if (i.style.display !== 'none') return i.value.trim();
  const v = document.getElementById('ftsel').value;
  return (v && v !== '__new__') ? v : '';
}
function setTV(t) {
  if (!t) return;
  const s = document.getElementById('ftsel'), i = document.getElementById('ftn');
  for (let o of s.options) {
    if (o.value === t) { s.value = t; s.style.display = ''; i.style.display = 'none'; return; }
  }
  s.style.display = 'none'; i.style.display = 'block'; i.value = t;
}

window.addEventListener('DOMContentLoaded', init);
