/* ══════════════════════════════════════════════
   lv3_search.js — 搜尋功能
   依賴：lv3_helpers.js, lv3_vars_init.js
══════════════════════════════════════════════ */

/* ── 箱號子分頁切換 ── */
function swCTab(n) {
  ['ct1', 'ct2'].forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) el.style.display = (i + 1 === n) ? 'flex' : 'none';
  });
  var b1 = document.getElementById('ctb1'), b2 = document.getElementById('ctb2');
  if (b1) b1.style.background = n === 1 ? 'var(--bp)' : '#7f8c8d';
  if (b2) b2.style.background = n === 2 ? 'var(--bp)' : '#7f8c8d';
}

/* ── 除帳 SCRP 查詢 ── */
async function scScrp() {
  var chipId = (document.getElementById('sinp').value || '').trim().toUpperCase();
  if (!chipId) { alert('請輸入 Chip ID'); return; }
  var le = document.getElementById('scrplist'), ce = document.getElementById('scrpcnt');
  le.innerHTML = '<div class="lmsg">查詢中...</div>'; ce.textContent = '';
  try {
    var r = await post('/api/chip-scrp', { chip_id: chipId });
    if (r.error) { le.innerHTML = '<div class="lmsg" style="color:#c0392b">❌ ' + esc(r.error) + '</div>'; return; }
    var rows = r.data || [];
    ce.textContent = '共 ' + rows.length + ' 筆除帳記錄';
    if (!rows.length) { le.innerHTML = '<div class="lmsg">查無除帳記錄</div>'; return; }
    renderScrpList(le, rows);
    fetchD(chipId);
  } catch(e) { le.innerHTML = '<div class="lmsg" style="color:#c0392b">❌ ' + esc(e.message) + '</div>'; }
}

function renderScrpList(le, rows) {
  le.innerHTML = '<div style="margin-bottom:4px"><button onclick="importSelToBatch(\'scrplist\')" style="width:100%;padding:3px 0;background:#43a047;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit">📋 匯入選取到批次</button></div>';
  rows.forEach(function(r) {
    var cid = r.SHEET_ID_CHIP_ID || '';
    var ts  = (r.TRANS_TIMESTAMP || '').slice(0, 16);
    var info = [r.OP_ID, r.TRANS_USER, r.CASSETTE_ID].filter(Boolean).join(' | ');
    var el = document.createElement('div');
    el.className = 'ci'; el.dataset.cid = cid;
    el.style.cssText = 'display:flex;align-items:flex-start;gap:5px';
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'ci-chk'; cb.value = cid;
    cb.style.cssText = 'flex-shrink:0;margin-top:3px;cursor:pointer';
    cb.onclick = function(e) { e.stopPropagation(); };
    var wr = document.createElement('div');
    wr.style.cssText = 'flex:1;cursor:pointer';
    wr.onclick = function() { fetchD(el.dataset.cid); };
    wr.innerHTML = '<span class="cid">' + esc(cid || '—') + '</span>'
      + '<span class="cif">⏰ ' + esc(ts) + '</span>'
      + (info ? '<span class="cif">' + esc(info) + '</span>' : '');
    el.appendChild(cb); el.appendChild(wr);
    le.appendChild(el);
  });
}

/* ── 箱號搜尋 ── */
async function scCassette() {
  const cid = document.getElementById('cinp').value.trim();
  if (!cid) { alert('請輸入箱號'); return; }
  const le = document.getElementById('clist'), ce = document.getElementById('ccnt');
  le.innerHTML = '<div class="lmsg">查詢中...</div>'; ce.textContent = '';
  try {
    const r = await post('/api/search-cassette', { cassette_id: cid });
    if (r.error) { le.innerHTML = em(r.error); return; }
    const ids = r.chip_ids || []; ce.textContent = `共 ${ids.length} 個 ID`;
    if (ids.length) {
      le.innerHTML = '<div style="margin-bottom:4px">'
        + '<button onclick="importSelToBatch(\'clist\')" style="width:100%;padding:3px 0;background:#43a047;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit">📋 匯入選取到批次</button></div>'
        + ids.map(function(id) {
          return '<div class="ci" data-cid="' + esc(id) + '" style="display:flex;align-items:center;gap:5px" onclick="var _cb=this.querySelector(\'input.ci-chk\');if(_cb){_cb.checked=!_cb.checked;}fetchD(\'' + esc(id) + '\');">'
            + '<input type="checkbox" class="ci-chk" value="' + esc(id) + '" onclick="event.stopPropagation();fetchD(\'' + esc(id) + '\')" style="flex-shrink:0;cursor:pointer">'
            + '<span class="cid" style="flex:1;cursor:pointer">' + esc(id) + '</span>'
            + '</div>';
        }).join('');
    } else {
      le.innerHTML = '<div class="lmsg">查無資料</div>';
    }
    await markKeyed(le, ids);
  } catch(e) { le.innerHTML = em(e.message); }
}

/* ── 月良率搜尋 ── */
async function scYield() {
  const dv = document.getElementById('ydate').value;
  if (!dv) { alert('請選擇日期'); return; }
  const gs = getG(); if (!gs.length) { alert('請選等級'); return; }
  const le = document.getElementById('ylist'), ce = document.getElementById('ycnt');
  le.innerHTML = '<div class="lmsg">查詢中...</div>'; ce.textContent = '';
  document.getElementById('dynf').style.display = 'none';
  try {
    const r = await post('/api/search-yield', { date: dv.replace(/-/g, ''), grades: gs, first_yield_flag: getFYF() });
    if (r.error) { le.innerHTML = em(r.error); return; }
    _chips = r.chips || [];
    if (!_chips.length) { ce.textContent = '查無資料'; le.innerHTML = '<div class="lmsg">查無資料</div>'; return; }
    buildDF(_chips); renderFC();
    loadReport(dv.replace(/-/g, ''));
  } catch(e) { le.innerHTML = em(e.message); }
}

function getG() {
  return [...document.querySelectorAll('#gw input[name=g]:checked,#rsub input[name=g]:checked')].map(e => e.value);
}
function getFYF() {
  const e = document.querySelector('input[name=fyf]:checked'); return e ? e.value : 'Y';
}
function togR() {
  document.getElementById('rsub').style.display = document.getElementById('gR').checked ? 'flex' : 'none';
}
function togPCH(all) {
  document.querySelectorAll('#pch input[type=checkbox]').forEach(function(cb) { cb.checked = all; }); renderFC();
}

function buildDF(chips) {
  const ss = [...new Set(chips.map(c => c.shift || '').filter(Boolean))].sort();
  const ps = [...new Set(chips.map(c => c.model || '').filter(Boolean))].sort();
  document.getElementById('sch').innerHTML = ss.length
    ? ss.map(s => `<label><input type="checkbox" name="ds" value="${esc(s)}" checked onchange="renderFC()"> ${esc(s)}</label>`).join('')
    : '—';
  document.getElementById('pch').innerHTML = ps.length
    ? ps.map(p => `<label><input type="checkbox" name="dp" value="${esc(p)}" checked onchange="renderFC()"> ${esc(p)}</label>`).join('')
    : '—';
  document.getElementById('dynf').style.display = 'block';
}

async function renderFC() {
  const ss = [...document.querySelectorAll('input[name=ds]:checked')].map(e => e.value);
  const ps = [...document.querySelectorAll('input[name=dp]:checked')].map(e => e.value);
  var _yq = (document.getElementById('yidf') ? document.getElementById('yidf').value.trim().toLowerCase() : '');
  const fl = _chips.filter(c =>
    (!_yq || c.chip_id.toLowerCase().includes(_yq)) &&
    (ss.length === 0 || ss.includes(c.shift || '')) &&
    (document.querySelectorAll('#pch input[type=checkbox]').length === 0 || ps.length > 0 && ps.includes(c.model || ''))
  );
  const le = document.getElementById('ylist'), ce = document.getElementById('ycnt');
  ce.textContent = `顯示 ${fl.length} / ${_chips.length} 筆`;
  le.innerHTML = fl.length
    ? fl.map(c => `<div class="ci" onclick="fetchD('${esc(c.chip_id)}')" data-cid="${esc(c.chip_id)}"><span class="cid">${esc(c.chip_id)}</span><span class="cif">${esc(c.grade)}｜${esc(c.shift || '')}｜${esc(c.defect)}</span></div>`).join('')
    : '<div class="lmsg">篩選後無資料</div>';
  await markKeyed(le, fl.map(c => c.chip_id));
}

async function markKeyed(listEl, ids) {
  if (!ids.length || !_u) return;
  try {
    const r = await post('/api/check-chips', { chip_ids: ids, user: _u, date: _today });
    const ks = new Set(r.keyed || []);
    listEl.querySelectorAll('.ci[data-cid]').forEach(el => {
      if (ks.has(el.dataset.cid)) { el.classList.add('keyed'); el.title = '⚠️ 今天已 KEY IN'; }
    });
  } catch {}
}

/* ── 篩選 Chip ID 清單 ── */
function filterCList() {
  var q = (document.getElementById('cidf') || { value: '' }).value.trim().toLowerCase();
  document.querySelectorAll('#clist .ci').forEach(function(el) {
    var id = (el.querySelector('.cid') || el).textContent.toLowerCase();
    el.style.display = (!q || id.includes(q)) ? '' : 'none';
  });
}

/* ── 全選/取消全選 toggle ── */
function togAll(listId, btn) {
  var le = document.getElementById(listId); if (!le) return;
  var cbs = le.querySelectorAll('input.ci-chk');
  if (!cbs.length) { alert('尚無列表，請先搜尋'); return; }
  var allChecked = Array.from(cbs).every(function(cb) { return cb.checked; });
  var sel = !allChecked;
  cbs.forEach(function(cb) { cb.checked = sel; });
  if (btn) btn.textContent = sel ? '☑️ 取消全選' : '☑️ 全選';
}

/* ── 匯入選取到批次面板 ── */
function importSelToBatch(listId) {
  var le = document.getElementById(listId); if (!le) return;
  var cbs = le.querySelectorAll('input.ci-chk:checked');
  if (!cbs.length) { alert('請先勾選要匯入的 Chip ID'); return; }
  var newIds = Array.from(cbs).map(function(c) { return c.value.trim(); }).filter(Boolean);
  var bpTa = document.getElementById('bp-ids'); if (!bpTa) return;
  bpTa.value = newIds.join('\n');
  var bp = document.getElementById('batch-panel');
  if (bp && !bp.classList.contains('show')) toggleBatch();
  showS('✅ 已匯入 ' + newIds.length + ' 筆 ID（舊批次已清除）', 'ok');
}
