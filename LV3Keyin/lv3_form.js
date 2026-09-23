/* ══════════════════════════════════════════════
   lv3_form.js — 表單操作（fetchD / submitForm / 改判 / 刪除）
   依賴：lv3_helpers.js, lv3_vars_init.js
══════════════════════════════════════════════ */

/* ── JND 截斷到小數第1位 ── */
function truncJnd(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = String(v).trim();
  var n = parseFloat(s);
  if (isNaN(n)) return s;
  var d = s.indexOf('.');
  if (d < 0) return s;
  return s.slice(0, d + 2);
}

/* ── Chip 詳細資料查詢 ── */
async function fetchD(chipId) {
  document.getElementById('fchip').value = chipId;
  const fs = ['fmod', 'fgrd', 'fdef', 'fjnd', 'ftool', 'fpol', 'fxs', 'fys'];
  fs.forEach(id => { document.getElementById(id).value = '⋯'; });
  try {
    const d = await post('/api/chip-detail', { chip_id: chipId });
    if (!d.found) {
      fs.forEach(id => { document.getElementById(id).value = ''; });
      alert(d.error ? '查詢失敗：' + d.error : `找不到 ${chipId}`);
      return;
    }
    document.getElementById('fmod').value = d.model || '';
    updateSketchForModel(d.model || '');

    /* Grade */
    document.getElementById('fgrd').value = d.grade || '';
    document.getElementById('fgrd_orig').value = '';
    document.getElementById('fgrd').setAttribute('readonly', '');
    document.getElementById('fgrd').className = 'fc fa';
    document.getElementById('gbtn').textContent = '改判';
    document.getElementById('gbtn').style.background = '#7f8c8d';

    /* Defect */
    document.getElementById('fdef').value = d.defect || '';
    document.getElementById('fdef_orig').value = '';
    document.getElementById('fdef').setAttribute('readonly', '');
    document.getElementById('fdef').className = 'fc fa';
    document.getElementById('obtn').textContent = '改判';
    document.getElementById('obtn').style.background = '#7f8c8d';
    document.getElementById('defect-warn').style.display = 'none';
    var _dd = document.getElementById('defect-drop');
    if (_dd) _dd.style.display = 'none';

    /* JND */
    document.getElementById('fjnd').value = truncJnd(d.jnd);
    document.getElementById('fjnd_orig').value = '';
    document.getElementById('fjnd').setAttribute('readonly', '');
    document.getElementById('fjnd').className = 'fc fa';
    document.getElementById('jbtn').textContent = '改判';
    document.getElementById('jbtn').style.background = '#7f8c8d';

    document.getElementById('ftool').value = d.tool_id || '';
    document.getElementById('fpol').value = d.pol || '';
    document.getElementById('fxs').value = d.x_start || '';
    document.getElementById('fys').value = d.y_start || '';

    if (d.date)
      document.getElementById('fdate').value =
        d.date.slice(0, 4) + '/' + d.date.slice(4, 6) + '/' + d.date.slice(6, 8);

    /* 自動查 DEFECT.txt 帶入呈象描述與判定畫面 */
    const defectCode = d.defect || '';
    if (defectCode) {
      try {
        const dl = await get('/api/defect-lookup?defect=' + encodeURIComponent(defectCode));
        if (dl.found) {
          document.getElementById('fapp').value = dl.description || '';
          document.getElementById('fjdg').value = dl.judgment || '';
        }
      } catch {}
    }
    applyUnlockState();
  } catch (e) {
    fs.forEach(id => { document.getElementById(id).value = ''; });
    alert('連線失敗：' + e.message);
  }
}

/* ── 照片貼上 ── */
function onPaste(e) {
  const its = e.clipboardData && e.clipboardData.items;
  if (!its) return;
  for (let i = 0; i < its.length; i++) {
    if (its[i].type.startsWith('image/')) {
      const _url = URL.createObjectURL(its[i].getAsFile());
      const _img = new Image();
      _img.onload = function () {
        const tc = document.createElement('canvas');
        tc.width = _img.naturalWidth; tc.height = _img.naturalHeight;
        tc.getContext('2d').drawImage(_img, 0, 0);
        const jpg = tc.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(_url);
        _imgs[_imgIdx] = { b64: jpg };
        const a = document.getElementById('pa');
        a.innerHTML = '<img src="' + jpg + '" alt="">';
        a.classList.add('hi');
      };
      _img.src = _url;
      e.preventDefault(); return;
    }
  }
}

function clrImg() {
  _imgs[_imgIdx] = null;
  const a = document.getElementById('pa');
  a.innerHTML = '<span>Ctrl+V 貼截圖</span>';
  a.classList.remove('hi');
}

/* ── 表單送出 ── */
async function submitForm() {
  const t = getT();
  if (!_u) { showS('❗ 請先登入', 'err'); return; }
  if (!document.getElementById('fchip').value.trim()) { showS('❗ 請先點選左側 Chip ID', 'err'); return; }
  if (!t) { showS('❗ 請輸入或選擇標題', 'err'); return; }
  const ds = document.getElementById('fdate').value.replace(/\//g, '');
  const saveName = (_u === '大寶' && _editOwner) ? _editOwner : _u;
  const form = {
    name: saveName,
    chip_id: document.getElementById('fchip').value.trim(),
    date: ds,
    model: document.getElementById('fmod').value,
    grade: (function () {
      var o = document.getElementById('fgrd_orig').value.trim(),
        v = document.getElementById('fgrd').value.trim();
      return o ? o + '||' + v : v;
    })(),
    defect: (function () {
      var o = document.getElementById('fdef_orig').value.trim(),
        v = document.getElementById('fdef').value.trim();
      return o ? o + '||' + v : v;
    })(),
    jnd: (function () {
      var o = document.getElementById('fjnd_orig').value.trim(),
        v = truncJnd(document.getElementById('fjnd').value.trim());
      return o ? o + '||' + v : v;
    })(),
    appearance: document.getElementById('fapp').value,
    judgment: document.getElementById('fjdg').value,
    tool_id: document.getElementById('ftool').value,
    pol: document.getElementById('fpol').value,
    x_start: document.getElementById('fxs').value,
    x_end: document.getElementById('fxe').value,
    y_start: document.getElementById('fys').value,
    y_end: document.getElementById('fye').value,
    title: t
  };
  try {
    const body = { form };
    if (_imgs[0]) body.image = _imgs[0].b64;
    if (_imgs[1]) body.image2 = _imgs[1].b64;
    if (_imgs[2]) body.image3 = _imgs[2].b64;
    if (_sketch_data) body.sketch = _sketch_data;
    const r = await post('/api/save', body);
    if (!r.success) { showS('❌ ' + (r.error || '儲存失敗'), 'err'); return; }
    if (_nextPhotoMode) {
      _nextPhotoMode = false; _imgIdx++;
      const _slot = ['第二張', '第三張'];
      const _npa = document.getElementById('pa');
      _npa.innerHTML = '<span>Ctrl+V 貼截圖（' + (_slot[_imgIdx - 1] || '下一張') + '）</span>';
      _npa.classList.remove('hi');
      updateNextBtn();
      showS('✅ 已儲存！請貼上' + (_slot[_imgIdx - 1] || '下一張'), 'ok'); _lt = t;
      if (r.groups) renderRep(r.groups);
      await loadTitles();
      const cinp2 = document.getElementById('cinp').value.trim();
      if (cinp2) setTimeout(scCassette, 500);
    } else {
      showS('✅ ' + r.message, 'ok'); _lt = t; clrForm(true);
      if (r.groups) renderRep(r.groups);
      await loadTitles();
      const cinp = document.getElementById('cinp').value.trim();
      if (cinp) setTimeout(scCassette, 500);
    }
    saveTitleLocal(getT());
  } catch (e) { showS('❌ ' + e.message, 'err'); }
}

/* ── Grade 改判 ── */
function toggleOvrG() {
  var inp = document.getElementById('fgrd'), orig = document.getElementById('fgrd_orig'), btn = document.getElementById('gbtn');
  if (inp.readOnly) {
    orig.value = inp.value; inp.removeAttribute('readonly'); inp.className = 'fc'; inp.value = ''; inp.focus();
    btn.textContent = '取消改判'; btn.style.background = '#c0392b';
  } else {
    inp.value = orig.value; orig.value = ''; inp.setAttribute('readonly', ''); inp.className = 'fc fa';
    btn.textContent = '改判'; btn.style.background = '#7f8c8d';
  }
}

/* ── JND 改判 ── */
function toggleOvrJ() {
  var inp = document.getElementById('fjnd'), orig = document.getElementById('fjnd_orig'), btn = document.getElementById('jbtn');
  if (inp.readOnly) {
    orig.value = inp.value; inp.removeAttribute('readonly'); inp.className = 'fc'; inp.value = ''; inp.focus();
    btn.textContent = '取消改判'; btn.style.background = '#c0392b';
  } else {
    inp.value = orig.value; orig.value = ''; inp.setAttribute('readonly', ''); inp.className = 'fc fa';
    btn.textContent = '改判'; btn.style.background = '#7f8c8d';
  }
}

/* ── Defect 改判（開關）── */
function toggleOverride() {
  var inp = document.getElementById('fdef'), orig = document.getElementById('fdef_orig'),
    btn = document.getElementById('obtn'),
    drop = document.getElementById('defect-drop'), warn = document.getElementById('defect-warn');
  if (inp.readOnly) {
    orig.value = inp.value; inp.removeAttribute('readonly'); inp.className = 'fc'; inp.value = ''; inp.focus();
    btn.textContent = '取消改判'; btn.style.background = '#c0392b';
    loadDefCache();
  } else {
    inp.value = orig.value; orig.value = ''; inp.setAttribute('readonly', ''); inp.className = 'fc fa';
    btn.textContent = '改判'; btn.style.background = '#7f8c8d';
    if (drop) drop.style.display = 'none';
    if (warn) warn.style.display = 'none';
  }
}

/* ── 清除表單 ── */
function clrForm(keepT = false) {
  _editOwner = ''; _imgs = [null, null, null]; _imgIdx = 0; updateNextBtn(); clearSketch();
  var _cbg = document.getElementById('ubadge'); if (_cbg) _cbg.textContent = '';
  const sv = keepT ? getT() : '';
  ['fchip', 'fmod', 'fgrd', 'fdef', 'fjnd', 'ftool', 'fpol', 'fxs', 'fxe', 'fys', 'fye', 'fapp', 'fjdg']
    .forEach(id => { document.getElementById(id).value = ''; });
  clrImg(); _ecid = null;
  document.getElementById('bdel').disabled = true;

  /* 重置 Defect */
  document.getElementById('fdef_orig').value = '';
  document.getElementById('fdef').setAttribute('readonly', ''); document.getElementById('fdef').className = 'fc fa';
  document.getElementById('obtn').textContent = '改判'; document.getElementById('obtn').style.background = '#7f8c8d';
  /* 重置 Grade */
  document.getElementById('fgrd_orig').value = '';
  document.getElementById('fgrd').setAttribute('readonly', ''); document.getElementById('fgrd').className = 'fc fa';
  document.getElementById('gbtn').textContent = '改判'; document.getElementById('gbtn').style.background = '#7f8c8d';
  /* 重置 JND */
  document.getElementById('fjnd_orig').value = '';
  document.getElementById('fjnd').setAttribute('readonly', ''); document.getElementById('fjnd').className = 'fc fa';
  document.getElementById('jbtn').textContent = '改判'; document.getElementById('jbtn').style.background = '#7f8c8d';

  document.getElementById('defect-warn').style.display = 'none';

  if (keepT && sv) {
    setTV(sv);
  } else {
    document.getElementById('ftsel').style.display = '';
    document.getElementById('ftsel').value = '';
    document.getElementById('ftn').style.display = 'none';
    document.getElementById('ftn').value = '';
  }
}

/* ── 刪除 ── */
async function delRecord() {
  if (!_ecid) return;
  if (!confirm(`確定刪除 ${_ecid}？此操作無法復原`)) return;
  try {
    const delName = (_u === '大寶' && _editOwner) ? _editOwner : _u;
    const r = await post('/api/delete', { chip_id: _ecid, name: delName, date: _today });
    if (!r.success) { showS('❌ ' + (r.error || '刪除失敗'), 'err'); return; }
    showS('🗑️ ' + r.message, 'ok'); _ecid = null; clrForm(false);
    if (r.groups) renderRep(r.groups);
  } catch (e) { showS('❌ ' + e.message, 'err'); }
}

/* ── 顯示訊息 ── */
function showS(msg, type) {
  const el = document.getElementById('sm');
  el.textContent = msg; el.className = type; el.style.display = 'block';
  clearTimeout(el._t); el._t = setTimeout(() => el.style.display = 'none', 4000);
}

/* ── 多照片輔助 ── */
function updateNextBtn() {
  var btn = document.getElementById('bnext');
  if (btn) btn.style.display = (_imgIdx < 2) ? '' : 'none';
}

async function nextPhoto() {
  if (_imgIdx >= 2) return;
  _nextPhotoMode = true;
  await submitForm();
}
