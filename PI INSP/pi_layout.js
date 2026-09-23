// pi_layout.js  v3
// 排版修改：
//   1. 隱藏「📊 數據輸入」control-group
//   2. 版面改為三欄：圖表(左) | 紅點表格(中) | 右側選項(右)
//
// 策略：雙保險
//   A. 注入 <style>（!important 覆蓋 pi_style.css）
//   B. JS 重排 DOM，把三個區塊直接掛在 .container 下

(function () {
  'use strict';

  /* ──────────────────────────────────────────────
   * 1. 注入覆蓋樣式
   * ────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('pi_layout_style')) return;
    var s = document.createElement('style');
    s.id = 'pi_layout_style';
    s.textContent =
      /* 三欄 grid container */
      '#pi_layout_root {' +
        'display: grid !important;' +
        'grid-template-columns: auto 1fr auto !important;' +
        'align-items: start !important;' +
        'gap: 12px !important;' +
        'width: 100% !important;' +
        'box-sizing: border-box !important;' +
        'padding: 0 8px !important;' +
      '}' +
      /* 中欄紅點表格可水平捲動 */
      '#pi_layout_root > .results-section {' +
        'min-width: 0 !important;' +
        'overflow-x: auto !important;' +
      '}' +
      /* 右欄固定寬度 */
      '#pi_layout_root > .controls {' +
        'min-width: 220px !important;' +
        'max-width: 280px !important;' +
      '}';
    document.head.appendChild(s);
  }

  /* ──────────────────────────────────────────────
   * 2. 重排 DOM → 建立 #pi_layout_root 三欄容器
   *
   * 原始:
   *   .container
   *     .content
   *       .canvas-container
   *       .controls
   *     .results-section
   *
   * 目標:
   *   .container
   *     #pi_layout_root  (grid 三欄)
   *       .canvas-container
   *       .results-section
   *       .controls
   * ────────────────────────────────────────────── */
  function rearrangeDOM() {
    if (document.getElementById('pi_layout_root')) return true; // 已完成

    var container   = document.querySelector('.container');
    var content     = document.querySelector('.content');
    var canvasCont  = document.querySelector('.canvas-container');
    var controls    = document.querySelector('.controls');
    var resultsSec  = document.querySelector('.results-section');

    if (!container || !canvasCont || !controls || !resultsSec) {
      return false;
    }

    // 建立三欄 wrapper
    var root = document.createElement('div');
    root.id = 'pi_layout_root';

    // 把三個子元素依序放入（左→中→右）
    root.appendChild(canvasCont);
    root.appendChild(resultsSec);
    root.appendChild(controls);

    // 清空 container，放入 root
    // （也把舊的 .content 空殼移除）
    if (content && content.parentNode === container) {
      container.removeChild(content);
    }
    // 移除 resultsSec 殘留（已搬入 root）
    if (resultsSec.parentNode === container) {
      container.removeChild(resultsSec);
    }

    container.appendChild(root);
    console.log('[pi_layout v3] DOM 重排完成 ✓');
    return true;
  }

  /* ──────────────────────────────────────────────
   * 3. 隱藏「數據輸入」control-group
   * ────────────────────────────────────────────── */
  function hideDataInput() {
    // 最可靠：找 #dataInput textarea 的上層 .control-group
    var ta = document.getElementById('dataInput');
    if (ta) {
      var grp = ta.closest('.control-group');
      if (grp) grp.style.cssText = 'display:none !important';
    }
    // 備援：用 h3 文字比對
    document.querySelectorAll('.control-group').forEach(function (grp) {
      var h3 = grp.querySelector('h3');
      if (!h3) return;
      var t = h3.textContent || '';
      if (t.indexOf('數據輸入') !== -1 || t.indexOf('數據匯入') !== -1) {
        grp.style.cssText = 'display:none !important';
      }
    });
  }

  /* ──────────────────────────────────────────────
   * 初始化（跑兩次：DOMContentLoaded + load）
   * ────────────────────────────────────────────── */
  function init() {
    injectStyles();
    var ok = rearrangeDOM();
    hideDataInput();
    if (!ok) {
      // DOM 還沒準備好，稍後重試
      setTimeout(function () {
        rearrangeDOM();
        hideDataInput();
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
  // load 之後再跑一次，防止 pi_patches.js 注入新元素後打亂排版
  window.addEventListener('load', function () {
    setTimeout(function () {
      rearrangeDOM();
      hideDataInput();
    }, 900);
  });

})();
