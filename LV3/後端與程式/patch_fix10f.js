// ═══════════════════════════════════════════════════
// Fix-10f: buildHtmlReport 混合顯示
//   舊 Excel 記錄 → 整行全寬 Excel 快照
//   新 DB  記錄   → 原有結構化表格行
//
// 使用方式：在 index.html </body> 前加入
//   <script src="patch_fix10f.js"></script>
// ═══════════════════════════════════════════════════

// ── 覆寫 buildHtmlReport ──────────────────────────
function buildHtmlReport(records) {
  if (!records || !records.length) {
    document.getElementById('reportEmpty').style.display = 'block';
    document.getElementById('reportContainer').style.display = 'none';
    return;
  }

  var thead = document.getElementById('reportThead');
  var tbody = document.getElementById('reportBody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  var NCOLS     = 15;
  var colLabels = ['NO','日期','Model','CHIP ID','Grade','Defect',
                   '呈像描述','判定畫面','JND','左右','上下','機台','POL','示意圖','照片'];

  // 表頭（永遠顯示）
  colLabels.forEach(function(c) {
    var th = document.createElement('th');
    th.textContent = c;
    thead.appendChild(th);
  });

  // ── 分類：舊 Excel vs 新 DB ──────────────────────
  var xlRecs = [], dbRecs = [];
  records.forEach(function(r) {
    if (r.sheet_name && parseInt(r.row_num || 0) > 0 && r.file_path) {
      xlRecs.push(r);
    } else {
      dbRecs.push(r);
    }
  });

  // ── 舊 Excel 快照段（綠色標題 + 整行快照）─────────
  if (xlRecs.length) {
    // 分段標題列
    var xlHdrTr = document.createElement('tr');
    var xlHdrTd = document.createElement('td');
    xlHdrTd.colSpan = NCOLS;
    xlHdrTd.style.cssText =
      'background:#2e7d32;color:#fff;padding:5px 14px;' +
      'font-size:13px;font-weight:700;text-align:left;';
    xlHdrTd.textContent = '📋 舊 Excel 資料 — ' + xlRecs.length + ' 筆（Excel 快照）';
    xlHdrTr.appendChild(xlHdrTd);
    tbody.appendChild(xlHdrTr);

    xlRecs.forEach(function(r) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = NCOLS;
      td.style.cssText =
        'padding:3px;background:#f1f8e9;border-bottom:1px solid #c8e6c9;';

      // 構建快照 URL
      var snUrl = apiUrl('/api/snapshot/')
        + '?file_path='  + encodeURIComponent(r.file_path  || '')
        + '&sheet_name=' + encodeURIComponent(r.sheet_name || '')
        + '&row_num='    + (r.row_num || 0);

      // 全寬快照圖片，點擊可放大
      td.innerHTML =
        '<img src="' + snUrl + '" ' +
        'data-full-snap="1" ' +
        'style="width:100%;max-width:100%;display:block;cursor:zoom-in;border-radius:2px;" ' +
        'onerror="this.style.display=\'none\';' +
          'this.insertAdjacentHTML(\'afterend\',' +
          '\'<div style=\\\"color:#c0392b;font-size:.82rem;padding:6px;\\\">⚠️ 快照載入失敗（' +
          escHtml(r.id || r.sheet_name || '') +
          '）— 請確認 Excel 檔案路徑可存取</div>\')" ' +
        'onclick="event.stopPropagation();_openSnapZoom(this.src)">';

      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  }

  // ── 新 DB 資料段（紫色標題 + 結構化表格行）─────────
  if (dbRecs.length) {

    // 若同時有 Excel 段，加分段標題
    if (xlRecs.length) {
      var dbHdrTr = document.createElement('tr');
      var dbHdrTd = document.createElement('td');
      dbHdrTd.colSpan = NCOLS;
      dbHdrTd.style.cssText =
        'background:#5c6bc0;color:#fff;padding:5px 14px;' +
        'font-size:13px;font-weight:700;text-align:left;';
      dbHdrTd.textContent = '🗄️ 新 DB 資料 — ' + dbRecs.length + ' 筆';
      dbHdrTr.appendChild(dbHdrTd);
      tbody.appendChild(dbHdrTr);
    }

    dbRecs.forEach(function(r, i) {
      var d = r.date || '';
      var dateStr = d.length >= 8
        ? d.slice(4,6) + '/' + d.slice(6,8)
        : (d || '—');

      var xse = (!r.x_start && !r.x_end) ? '—'
        : (r.x_start || '') + (r.x_end ? '/' + r.x_end : '');
      var yse = (!r.y_start && !r.y_end) ? '—'
        : (r.y_start || '') + (r.y_end ? '/' + r.y_end : '');

      var tr = document.createElement('tr');
      var cells = [
        i + 1,
        dateStr,
        escHtml(r.model       || '—'),
        '<span style="font-weight:700">' + escHtml(r.id || '—') + '</span>',
        escHtml(r.grade       || '—'),
        escHtml(r.defect      || '—'),
        escHtml(r.description || '—'),
        escHtml(r.judgment    || '—'),
        jndHtml(r.jnd),
        escHtml(xse),
        escHtml(yse),
        escHtml(r.tool_id     || '—'),
        escHtml(r.pol         || '—'),
        sketchCellHtml(r),
        photosCellHtml(r)
      ];

      var cellStyles = [
        '','','','','',
        'text-align:left','text-align:left',
        '','','','','','',
        'padding:0;overflow:hidden;',
        'padding:2px;overflow:visible;'
      ];

      cells.forEach(function(v, ci) {
        var td = document.createElement('td');
        if (cellStyles[ci]) td.setAttribute('style', cellStyles[ci]);
        td.innerHTML = v;
        tr.appendChild(td);
      });

      // 列點擊詳情（Fix-9B）
      (function(row) {
        tr.onclick = function(e) {
          if (e.target.tagName !== 'IMG') showRowDetail(row);
        };
      })(r);

      tbody.appendChild(tr);
    });
  }

  // 非同步載入 DB 縮圖（Excel 快照已直接用 img src 載入，不需要這步）
  loadDailyThumbs();
}

// ── 快照全螢幕放大（點擊 Excel 快照列時觸發）────────
function _openSnapZoom(src) {
  // 優先複用現有的 lightbox
  var lb    = document.getElementById('lightbox');
  var lbImg = document.getElementById('lightboxImage');
  if (lb && lbImg) {
    lbImg.src = src;
    lb.classList.add('show');
    return;
  }
  // 若找不到 lightbox，開新分頁
  window.open(src, '_blank');
}
