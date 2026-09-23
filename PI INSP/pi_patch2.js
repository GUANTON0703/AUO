// pi_patch2.js  v13
// ★ 根本原因修正：
//   1. pi_main.js 的 getRegion / getFilters / updateRegionGrid / refreshRedPointsDisplay
//      都是 local scope，window.xxx 覆蓋對它們無效。
//      → 必須直接覆蓋 window.getRegion、window.getFilters，
//        並且 patch drawPoints() 讓它讀到更新後的 getFilters。
//   2. window.currentProductKey 必須在頁面初始化時就讀 productSelect.value（而非默認T550）
//   3. 計數 Canvas 完全自己算（不依賴 regionGrid DOM）
//   4. 篩選 Canvas 點擊 → 更新 DOM checkbox A~D/E/F → 呼叫 window.updateDisplay()
//      → pi_main.js 的 drawPoints() 會讀 getFilters()（已被覆蓋）

(function () {
  'use strict';

  /* =========================================================
   * A. 工具：等待函數存在
   * ========================================================= */
  function waitFor(getter, cb, interval, maxMs) {
    var t0 = Date.now();
    var id = setInterval(function() {
      if (getter()) { clearInterval(id); cb(); return; }
      if (Date.now() - t0 > (maxMs || 10000)) clearInterval(id);
    }, interval || 100);
  }

  /* =========================================================
   * B. prodCode → productSelect value
   * ========================================================= */
  var PROD_CODE_MAP = {
    'T850QVN04':'T430QVN05','T850QVN06':'T430QVN05','T850QVN08':'T430QVN05',
    'T430HVN01':'T430QVN05','T215HVN03':'T430QVN05',
    'T215HVN05':'T430QVN03','T430QVN03':'T430QVN03',
    'M430QVN02':'T430QVN04','T430QVN04':'T430QVN04',
    'T430QVN05':'T430QVN05',
    'M270DAN11':'M270DAN11',
    'M270HAN01':'M270DAN11','M270DAN07':'M270DAN11','M270DAN13':'M270DAN11',
    'M270HVR01':'M270DAN11','M270HVR03':'M270DAN11','M270QAN11':'M270DAN11',
    'W270DAN06':'M270DAN11',
    'M315DVR01':'M315DVR01','M315DVR06':'M315DVR01','M315HVR01':'M315DVR01',
    'P490QAR01':'P490QAR01',
    'M490AVR01':'M490AVR01',
    'M236HVR01':'M236HVR01','M238HAN03':'M236HVR01','M238HAN05':'M236HVR01',
    'B160UAN04':'B160UAN04',
    'B156HAN02':'B156HAN02','Y156HAN02':'B156HAN02','Y156HAN08':'B156HAN02',
    'M215HVN02':'M215HVN02','T215HVN02':'M215HVN02',
    'T550QVN10':'T550QVN10',
    'P550HVN01':'T550QVN10','P550HVN03':'T550QVN10','P550HVN06':'T550QVN10',
    'P550HVN07':'T550QVN10','P550HVN09':'T550QVN10',
    'P550QVN01':'T550QVN10','P550QVN05':'T550QVN10','P550QVN06':'T550QVN10',
    'P550QVR04':'T550QVN10',
    'T550HVN08':'T550QVN10','T550QVN03':'T550QVN10','T550QVN05':'T550QVN10',
    'T550QVN07':'T550QVN10','T550QVN11':'T550QVN10',
    'T550QVR06':'T550QVN10','T550QVR08':'T550QVN10',
    'T550QVN09':'T550QVN09','T650QVN07':'T550QVN09',
  };

  /* =========================================================
   * C. 取得目前 chips
   * ========================================================= */
  function getCurrentChips() {
    var sel = document.getElementById('productSelect');
    var key = (sel && sel.value) ? sel.value : (window.currentProductKey || 'T550QVN10');
    window.currentProductKey = key; // 隨時同步
    var cfg = window.PRODUCT_CONFIGS && window.PRODUCT_CONFIGS[key];
    if (cfg && cfg.chips && cfg.chips.length) return cfg.chips;
    // T550 fallback
    var cw = 2500/2, rh = 2200/3;
    return [
      {label:'A',x:0,  y:0,      w:cw,h:rh},
      {label:'B',x:cw, y:0,      w:cw,h:rh},
      {label:'C',x:0,  y:rh,     w:cw,h:rh},
      {label:'D',x:cw, y:rh,     w:cw,h:rh},
      {label:'E',x:0,  y:rh*2,   w:cw,h:rh},
      {label:'F',x:cw, y:rh*2,   w:cw,h:rh},
    ];
  }

  /* =========================================================
   * D. getRegionByChips：依 chips 座標判斷區域
   *    ★ 這是唯一的座標判斷函數，不用 MODES/CF/TFT 邏輯
   * ========================================================= */
  function getRegionByChips(x, y) {
    var chips = getCurrentChips();
    // 正向找：精確落入
    for (var i = chips.length - 1; i >= 0; i--) {
      var c = chips[i];
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return c.label;
    }
    // fallback：最近格子
    var best = chips[0], bd = Infinity;
    chips.forEach(function(c) {
      var d = Math.hypot(x - (c.x + c.w * 0.5), y - (c.y + c.h * 0.5));
      if (d < bd) { bd = d; best = c; }
    });
    return best.label;
  }

  /* =========================================================
   * E. filterState（內部）+ 同步 DOM checkbox
   * ========================================================= */
  var filterState = {};

  function ensureFilterState() {
    getCurrentChips().forEach(function(c) {
      if (filterState[c.label] === undefined) filterState[c.label] = true;
    });
  }

  // ★ 把 filterState 同步到 DOM checkbox
  //   pi_main.js 的 drawPoints() → 呼叫 local getFilters()
  //   local getFilters() 讀的是 document.getElementById('filterA').checked 等
  //   → 所以只要把 DOM checkbox 設對，篩選就對了
  function syncFilterStateToDom() {
    var chips = getCurrentChips();
    // 先把所有可能的 label checkbox 設為 true（避免殘留干擾）
    ['A','B','C','D','E','F'].forEach(function(lbl) {
      var cb = document.getElementById('filter' + lbl);
      if (cb) cb.checked = true;
    });
    // 再依 filterState 設定當前產品的 chips
    chips.forEach(function(c) {
      var id = 'filter' + c.label;
      var cb = document.getElementById(id);
      if (!cb) {
        // 建立隱藏 checkbox 讓 getFilters() 讀到
        cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = id;
        cb.style.display = 'none';
        document.body.appendChild(cb);
      }
      cb.checked = filterState[c.label] !== false;
    });
  }

  /* =========================================================
   * F. ★ 覆蓋 window.getRegion（供外部呼叫）
   *    ★ 覆蓋 window.getFilters（pi_main.js local 讀不到，
   *      但 pi_patches.js 的 refreshRedPointsDisplay 會呼叫）
   * ========================================================= */
  function patchCoreFunctions() {
    // 覆蓋 window.getRegion
    window.getRegion = function(x, y) {
      return getRegionByChips(x, y);
    };

    // ★ 關鍵：pi_main.js 的 local getFilters() 讀 DOM
    //   但 pi_main.js 也有一個 global getFilters（結尾沒有 const/let）
    //   看 source：`function getFilters(){return{A:...,B:...,C:...,D:...,E:...,F:...};}`
    //   這是 function declaration → 會被提升到 window scope！
    //   所以 window.getFilters 可以覆蓋它！
    window.getFilters = function() {
      var chips = getCurrentChips();
      var f = {};
      // 當前產品的每個 label
      chips.forEach(function(c) {
        f[c.label] = filterState[c.label] !== false;
      });
      // A~F 其他不在當前產品的 label → 預設 true（不過濾）
      ['A','B','C','D','E','F'].forEach(function(lbl) {
        if (!(lbl in f)) f[lbl] = true;
      });
      return f;
    };

    console.log('[p2v13] window.getRegion / getFilters 已覆蓋 ✓');
  }

  /* =========================================================
   * G. Canvas 尺寸計算
   * ========================================================= */
  function getCanvasSize(chips) {
    var RW = 2500, RH = 2200;
    var n = chips.length;
    var maxW = Math.max(260, Math.min(380, Math.ceil(Math.sqrt(n) * 36)));
    var maxH = Math.max(160, Math.min(300, Math.ceil(Math.sqrt(n) * 24)));
    var scale = Math.min(maxW / RW, maxH / RH);
    return { W: Math.round(RW * scale), H: Math.round(RH * scale), scale: scale };
  }

  /* =========================================================
   * H. 計數 Canvas
   * ========================================================= */
  var COUNT_ID = 'p2_count_canvas';

  function drawCountCanvas() {
    var container = document.getElementById('p2_count_container');
    if (!container) return;

    var chips = getCurrentChips();
    var sz    = getCanvasSize(chips);
    var W = sz.W, H = sz.H, scale = sz.scale;

    var cv = document.getElementById(COUNT_ID);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = COUNT_ID;
      cv.style.cssText = 'display:block;margin:4px auto;border:1px solid #ccc;border-radius:3px;';
      container.innerHTML = '';
      container.appendChild(cv);
    }
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // ★ 用 getRegionByChips（自己算，不依賴 window.getRegion 的覆蓋時序）
    var counts = {};
    chips.forEach(function(c) { counts[c.label] = 0; });

    var pts    = window.allPoints        || (typeof allPoints !== 'undefined' ? allPoints : []);
    var idxArr = window.allMarkedIndices || (typeof allMarkedIndices !== 'undefined' ? allMarkedIndices : []);
    var excl   = window.excludedPoints   || (typeof excludedPoints !== 'undefined' ? excludedPoints : new Set());

    idxArr.forEach(function(idx) {
      if (excl.has && excl.has(idx)) return;
      var pt = pts[idx];
      if (!pt) return;
      var lbl = getRegionByChips(pt.x, pt.y); // ★ 直接呼叫，不走 window
      if (counts.hasOwnProperty(lbl)) counts[lbl]++;
    });

    // 繪製格子
    chips.forEach(function(chip) {
      var cx = chip.x * scale;
      var cy = H - (chip.y + chip.h) * scale;  // Y 翻轉
      var cw = chip.w * scale;
      var ch = chip.h * scale;
      var cnt = counts[chip.label] || 0;

      ctx.fillStyle = cnt > 0 ? 'rgba(220,50,50,0.18)' : 'rgba(200,220,255,0.35)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = cnt > 0 ? '#cc3333' : '#99aacc';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);

      // 格子標籤（左上角）
      var fsL = Math.max(7, Math.min(cw * 0.28, ch * 0.32, 13));
      ctx.fillStyle = '#666';
      ctx.font = fsL + 'px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(chip.label, cx + 2, cy + 2);

      // 數量（中央）
      if (cnt > 0) {
        var fsN = Math.min(ch * 0.5, cw * 0.4, 26);
        ctx.fillStyle = '#cc2222';
        ctx.font = 'bold ' + Math.max(fsN, 10) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cnt, cx + cw / 2, cy + ch / 2);
      }
    });

    window.__p2DrawCount = drawCountCanvas;
  }

  /* =========================================================
   * I. 篩選 Canvas
   * ========================================================= */
  var FILTER_ID = 'p2_filter_canvas';

  function drawFilterCanvas() {
    var cv = document.getElementById(FILTER_ID);
    if (!cv) return;

    var chips = getCurrentChips();
    var sz    = getCanvasSize(chips);
    var W = sz.W, H = sz.H, scale = sz.scale;

    ensureFilterState();
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    chips.forEach(function(chip) {
      var cx = chip.x * scale;
      var cy = H - (chip.y + chip.h) * scale;
      var cw = chip.w * scale;
      var ch = chip.h * scale;
      var on = filterState[chip.label] !== false;

      ctx.fillStyle = on ? 'rgba(30,120,220,0.28)' : 'rgba(160,160,160,0.18)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = on ? '#2277cc' : '#aaa';
      ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);

      var fs = Math.max(8, Math.min(cw * 0.3, ch * 0.4, 20));
      ctx.fillStyle = on ? '#1155aa' : '#888';
      ctx.font = 'bold ' + fs + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(chip.label, cx + cw / 2, cy + ch / 2);
    });

    window.__p2DrawFilter = drawFilterCanvas;
  }

  function bindFilterCanvas() {
    var cv = document.getElementById(FILTER_ID);
    if (!cv || cv._p2v13) return;
    cv._p2v13 = true;

    cv.addEventListener('click', function(e) {
      var rect = cv.getBoundingClientRect();
      var mx = (e.clientX - rect.left) * (cv.width  / rect.width);
      var my = (e.clientY - rect.top)  * (cv.height / rect.height);

      var chips = getCurrentChips();
      var sz    = getCanvasSize(chips);
      var H = sz.H, scale = sz.scale;

      chips.forEach(function(chip) {
        var cx = chip.x * scale;
        var cy = H - (chip.y + chip.h) * scale;
        var cw = chip.w * scale;
        var ch = chip.h * scale;
        if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
          filterState[chip.label] = !(filterState[chip.label] !== false);
        }
      });

      ensureFilterState();
      syncFilterStateToDom();   // 同步 DOM checkbox
      drawFilterCanvas();

      // ★ 呼叫 updateDisplay()（pi_main.js 定義，會呼叫 drawPoints → 讀 getFilters()）
      if (typeof window.updateDisplay === 'function') window.updateDisplay();
      // ★ 呼叫 refreshRedPointsDisplay（過濾表格）
      if (typeof window.refreshRedPointsDisplay === 'function') window.refreshRedPointsDisplay();

      setTimeout(drawCountCanvas, 150);
    });
  }

  /* =========================================================
   * J. patchUpdateRegionGrid → 隱藏舊粉紅格，改用計數 Canvas
   * ========================================================= */
  function patchUpdateRegionGrid() {
    var orig = window.updateRegionGrid;
    if (typeof orig !== 'function') {
      setTimeout(patchUpdateRegionGrid, 300);
      return;
    }
    if (orig.__p2v13) return;

    window.updateRegionGrid = function() {
      // 不呼叫 orig（因為 orig 更新的是 numChip_X DOM，這些格子我們要隱藏）
      // 直接用計數 Canvas 代替
      var rg = document.getElementById('regionGrid');
      if (rg) rg.style.setProperty('display', 'none', 'important');
      drawCountCanvas();
    };
    window.updateRegionGrid.__p2v13 = true;

    // 立即隱藏
    var rg = document.getElementById('regionGrid');
    if (rg) rg.style.setProperty('display', 'none', 'important');
    console.log('[p2v13] updateRegionGrid patch ✓');
  }

  /* =========================================================
   * K. patchUpdateDisplay → 每次重繪都更新計數 Canvas
   * ========================================================= */
  function patchUpdateDisplay() {
    var orig = window.updateDisplay;
    if (typeof orig !== 'function' || orig.__p2v13) return;
    window.updateDisplay = function() {
      orig.apply(this, arguments);
      setTimeout(drawCountCanvas, 100);
    };
    window.updateDisplay.__p2v13 = true;
  }

  /* =========================================================
   * L. 切換產品時重置篩選狀態
   * ========================================================= */
  function hookProductChange() {
    var sel = document.getElementById('productSelect');
    if (!sel || sel._p2v13) return;
    sel._p2v13 = true;

    sel.addEventListener('change', function() {
      // pi_patches.js 的 changeProduct() 已更新 currentProductKey
      // 這裡再確保同步
      window.currentProductKey = sel.value;
      console.log('[p2v13] product →', window.currentProductKey);

      // 重置篩選（新底圖全開）
      filterState = {};
      ensureFilterState();

      setTimeout(function() {
        syncFilterStateToDom();
        drawFilterCanvas();
        drawCountCanvas();
        hideOldFilterGroup();
        refreshFilterTitle();
      }, 500);
    });
  }

  /* =========================================================
   * M. 隱藏舊 filterGroup
   * ========================================================= */
  function hideOldFilterGroup() {
    var fg = document.getElementById('filterGroup');
    if (fg) {
      var grp = fg.closest('.control-group');
      if (grp) grp.style.setProperty('display', 'none', 'important');
    }
  }

  function refreshFilterTitle() {
    var te = document.getElementById('p2_filter_title');
    if (te) te.textContent = '🗺️ 區域篩選（' + getCurrentChips().length + ' 格 · 對應底圖）';
  }

  /* =========================================================
   * N. 建立 UI（計數面板 + 篩選面板）
   * ========================================================= */
  function buildUI() {
    /* N1. 計數面板 */
    if (!document.getElementById('p2_count_wrap')) {
      var wrap = document.createElement('div');
      wrap.id = 'p2_count_wrap';
      wrap.style.cssText = 'margin:6px 0;';
      wrap.innerHTML =
        '<div style="font-size:11px;font-weight:bold;margin-bottom:3px;color:var(--text-secondary,#555);">' +
        '📊 各區不良數（對應底圖格位）</div>' +
        '<div id="p2_count_container"></div>';

      // 插在 regionGrid 旁邊
      var rg = document.getElementById('regionGrid');
      if (rg) {
        rg.style.setProperty('display', 'none', 'important');
        rg.parentNode.appendChild(wrap);
      } else {
        var canvasEl = document.getElementById('canvas');
        if (canvasEl && canvasEl.parentNode) canvasEl.parentNode.appendChild(wrap);
      }
    }

    /* N2. 篩選面板（取代舊 filterGroup） */
    if (!document.getElementById('p2_filter_wrap')) {
      var fw = document.createElement('div');
      fw.id = 'p2_filter_wrap';
      fw.className = 'control-group';

      var ftitle = document.createElement('h3');
      ftitle.id = 'p2_filter_title';
      ftitle.textContent = '🗺️ 區域篩選（對應底圖）';
      fw.appendChild(ftitle);

      var fc = document.createElement('canvas');
      fc.id = FILTER_ID;
      fc.style.cssText =
        'display:block;margin:4px auto;cursor:pointer;' +
        'border:1px solid #ccc;border-radius:4px;max-width:100%;';
      fw.appendChild(fc);

      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';

      var bAll = document.createElement('button');
      bAll.textContent = '✅ 全選';
      bAll.style.cssText =
        'flex:1;padding:5px 0;font-size:12px;cursor:pointer;' +
        'background:#3388cc;color:#fff;border:none;border-radius:4px;';
      bAll.onclick = function() {
        getCurrentChips().forEach(function(c) { filterState[c.label] = true; });
        syncFilterStateToDom(); drawFilterCanvas();
        if (typeof window.updateDisplay === 'function') window.updateDisplay();
        if (typeof window.refreshRedPointsDisplay === 'function') window.refreshRedPointsDisplay();
        setTimeout(drawCountCanvas, 150);
      };

      var bNone = document.createElement('button');
      bNone.textContent = '☐ 全不選';
      bNone.style.cssText =
        'flex:1;padding:5px 0;font-size:12px;cursor:pointer;' +
        'background:#999;color:#fff;border:none;border-radius:4px;';
      bNone.onclick = function() {
        getCurrentChips().forEach(function(c) { filterState[c.label] = false; });
        syncFilterStateToDom(); drawFilterCanvas();
        if (typeof window.updateDisplay === 'function') window.updateDisplay();
        if (typeof window.refreshRedPointsDisplay === 'function') window.refreshRedPointsDisplay();
        setTimeout(drawCountCanvas, 150);
      };

      btnRow.appendChild(bAll);
      btnRow.appendChild(bNone);
      fw.appendChild(btnRow);

      // 插入位置：替換 filterGroup 的 control-group
      var oldFG = document.getElementById('filterGroup');
      if (oldFG) {
        var oldGrp = oldFG.closest('.control-group') || oldFG.parentElement;
        oldGrp.style.setProperty('display', 'none', 'important');
        oldGrp.parentNode.insertBefore(fw, oldGrp);
      } else {
        var controls = document.querySelector('.controls');
        if (controls) controls.appendChild(fw);
      }

      bindFilterCanvas();
    }

    refreshFilterTitle();
    ensureFilterState();
    syncFilterStateToDom();
    drawFilterCanvas();
    drawCountCanvas();
  }

  /* =========================================================
   * O. autoIdentify（搜尋後自動切換底圖）
   * ========================================================= */
  function autoIdentify(ids) {
    if (!ids || !ids.length) return;
    var firstId = ids[0].trim();
    if (!firstId) return;

    fetch('http://10.36.38.240:5106/identify?ids=' + encodeURIComponent(firstId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.results || !data.results.length) return;
        var res = data.results[0];
        console.log('[p2v13] identify → side=' + res.side + ' code=' + res.product_code);

        if (res.side && typeof window.setMode === 'function') window.setMode(res.side);

        var selKey = PROD_CODE_MAP[res.product_code || ''] || null;
        if (selKey) {
          var sel = document.getElementById('productSelect');
          if (sel) {
            for (var i = 0; i < sel.options.length; i++) {
              if (sel.options[i].value === selKey) {
                if (sel.selectedIndex !== i) {
                  sel.selectedIndex = i;
                  window.currentProductKey = selKey;
                  // 觸發 change（讓 pi_patches.js 的 changeProduct 也執行）
                  var ev = document.createEvent('Event');
                  ev.initEvent('change', true, true);
                  sel.dispatchEvent(ev);
                }
                break;
              }
            }
          }
        }
      })
      .catch(function(e) { console.warn('[p2v13] identify 失敗', e); });
  }

  /* =========================================================
   * P. Hook bqSearch
   * ========================================================= */
  function hookBqSearch() {
    var orig = window.bqSearch;
    if (typeof orig !== 'function') { setTimeout(hookBqSearch, 400); return; }
    if (orig.__p2v13) return;

    window.bqSearch = function() {
      var ta = document.getElementById('bqSheetID') ||
               document.querySelector('textarea[id*="Sheet"]') ||
               document.querySelector('textarea');
      if (ta) {
        var ids = ta.value.split(/[\n,，\s]+/).map(function(s) { return s.trim(); }).filter(Boolean);
        autoIdentify(ids);
      }
      var result = orig.apply(this, arguments);
      setTimeout(drawCountCanvas, 1600);
      if (result && typeof result.then === 'function') {
        result.then(function() { setTimeout(drawCountCanvas, 400); });
      }
      return result;
    };
    window.bqSearch.__p2v13 = true;
    console.log('[p2v13] bqSearch hook ✓');
  }

  /* =========================================================
   * Q. 初始化
   * ========================================================= */
  function init() {
    // ★ 先同步 currentProductKey
    var sel = document.getElementById('productSelect');
    if (sel && sel.value) window.currentProductKey = sel.value;
    console.log('[p2v13] init, productKey=' + window.currentProductKey);

    // 隱藏舊 regionGrid
    var rg = document.getElementById('regionGrid');
    if (rg) rg.style.setProperty('display', 'none', 'important');
    hideOldFilterGroup();

    // ★ 核心函式覆蓋（要在 buildUI 之前）
    patchCoreFunctions();

    buildUI();
    patchUpdateRegionGrid();
    patchUpdateDisplay();
    hookBqSearch();
    hookProductChange();

    console.log('[pi_patch2 v13] ✅ 全部初始化完成');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // 等 pi_patches.js 跑完（它在 DOMContentLoaded 裡跑 init()）再執行
      setTimeout(init, 1500);
    });
  } else {
    setTimeout(init, 1500);
  }

})();
