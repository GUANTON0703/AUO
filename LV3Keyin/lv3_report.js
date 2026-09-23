/* ══════════════════════════════════════════════
   lv3_report.js — 報告渲染、rowClick、截圖、全員查詢
   依賴：lv3_helpers.js, lv3_vars_init.js, lv3_settings.js
══════════════════════════════════════════════ */

const COLS = ['NO','日期','Model','CHIP ID','Grade','Defect','呈象敘述','判定畫面','JND',
  '由左至右<br>S/E','由上而下<br>S/E','機台','POL','示意圖','照片1','照片2','照片3'];

function fmtDefect(raw) {
  var dp = (raw || '').split('||');
  if (dp.length >= 2)
    return '<span style="color:#999;font-size:10px">' + esc(dp[0]) + '</span><br>' +
           '<span style="color:#e67e22;font-size:14px;font-weight:700">→ ' + esc(dp[1]) + '</span>';
  return esc(raw || '—');
}

function sortR(rows) {
  return [...rows].sort((a, b) => {
    const m = (a['Model'] || '').localeCompare(b['Model'] || ''); if (m) return m;
    const d = (a['Defect'] || '').localeCompare(b['Defect'] || ''); if (d) return d;
    return (a['Grade'] || '').localeCompare(b['Grade'] || '');
  });
}

function renderRep(groups) {
  _rg = groups;
  const area = document.getElementById('rarea');
  const titles = Object.keys(groups);
  if (!titles.length) { area.innerHTML = '<div class="rep-empty">📭 今日尚無資料</div>'; return; }
  area.innerHTML = titles.map(title => {
    const rows = sortR(groups[title]);
    const thead = `<tr>${COLS.map(c => `<th>${c}</th>`).join('')}</tr>`;
    const tbody = rows.map((r, i) => {
      const ph  = r['圖片路徑']   ? `<img class="th" src="${BASE_URL}/api/image?path=${encodeURIComponent(r['圖片路徑'])}" alt="照片"  onclick="event.stopPropagation();openM(this.src)">` : '<span style="color:var(--tm)">—</span>';
      const ph2 = r['圖片路徑_2'] ? `<img class="th" src="${BASE_URL}/api/image?path=${encodeURIComponent(r['圖片路徑_2'])}" alt="照片2" onclick="event.stopPropagation();openM(this.src)">` : '<span style="color:var(--tm)">—</span>';
      const ph3 = r['圖片路徑_3'] ? `<img class="th" src="${BASE_URL}/api/image?path=${encodeURIComponent(r['圖片路徑_3'])}" alt="照片3" onclick="event.stopPropagation();openM(this.src)">` : '<span style="color:var(--tm)">—</span>';
      const sk  = r['示意圖路徑'] ? `<img class="th" src="${BASE_URL}/api/image?path=${encodeURIComponent(r['示意圖路徑'])}" alt="示意圖" onclick="event.stopPropagation();openM(this.src)">` : '<span style="color:var(--tm)">—</span>';
      return `<tr onclick="rowClick('${esc(title)}','${esc(r['Chip_ID'] || '')}')">
        <td>${i + 1}</td><td>${fd(r['日期'])}</td><td>${esc(r['Model'] || '—')}</td>
        <td style="font-weight:700">${esc(r['Chip_ID'] || '—')}</td>
        <td>${fmtDefect(r['Grade'])}</td><td class="lft def-td">${fmtDefect(r['Defect'])}</td>
        <td class="lft app-td">${esc(r['呈象描述'] || '—')}</td><td>${esc(r['判定畫面'] || '—')}</td>
        <td>${fmtDefect(r['JND'])}</td>
        <td class="cc">${fc(r['X_start'], r['X_end'])}</td><td class="cc">${fc(r['Y_start'], r['Y_end'])}</td>
        <td>${esc((r['機台'] || '—').replace(/^CK/, ''))}</td><td>${esc(r['POL'] || '—')}</td>
        <td class="sk-td">${sk}</td><td class="ph-td">${ph}</td><td class="ph-td2">${ph2}</td><td class="ph-td3">${ph3}</td>
      </tr>`;
    }).join('');
    return `<div class="rb"><div class="rtitle">● ${esc(title)}<span class="cnt">（${rows.length} 筆）</span></div>
      <div class="rw"><table class="rt"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div></div>`;
  }).join('');
  _applyPhColCSS();
}

/* ── 照片欄顯示/隱藏 ── */
var _phCol2 = false, _phCol3 = false;
function _applyPhColCSS() {
  var el = document.getElementById('ph-col-dyn');
  if (!el) { el = document.createElement('style'); el.id = 'ph-col-dyn'; document.head.appendChild(el); }
  var css = '';
  if (!_phCol2) css += 'table.rt th:nth-child(16),table.rt td.ph-td2{display:none!important;}';
  if (!_phCol3) css += 'table.rt th:nth-child(17),table.rt td.ph-td3{display:none!important;}';
  el.textContent = css;
}
function togglePhCol(n, btn) {
  if (n === 2) { _phCol2 = !_phCol2; if (btn) btn.style.background = _phCol2 ? 'var(--bp)' : '#7f8c8d'; }
  else         { _phCol3 = !_phCol3; if (btn) btn.style.background = _phCol3 ? 'var(--bp)' : '#7f8c8d'; }
  _applyPhColCSS();
}

/* ── 報告載入 ── */
async function loadReport(date) {
  var d = date || _today; _repDate = d;
  var tl = document.getElementById('rep-title');
  if (tl) tl.textContent = d === _today ? '📋 今日報告' : '📋 ' + d.slice(4, 6) + '/' + d.slice(6, 8) + ' 的報告';
  try {
    const r = await get('/api/report?user=' + encodeURIComponent(_u) + '&date=' + d);
    renderRep(r.groups || {});
  } catch {
    document.getElementById('rarea').innerHTML = '<div class="rep-empty" style="color:#c0392b">❌ 無法載入</div>';
  }
}

/* ── rowClick — 點列載入表單 ── */
function rowClick(title, chipId) {
  if (_ecid === chipId) {
    document.querySelectorAll('table.rt tr.sel').forEach(el => el.classList.remove('sel'));
    clrForm(false);
    return;
  }
  const rows = _rg[title] || [];
  const r = rows.find(x => x['Chip_ID'] === chipId);
  if (!r) return;

  /* 解析 owner（全員模式 title='姓名 > 標題'）*/
  var _own = title.includes(' > ') ? title.split(' > ')[0] : '';
  if (_own && _own !== _u) {
    if (_u !== '大寶') { alert('❌ 非本人不能修改，請確認身分'); return; }
    _editOwner = _own;
    var _bg = document.getElementById('ubadge');
    if (_bg) _bg.innerHTML = '<span style="color:#e67e22;font-weight:700">⚠️ 代替 ' + esc(_own) + ' 修改</span>';
  } else {
    _editOwner = '';
    var _bg = document.getElementById('ubadge'); if (_bg) _bg.textContent = '';
  }

  _ecid = chipId;
  document.getElementById('bdel').disabled = false;
  document.getElementById('fchip').value = chipId;
  document.getElementById('fmod').value = r['Model'] || '';
  updateSketchForModel(r['Model'] || '');

  /* Grade 改判狀態還原 */
  var _rg2 = r['Grade'] || '', _gp = _rg2.split('||');
  if (_gp.length >= 2) {
    document.getElementById('fgrd_orig').value = _gp[0];
    document.getElementById('fgrd').value = _gp[1];
    document.getElementById('fgrd').removeAttribute('readonly');
    document.getElementById('fgrd').className = 'fc';
    document.getElementById('gbtn').textContent = '取消改判';
    document.getElementById('gbtn').style.background = '#c0392b';
  } else {
    document.getElementById('fgrd').value = _rg2;
    document.getElementById('fgrd_orig').value = '';
    document.getElementById('fgrd').setAttribute('readonly', '');
    document.getElementById('fgrd').className = 'fc fa';
    document.getElementById('gbtn').textContent = '改判';
    document.getElementById('gbtn').style.background = '#7f8c8d';
  }

  /* Defect 改判狀態還原 */
  var _rd = r['Defect'] || '', _dp = _rd.split('||');
  if (_dp.length >= 2) {
    document.getElementById('fdef_orig').value = _dp[0];
    document.getElementById('fdef').value = _dp[1];
    document.getElementById('fdef').removeAttribute('readonly');
    document.getElementById('fdef').className = 'fc';
    document.getElementById('obtn').textContent = '取消改判';
    document.getElementById('obtn').style.background = '#c0392b';
  } else {
    document.getElementById('fdef').value = _rd;
    document.getElementById('fdef_orig').value = '';
    document.getElementById('fdef').setAttribute('readonly', '');
    document.getElementById('fdef').className = 'fc fa';
    document.getElementById('obtn').textContent = '改判';
    document.getElementById('obtn').style.background = '#7f8c8d';
  }

  /* JND 改判狀態還原 */
  var _rj = r['JND'] || '', _jp = _rj.split('||');
  if (_jp.length >= 2) {
    document.getElementById('fjnd_orig').value = _jp[0];
    document.getElementById('fjnd').value = _jp[1];
    document.getElementById('fjnd').removeAttribute('readonly');
    document.getElementById('fjnd').className = 'fc';
    document.getElementById('jbtn').textContent = '取消改判';
    document.getElementById('jbtn').style.background = '#c0392b';
  } else {
    document.getElementById('fjnd').value = _rj;
    document.getElementById('fjnd_orig').value = '';
    document.getElementById('fjnd').setAttribute('readonly', '');
    document.getElementById('fjnd').className = 'fc fa';
    document.getElementById('jbtn').textContent = '改判';
    document.getElementById('jbtn').style.background = '#7f8c8d';
  }

  document.getElementById('ftool').value = r['機台'] || '';
  document.getElementById('fpol').value = r['POL'] || '';
  document.getElementById('fapp').value = r['呈象描述'] || '';
  document.getElementById('fjdg').value = r['判定畫面'] || '';
  const tv = v => (v || '').replace(/\|/g, '\n');
  document.getElementById('fxs').value = tv(r['X_start']);
  document.getElementById('fxe').value = tv(r['X_end']);
  document.getElementById('fys').value = tv(r['Y_start']);
  document.getElementById('fye').value = tv(r['Y_end']);
  const ds = r['日期'] || '';
  if (ds.length >= 8) document.getElementById('fdate').value = ds.slice(0, 4) + '/' + ds.slice(4, 6) + '/' + ds.slice(6, 8);
  setTV(r['標題'] || '');
  document.querySelectorAll('table.rt tr.sel').forEach(el => el.classList.remove('sel'));
  event.currentTarget.classList.add('sel');

  /* 多圖片狀態重設 */
  _imgs = [null, null, null]; _imgIdx = 0; updateNextBtn();
  const _rpa = document.getElementById('pa');
  if (r['圖片路徑']) {
    _rpa.innerHTML = `<img src="${BASE_URL}/api/image?path=${encodeURIComponent(r['圖片路徑'])}&t=${Date.now()}" alt="照片" style="max-height:176px;max-width:100%;object-fit:contain;border-radius:3px">`;
    _rpa.classList.add('hi');
  } else {
    _rpa.innerHTML = '<span>Ctrl+V 貼截圖</span>';
    _rpa.classList.remove('hi');
  }

  if (r['示意圖路徑']) {
    loadSketchFromUrl(BASE_URL + '/api/image?path=' + encodeURIComponent(r['示意圖路徑']));
  } else {
    clearSketch();
  }
  document.getElementById('fc').scrollTop = 0;
}

/* ── 截圖報告區 ── */
var SNAP_ROWS_PER = 20;
async function captureReport() {
  var btn = document.getElementById('snapbtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    if (typeof html2canvas === 'undefined') throw new Error('html2canvas 未載入');
    var chunks = [];
    document.querySelectorAll('#rarea .rb').forEach(function (block) {
      var titleEl = block.querySelector('.rtitle');
      var title = titleEl ? titleEl.textContent : '';
      var table = block.querySelector('table.rt');
      if (!table) return;
      var thead = table.querySelector('thead');
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var rows = Array.from(tbody.querySelectorAll('tr'));
      if (!rows.length) return;
      for (var i = 0; i < rows.length; i += SNAP_ROWS_PER) {
        var slice = rows.slice(i, i + SNAP_ROWS_PER);
        chunks.push({ title, table, thead, rows: slice, start: i + 1, end: Math.min(i + SNAP_ROWS_PER, rows.length), total: rows.length });
      }
    });
    if (!chunks.length) { showS('沒有資料可截圖', 'err'); return; }
    var results = [];
    for (var ci = 0; ci < chunks.length; ci++) {
      var ck = chunks[ci];
      var tmp = document.createElement('div');
      tmp.style.cssText = 'position:fixed;left:-9999px;top:0;background:#ffffff;padding:6px;font-family:Microsoft JhengHei,sans-serif;';
      if (ck.title) {
        var td2 = document.createElement('div');
        td2.textContent = ck.title + (ck.total > SNAP_ROWS_PER ? ' (' + ck.start + '-' + ck.end + '/' + ck.total + ')' : '');
        td2.style.cssText = 'font-weight:700;padding:3px 8px;background:#9575cd;color:#fff;margin-bottom:3px;border-radius:4px;font-size:13px;';
        tmp.appendChild(td2);
      }
      var tbl = ck.table.cloneNode(false);
      var tcs = window.getComputedStyle(ck.table);
      tbl.style.borderCollapse = tcs.borderCollapse;
      tbl.style.width = tcs.width;
      if (ck.thead) { var th2 = ck.thead.cloneNode(true); tbl.appendChild(th2); }
      var tb2 = document.createElement('tbody');
      ck.rows.forEach(function (r) { tb2.appendChild(r.cloneNode(true)); });
      tbl.appendChild(tb2);
      tmp.appendChild(tbl);
      document.body.appendChild(tmp);
      var cvs = await html2canvas(tmp, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, logging: false });
      document.body.removeChild(tmp);
      results.push({ label: '第 ' + ck.start + '-' + ck.end + ' 列', dataURL: cvs.toDataURL('image/png'), canvas: cvs });
    }
    showSnapPanel(results);
  } catch (e) { showS('❌ 截圖失敗：' + e.message, 'err'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '📸'; } }
}

function showSnapPanel(results) {
  var panel = document.getElementById('snap-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'snap-panel';
    panel.style.cssText = 'position:fixed;top:46px;right:12px;z-index:9992;background:#fff;border:2px solid #9575cd;border-radius:10px;padding:8px 8px 6px;box-shadow:0 6px 24px rgba(0,0,0,.35);max-height:82vh;overflow-y:auto;width:210px;';
    document.body.appendChild(panel);
  }
  panel.innerHTML = '';
  var xbtn = document.createElement('button');
  xbtn.textContent = '✕ 關閉';
  xbtn.style.cssText = 'width:100%;margin-bottom:5px;padding:3px 0;background:#888;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-family:inherit;';
  xbtn.onclick = function () { panel.style.display = 'none'; };
  panel.appendChild(xbtn);
  var hint = document.createElement('div');
  hint.textContent = '🖼 點擊圖片即可複製到剪貼簿';
  hint.style.cssText = 'font-size:11px;color:#555;text-align:center;margin-bottom:6px;';
  panel.appendChild(hint);
  results.forEach(function (r) {
    var card = document.createElement('div');
    card.style.cssText = 'margin-bottom:8px;cursor:pointer;border:2px solid #ddd;border-radius:6px;padding:3px;transition:border-color .2s;';
    card.title = '點擊複製 ' + r.label;
    var lbl = document.createElement('div');
    lbl.textContent = r.label;
    lbl.style.cssText = 'font-size:11px;color:#333;text-align:center;background:#ede7f6;border-radius:3px;padding:2px 0;margin-bottom:3px;font-weight:600;';
    card.appendChild(lbl);
    var img = document.createElement('img');
    img.src = r.dataURL;
    img.style.cssText = 'width:100%;border-radius:3px;display:block;';
    card.appendChild(img);
    (function (res, cardEl) {
      cardEl.addEventListener('click', async function () {
        cardEl.style.borderColor = '#ff9800';
        try {
          res.canvas.toBlob(async function (blob) {
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              lbl.textContent = '✅ 已複製！'; lbl.style.background = '#c8e6c9';
            } catch (ce) {
              var a = document.createElement('a');
              a.download = 'LV3_snap_' + res.label.replace(/[^0-9\-]/g, '_') + '.png';
              a.href = res.dataURL; a.click();
              lbl.textContent = '📥 已下載'; lbl.style.background = '#fff9c4';
            }
          }, 'image/png');
        } catch (e) { showS('❌ 複製失敗：' + e.message, 'err'); }
        setTimeout(function () { cardEl.style.borderColor = '#ddd'; lbl.textContent = res.label; lbl.style.background = '#ede7f6'; }, 2000);
      });
    })(r, card);
    panel.appendChild(card);
  });
  panel.style.display = 'block';
}

/* ── 全員查詢 ── */
var _allViewOpen = false;
function allUsrSel(v) {
  document.querySelectorAll('#all-users input[type=checkbox]').forEach(c => c.checked = v);
}
function toggleAllView() {
  _allViewOpen = !_allViewOpen;
  var panel = document.getElementById('all-panel');
  var btn = document.getElementById('allbtn');
  if (panel) panel.style.display = _allViewOpen ? 'block' : 'none';
  if (btn) { btn.textContent = _allViewOpen ? '▲ 收起' : '👥 全員'; btn.style.background = _allViewOpen ? 'var(--bp)' : '#7f8c8d'; }
  if (_allViewOpen) {
    var ad = document.getElementById('all-date');
    if (ad && !ad.value) { var t = new Date(); ad.value = t.toISOString().slice(0, 10); }
  }
}
async function loadAllReport() {
  var dv = document.getElementById('all-date').value;
  if (!dv) { alert('請選擇日期'); return; }
  var date = dv.replace(/-/g, '');
  var checked = [...document.querySelectorAll('#all-users input:checked')].map(e => e.value);
  if (!checked.length) { alert('請選擇至少一人'); return; }
  var btn = document.getElementById('all-qbtn');
  btn.disabled = true; btn.textContent = '查詢中...';
  try {
    var combined = {};
    await Promise.all(checked.map(async function (user) {
      try {
        var r = await get('/api/report?user=' + encodeURIComponent(user) + '&date=' + date);
        var groups = r.groups || {};
        Object.keys(groups).forEach(t => { combined[user + ' > ' + t] = groups[t]; });
      } catch {}
    }));
    renderRep(combined);
    var tl = document.getElementById('rep-title');
    if (tl) tl.textContent = '👥 ' + date.slice(4, 6) + '/' + date.slice(6, 8) + ' 全員報告（' + checked.length + '人）';
  } catch (e) { alert('查詢失敗：' + e.message); }
  finally { btn.disabled = false; btn.textContent = '查詢'; }
}
function resetToMyReport() {
  loadReport(_today);
  if (_allViewOpen) toggleAllView();
}

/* ── 左側欄收折 ── */
function toggleC1() {
  var el = document.getElementById('c1');
  var btn = document.getElementById('tc1btn');
  var h = el.classList.toggle('col-hidden');
  if (btn) btn.textContent = h ? '📦 ▶' : '📦 ◀';
}
function toggleC2() {
  var el = document.getElementById('c2');
  var btn = document.getElementById('tc2btn');
  var h = el.classList.toggle('col-hidden');
  if (btn) btn.textContent = h ? '📝 ▶' : '📝 ◀';
}
