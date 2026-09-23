/* ══════════════════════════════════════════════
   lv3_defect.js — Defect 智慧下拉 / 新增 Defect
   依賴：lv3_helpers.js (get, post, esc)
         lv3_form.js 裡的 showS()
══════════════════════════════════════════════ */

var _defCache = null;

async function loadDefCache() {
  if (_defCache) return _defCache;
  try {
    var r = await get('/api/defect-list');
    _defCache = r.defects || [];
  } catch (e) { _defCache = []; }
  return _defCache;
}

/* 三層匹配評分
   100 前綴 | 70 包含 | 50 字首縮寫序列 | 20 全文字元序列 */
function scoreDefect(code, query) {
  var q = query.toLowerCase().replace(/\s+/g, '');
  var c = code.toLowerCase();
  if (!q) return 0;
  if (c.startsWith(q)) return 100;
  if (c.includes(q)) return 70;
  var words = c.split(/[\s\-_]+/).filter(function (w) { return w.length > 0; });
  var initials = words.map(function (w) { return w[0]; }).join('');
  var qi = 0;
  for (var i = 0; i < initials.length && qi < q.length; i++) {
    if (initials[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 50;
  qi = 0;
  for (var i = 0; i < c.length && qi < q.length; i++) {
    if (c[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 20;
  return 0;
}

async function onDefInput() {
  var inp = document.getElementById('fdef');
  if (inp.readOnly) return;
  var v = inp.value.trim();
  var drop = document.getElementById('defect-drop');
  var warn = document.getElementById('defect-warn');
  warn.style.display = 'none';
  if (!v) { drop.style.display = 'none'; return; }
  var list = await loadDefCache();
  var scored = list.map(function (d) { return { d: d, s: scoreDefect(d.code, v) }; })
    .filter(function (x) { return x.s > 0; })
    .sort(function (a, b) { return b.s - a.s; })
    .slice(0, 25);
  if (!scored.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = scored.map(function (x) {
    return '<div class="dd-item" onclick="selDefect(\'' + esc(x.d.code) + '\',\'' + esc(x.d.description) + '\',\'' + esc(x.d.judgment) + '\')">'
      + '<div class="dd-code">' + esc(x.d.code) + '</div>'
      + (x.d.description ? '<div class="dd-desc">' + esc(x.d.description) + '</div>' : '')
      + '</div>';
  }).join('');
  drop.style.display = 'block';
}

function selDefect(code, desc, jdg) {
  document.getElementById('fdef').value = code;
  document.getElementById('defect-drop').style.display = 'none';
  document.getElementById('defect-warn').style.display = 'none';
  if (desc) document.getElementById('fapp').value = desc;
  if (jdg) document.getElementById('fjdg').value = jdg;
}

async function onDefBlur() {
  setTimeout(async function () {
    var inp = document.getElementById('fdef');
    if (inp.readOnly) return;
    var v = inp.value.trim();
    var drop = document.getElementById('defect-drop');
    var warn = document.getElementById('defect-warn');
    drop.style.display = 'none';
    if (!v) { warn.style.display = 'none'; return; }
    var list = await loadDefCache();
    var hit = list.find(function (d) { return d.code.toLowerCase() === v.toLowerCase(); });
    if (hit) {
      warn.style.display = 'none';
      document.getElementById('fapp').value = hit.description || '';
      document.getElementById('fjdg').value = hit.judgment || '';
      return;
    }
    var fuzzy = list.filter(function (d) { return scoreDefect(d.code, v) > 0; });
    if (fuzzy.length) { warn.style.display = 'none'; return; }
    warn.innerHTML = '<span style="color:#856404">⚠️ 「' + esc(v) + '」不在 DEFECT.txt 中，要新增嗎？</span> '
      + '<button onclick="showAddDefect()" style="padding:2px 9px;font-size:11px;background:#e67e22;color:#fff;border:none;border-radius:3px;cursor:pointer">新增</button>';
    warn.style.display = 'block';
  }, 200);
}

function showAddDefect() {
  var v = document.getElementById('fdef').value.trim();
  document.getElementById('defect-warn').innerHTML =
    '<div style="background:#fff8e1;border:1px solid #ffc107;border-radius:5px;padding:7px;margin-top:2px">'
    + '<div style="font-size:11px;font-weight:700;color:#5d4037;margin-bottom:5px">➕ 新增到 DEFECT.txt</div>'
    + '<input id="nadd_code" class="fc" value="' + esc(v) + '" readonly style="margin-bottom:3px;background:#f0f0f0">'
    + '<input id="nadd_desc" class="fc" placeholder="呈象描述（選填）" style="margin-bottom:3px">'
    + '<input id="nadd_jdg"  class="fc" placeholder="判定畫面（選填）" style="margin-bottom:5px">'
    + '<div style="display:flex;gap:5px">'
    + '<button onclick="doAddDefect()" style="flex:1;padding:4px 0;background:#43a047;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">確認新增</button>'
    + '<button onclick="document.getElementById(\'defect-warn\').style.display=\'none\'" style="flex:1;padding:4px 0;background:#7f8c8d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">取消</button>'
    + '</div></div>';
}

async function doAddDefect() {
  var code = (document.getElementById('nadd_code') || { value: '' }).value.trim();
  var desc = (document.getElementById('nadd_desc') || { value: '' }).value.trim();
  var jdg  = (document.getElementById('nadd_jdg')  || { value: '' }).value.trim();
  if (!code) { alert('請輸入 Defect Code'); return; }
  try {
    var r = await post('/api/defect-add', { defect_code: code, description: desc, judgment: jdg });
    if (!r.success) { alert('新增失敗：' + (r.error || '')); return; }
    _defCache = null; /* 清快取，下次重讀 */
    document.getElementById('defect-warn').style.display = 'none';
    showS('✅ ' + r.message, 'ok');
  } catch (e) { alert('連線失敗：' + e.message); }
}
