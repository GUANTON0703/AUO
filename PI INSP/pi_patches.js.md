/* PI_Insp_Map Patches（整合清理版）
 * 包含：smartPastePanel / Product選單 / ChipFix / iframe固定對準
 *       排版修正 / 按鈕文字互換
 * 廢棄已移除：autoQueryPanel
 */

(function(){
    // ===== 新增：iframe 對準參數 =====
    var iframeOffsetX  = 0;
    var iframeOffsetY  = 0;
    var iframeViewH    = 90;
    var iframeViewScale= 0.30;

    // ===== 產生 iframe style 字串 =====
    function getIframeStyle(){
        var w  = (100 / iframeViewScale).toFixed(1);
        var h  = Math.ceil(iframeViewH / iframeViewScale + iframeOffsetY + 100);
        var ml = -(iframeOffsetX * iframeViewScale).toFixed(1);
        var mt = -(iframeOffsetY * iframeViewScale).toFixed(1);
        return 'width:'+w+'%;height:'+h+'px;transform:scale('+iframeViewScale+');transform-origin:top left;margin-left:'+ml+'px;margin-top:'+mt+'px;';
    }

    // ===== 注入控制面板 HTML =====
    var clearGroup = document.querySelector('button.secondary[onclick="clearAll()"]');
    if(clearGroup){
        var container = clearGroup.parentElement;
        var newDiv = document.createElement('div');
        newDiv.className = 'control-group';
        newDiv.id = 'iframeAlignGroup';
        newDiv.innerHTML =
            '<h3>🎯 嵌入區域對準</h3>'+
            '<div class="input-row"><label>X 偏移:</label>'+
            '<input type="range" id="ifrX" min="0" max="2000" value="0" oninput="window._ifrUpdate()">'+
            '<span class="slider-value" id="ifrXv">0</span></div>'+
            '<div class="input-row"><label>Y 偏移:</label>'+
            '<input type="range" id="ifrY" min="0" max="2000" value="0" oninput="window._ifrUpdate()">'+
            '<span class="slider-value" id="ifrYv">0</span></div>'+
            '<div class="input-row"><label>顯示高:</label>'+
            '<input type="range" id="ifrH" min="50" max="500" value="90" oninput="window._ifrUpdate()">'+
            '<span class="slider-value" id="ifrHv">90px</span></div>'+
            '<div class="input-row"><label>縮放:</label>'+
            '<input type="range" id="ifrS" min="5" max="100" value="30" oninput="window._ifrUpdate()">'+
            '<span class="slider-value" id="ifrSv">0.30</span></div>'+
            '<div id="ifrPrevWrap" style="display:none;margin-top:6px;">'+
            '<div class="iframe-align-preview" id="ifrPrevClip">'+
            '<iframe id="ifrPrevFrame" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe>'+
            '</div></div>'+
            '<div style="display:flex;gap:6px;margin-top:8px;">'+
            '<button onclick="window._ifrPreview()" style="flex:1;background:#6c757d;font-size:11px;padding:6px;">🔍 預覽</button>'+
            '<button onclick="window._ifrApply()" style="flex:1;background:#8e44ad;font-size:11px;padding:6px;">✅ 套用</button>'+
            '</div>';
        container.parentNode.insertBefore(newDiv, container);
    }

    // ===== 更新滑桿值 =====
    window._ifrUpdate = function(){
        iframeOffsetX   = parseInt(document.getElementById('ifrX').value);
        iframeOffsetY   = parseInt(document.getElementById('ifrY').value);
        iframeViewH     = parseInt(document.getElementById('ifrH').value);
        iframeViewScale = parseInt(document.getElementById('ifrS').value) / 100;
        document.getElementById('ifrXv').textContent = iframeOffsetX;
        document.getElementById('ifrYv').textContent = iframeOffsetY;
        document.getElementById('ifrHv').textContent = iframeViewH + 'px';
        document.getElementById('ifrSv').textContent = iframeViewScale.toFixed(2);
        // 更新預覽框尺寸
        var clip = document.getElementById('ifrPrevClip');
        var frame= document.getElementById('ifrPrevFrame');
        if(clip && frame && frame.src && frame.src !== window.location.href){
            clip.style.height = iframeViewH + 'px';
            frame.style.cssText = getIframeStyle();
        }
    };

    // ===== 預覽：用第一個有 URL 的點 =====
    window._ifrPreview = function(){
        var pt = (typeof loadedRedPoints !== 'undefined') && loadedRedPoints.find(function(p){ return p.url; });
        if(!pt){ alert('請先按「顯示圖片」載入資料，再預覽對準效果'); return; }
        var clip  = document.getElementById('ifrPrevClip');
        var frame = document.getElementById('ifrPrevFrame');
        clip.style.height = iframeViewH + 'px';
        frame.style.cssText = getIframeStyle();
        if(frame.src !== pt.url) frame.src = pt.url;
        document.getElementById('ifrPrevWrap').style.display = 'block';
    };

    // ===== 套用到所有 iframe =====
    window._ifrApply = function(){
        // 重建所有 iframe-clip 的樣式（不重新載入 src）
        document.querySelectorAll('.iframe-clip').forEach(function(clip){
            clip.style.height = iframeViewH + 'px';
            var frame = clip.querySelector('iframe');
            if(frame) frame.style.cssText = getIframeStyle();
        });
        if(typeof showToast === 'function') showToast('✅ 已套用對準設定到所有嵌入！');
    };

    // ===== 覆蓋 refreshRedPointsDisplay：使用新的 iframe style =====
    var _origRefresh = (typeof refreshRedPointsDisplay !== 'undefined') ? refreshRedPointsDisplay : null;
    window.refreshRedPointsDisplay = function(){
        if(!_origRefresh) return;
        _origRefresh();
        // 套用當前對準設定到新渲染的 iframe
        document.querySelectorAll('.iframe-clip').forEach(function(clip){
            clip.style.height = iframeViewH + 'px';
            var frame = clip.querySelector('iframe');
            if(frame && !frame.dataset.alignApplied){
                frame.style.cssText = getIframeStyle();
                frame.dataset.alignApplied = '1';
            }
        });
    };

    // ===== 覆蓋 _ifrApply 也重設 =====
    // 讓清空時也重置預覽
    var _origClearAll = (typeof clearAll !== 'undefined') ? clearAll : null;
    window.clearAll = function(){
        if(_origClearAll) _origClearAll();
        document.getElementById('ifrPrevWrap').style.display = 'none';
        var frame = document.getElementById('ifrPrevFrame');
        if(frame) frame.src = '';
    };

})();

/* ─────────────────────────────── */

/* ===== 移除對準 UI，改用固定預設值 ===== */
(function(){
    // 等 DOM 完全就緒後執行
    function applyFixedAlign(){
        // 1. 移除對準面板 UI
        var grp = document.getElementById('iframeAlignGroup');
        if(grp) grp.remove();

        // 2. 固定對準值
        var FIX_X = 208;
        var FIX_Y = 42;
        var FIX_H = 78;
        var FIX_S = 0.40;

        // 3. 產生固定 iframe style
        function fixStyle(){
            var w  = (100 / FIX_S).toFixed(1);
            var h  = Math.ceil(FIX_H / FIX_S + FIX_Y + 100);
            var ml = -(FIX_X * FIX_S).toFixed(1);
            var mt = -(FIX_Y * FIX_S).toFixed(1);
            return 'width:'+w+'%;height:'+h+'px;transform:scale('+FIX_S+');transform-origin:top left;margin-left:'+ml+'px;margin-top:'+mt+'px;';
        }

        // 4. 覆蓋 refreshRedPointsDisplay：套用固定對準
        var _orig = window.refreshRedPointsDisplay;
        window.refreshRedPointsDisplay = function(){
            if(_orig) _orig();
            // 對每個新渲染的 iframe 套用固定 style
            document.querySelectorAll('.iframe-clip').forEach(function(clip){
                clip.style.height = FIX_H + 'px';
                var fr = clip.querySelector('iframe');
                if(fr) fr.style.cssText = fixStyle();
            });
        };

        // 5. 覆蓋 _ifrApply（舊按鈕已被移除，但若有殘留也套用正確值）
        window._ifrApply = function(){
            document.querySelectorAll('.iframe-clip').forEach(function(clip){
                clip.style.height = FIX_H + 'px';
                var fr = clip.querySelector('iframe');
                if(fr) fr.style.cssText = fixStyle();
            });
        };

        // 6. 清空時不需重置 ifrPrevWrap（已移除），覆蓋 clearAll 去掉舊的 DOM 操作
        var _origClear = window.clearAll;
        window.clearAll = function(){
            if(_origClear) _origClear();
        };
    }

    // DOM 已載入則直接執行，否則等待
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', applyFixedAlign);
    } else {
        applyFixedAlign();
    }
})();

/* ─────────────────────────────── */

(function(){
    // ✅ 固定對準參數
    var FX = 208, FY = 42, FH = 78, FS = 0.40;

    function getStyle(){
        var w  = (100 / FS).toFixed(1);
        var h  = Math.ceil(FH / FS + FY + 100);
        var ml = -(FX * FS).toFixed(1);
        var mt = -(FY * FS).toFixed(1);
        return 'width:'+w+'%;height:'+h+'px;transform:scale('+FS+');transform-origin:top left;margin-left:'+ml+'px;margin-top:'+mt+'px;';
    }

    function applyToAll(){
        document.querySelectorAll('.iframe-clip').forEach(function(clip){
            clip.style.height = FH + 'px';
            var f = clip.querySelector('iframe');
            if(f) f.style.cssText = getStyle();
        });
    }

    // 移除 UI 面板
    var panel = document.getElementById('iframeAlignGroup');
    if(panel) panel.remove();

    // 覆蓋 refreshRedPointsDisplay
    var _orig = window.refreshRedPointsDisplay;
    window.refreshRedPointsDisplay = function(){
        if(_orig) _orig();
        applyToAll();
    };

    // clearAll 也要重置（移除舊版 clearAll 裡對不存在元素的操作）
    var _origClear = window.clearAll;
    window.clearAll = function(){
        if(_origClear) _origClear();
    };

    // 頁面載入完後執行一次
    applyToAll();
})();

/* ─────────────────────────────── */

document.getElementById('btnCF').textContent  = 'TFT';
document.getElementById('btnTFT').textContent = 'CF';

/* ─────────────────────────────── */

(function(){
'use strict';

// ════════════════════════════════════════════════
// 1. PRODUCT 座標設定表
//    chipDefs: [{label, x, y, w, h}]  （mm 單位，原點左下）
// ════════════════════════════════════════════════
const REAL_W = 2500, REAL_H = 2200;
const SC = 500 / REAL_W; // 0.2

/** 等分，標籤依欄優先（欄0由下到上排完，再排欄1...） */
function makeColMajorChips(cols, rows, skipSet){
    const cw = REAL_W / cols, rh = REAL_H / rows;
    const skip = new Set(skipSet || []);
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let li = 0;
    const chips = [];
    for(let col = 0; col < cols; col++){
        for(let row = 0; row < rows; row++){
            while(li < ALPHA.length && skip.has(ALPHA[li])) li++;
            if(li >= ALPHA.length) break;
            chips.push({ label: ALPHA[li++], x: col*cw, y: row*rh, w: cw, h: rh });
        }
    }
    return chips;
}

/** M236：8×4=32格，A~Z跳I,O → 24個，再補 2~9 共8個 */
function makeM236Chips(){
    const cols=8, rows=4;
    const cw=REAL_W/cols, rh=REAL_H/rows;
    const LABELS=['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z','2','3','4','5','6','7','8','9'];
    return LABELS.map((label,idx)=>({ label, x:(idx%cols)*cw, y:Math.floor(idx/cols)*rh, w:cw, h:rh }));
}

/** B160(11×6) / B156(12×6)：雙字母標籤 AA,AB...LF / MA~MF，跳I欄用J */
function makeTwoLetterChips(cols, rows){
    const cw=REAL_W/cols, rh=REAL_H/rows;
    // 跳 I：A B C D E F G H J K L M
    const COL_LETTERS='ABCDEFGHJKLM'.slice(0,cols);
    const ROW_LETTERS='ABCDEF'.slice(0,rows);
    const chips=[];
    for(let col=0;col<cols;col++)
        for(let row=0;row<rows;row++)
            chips.push({ label: COL_LETTERS[col]+ROW_LETTERS[row], x:col*cw, y:row*rh, w:cw, h:rh });
    return chips;
}

/** T215HVN03（M21+43Q3共版）：4欄不等寬，4列等高 */
function makeT215Chips(){
    const rh = REAL_H/4;
    const colDefs=[
        {x:0,    w:295,  labels:['A','B','C','D']},
        {x:295,  w:955,  labels:['E','F','G','H']},
        {x:1250, w:285,  labels:['J','K','L','M']},
        {x:1535, w:965,  labels:['N','P','Q','R']},
    ];
    const chips=[];
    colDefs.forEach(col=>col.labels.forEach((label,ri)=>
        chips.push({label, x:col.x, y:ri*rh, w:col.w, h:rh})));
    return chips;
}

/** T430QVN04（43Q4）：左1×2 + 右2×4 = 10格 */
function makeT43Q4Chips(){
    const splitX=560.5;
    const rhL=REAL_H/2, rhR=REAL_H/4;
    const rwR=(REAL_W-splitX)/2;
    const chips=[
        {label:'A',x:0,     y:0,   w:splitX,h:rhL},
        {label:'B',x:0,     y:rhL, w:splitX,h:rhL},
    ];
    const rightLabels=['C','D','E','F','G','H','J','K'];
    let li=0;
    for(let col=0;col<2;col++)
        for(let row=0;row<4;row++)
            chips.push({label:rightLabels[li++], x:splitX+col*rwR, y:row*rhR, w:rwR, h:rhR});
    return chips;
}

/** T430QVN05（43Q5+85共版）：左窄2格 + 右寬2格 */
function makeT43Q5Chips(){
    const splitX=560, rh=REAL_H/2;
    return [
        {label:'A',x:0,      y:0,  w:splitX,       h:rh},
        {label:'B',x:0,      y:rh, w:splitX,       h:rh},
        {label:'C',x:splitX, y:0,  w:REAL_W-splitX,h:rh},
        {label:'D',x:splitX, y:rh, w:REAL_W-splitX,h:rh},
    ];
}

// ────────────────────────────────────────────────
// PRODUCT_CONFIGS
// ────────────────────────────────────────────────
const PRODUCT_CONFIGS = {
    'T550QVN10':{ name:'T550QVN10 (55吋 2×3)', image:'T550QVN10.png',
        chips:makeColMajorChips(2,3,[]),      cols:2, rows:3,
        note:'55吋，2欄×3列，6格 A~F' },
    'M270DAN11':{ name:'M270DAN11 (27吋 4×6)', image:'M270DAN11.png',
        chips:makeColMajorChips(4,6,['I','O']), cols:4, rows:6,
        note:'27吋，4欄×6列，24格（跳I,O）' },
    'M315DVR01':{ name:'M315DVR01 (M315 6×3)', image:'M315DVR01.png',
        chips:makeColMajorChips(6,3,['I','O']), cols:6, rows:3,
        note:'M315，6欄×3列，18格（跳I,O）' },
    'P490QAR01':{ name:'P490QAR01 (P49 4×2)',  image:'P490QAR01.png',
        chips:makeColMajorChips(4,2,[]),      cols:4, rows:2,
        note:'P49，4欄×2列，8格 A~H' },
    'M490AVR01':{ name:'M490AVR01 (M49 2×6)',  image:'M490AVR01.png',
        chips:makeColMajorChips(2,6,['I']),   cols:2, rows:6,
        note:'M49，2欄×6列，12格（跳I）' },
    'M236HVR01':{ name:'M236HVR01 (M236 8×4)', image:'M236HVR01.png',
        chips:makeM236Chips(),                cols:8, rows:4,
        note:'M236，8欄×4列，32格（A~Z跳I,O + 2~9）' },
    'B160UAN04':{ name:'B160UAN04 (160吋 11×6)', image:'B160UAN04.png',
        chips:makeTwoLetterChips(11,6),       cols:11, rows:6,
        note:'160吋，11欄×6列，66格（AA~LF）' },
    'B156HAN02':{ name:'B156HAN02 (156吋 12×6)', image:'B156HAN02.png',
        chips:makeTwoLetterChips(12,6),       cols:12, rows:6,
        note:'156吋，12欄×6列，72格（AA~MF）' },
    'M215HVN02':{ name:'M215HVN02 (M21 5×8)',  image:'M215HVN02.png',
        chips:makeColMajorChips(5,8,['I','O']), cols:5, rows:8,
        note:'M21，5欄×8列，40格（跳I,O）' },
    'T215HVN03':{ name:'T215HVN03 (M21+43Q3 共版)', image:'T215HVN03.png',
        chips:makeT215Chips(),                cols:null, rows:4,
        note:'M21+43Q3 共版，4區×4列，16格' },
    'T430QVN04':{ name:'T430QVN04 (43Q4)',     image:'T430QVN04.png',
        chips:makeT43Q4Chips(),               cols:null, rows:null,
        note:'43Q4，左1×2 + 右2×4，共10格（跳I）' },
    'T430QVN05':{ name:'T430QVN05 (43Q5+85 共版)', image:'T430QVN05.png',
        chips:makeT43Q5Chips(),               cols:null, rows:2,
        note:'43Q5(A,B) + 85吋(C,D) 共版，2欄×2列' },
};

let currentProductKey = 'T550QVN10';
function currentProduct(){ return PRODUCT_CONFIGS[currentProductKey]; }

// ════════════════════════════════════════════════
// 2. getRegion — 依 chipDefs 判斷落點
// ════════════════════════════════════════════════
function getRegion(x, y){
    const chips = currentProduct().chips;
    for(let i=chips.length-1;i>=0;i--){
        const c=chips[i];
        if(x>=c.x && x<c.x+c.w && y>=c.y && y<c.y+c.h) return c.label;
    }
    // fallback: 最近格
    let best=chips[0], bestD=Infinity;
    chips.forEach(c=>{
        const d=Math.hypot(x-(c.x+c.w*.5), y-(c.y+c.h*.5));
        if(d<bestD){bestD=d;best=c;}
    });
    return best.label;
}

// ════════════════════════════════════════════════
// 3. isPointInBounds — 只要在面板內
// ════════════════════════════════════════════════
function isPointInBounds(x, y){
    return x>=0 && x<=REAL_W && y>=0 && y<=REAL_H;
}

// ════════════════════════════════════════════════
// 4. getFilters — checkbox 狀態
// ════════════════════════════════════════════════
function getFilters(){
    const f={};
    currentProduct().chips.forEach(c=>{
        const el=document.getElementById('filter'+c.label);
        f[c.label]=el?el.checked:true;
    });
    return f;
}

// ════════════════════════════════════════════════
// 5. buildFilterUI — 依 chips 動態生成 checkbox
// ════════════════════════════════════════════════
function buildFilterUI(){
    const chips=currentProduct().chips;
    // 記憶舊勾選
    const cur={};
    chips.forEach(c=>{const el=document.getElementById('filter'+c.label); cur[c.label]=el?el.checked:true;});
    // 動態欄數（最多6欄）
    const PER_ROW=Math.min(6, chips.length);
    const fg=document.getElementById('filterGroup');
    if(!fg) return;
    fg.style.gridTemplateColumns=`repeat(${PER_ROW},1fr)`;
    fg.innerHTML=chips.map(c=>
        `<div class="checkbox-item"><input type="checkbox" id="filter${c.label}" ${cur[c.label]!==false?'checked':''} onchange="updateDisplay();refreshRedPointsDisplay();"><label for="filter${c.label}">${c.label}</label></div>`
    ).join('');
    // 標題
    const ft=document.getElementById('filterTitle');
    if(ft) ft.textContent=`🗺️ 區域篩選（${chips.length} 格）`;
}

// ════════════════════════════════════════════════
// 6. drawBackground — 底圖 + 分割線 + 標籤
// ════════════════════════════════════════════════
let _bgImg=null, _bgImgSrc='';

function drawBackground(){
    const isDark=document.body.classList.contains('dark-mode');
    const canvas=document.getElementById('canvas');
    if(!canvas) return;
    const ctx=canvas.getContext('2d');

    ctx.fillStyle=isDark?'#1e1e1e':'#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const prod=currentProduct();

    function drawLines(){
        ctx.save();
        // 分割線（紅色虛線）
        ctx.strokeStyle='rgba(220,50,50,0.5)';
        ctx.lineWidth=1;
        ctx.setLineDash([4,3]);
        const xSet=new Set(), ySet=new Set();
        prod.chips.forEach(c=>{
            xSet.add(c.x); xSet.add(c.x+c.w);
            ySet.add(c.y); ySet.add(c.y+c.h);
        });
        [...xSet].filter(v=>v>0&&v<REAL_W).forEach(xmm=>{
            const cx=xmm*SC;
            ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,canvas.height); ctx.stroke();
        });
        [...ySet].filter(v=>v>0&&v<REAL_H).forEach(ymm=>{
            const cy=canvas.height-ymm*SC;
            ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(canvas.width,cy); ctx.stroke();
        });
        ctx.setLineDash([]);
        // 外框
        ctx.strokeStyle=isDark?'#555':'#aaa';
        ctx.lineWidth=1.5;
        ctx.strokeRect(0.5,0.5,canvas.width-1,canvas.height-1);

        // 每格標籤
        prod.chips.forEach(c=>{
            const cxPx=(c.x+c.w*.5)*SC;
            const cyPx=canvas.height-(c.y+c.h*.5)*SC;
            const fs=Math.max(6, Math.min(c.w*SC*.28, c.h*SC*.28, 16));
            ctx.font=`bold ${fs}px sans-serif`;
            ctx.fillStyle=isDark?'rgba(180,210,255,0.55)':'rgba(0,70,150,0.38)';
            ctx.textAlign='center';
            ctx.textBaseline='middle';
            ctx.fillText(c.label, cxPx, cyPx);
        });
        ctx.restore();
    }

    // 載入底圖
    if(_bgImgSrc===prod.image && _bgImg && _bgImg.complete && _bgImg.naturalWidth>0){
        ctx.globalAlpha=0.4;
        ctx.drawImage(_bgImg,0,0,canvas.width,canvas.height);
        ctx.globalAlpha=1;
        drawLines();
    } else {
        const img=new Image();
        _bgImgSrc=prod.image;
        img.onload=()=>{
            _bgImg=img;
            ctx.globalAlpha=0.4;
            ctx.drawImage(img,0,0,canvas.width,canvas.height);
            ctx.globalAlpha=1;
            drawLines();
            // 底圖載入後觸發完整重繪（含紅點）
            if(typeof updateDisplay==='function') updateDisplay();
        };
        img.onerror=()=>{ _bgImg=null; drawLines(); };
        img.src=prod.image;
        // 先畫線（底圖載入中先呈現格子）
        drawLines();
    }
}

// ════════════════════════════════════════════════
// 7. buildRegionGrid / updateRegionGrid — 動態格子
// ════════════════════════════════════════════════
function buildRegionGrid(){
    const chips=currentProduct().chips;
    const container=document.getElementById('regionGrid');
    if(!container) return;
    const gridCols=currentProduct().cols || Math.min(6, chips.length);
    container.style.gridTemplateColumns=`repeat(${gridCols},1fr)`;
    container.style.gridTemplateRows='';
    container.innerHTML=chips.map(c=>
        `<div class="region-cell" id="cellChip_${c.label}" style="padding:5px 2px;">
            <span class="region-name">${c.label}</span>
            <span class="region-num" id="numChip_${c.label}">0</span>
        </div>`
    ).join('');
}

function updateRegionGrid(){
    const chips=currentProduct().chips;
    const stats={};
    chips.forEach(c=>stats[c.label]=0);
    if(typeof allMarkedIndices!=='undefined'){
        allMarkedIndices.forEach(idx=>{
            if(typeof excludedPoints!=='undefined'&&excludedPoints.has(idx)) return;
            const pt=allPoints[idx];
            const lbl=getRegion(pt.x,pt.y);
            if(stats.hasOwnProperty(lbl)) stats[lbl]++;
        });
    }
    chips.forEach(c=>{
        const numEl=document.getElementById('numChip_'+c.label);
        const cellEl=document.getElementById('cellChip_'+c.label);
        if(numEl) numEl.textContent=stats[c.label];
        if(cellEl) cellEl.style.background=stats[c.label]>0?'rgba(255,105,180,0.25)':'rgba(255,105,180,0.05)';
    });
    const grid=document.getElementById('regionGrid');
    if(grid) grid.style.display='grid';
}

// ════════════════════════════════════════════════
// 8. changeProduct
// ════════════════════════════════════════════════
window.changeProduct=function(){
    const sel=document.getElementById('productSelect');
    if(!sel) return;
    currentProductKey=sel.value;
    _bgImgSrc=''; _bgImg=null;
    buildFilterUI();
    buildRegionGrid();
    if(typeof updateDisplay==='function') updateDisplay();
    const infoEl=document.getElementById('productInfo');
    if(infoEl) infoEl.textContent=currentProduct().note||'';
    if(typeof allMarkedIndices!=='undefined'&&allMarkedIndices.length>0){
        if(typeof refreshRedPointsDisplay==='function') refreshRedPointsDisplay();
        updateRegionGrid();
    }
};

// ════════════════════════════════════════════════
// 9. 注入 PRODUCT 下拉列到 .canvas-container 上方
// ════════════════════════════════════════════════
function injectProductBar(){
    const container=document.querySelector('.canvas-container');
    if(!container||document.getElementById('productSelect')) return;
    const bar=document.createElement('div');
    bar.className='product-bar';
    bar.innerHTML=
        '<label>📦 PRODUCT：</label>'+
        '<select id="productSelect" onchange="changeProduct()">'+
        Object.entries(PRODUCT_CONFIGS).map(([k,v])=>
            `<option value="${k}"${k===currentProductKey?' selected':''}>${v.name}</option>`
        ).join('')+
        '</select>'+
        '<span class="product-info" id="productInfo">'+currentProduct().note+'</span>';
    container.parentNode.insertBefore(bar,container);
}

// ════════════════════════════════════════════════
// 10. 覆蓋原始函式並初始化
// ════════════════════════════════════════════════
function patchAll(){
    window.getRegion         = getRegion;
    window.isPointInBounds   = isPointInBounds;
    window.getFilters        = getFilters;
    window.buildFilterUI     = buildFilterUI;
    window.drawBackground    = drawBackground;
    window.buildRegionGrid   = buildRegionGrid;
    window.updateRegionGrid  = updateRegionGrid;

    injectProductBar();
    buildFilterUI();
    buildRegionGrid();
    if(typeof updateDisplay==='function') updateDisplay();
}

// 等所有原始腳本跑完再覆蓋
if(document.readyState==='complete'){
    setTimeout(patchAll, 80);
} else {
    window.addEventListener('load', ()=>setTimeout(patchAll, 80));
}

})();

/* ─────────────────────────────── */

/* 排版修正：讓 Canvas 自動根據容器寬度縮放 */
(function(){
    function resizeCanvas(){
        var canvas = document.getElementById('canvas');
        if(!canvas) return;
        var container = canvas.closest('.canvas-container');
        if(!container) return;
        // canvas 原始比例 500:440
        var maxW = container.clientWidth - 40; // 扣除 padding
        if(maxW < 300) maxW = 300;
        // 只設 CSS 顯示尺寸，不改 canvas 解析度（會失真）→ 用 max-width:100% 的 CSS 已處理
    }
    if(document.readyState==='complete') resizeCanvas();
    else window.addEventListener('load', resizeCanvas);
    window.addEventListener('resize', resizeCanvas);
})();

/* ─────────────────────────────── */

/* product-bar 是 canvas-container 的前一個 sibling，
   它被插在 .content 裡，所以在 grid 中會佔一個 cell。
   解法：把 product-bar 移到 canvas-container 內部（第一個子元素） */
(function(){
    function fixProductBarPosition(){
        var bar = document.getElementById('productSelect');
        if(!bar) return;
        var productBar = bar.closest('.product-bar');
        if(!productBar) return;
        var canvasContainer = document.querySelector('.canvas-container');
        if(!canvasContainer) return;
        // 已經在 canvas-container 裡了，不用再移
        if(canvasContainer.contains(productBar)) return;
        // 把 product-bar 移到 canvas-container 第一個子節點前
        canvasContainer.insertBefore(productBar, canvasContainer.firstChild);
    }
    if(document.readyState==='complete') fixProductBarPosition();
    else window.addEventListener('load', fixProductBarPosition);
    // patch 也可能在 load 後才跑，多等一下
    setTimeout(fixProductBarPosition, 200);
})();

/* ─────────────────────────────── */

(function(){
'use strict';

const REAL_W = 2500, REAL_H = 2200;
const SC = 500 / REAL_W;

// ── 1. M236：8欄×4列，欄優先（每欄由下到上：A B C D → E F G H → ...）
function makeM236ChipsFixed(){
    const cols=8, rows=4;
    const cw=REAL_W/cols, rh=REAL_H/rows;
    const LABELS=['A','B','C','D','E','F','G','H','J','K','L','M',
                  'N','P','Q','R','S','T','U','V','W','X','Y','Z',
                  '2','3','4','5','6','7','8','9'];
    const chips=[];
    let li=0;
    for(let col=0;col<cols;col++){
        for(let row=0;row<rows;row++){
            chips.push({ label:LABELS[li++], x:col*cw, y:row*rh, w:cw, h:rh });
        }
    }
    return chips;
}

// ── 2. M21：5欄×8列，雙字母欄優先（AA~AH, BA~BH, ..., EA~EH）
function makeM21Chips(){
    const cols=5, rows=8;
    const cw=REAL_W/cols, rh=REAL_H/rows;
    const COL_LETTERS=['A','B','C','D','E'];
    const ROW_LETTERS=['A','B','C','D','E','F','G','H'];
    const chips=[];
    for(let col=0;col<cols;col++){
        for(let row=0;row<rows;row++){
            chips.push({
                label: COL_LETTERS[col]+ROW_LETTERS[row],
                x: col*cw, y: row*rh, w: cw, h: rh
            });
        }
    }
    return chips;
}

// ── 3. T215HVN03（M21+43Q3共版）：同上 makeT215Chips，但底圖改 2143.png
function makeT215ChipsFixed(){
    const rh = REAL_H/4;
    const colDefs=[
        {x:0,    w:295,  labels:['A','B','C','D']},
        {x:295,  w:955,  labels:['E','F','G','H']},
        {x:1250, w:285,  labels:['J','K','L','M']},
        {x:1535, w:965,  labels:['N','P','Q','R']},
    ];
    const chips=[];
    colDefs.forEach(col=>col.labels.forEach((label,ri)=>
        chips.push({label, x:col.x, y:ri*rh, w:col.w, h:rh})));
    return chips;
}

// ── 4. T430QVN04（43Q4）：維持原格局，但線段繪製改為 chip 邊框模式避免跨欄
function makeT43Q4ChipsFixed(){
    const splitX=560.5;
    const rhL=REAL_H/2, rhR=REAL_H/4;
    const rwR=(REAL_W-splitX)/2;
    const chips=[
        {label:'A', x:0,      y:0,    w:splitX, h:rhL},
        {label:'B', x:0,      y:rhL,  w:splitX, h:rhL},
    ];
    const rightLabels=['C','D','E','F','G','H','J','K'];
    let li=0;
    for(let col=0;col<2;col++)
        for(let row=0;row<4;row++)
            chips.push({label:rightLabels[li++], x:splitX+col*rwR, y:row*rhR, w:rwR, h:rhR});
    return chips;
}

// ════════════════════════════════════════════════
// 更新 PRODUCT_CONFIGS（等 patchAll 之後再覆蓋）
// ════════════════════════════════════════════════
function applyChipFixes(){
    if(typeof PRODUCT_CONFIGS === 'undefined'){
        console.warn('[ChipFix] PRODUCT_CONFIGS not ready, retry...');
        return false;
    }

    PRODUCT_CONFIGS['M236HVR01'].chips = makeM236ChipsFixed();
    PRODUCT_CONFIGS['M215HVN02'] = {
        name: 'M215HVN02 (M21 5×8 雙字母)',
        image: 'M215HVN02.png',
        chips: makeM21Chips(),
        cols: 5, rows: 8,
        note: 'M21，5欄×8列，AA~EH（欄優先）'
    };
    PRODUCT_CONFIGS['T215HVN03'].chips  = makeT215ChipsFixed();
    PRODUCT_CONFIGS['T215HVN03'].image  = '2143.png';
    PRODUCT_CONFIGS['T215HVN03'].name   = '2143 (M21+43Q3 共版)';
    PRODUCT_CONFIGS['T430QVN04'].chips  = makeT43Q4ChipsFixed();

    return true;
}

// ════════════════════════════════════════════════
// 改良版 drawBackground：依各 chip 邊框逐段畫線
// 避免不同 chip 群的格線互相跨越
// ════════════════════════════════════════════════
function drawBackgroundFixed(){
    const isDark = document.body.classList.contains('dark-mode');
    const canvas = document.getElementById('canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = isDark ? '#1e1e1e' : '#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    if(typeof PRODUCT_CONFIGS === 'undefined' || typeof currentProductKey === 'undefined') return;
    const prod = PRODUCT_CONFIGS[currentProductKey];
    if(!prod) return;

    let _bgImg=null, _bgImgSrc='';
    // 取上層已存的 _bgImg（在閉包外面，這裡重新宣告一個局部的不影響上層快取）

    function doDrawLines(){
        ctx.save();
        ctx.strokeStyle = 'rgba(210,40,40,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4,3]);

        // 對每個 chip，畫它的 4 條邊（非面板邊緣才畫）
        prod.chips.forEach(chip => {
            const x1 = chip.x * SC;
            const x2 = (chip.x + chip.w) * SC;
            const y1 = canvas.height - chip.y * SC;          // bottom edge of chip (in canvas coords)
            const y2 = canvas.height - (chip.y + chip.h) * SC; // top edge of chip (in canvas coords)

            // 左邊（x1 > 0 才畫）
            if(chip.x > 0.5){
                ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(x1, y1); ctx.stroke();
            }
            // 右邊（x2 < canvas.width 才畫）
            if(chip.x + chip.w < REAL_W - 0.5){
                ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2, y1); ctx.stroke();
            }
            // 底邊（y1 < canvas.height 才畫）
            if(chip.y > 0.5){
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
            }
            // 頂邊（y2 > 0 才畫）
            if(chip.y + chip.h < REAL_H - 0.5){
                ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(x2, y2); ctx.stroke();
            }
        });

        ctx.setLineDash([]);
        // 外框
        ctx.strokeStyle = isDark ? '#666' : '#999';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0.5, 0.5, canvas.width-1, canvas.height-1);

        // 格子標籤
        prod.chips.forEach(c => {
            const cxPx = (c.x + c.w * .5) * SC;
            const cyPx = canvas.height - (c.y + c.h * .5) * SC;
            const fs = Math.max(6, Math.min(c.w*SC*.25, c.h*SC*.25, 14));
            ctx.font = `bold ${fs}px sans-serif`;
            ctx.fillStyle = isDark ? 'rgba(170,205,255,0.6)' : 'rgba(0,60,140,0.4)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(c.label, cxPx, cyPx);
        });
        ctx.restore();
    }

    // 底圖
    const imgSrc = prod.image;
    const img = new Image();
    img.onload = () => {
        ctx.globalAlpha = 0.4;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        doDrawLines();
        if(typeof updateDisplay === 'function') updateDisplay();
    };
    img.onerror = () => { doDrawLines(); };
    img.src = imgSrc;
    doDrawLines(); // 底圖載入前先畫線
}

// ════════════════════════════════════════════════
// 安裝 & 套用
// ════════════════════════════════════════════════
function install(){
    if(!applyChipFixes()) { setTimeout(install, 150); return; }

    // 覆蓋 drawBackground
    window.drawBackground = drawBackgroundFixed;

    // 如果下拉目前選到受影響的產品，立刻重繪
    const affected = new Set(['M236HVR01','M215HVN02','T215HVN03','T430QVN04']);
    if(affected.has(window.currentProductKey)){
        if(typeof buildFilterUI  === 'function') buildFilterUI();
        if(typeof buildRegionGrid === 'function') buildRegionGrid();
        if(typeof updateDisplay   === 'function') updateDisplay();
    }

    // 更新下拉選項文字
    const sel = document.getElementById('productSelect');
    if(sel){
        [...sel.options].forEach(opt => {
            const cfg = PRODUCT_CONFIGS[opt.value];
            if(cfg) opt.textContent = cfg.name;
        });
    }

    // 立刻重繪（不管目前選哪個）
    drawBackgroundFixed();
    console.log('[ChipFix v2] 套用完成');
}

if(document.readyState === 'complete') setTimeout(install, 250);
else window.addEventListener('load', () => setTimeout(install, 250));

})();

/* ─────────────────────────────── */

/* 把 product-bar 移進 canvas-container（如果還在外面的話），
   避免它在 grid 裡多佔一格 */
(function(){
    function fixBar(){
        var sel = document.getElementById('productSelect');
        if(!sel) return;
        var bar = sel.closest('.product-bar');
        if(!bar) return;
        var cc = document.querySelector('.canvas-container');
        if(!cc || cc.contains(bar)) return;   // 已在裡面，不動
        cc.insertBefore(bar, cc.firstChild);
    }
    if(document.readyState === 'complete') fixBar();
    else window.addEventListener('load', fixBar);
    setTimeout(fixBar, 300);
})();

/* ─────────────────────────────── */

(function(){
'use strict';

// ════════════════════════════════════════
// ① 把 product-bar 移進 canvas-container
//    避免它在 grid 多佔一個 cell
// ════════════════════════════════════════
function fixProductBarPos(){
    var sel = document.getElementById('productSelect');
    if(!sel) return;
    var bar = sel.closest('.product-bar');
    if(!bar) return;
    var cc  = document.querySelector('.canvas-container');
    if(!cc || cc.contains(bar)) return;
    cc.insertBefore(bar, cc.firstChild);
}

// ════════════════════════════════════════
// ② 修正後的 chip 生成函式（完整替換）
// ════════════════════════════════════════
var REAL_W = 2500, REAL_H = 2200;
var SC = 500 / REAL_W;   // 0.2

/** M236：8欄×4列=32格
 *  排列：欄優先(左→右)，每欄由下→上
 *  標籤：A B C D ... 跳 I O，再接 2 3 4 5 6 7 8 9
 *  A=最左欄最下格，B=最左欄往上第2格... */
function makeM236Chips(){
    var COLS=8, ROWS=4;
    var cw=REAL_W/COLS, rh=REAL_H/ROWS;
    // 32個標籤：A~Z跳I,O(=24) + 2~9(=8)
    var LABELS=['A','B','C','D','E','F','G','H',
                'J','K','L','M','N','P','Q','R',
                'S','T','U','V','W','X','Y','Z',
                '2','3','4','5','6','7','8','9'];
    var chips=[];
    var li=0;
    // 欄優先，每欄由下→上（row=0在下，row=ROWS-1在上）
    for(var col=0;col<COLS;col++){
        for(var row=0;row<ROWS;row++){
            if(li>=LABELS.length) break;
            chips.push({label:LABELS[li++], x:col*cw, y:row*rh, w:cw, h:rh});
        }
    }
    return chips;
}

/** M21（M215HVN02）：5欄×8列=40格
 *  標籤規則：AA AB AC AD AE AF AG AH（第1欄由下→上）
 *              BA BB BC ...（第2欄）... EA~EH（第5欄）
 *  也就是：欄字母 A~E，列字母 A~H（由下→上）
 *  跳欄字母 I（沒有 IA~IH），沿用 A~E（5欄剛好不到I）*/
function makeM21Chips(){
    var COLS=5, ROWS=8;
    var cw=REAL_W/COLS, rh=REAL_H/ROWS;
    var COL_LETTERS=['A','B','C','D','E'];
    var ROW_LETTERS=['A','B','C','D','E','F','G','H'];
    var chips=[];
    for(var col=0;col<COLS;col++){
        for(var row=0;row<ROWS;row++){
            chips.push({
                label: COL_LETTERS[col]+ROW_LETTERS[row],
                x: col*cw,
                y: row*rh,
                w: cw,
                h: rh
            });
        }
    }
    return chips;
}

/** T43Q4：左欄1×2（A下/B上），右區2欄×4列（C~K跳I）
 *  重點修正：A 和 B 的 h = REAL_H/2，是完整的上下半區
 *  分割線只在 x=splitX（垂直線），左欄不再被水平線切割 */
function makeT43Q4Chips(){
    var splitX=560.5;
    var rhL=REAL_H/2, rhR=REAL_H/4;
    var rwR=(REAL_W-splitX)/2;
    var chips=[
        {label:'A', x:0,      y:0,    w:splitX, h:rhL},   // 左下
        {label:'B', x:0,      y:rhL,  w:splitX, h:rhL},   // 左上
    ];
    var rightLabels=['C','D','E','F','G','H','J','K'];
    var li=0;
    for(var col=0;col<2;col++){
        for(var row=0;row<4;row++){
            chips.push({label:rightLabels[li++],
                x:splitX+col*rwR, y:row*rhR, w:rwR, h:rhR});
        }
    }
    return chips;
}

// ════════════════════════════════════════
// ③ 覆蓋 PRODUCT_CONFIGS 裡受影響的3個產品
// ════════════════════════════════════════
function applyChipFixes(){
    if(typeof PRODUCT_CONFIGS === 'undefined') return;

    // M236：修正排列
    if(PRODUCT_CONFIGS['M236HVR01']){
        PRODUCT_CONFIGS['M236HVR01'].chips = makeM236Chips();
        PRODUCT_CONFIGS['M236HVR01'].cols  = 8;
    }

    // M21：新標籤系統 AA~EH
    if(PRODUCT_CONFIGS['M215HVN02']){
        PRODUCT_CONFIGS['M215HVN02'].chips = makeM21Chips();
        PRODUCT_CONFIGS['M215HVN02'].note  = 'M21，5欄×8列，40格（AA~EH）';
    }

    // T215HVN03：底圖改用 2143.png
    if(PRODUCT_CONFIGS['T215HVN03']){
        PRODUCT_CONFIGS['T215HVN03'].image = '2143.png';
    }

    // T43Q4：A/B 不再被橫線切割
    if(PRODUCT_CONFIGS['T430QVN04']){
        PRODUCT_CONFIGS['T430QVN04'].chips = makeT43Q4Chips();
        PRODUCT_CONFIGS['T430QVN04'].note  = '43Q4：左A(下)/B(上) + 右2×4共8格（C~K跳I）';
    }

    // 如果當前選中的是被改到的產品，強制重繪
    var selEl = document.getElementById('productSelect');
    if(selEl){
        var cur = selEl.value;
        if(['M236HVR01','M215HVN02','T215HVN03','T430QVN04'].indexOf(cur) !== -1){
            if(typeof buildFilterUI    === 'function') buildFilterUI();
            if(typeof buildRegionGrid  === 'function') buildRegionGrid();
            if(typeof updateDisplay    === 'function') updateDisplay();
        }
    }
}

// ════════════════════════════════════════
// ④ 執行時序：等所有 patch 跑完再蓋
// ════════════════════════════════════════
function runAll(){
    fixProductBarPos();
    applyChipFixes();
}
if(document.readyState === 'complete'){
    setTimeout(runAll, 150);
} else {
    window.addEventListener('load', function(){ setTimeout(runAll, 150); });
}

})();

/* ─────────────────────────────── */

/* =====================================================================
   DEFINITIVE PATCH v5
   - 重建完整 PRODUCT_CONFIGS（含正確 chip 邏輯）並暴露至 window
   - 覆蓋 getRegion / getFilters / buildFilterUI / buildRegionGrid /
     updateRegionGrid / drawBackground / changeProduct
   - 修正 product-bar 位置
   ===================================================================== */
(function(){
'use strict';

var RW = 2500, RH = 2200, SC = 500/2500;  // 0.2

/* ──────────────────────────────────────────────
   chip 生成函式
   ────────────────────────────────────────────── */

// 欄優先（col 0 由下→上排完，再 col 1...），可跳標籤
function colMajor(cols, rows, skipSet){
    var cw=RW/cols, rh=RH/rows;
    var skip=new Set(skipSet||[]);
    var ALPHA='ABCDEFGHJKLMNPQRSTUVWXYZ';
    var li=0, chips=[];
    for(var col=0;col<cols;col++){
        for(var row=0;row<rows;row++){
            while(li<ALPHA.length && skip.has(ALPHA[li])) li++;
            if(li>=ALPHA.length) break;
            chips.push({label:ALPHA[li++], x:col*cw, y:row*rh, w:cw, h:rh});
        }
    }
    return chips;
}

// M236：8欄×4列，欄優先，A~Z跳I,O + 2~9
function makeM236(){
    var cols=8, rows=4, cw=RW/cols, rh=RH/rows;
    var L=['A','B','C','D','E','F','G','H',
           'J','K','L','M','N','P','Q','R',
           'S','T','U','V','W','X','Y','Z',
           '2','3','4','5','6','7','8','9'];
    // 欄優先(左→右)，每欄由下→上(row=0最下)
    var chips=[], li=0;
    for(var col=0;col<cols;col++)
        for(var row=0;row<rows;row++)
            chips.push({label:L[li++], x:col*cw, y:row*rh, w:cw, h:rh});
    return chips;
}

// M21：5欄×8列，雙字母欄優先 AA~AH → BA~BH → ... → EA~EH
function makeM21(){
    var cols=5, rows=8, cw=RW/cols, rh=RH/rows;
    var CL=['A','B','C','D','E'];
    var RL=['A','B','C','D','E','F','G','H'];
    var chips=[];
    for(var col=0;col<cols;col++)
        for(var row=0;row<rows;row++)
            chips.push({label:CL[col]+RL[row], x:col*cw, y:row*rh, w:cw, h:rh});
    return chips;
}

// B160(11×6) / B156(12×6)：雙字母 AA~LF / AA~MF，跳 I欄用 J
function makeTwoLetter(cols, rows){
    var cw=RW/cols, rh=RH/rows;
    var CL='ABCDEFGHJKLM'.slice(0,cols);
    var RL='ABCDEF'.slice(0,rows);
    var chips=[];
    for(var col=0;col<cols;col++)
        for(var row=0;row<rows;row++)
            chips.push({label:CL[col]+RL[row], x:col*cw, y:row*rh, w:cw, h:rh});
    return chips;
}

// T215HVN03（M21+43Q3 共版）：4欄不等寬×4列等高
function makeT215(){
    var rh=RH/4;
    var defs=[
        {x:0,    w:295,  labels:['A','B','C','D']},
        {x:295,  w:955,  labels:['E','F','G','H']},
        {x:1250, w:285,  labels:['J','K','L','M']},
        {x:1535, w:965,  labels:['N','P','Q','R']},
    ];
    var chips=[];
    defs.forEach(function(d){
        d.labels.forEach(function(lbl,ri){
            chips.push({label:lbl, x:d.x, y:ri*rh, w:d.w, h:rh});
        });
    });
    return chips;
}

// T430QVN04（43Q4）：左 A(下半)/B(上半) + 右 2欄×4列 C~K跳I
function makeT43Q4(){
    var spX=560.5, rhL=RH/2, rhR=RH/4, rwR=(RW-560.5)/2;
    var chips=[
        {label:'A', x:0,   y:0,   w:spX, h:rhL},
        {label:'B', x:0,   y:rhL, w:spX, h:rhL},
    ];
    var RL=['C','D','E','F','G','H','J','K'];
    var li=0;
    for(var col=0;col<2;col++)
        for(var row=0;row<4;row++)
            chips.push({label:RL[li++], x:spX+col*rwR, y:row*rhR, w:rwR, h:rhR});
    return chips;
}

// T430QVN05（43Q5+85 共版）：左窄2格 + 右寬2格
function makeT43Q5(){
    var spX=560, rh=RH/2;
    return [
        {label:'A',x:0,   y:0,  w:spX,    h:rh},
        {label:'B',x:0,   y:rh, w:spX,    h:rh},
        {label:'C',x:spX, y:0,  w:RW-spX, h:rh},
        {label:'D',x:spX, y:rh, w:RW-spX, h:rh},
    ];
}

/* ──────────────────────────────────────────────
   PRODUCT_CONFIGS（完整版，暴露至 window）
   ────────────────────────────────────────────── */
window.PRODUCT_CONFIGS = {
    'T550QVN10':{ name:'T550QVN10 (55吋 2×3)',     image:'T550QVN10.png',  chips:colMajor(2,3,[]),       cols:2,  rows:3,  note:'55吋，2欄×3列，6格 A~F' },
    'M270DAN11':{ name:'M270DAN11 (27吋 4×6)',     image:'M270DAN11.png',  chips:colMajor(4,6,['I','O']),cols:4,  rows:6,  note:'27吋，4欄×6列，24格（跳I,O）' },
    'M315DVR01':{ name:'M315DVR01 (M315 6×3)',     image:'M315DVR01.png',  chips:colMajor(6,3,['I','O']),cols:6,  rows:3,  note:'M315，6欄×3列，18格（跳I,O）' },
    'P490QAR01':{ name:'P490QAR01 (P49 4×2)',      image:'P490QAR01.png',  chips:colMajor(4,2,[]),       cols:4,  rows:2,  note:'P49，4欄×2列，8格 A~H' },
    'M490AVR01':{ name:'M490AVR01 (M49 2×6)',      image:'M490AVR01.png',  chips:colMajor(2,6,['I']),    cols:2,  rows:6,  note:'M49，2欄×6列，12格（跳I）' },
    'M236HVR01':{ name:'M236HVR01 (M236 8×4)',     image:'M236HVR01.png',  chips:makeM236(),             cols:8,  rows:4,  note:'M236，8欄×4列，32格（A→欄優先由下到上）' },
    'B160UAN04':{ name:'B160UAN04 (160吋 11×6)',   image:'B160UAN04.png',  chips:makeTwoLetter(11,6),    cols:11, rows:6,  note:'160吋，11欄×6列，AA~LF' },
    'B156HAN02':{ name:'B156HAN02 (156吋 12×6)',   image:'B156HAN02.png',  chips:makeTwoLetter(12,6),    cols:12, rows:6,  note:'156吋，12欄×6列，AA~MF' },
    'M215HVN02':{ name:'M215HVN02 (M21 5×8)',      image:'M215HVN02.png',  chips:makeM21(),              cols:5,  rows:8,  note:'M21，5欄×8列，AA~EH（欄優先由下→上）' },
    'T215HVN03':{ name:'2143 (M21+43Q3 共版)',      image:'2143.png',       chips:makeT215(),             cols:null,rows:4, note:'M21+43Q3 共版，4區×4列，16格' },
    'T430QVN04':{ name:'T430QVN04 (43Q4)',          image:'T430QVN04.png',  chips:makeT43Q4(),            cols:null,rows:null,note:'43Q4：左A(下)/B(上) + 右2×4(C~K)' },
    'T430QVN05':{ name:'T430QVN05 (43Q5+85 共版)', image:'T430QVN05.png',  chips:makeT43Q5(),            cols:null,rows:2,  note:'43Q5(A,B) + 85吋(C,D) 共版' },
};

window.currentProductKey = window.currentProductKey || 'T550QVN10';

/* ──────────────────────────────────────────────
   核心函式（全部覆蓋）
   ────────────────────────────────────────────── */

window.getRegion = function(x, y){
    var chips = window.PRODUCT_CONFIGS[window.currentProductKey].chips;
    for(var i=chips.length-1;i>=0;i--){
        var c=chips[i];
        if(x>=c.x && x<c.x+c.w && y>=c.y && y<c.y+c.h) return c.label;
    }
    var best=chips[0], bd=Infinity;
    chips.forEach(function(c){
        var d=Math.hypot(x-(c.x+c.w*.5), y-(c.y+c.h*.5));
        if(d<bd){bd=d;best=c;}
    });
    return best.label;
};

window.isPointInBounds = function(x, y){
    return x>=0 && x<=RW && y>=0 && y<=RH;
};

window.getFilters = function(){
    var f={};
    window.PRODUCT_CONFIGS[window.currentProductKey].chips.forEach(function(c){
        var el=document.getElementById('filter'+c.label);
        f[c.label]=el?el.checked:true;
    });
    return f;
};

window.buildFilterUI = function(){
    var chips = window.PRODUCT_CONFIGS[window.currentProductKey].chips;
    var cur={};
    chips.forEach(function(c){var el=document.getElementById('filter'+c.label);cur[c.label]=el?el.checked:true;});
    var fg=document.getElementById('filterGroup');
    if(!fg) return;
    var PER_ROW=Math.min(6,chips.length);
    fg.style.gridTemplateColumns='repeat('+PER_ROW+',1fr)';
    fg.innerHTML=chips.map(function(c){
        return '<div class="checkbox-item"><input type="checkbox" id="filter'+c.label+'" '+(cur[c.label]!==false?'checked':'')+' onchange="updateDisplay();refreshRedPointsDisplay();"><label for="filter'+c.label+'">'+c.label+'</label></div>';
    }).join('');
    var ft=document.getElementById('filterTitle');
    if(ft) ft.textContent='🗺️ 區域篩選（'+chips.length+' 格）';
};

window.buildRegionGrid = function(){
    var chips=window.PRODUCT_CONFIGS[window.currentProductKey].chips;
    var container=document.getElementById('regionGrid');
    if(!container) return;
    var cfg=window.PRODUCT_CONFIGS[window.currentProductKey];
    var gridCols=cfg.cols||Math.min(6,chips.length);
    container.style.gridTemplateColumns='repeat('+gridCols+',1fr)';
    container.style.gridTemplateRows='';
    container.innerHTML=chips.map(function(c){
        return '<div class="region-cell" id="cellChip_'+c.label+'" style="padding:5px 2px;"><span class="region-name">'+c.label+'</span><span class="region-num" id="numChip_'+c.label+'">0</span></div>';
    }).join('');
};

window.updateRegionGrid = function(){
    var chips=window.PRODUCT_CONFIGS[window.currentProductKey].chips;
    var stats={};
    chips.forEach(function(c){stats[c.label]=0;});
    if(typeof allMarkedIndices!=='undefined'){
        allMarkedIndices.forEach(function(idx){
            if(typeof excludedPoints!=='undefined'&&excludedPoints.has(idx)) return;
            var pt=allPoints[idx];
            var lbl=window.getRegion(pt.x,pt.y);
            if(stats.hasOwnProperty(lbl)) stats[lbl]++;
        });
    }
    chips.forEach(function(c){
        var n=document.getElementById('numChip_'+c.label);
        var cell=document.getElementById('cellChip_'+c.label);
        if(n) n.textContent=stats[c.label];
        if(cell) cell.style.background=stats[c.label]>0?'rgba(255,105,180,0.25)':'rgba(255,105,180,0.05)';
    });
    var g=document.getElementById('regionGrid');
    if(g) g.style.display='grid';
};

var _bgCache={};
window.drawBackground = function(){
    var isDark=document.body.classList.contains('dark-mode');
    var canvas=document.getElementById('canvas');
    if(!canvas) return;
    var ctx=canvas.getContext('2d');
    ctx.fillStyle=isDark?'#1e1e1e':'#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    var key=window.currentProductKey;
    var prod=window.PRODUCT_CONFIGS[key];
    if(!prod) return;

    function drawLines(){
        ctx.save();
        ctx.strokeStyle='rgba(210,40,40,0.55)';
        ctx.lineWidth=1;
        ctx.setLineDash([4,3]);
        // 每個 chip 各畫自己的邊（只畫內部邊，跳過面板邊緣）
        prod.chips.forEach(function(c){
            var x1=c.x*SC, x2=(c.x+c.w)*SC;
            var y1=canvas.height-c.y*SC, y2=canvas.height-(c.y+c.h)*SC;
            if(c.x>0.5){ctx.beginPath();ctx.moveTo(x1,y2);ctx.lineTo(x1,y1);ctx.stroke();}
            if(c.x+c.w<RW-0.5){ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2,y1);ctx.stroke();}
            if(c.y>0.5){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y1);ctx.stroke();}
            if(c.y+c.h<RH-0.5){ctx.beginPath();ctx.moveTo(x1,y2);ctx.lineTo(x2,y2);ctx.stroke();}
        });
        ctx.setLineDash([]);
        ctx.strokeStyle=isDark?'#666':'#999';
        ctx.lineWidth=1.5;
        ctx.strokeRect(0.5,0.5,canvas.width-1,canvas.height-1);
        prod.chips.forEach(function(c){
            var cx=(c.x+c.w*.5)*SC, cy=canvas.height-(c.y+c.h*.5)*SC;
            var fs=Math.max(6,Math.min(c.w*SC*.25,c.h*SC*.25,14));
            ctx.font='bold '+fs+'px sans-serif';
            ctx.fillStyle=isDark?'rgba(170,205,255,0.6)':'rgba(0,60,140,0.4)';
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(c.label,cx,cy);
        });
        ctx.restore();
    }

    var imgSrc=prod.image;
    if(_bgCache[imgSrc] && _bgCache[imgSrc].complete && _bgCache[imgSrc].naturalWidth>0){
        ctx.globalAlpha=0.4;
        ctx.drawImage(_bgCache[imgSrc],0,0,canvas.width,canvas.height);
        ctx.globalAlpha=1;
        drawLines();
    } else {
        drawLines(); // 先畫線
        var img=new Image();
        img.onload=function(){
            _bgCache[imgSrc]=img;
            ctx.fillStyle=isDark?'#1e1e1e':'#ffffff';
            ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.globalAlpha=0.4;
            ctx.drawImage(img,0,0,canvas.width,canvas.height);
            ctx.globalAlpha=1;
            drawLines();
            if(typeof updateDisplay==='function') updateDisplay();
        };
        img.onerror=function(){drawLines();};
        img.src=imgSrc;
    }
};

window.changeProduct = function(){
    var sel=document.getElementById('productSelect');
    if(!sel) return;
    window.currentProductKey=sel.value;
    window.buildFilterUI();
    window.buildRegionGrid();
    var info=document.getElementById('productInfo');
    if(info) info.textContent=(window.PRODUCT_CONFIGS[window.currentProductKey].note||'');
    if(typeof updateDisplay==='function') updateDisplay();
    if(typeof allMarkedIndices!=='undefined'&&allMarkedIndices.length>0){
        if(typeof refreshRedPointsDisplay==='function') refreshRedPointsDisplay();
        window.updateRegionGrid();
    }
};

/* ──────────────────────────────────────────────
   注入 / 更新 product-bar 下拉選單
   ────────────────────────────────────────────── */
function setupProductBar(){
    var sel=document.getElementById('productSelect');
    var cc=document.querySelector('.canvas-container');
    if(!cc) return;

    if(!sel){
        // 全新建立
        var bar=document.createElement('div');
        bar.className='product-bar';
        bar.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-secondary);border-radius:4px;margin-bottom:8px;flex-wrap:wrap;';
        bar.innerHTML=
            '<label style="font-size:13px;font-weight:700;">📦 PRODUCT：</label>'+
            '<select id="productSelect" onchange="changeProduct()" style="padding:5px 10px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--input-bg);color:var(--text-primary);cursor:pointer;min-width:200px;">'+
            Object.entries(window.PRODUCT_CONFIGS).map(function(e){
                return '<option value="'+e[0]+'"'+(e[0]===window.currentProductKey?' selected':'')+'>'+e[1].name+'</option>';
            }).join('')+
            '</select>'+
            '<span id="productInfo" style="font-size:11px;color:var(--text-secondary);">'+
            (window.PRODUCT_CONFIGS[window.currentProductKey].note||'')+
            '</span>';
        cc.insertBefore(bar, cc.firstChild);
    } else {
        // 已存在：確保在 canvas-container 裡
        var bar2=sel.closest('.product-bar');
        if(bar2 && !cc.contains(bar2)){
            cc.insertBefore(bar2, cc.firstChild);
        }
        // 更新選項文字
        Array.from(sel.options).forEach(function(opt){
            var cfg=window.PRODUCT_CONFIGS[opt.value];
            if(cfg) opt.textContent=cfg.name;
        });
    }
}

/* ──────────────────────────────────────────────
   初始化：等所有前面的 patch 跑完再蓋
   ────────────────────────────────────────────── */
function init(){
    setupProductBar();
    window.buildFilterUI();
    window.buildRegionGrid();
    if(typeof updateDisplay==='function') updateDisplay();
    console.log('[v5] 初始化完成，currentProduct='+window.currentProductKey);
}

if(document.readyState==='complete') setTimeout(init,200);
else window.addEventListener('load',function(){setTimeout(init,200);});

})();

/* ─────────────────────────────── */

(function(){
'use strict';

var QUERY_URL  = 'http://tw100049089/L8BN0/PI_Image/PI_All_Image_Query.aspx';
var IMAGE_BASE = 'http://tw100049089/L8BN0/PI_Image/PI_Insp_Image.aspx';

/* ── 建立面板 ── */
function buildSmartPastePanel(){
    var controls = document.querySelector('.controls');
    if(!controls) return;
    if(document.getElementById('smartPastePanel')) return; // 已建立

    var panel = document.createElement('div');
    panel.id = 'smartPastePanel';
    panel.innerHTML =
        '<div class="sp-header" onclick="toggleSpPanel()">' +
            '<span>📋 智慧貼上查詢結果</span>' +
            '<span id="spToggleIcon">▼</span>' +
        '</div>' +
        '<div id="spBody">' +
            '<div class="sp-step">' +
                '① 點下方連結開啟查詢頁面（另開分頁）<br>' +
                '② 輸入條件 → Query → <strong>選取所有結果列</strong> → <kbd>Ctrl+C</kbd><br>' +
                '③ 點下方貼上框 → <kbd>Ctrl+V</kbd> → 按「匯入並標點」' +
            '</div>' +
            '<a class="sp-query-link" href="' + QUERY_URL + '" target="_blank">' +
                '🔗 開啟 PI_All_Image_Query →' +
            '</a>' +
            '<div style="margin-top:8px;">' +
                '<textarea id="spPasteArea" placeholder="貼上從查詢結果複製的文字（支援直接從網頁表格複製）…\n\n範例（從網頁複製的格式）：\nPI INSP  2026/08/23  KA6K85A73  CKPIC400  40598  1818413\nPI INSP  2026/08/23  KA6K85A73  CKPIC400  80871  1927740\n\n也支援原本的手動格式：\nKA6K85A73|http://...  CKPIC400  40598  1818413"></textarea>' +
            '</div>' +
            '<div class="sp-btn-row">' +
                '<button id="spImportBtn" onclick="spImport()">⬇️ 匯入並標點</button>' +
                '<button id="spClearBtn"  onclick="spClearAll()">🗑️ 清除</button>' +
            '</div>' +
            '<div id="spStatus"></div>' +
        '</div>';

    controls.insertBefore(panel, controls.firstChild);

    // 也把 aqPanel 隱藏（已確認無用）
    var aq = document.getElementById('autoQueryPanel');
    if(aq) aq.style.display = 'none';

    // Ctrl+V 自動觸發匯入（貼入後 500ms）
    var ta = document.getElementById('spPasteArea');
    if(ta){
        ta.addEventListener('paste', function(){
            setTimeout(spImport, 500);
        });
    }
}

window.toggleSpPanel = function(){
    var b = document.getElementById('spBody');
    var i = document.getElementById('spToggleIcon');
    if(!b) return;
    var open = b.style.display !== 'none' && b.style.display !== '';
    b.style.display = open ? 'none' : 'block';
    i.textContent   = open ? '▶' : '▼';
};

function setSpStatus(msg, type){
    var el = document.getElementById('spStatus');
    if(!el) return;
    el.textContent = msg; el.className = type||'';
    el.style.display = msg ? 'block' : 'none';
}

/* ── 智慧解析：同時支援兩種格式 ── */
//  格式A（網頁複製）：PI INSP \t 2026/08/23 \t KA6K... \t CKPIC400 \t 40598 \t 1818413
//  格式B（手動）    ：KA6K...|http://... \t CKPIC400 \t 40598 \t 1818413
function parseSmartPaste(raw){
    var lines = raw.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
    var results = [], skipped = [];

    lines.forEach(function(line, li){
        // 分割（tab 或多空格）
        var cols = line.split(/\t/);
        if(cols.length < 2) cols = line.split(/  +/);

        var sheetID='', href='', lineID='', x=NaN, y=NaN, mfgDay='';

        if(cols.length >= 6 && !cols[0].includes('|')){
            // ── 格式A：6欄，網頁複製 ──
            // cols: [照片來源, MFG_DAY, SHEET_ID, LINE_ID, X_CORD, Y_CORD]
            mfgDay  = cols[1].trim();
            sheetID = cols[2].trim();
            lineID  = cols[3].trim();
            x       = parseFloat(cols[4]);
            y       = parseFloat(cols[5]);
            href    = IMAGE_BASE + '?SHEET_ID=' + encodeURIComponent(sheetID) +
                      '&MFG_DAY=' + encodeURIComponent(mfgDay) +
                      '&X_CORD=' + x + '&Y_CORD=' + y;
        } else if(cols.length >= 4 && cols[0].includes('|')){
            // ── 格式B：手動格式 ──
            var part0 = cols[0].split('|');
            sheetID = part0[0].trim();
            href    = part0[1] ? part0[1].trim() : '';
            lineID  = cols[1].trim();
            x       = parseFloat(cols[2]);
            y       = parseFloat(cols[3]);
            // 從 URL 補 mfgDay
            var m = href.match(/MFG_DAY=([^&]+)/);
            mfgDay = m ? decodeURIComponent(m[1]) : '';
        } else if(cols.length >= 4){
            // ── 格式C：可能是 4 欄，沒有前兩欄 ──
            sheetID = cols[0].trim();
            lineID  = cols[1].trim();
            x       = parseFloat(cols[2]);
            y       = parseFloat(cols[3]);
        } else {
            skipped.push('第' + (li+1) + '行：欄數不足（' + cols.length + ' 欄）');
            return;
        }

        if(isNaN(x) || isNaN(y)){
            skipped.push('第' + (li+1) + '行：X/Y 非數字（' + cols.slice(-2) + '）');
            return;
        }

        results.push({ sheetID:sheetID, href:href, lineID:lineID, x:x, y:y, mfgDay:mfgDay });
    });

    return { ok: results, skip: skipped };
}

/* ── 匯入並標點 ── */
window.spImport = function(){
    var ta = document.getElementById('spPasteArea');
    if(!ta || !ta.value.trim()){ setSpStatus('⚠️ 請先貼上查詢結果', 'warn'); return; }

    var parsed = parseSmartPaste(ta.value);
    var pts = parsed.ok;

    if(pts.length === 0){
        setSpStatus('❌ 解析不到有效資料，請確認格式\n' + parsed.skip.slice(0,5).join('\n'), 'err');
        return;
    }

    // 轉成格式B 貼入原本的 textarea（觸發原有匯入流程）
    var formatted = pts.map(function(p){
        return p.sheetID + '|' + p.href + '\t' + p.lineID + '\t' + p.x + '\t' + p.y;
    }).join('\n');

    // 找原本資料 textarea（排除 spPasteArea）
    var origTA = Array.from(document.querySelectorAll('textarea')).find(function(t){
        return t.id !== 'spPasteArea';
    });

    if(origTA){
        origTA.value = formatted;
        // 觸發原匯入按鈕
        var importBtn = Array.from(document.querySelectorAll('button')).find(function(b){
            return b.id !== 'spImportBtn' && b.id !== 'spClearBtn' && b.id !== 'aqFetchBtn' && b.id !== 'aqClearBtn' &&
                   (b.textContent.includes('匯入') || b.textContent.includes('載入') || b.textContent.includes('Import'));
        });
        if(importBtn){
            importBtn.click();
        } else {
            // fallback：呼叫全域函式
            ['importData','parseAndPlot','loadData','submitData'].forEach(function(fn){
                if(typeof window[fn]==='function') window[fn]();
            });
        }
    }

    var msg = '✅ 成功解析 ' + pts.length + ' 筆並標點！';
    if(parsed.skip.length > 0)
        msg += '\n⚠️ 跳過 ' + parsed.skip.length + ' 筆：\n' + parsed.skip.slice(0,3).join('\n') +
               (parsed.skip.length>3 ? '\n…（共' + parsed.skip.length + '筆）' : '');
    setSpStatus(msg, 'ok');
};

/* ── 清除 ── */
window.spClearAll = function(){
    var ta = document.getElementById('spPasteArea');
    if(ta) ta.value = '';
    setSpStatus('', '');
    if(typeof window.allMarkedIndices !== 'undefined') window.allMarkedIndices = [];
    if(typeof window.excludedPoints   !== 'undefined') window.excludedPoints   = new Set();
    if(typeof window.updateDisplay    === 'function')  window.updateDisplay();
    if(typeof window.updateRegionGrid === 'function')  window.updateRegionGrid();
    var origTA = document.getElementById('dataInput') || Array.from(document.querySelectorAll('textarea')).find(function(t){ return t.id !== 'spPasteArea' && t.id !== 'bqSheetID'; });
    if(origTA) origTA.value = '';
};

/* ── init ── */
if(document.readyState === 'complete') buildSmartPastePanel();
else window.addEventListener('load', buildSmartPastePanel);

})();

/* ─────────────────────────────── */

(function(){
'use strict';

/* ══════════════════════════════════════════════
   書籤小程式原始碼（minified）
   ── 在查詢頁執行 → 讀表格第1~6欄 → 存剪貼簿
   ══════════════════════════════════════════════ */
var BOOKMARKLET_SRC = (function(){
    var code = [
        '(function(){',
        '  var trs=document.querySelectorAll("table tr"),lines=[];',
        '  trs.forEach(function(tr){',
        '    var tds=tr.querySelectorAll("td");',
        '    if(tds.length<6)return;',
        '    var r=Array.from(tds).map(function(t){return t.textContent.trim();});',
        '    lines.push(r.join("\\t"));',
        '  });',
        '  if(!lines.length){alert("找不到查詢結果，請先按 Query");return;}',
        '  var txt=lines.join("\\n");',
        '  navigator.clipboard.writeText(txt).then(function(){',
        '    var msg="✅ 已複製 "+lines.length+" 筆到剪貼簿！\\n請切回 PI_Insp_Map，點「📥 從剪貼簿匯入」";',
        '    var d=document.createElement("div");',
        '    d.style.cssText="position:fixed;top:16px;left:50%;transform:translateX(-50%);'+
        'z-index:99999;background:#107c10;color:#fff;padding:10px 20px;border-radius:8px;'+
        'font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,.3)";',
        '    d.textContent=msg.split("\\n")[0];',
        '    document.body.appendChild(d);',
        '    setTimeout(function(){d.remove();},3000);',
        '  },function(){',
        '    prompt("複製失敗，請手動複製以下文字：",txt);',
        '  });',
        '})()'
    ].join('');
    return 'javascript:' + encodeURIComponent(code);
})();

/* ── 在智慧貼上面板加「從剪貼簿匯入」按鈕 ── */
function addClipboardBtn(){
    var btnRow = document.querySelector('.sp-btn-row');
    if(!btnRow || document.getElementById('spClipboardBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'spClipboardBtn';
    btn.textContent = '📥 從剪貼簿匯入';
    btn.title = '點書籤複製查詢結果後，用此鈕直接匯入（免貼上）';
    btn.onclick = function(){ spImportFromClipboard(); };
    btnRow.insertBefore(btn, btnRow.firstChild);
}

/* ── 從剪貼簿讀取並匯入 ── */
window.spImportFromClipboard = function(){
    if(!navigator.clipboard || !navigator.clipboard.readText){
        setSpStatus('⚠️ 瀏覽器不支援剪貼簿讀取 API（請改用 Ctrl+V 貼入框）', 'warn');
        return;
    }
    navigator.clipboard.readText().then(function(text){
        if(!text || !text.trim()){
            setSpStatus('⚠️ 剪貼簿是空的，請先在查詢頁點書籤「複製 PI 查詢」', 'warn');
            return;
        }
        var ta = document.getElementById('spPasteArea');
        if(ta) ta.value = text;
        window.spImport();
    }).catch(function(e){
        setSpStatus('❌ 無法讀取剪貼簿：' + e.message + '\n請改用 Ctrl+V 貼入下方框', 'err');
    });
};

/* ── 建立書籤安裝說明面板 ── */
function buildBookmarkletPanel(){
    var spPanel = document.getElementById('smartPastePanel');
    if(!spPanel || document.getElementById('bookmarkletPanel')) return;

    var panel = document.createElement('div');
    panel.id = 'bookmarkletPanel';
    panel.innerHTML =
        '<div class="bm-header" onclick="toggleBmPanel()">' +
            '🔖 安裝「複製 PI 查詢」書籤（一次設定，長久使用）' +
            '<span id="bmIcon" style="margin-left:auto;font-size:11px;">▶ 展開說明</span>' +
        '</div>' +
        '<div id="bmBody">' +
            '<div class="bm-step">① <strong>確認瀏覽器書籤列已顯示</strong>（Ctrl+Shift+B）</div>' +
            '<div class="bm-step">② 把下方綠色按鈕<strong>拖曳到書籤列</strong>（或右鍵 → 加入書籤）：</div>' +
            '<a id="bmDragLink" href="' + BOOKMARKLET_SRC + '">📋 複製 PI 查詢</a>' +
            '<div class="bm-step">③ <strong>使用方法</strong>：</div>' +
            '<div class="bm-step" style="padding-left:14px;">' +
                '→ 開啟 PI_All_Image_Query，輸入條件 → Query<br>' +
                '→ 點書籤列的「📋 複製 PI 查詢」<br>' +
                '→ 看到「✅ 已複製 N 筆」提示<br>' +
                '→ 切回本頁，點「<strong>📥 從剪貼簿匯入</strong>」→ 自動標點！' +
            '</div>' +
            '<div class="bm-note">⚠️ 注意：書籤只在 PI_All_Image_Query 結果頁有效；若瀏覽器詢問剪貼簿權限請點「允許」</div>' +
        '</div>';

    spPanel.after(panel);
}

window.toggleBmPanel = function(){
    var b = document.getElementById('bmBody');
    var i = document.getElementById('bmIcon');
    if(!b) return;
    var open = b.style.display === 'block';
    b.style.display = open ? 'none' : 'block';
    i.textContent   = open ? '▶ 展開說明' : '▼ 收合';
};

/* ── setSpStatus proxy（確保可以呼叫）── */
window._setSpStatus = window._setSpStatus || function(msg,type){
    var el=document.getElementById('spStatus');
    if(!el)return;
    el.textContent=msg; el.className=type||'';
    el.style.display=msg?'block':'none';
};

function setSpStatus(msg,type){ window._setSpStatus(msg,type); }

/* ── init ── */
function init(){
    addClipboardBtn();
    buildBookmarkletPanel();
}
if(document.readyState==='complete') setTimeout(init, 300);
else window.addEventListener('load', function(){ setTimeout(init, 300); });

})();

/* ─────────────────────────────── */

(function(){
'use strict';

var PROXY = 'http://10.36.38.240:5106';

/* ── 計算預設日期（今天往前90天）── */
function defaultDates(){
    var today = new Date();
    var start = new Date(today); start.setDate(today.getDate() - 90);
    var fmt = function(d){ return d.getFullYear()+'/'+(d.getMonth()<9?'0':'')+(d.getMonth()+1)+'/'+(d.getDate()<10?'0':'')+d.getDate(); };
    return { start: fmt(start), end: fmt(today) };
}

/* ── 建立面板 ── */
function buildBackendPanel(){
    var controls = document.querySelector('.controls');
    if(!controls || document.getElementById('backendQueryPanel')) return;

    var d = defaultDates();
    var panel = document.createElement('div');
    panel.id = 'backendQueryPanel';
    panel.innerHTML =
        '<div class="bq-header" onclick="toggleBqPanel()">' +
            '🚀 自動查詢（後端模式）' +
            '<span id="bqOnlineStatus" class="bq-offline">⚫ 後端離線</span>' +
        '</div>' +
        '<div id="bqBody">' +
            '<div class="bq-row">' +
                '<label>SHEET_ID</label>' +
                '<input id="bqSheetID" type="text" placeholder="輸入 SHEET_ID，多筆換行" style="flex:1;">' +
            '</div>' +
            '<div class="bq-row">' +
                '<label>開始日期</label>' +
                '<input id="bqStartDate" type="text" value="' + d.start + '" placeholder="YYYY/MM/DD">' +
            '</div>' +
            '<div class="bq-row">' +
                '<label>結束日期</label>' +
                '<input id="bqEndDate" type="text" value="' + d.end + '" placeholder="YYYY/MM/DD">' +
            '</div>' +
            '<div class="bq-row">' +
                '<label>類型</label>' +
                '<select id="bqImageType">' +
                    '<option value="INSP">INSP</option>' +
                    '<option value="REPAIR">REPAIR</option>' +
                    '<option value="ORBO">ORBO</option>' +
                    '<option value="生畫像">生畫像</option>' +
                '</select>' +
                '<select id="bqIDType" style="flex:1;margin-left:6px;">' +
                    '<option value="SHEET">SHEET</option>' +
                    '<option value="CHIP">CHIP</option>' +
                '</select>' +
            '</div>' +
            '<button id="bqSearchBtn" onclick="bqSearch()">🔍 搜尋並自動標點</button>' +
            '<div id="bqStatus"></div>' +
            '<div style="margin-top:8px;font-size:11px;color:#888;">⚙️ 需先在本機執行 <code>python pi_proxy.py</code></div>' +
        '</div>';

    // 插在最上方（優先於其他面板）
    controls.insertBefore(panel, controls.firstChild);

    // 檢查後端是否在線
    checkProxyOnline();
    setInterval(checkProxyOnline, 10000); // 每 10 秒更新狀態
}

/* ── 展開/收合 ── */
window.toggleBqPanel = function(){
    var b = document.getElementById('bqBody');
    if(!b) return;
    b.style.display = b.style.display === 'none' ? 'block' : 'none';
};

/* ── 後端在線檢查 ── */
function checkProxyOnline(){
    var el = document.getElementById('bqOnlineStatus');
    if(!el) return;
    fetch(PROXY + '/ping', { signal: AbortSignal.timeout(3000) })
        .then(function(r){ return r.json(); })
        .then(function(){ el.textContent = '🟢 後端在線'; el.className = 'bq-online'; })
        .catch(function(){ el.textContent = '⚫ 後端離線'; el.className = 'bq-offline'; });
}

function setBqStatus(msg, type){
    var el = document.getElementById('bqStatus');
    if(!el) return;
    el.textContent = msg; el.className = type||'';
    el.style.display = msg ? 'block' : 'none';
}

/* ── 主要搜尋函式 ── */
window.bqSearch = function(){
    var sheetRaw = (document.getElementById('bqSheetID')||{}).value || '';
    var start    = (document.getElementById('bqStartDate')||{}).value || '';
    var end      = (document.getElementById('bqEndDate')||{}).value || '';
    var imgType  = (document.getElementById('bqImageType')||{}).value || 'INSP';
    var idType   = (document.getElementById('bqIDType')||{}).value || 'SHEET';

    var sheetIDs = sheetRaw.split(/[\n,;，；]+/).map(function(s){ return s.trim(); }).filter(Boolean);
    if(!sheetIDs.length){ setBqStatus('⚠️ 請輸入 SHEET_ID', 'warn'); return; }

    var btn = document.getElementById('bqSearchBtn');
    if(btn){ btn.disabled = true; btn.textContent = '⏳ 查詢中...'; }
    setBqStatus('🔄 連線後端查詢中，請稍候...', 'loading');

    // 支援多個 SHEET_ID 同時查詢（parallel fetch）
    var allPoints = [];
    var errors    = [];
    var done = 0;

    sheetIDs.forEach(function(sid){
        var url = PROXY + '/query?sheet_id=' + encodeURIComponent(sid) +
                  '&start_date=' + encodeURIComponent(start) +
                  '&end_date='   + encodeURIComponent(end) +
                  '&image_type=' + encodeURIComponent(imgType) +
                  '&id_type='    + encodeURIComponent(idType);

        fetch(url, { signal: AbortSignal.timeout(20000) })
            .then(function(r){ return r.json(); })
            .then(function(data){
                if(data.error){ errors.push(sid + '：' + data.error); }
                else if(data.points){ allPoints = allPoints.concat(data.points); }
                if(data.warning) errors.push('⚠️ ' + sid + '：' + data.warning);
            })
            .catch(function(e){
                if(e.name === 'TimeoutError' || e.message.includes('Failed to fetch')){
                    errors.push('❌ 無法連線後端（localhost:5000）\n請確認已執行 python pi_proxy.py');
                } else {
                    errors.push(sid + ' 查詢失敗：' + e.message);
                }
            })
            .finally(function(){
                done++;
                if(done < sheetIDs.length) return; // 等所有查詢完

                if(btn){ btn.disabled = false; btn.textContent = '🔍 搜尋並自動標點'; }

                if(!allPoints.length){
                    setBqStatus('❌ 查無資料\n' + errors.join('\n'), 'err');
                    return;
                }

                // 轉成原有格式並匯入
                var lines = allPoints.map(function(p){
                    return p.sheet_id + '|' + p.url + '\t' + p.line_id + '\t' + p.x + '\t' + p.y;
                });

                var origTA = Array.from(document.querySelectorAll('textarea')).find(function(t){
                    return t.id !== 'spPasteArea';
                });
                if(origTA) origTA.value = lines.join('\n');

                // 觸發匯入
                var importBtn = Array.from(document.querySelectorAll('button')).find(function(b){
                    return !['bqSearchBtn','spImportBtn','spClearBtn','aqFetchBtn','aqClearBtn'].includes(b.id) &&
                           (b.textContent.includes('匯入') || b.textContent.includes('載入'));
                });
                if(importBtn) importBtn.click();
                else ['importData','parseAndPlot','loadData'].forEach(function(fn){
                    if(typeof window[fn]==='function') window[fn]();
                });

                var msg = '✅ 查詢完成！共 ' + allPoints.length + ' 筆已自動標點';
                if(errors.length) msg += '\n' + errors.join('\n');
                setBqStatus(msg, 'ok');
            });
    });
};

/* ── init ── */
if(document.readyState === 'complete') setTimeout(buildBackendPanel, 350);
else window.addEventListener('load', function(){ setTimeout(buildBackendPanel, 350); });

})();

/* ─────────────────────────────── */

(function(){
    // 等面板建立後，把 PROXY 位址從 5000 改成 5122
    // 同時更新所有引用到 localhost:5000 的地方
    var OLD = 'http://localhost:5000';
    var NEW = '';

    // 覆蓋 bqSearch 裡用到的 PROXY 常數（透過重新定義 bqSearch）
    var origBqSearch = window.bqSearch;
    if(typeof origBqSearch === 'function'){
        // 取得函式字串，替換 port，重新 eval
        var src = origBqSearch.toString().replace(/localhost:5000/g, 'localhost:5122');
        try { window.bqSearch = eval('(' + src + ')'); } catch(e){}
    }

    // 覆蓋 checkProxyOnline（ping 端點）
    window._proxyBase = NEW;

    // patch ping 檢查
    function patchPing(){
        var el = document.getElementById('bqOnlineStatus');
        if(!el){ setTimeout(patchPing, 500); return; }
        // 立刻重新 ping 新 port
        fetch(NEW + '/ping', { signal: AbortSignal.timeout(3000) })
            .then(function(r){ return r.json(); })
            .then(function(){ el.textContent = '🟢 後端在線'; el.className = 'bq-online'; })
            .catch(function(){ el.textContent = '⚫ 後端離線'; el.className = 'bq-offline'; });
    }

    // 最直接的做法：直接覆蓋 bqSearch，hardcode 新 port
    window.bqSearch = function(){
        var PROXY = '';
        var sheetRaw = (document.getElementById('bqSheetID')||{}).value || '';
        var start    = (document.getElementById('bqStartDate')||{}).value || '';
        var end      = (document.getElementById('bqEndDate')||{}).value || '';
        var imgType  = (document.getElementById('bqImageType')||{}).value || 'INSP';
        var idType   = (document.getElementById('bqIDType')||{}).value || 'SHEET';

        var sheetIDs = sheetRaw.split(/[\n,;，；]+/).map(function(s){ return s.trim(); }).filter(Boolean);
        if(!sheetIDs.length){
            var s=document.getElementById('bqStatus');
            if(s){s.textContent='⚠️ 請輸入 SHEET_ID';s.className='warn';s.style.display='block';}
            return;
        }

        var btn = document.getElementById('bqSearchBtn');
        if(btn){ btn.disabled=true; btn.textContent='⏳ 查詢中...'; }
        var bqS=document.getElementById('bqStatus');
        if(bqS){bqS.textContent='🔄 連線後端查詢中，請稍候...';bqS.className='loading';bqS.style.display='block';}

        var allPoints=[], errors=[], done=0;

        sheetIDs.forEach(function(sid){
            var url = PROXY + '/query?sheet_id=' + encodeURIComponent(sid) +
                      '&start_date=' + encodeURIComponent(start) +
                      '&end_date='   + encodeURIComponent(end) +
                      '&image_type=' + encodeURIComponent(imgType) +
                      '&id_type='    + encodeURIComponent(idType);

            fetch(url, { signal: AbortSignal.timeout(20000) })
                .then(function(r){ return r.json(); })
                .then(function(data){
                    if(data.error) errors.push(sid+'：'+data.error);
                    else if(data.points) allPoints = allPoints.concat(data.points);
                    if(data.warning) errors.push('⚠️ '+sid+'：'+data.warning);
                })
                .catch(function(e){
                    errors.push('❌ 無法連線後端（localhost:5122）\n請確認已執行 python pi_proxy.py');
                })
                .finally(function(){
                    done++;
                    if(done < sheetIDs.length) return;
                    if(btn){ btn.disabled=false; btn.textContent='🔍 搜尋並自動標點'; }
                    if(!allPoints.length){
                        if(bqS){bqS.textContent='❌ 查無資料\n'+errors.join('\n');bqS.className='err';bqS.style.display='block';}
                        return;
                    }
                    var lines = allPoints.map(function(p){
                        return p.sheet_id+'|'+p.url+'\t'+p.line_id+'\t'+p.x+'\t'+p.y;
                    });
                    var origTA = Array.from(document.querySelectorAll('textarea')).find(function(t){ return t.id!=='spPasteArea'; });
                    if(origTA) origTA.value = lines.join('\n');
                    var importBtn = Array.from(document.querySelectorAll('button')).find(function(b){
                        return !['bqSearchBtn','spImportBtn','spClearBtn','aqFetchBtn','aqClearBtn'].includes(b.id) &&
                               (b.textContent.includes('匯入')||b.textContent.includes('載入'));
                    });
                    if(importBtn) importBtn.click();
                    else ['importData','parseAndPlot','loadData'].forEach(function(fn){
                        if(typeof window[fn]==='function') window[fn]();
                    });
                    var msg='✅ 查詢完成！共 '+allPoints.length+' 筆已自動標點';
                    if(errors.length) msg+='\n'+errors.join('\n');
                    if(bqS){bqS.textContent=msg;bqS.className='ok';bqS.style.display='block';}
                });
        });
    };

    if(document.readyState==='complete') patchPing();
    else window.addEventListener('load', patchPing);
})();

/* ─────────────────────────────── */

(function(){
'use strict';

/* ── 1. 移除不需要的舊面板 ── */
function removeOldPanels(){
    ['smartPastePanel','bookmarkletPanel','autoQueryPanel'].forEach(function(id){
        var el = document.getElementById(id);
        if(el) el.remove();
    });
}

/* ── 2. 修正後端 PORT 5000 → 5122 ── */
window.__BQ_PROXY = '';

/* ── 3. 強制展開後端查詢面板 ── */
function openBqPanel(){
    var body = document.getElementById('bqBody');
    if(body) body.style.display = 'block';
}

/* ── 4. 覆寫 bqSearch：搜尋後自動載入（免手動點）── */
window.bqSearch = function(){
    var sheetRaw = (document.getElementById('bqSheetID')||{}).value || '';
    var start    = (document.getElementById('bqStartDate')||{}).value || '';
    var end      = (document.getElementById('bqEndDate')||{}).value || '';
    var imgType  = (document.getElementById('bqImageType')||{}).value || 'INSP';
    var idType   = (document.getElementById('bqIDType')||{}).value || 'SHEET';
    var btn      = document.getElementById('bqSearchBtn');

    var ids = sheetRaw.split(/[\n,]+/).map(function(s){ return s.trim(); }).filter(Boolean);
    if(!ids.length){
        setBqStatus2('⚠️ 請輸入 SHEET_ID', 'warn'); return;
    }

    if(btn){ btn.disabled = true; btn.textContent = '⏳ 查詢中...'; }
    setBqStatus2('🔄 查詢中，請稍候...', 'loading');

    var PROXY = window.__BQ_PROXY || '';
    var promises = ids.map(function(sid){
        var url = PROXY + '/query?sheet_id=' + encodeURIComponent(sid) +
                  '&start_date=' + encodeURIComponent(start) +
                  '&end_date='   + encodeURIComponent(end) +
                  '&image_type=' + encodeURIComponent(imgType) +
                  '&id_type='    + encodeURIComponent(idType);
        return fetch(url, { signal: AbortSignal.timeout(20000) })
                .then(function(r){ return r.json(); });
    });

    Promise.allSettled(promises).then(function(results){
        if(btn){ btn.disabled = false; btn.textContent = '🔍 搜尋並自動標點'; }

        var allPoints = [], errors = [];
        results.forEach(function(r, i){
            if(r.status === 'fulfilled'){
                var data = r.value;
                if(data.error){ errors.push('❌ ' + ids[i] + '：' + data.error); return; }
                (data.points || []).forEach(function(p){ allPoints.push(p); });
            } else {
                errors.push('❌ ' + ids[i] + '：連線失敗（後端未啟動？）');
            }
        });

        if(!allPoints.length){
            setBqStatus2('⚠️ 無查詢結果\n' + errors.join('\n'), 'warn'); return;
        }

        /* 轉成 textarea 格式 */
        var lines = allPoints.map(function(p){
            return p.sheet_id + '|' + p.url + '\t' + p.line_id + '\t' + p.x + '\t' + p.y;
        });

        /* 找到主要 textarea（排除 spPasteArea）並填入 */
        var origTA = document.getElementById('dataInput') || Array.from(document.querySelectorAll('textarea')).find(function(t){ return t.id !== 'spPasteArea' && t.id !== 'bqSheetID'; });
        if(origTA) origTA.value = lines.join('\n');

        /* ── 自動載入：依序嘗試各種方式 ── */
        var triggered = false;

        /* 方法 1：直接呼叫全域函式 */
        ['importData', 'parseAndPlot', 'loadData', 'loadPoints'].forEach(function(fn){
            if(!triggered && typeof window[fn] === 'function'){
                window[fn](); triggered = true;
            }
        });

        /* 方法 2：找「載入數據」按鈕並 click */
        if(!triggered){
            var importBtn = Array.from(document.querySelectorAll('button')).find(function(b){
                return !['bqSearchBtn','spImportBtn','spClearBtn','aqFetchBtn','aqClearBtn','bqClearBtn'].includes(b.id) &&
                       (b.textContent.includes('匯入') || b.textContent.includes('載入'));
            });
            if(importBtn){ importBtn.click(); triggered = true; }
        }

        /* 方法 3：觸發 textarea 的 input 事件（某些實作靠事件監聽）*/
        if(!triggered && origTA){
            origTA.dispatchEvent(new Event('input', {bubbles:true}));
            origTA.dispatchEvent(new Event('change', {bubbles:true}));
        }

        var msg = '✅ 查詢完成！共 ' + allPoints.length + ' 筆已自動標點';
        if(errors.length) msg += '\n' + errors.join('\n');
        setBqStatus2(msg, 'ok');
    });
};

/* setBqStatus 的本地版，確保不衝突 */
function setBqStatus2(msg, type){
    var el = document.getElementById('bqStatus');
    if(!el) return;
    el.textContent = msg; el.className = type||'';
    el.style.display = msg ? 'block' : 'none';
}

/* ── 覆寫 checkProxyOnline 使用正確 PORT ── */
window.__patchPing = function(){
    var el = document.getElementById('bqOnlineStatus');
    if(!el) return;
    fetch('http://localhost:5122/ping', { signal: AbortSignal.timeout(3000) })
        .then(function(r){ return r.json(); })
        .then(function(){ el.textContent = '🟢 後端在線'; el.className = 'bq-online'; })
        .catch(function(){ el.textContent = '⚫ 後端離線'; el.className = 'bq-offline'; });
};

/* ── 初始化 ── */
function init(){
    removeOldPanels();
    openBqPanel();
    // 修正 ping 定時器使用 5122
    clearInterval(window.__pingTimer);
    window.__pingTimer = setInterval(window.__patchPing, 10000);
    window.__patchPing();
}

if(document.readyState === 'complete') setTimeout(init, 400);
else window.addEventListener('load', function(){ setTimeout(init, 400); });

})();

/* ─────────────────────────────── */

(function(){
'use strict';

function applyFixes(){

    /* ═══════════════════════════════════════
       Q3：停止 iframe 載入 → 解決 tab 轉圈
       ═══════════════════════════════════════ */
    // 移除 autoQueryPanel（含 iframe）
    var aqp = document.getElementById('autoQueryPanel');
    if(aqp){
        var aqf = document.getElementById('aqFrame');
        if(aqf){ aqf.src = 'about:blank'; }   // 先停止載入
        aqp.remove();
    }
    // 停掉舊的 ping interval，改用不影響 tab 的輕量版
    if(window.__pingTimer){ clearInterval(window.__pingTimer); }
    window.__pingTimer = setInterval(function(){
        var el = document.getElementById('bqOnlineStatus');
        if(!el) return;
        // 用 keepalive=false + mode=no-cors 避免觸發瀏覽器 loading 指示
        fetch('http://localhost:5122/ping', {
            signal: AbortSignal.timeout(2500),
            cache: 'no-store'
        })
        .then(function(r){ return r.json(); })
        .then(function(){ el.textContent='🟢 後端在線'; el.className='bq-online'; })
        .catch(function(){ el.textContent='⚫ 後端離線'; el.className='bq-offline'; });
    }, 15000);  // 改為 15 秒，減少頻率
    // 立即執行一次（非 setInterval 觸發，不引起 tab 轉圈）
    setTimeout(function(){
        var el = document.getElementById('bqOnlineStatus');
        if(!el) return;
        fetch('http://localhost:5122/ping', { signal: AbortSignal.timeout(2500), cache:'no-store' })
            .then(function(r){ return r.json(); })
            .then(function(){ el.textContent='🟢 後端在線'; el.className='bq-online'; })
            .catch(function(){ el.textContent='⚫ 後端離線'; el.className='bq-offline'; });
    }, 500);

    /* ═══════════════════════════════════════
       Q1：數據匯入 control-group → 預設收起，點標題展開
       ═══════════════════════════════════════ */
    var groups = document.querySelectorAll('.control-group');
    groups.forEach(function(g){
        var h3 = g.querySelector('h3');
        if(!h3 || !h3.textContent.includes('數據匯入')) return;
        if(g.dataset.collapsible) return; // 已處理

        g.dataset.collapsible = '1';

        // 建立可折疊的 body 容器
        var body = document.createElement('div');
        body.id = 'dataInputBody';
        // 把 h3 以外的所有子節點移入 body
        var children = Array.from(g.childNodes).filter(function(n){
            return n !== h3;
        });
        children.forEach(function(n){ body.appendChild(n); });
        g.appendChild(body);

        // 預設收起
        body.style.display = 'none';
        var arrow = document.createElement('span');
        arrow.textContent = ' ▶';
        arrow.style.cssText = 'font-size:10px;color:var(--text-secondary);transition:transform .2s;';
        h3.appendChild(arrow);
        h3.style.cursor = 'pointer';
        h3.style.userSelect = 'none';

        h3.addEventListener('click', function(){
            var open = body.style.display !== 'none';
            body.style.display = open ? 'none' : 'block';
            arrow.textContent = open ? ' ▶' : ' ▼';
        });
    });

    /* ═══════════════════════════════════════
       Q2：SHEET_ID 改為 textarea（多行貼上）
       ═══════════════════════════════════════ */
    var bqInput = document.getElementById('bqSheetID');
    if(bqInput && bqInput.tagName === 'INPUT'){
        var ta = document.createElement('textarea');
        ta.id          = 'bqSheetID';
        ta.placeholder = '輸入 SHEET_ID，支援多筆換行或 Tab 分隔\n（可從 Excel/TXT 直接複製貼上）';
        ta.style.cssText = 'flex:1;min-height:60px;max-height:120px;resize:vertical;' +
                           'padding:5px 8px;font-size:12px;border:1px solid var(--border-color,#ccc);' +
                           'border-radius:4px;background:var(--input-bg,#fff);color:var(--text-primary,#222);' +
                           'box-sizing:border-box;font-family:monospace;';
        bqInput.parentNode.replaceChild(ta, bqInput);
        // row 改 layout：讓 label 上面，textarea 下面
        var row = ta.closest('.bq-row');
        if(row){
            row.style.flexDirection = 'column';
            row.style.alignItems    = 'flex-start';
            var lbl = row.querySelector('label');
            if(lbl) lbl.style.minWidth = 'unset';
            ta.style.width = '100%';
        }
    }

    /* ═══════════════════════════════════════
       Q4：預設圈選方式 → 手動框選（方框）
       ═══════════════════════════════════════ */
    // 切換到手動框選 tab
    if(typeof switchDetectTab === 'function') switchDetectTab('manual');
    // 設定工具為方框
    if(typeof setSelTool === 'function') setSelTool('rect');
    // 更新 UI 狀態
    var tabManual = document.getElementById('tabManual');
    var tabLinear = document.getElementById('tabLinear');
    if(tabManual){ tabManual.classList.add('active'); }
    if(tabLinear){ tabLinear.classList.remove('active'); }
    var toolRect = document.getElementById('toolRect');
    var toolCircle = document.getElementById('toolCircle');
    if(toolRect){ toolRect.classList.add('active'); }
    if(toolCircle){ toolCircle.classList.remove('active'); }

    /* ═══════════════════════════════════════
       Q5：確保區域篩選隨產品更新（強制修正）
       ═══════════════════════════════════════ */
    // 確保 window.buildFilterUI 使用 chip 版本（防舊版覆蓋）
    if(typeof window.PRODUCT_CONFIGS !== 'undefined'){
        var _buildFilterUIChip = function(){
            var chips = window.PRODUCT_CONFIGS[window.currentProductKey].chips;
            var cur = {};
            chips.forEach(function(c){
                var el = document.getElementById('filter'+c.label);
                cur[c.label] = el ? el.checked : true;
            });
            var fg = document.getElementById('filterGroup');
            if(!fg) return;
            var PER_ROW = Math.min(6, chips.length);
            fg.style.gridTemplateColumns = 'repeat('+PER_ROW+',1fr)';
            fg.innerHTML = chips.map(function(c){
                return '<div class="checkbox-item">' +
                    '<input type="checkbox" id="filter'+c.label+'" ' +
                    (cur[c.label] !== false ? 'checked' : '') +
                    ' onchange="updateDisplay();if(typeof refreshRedPointsDisplay===\'function\')refreshRedPointsDisplay();">' +
                    '<label for="filter'+c.label+'">'+c.label+'</label></div>';
            }).join('');
            var ft = document.getElementById('filterTitle');
            if(ft) ft.textContent = '🗺️ 區域篩選（'+chips.length+' 格）';
        };

        // 覆蓋 buildFilterUI
        window.buildFilterUI = _buildFilterUIChip;

        // 覆蓋 changeProduct，確保切換時 filter 更新
        var _origChangeProd = window.changeProduct;
        window.changeProduct = function(){
            var sel = document.getElementById('productSelect');
            if(sel) window.currentProductKey = sel.value;
            window.buildFilterUI();
            if(typeof window.buildRegionGrid === 'function') window.buildRegionGrid();
            var info = document.getElementById('productInfo');
            if(info && window.PRODUCT_CONFIGS[window.currentProductKey])
                info.textContent = window.PRODUCT_CONFIGS[window.currentProductKey].note || '';
            if(typeof updateDisplay === 'function') updateDisplay();
            if(typeof allMarkedIndices !== 'undefined' && allMarkedIndices.length > 0){
                if(typeof refreshRedPointsDisplay === 'function') refreshRedPointsDisplay();
                if(typeof window.updateRegionGrid  === 'function') window.updateRegionGrid();
            }
        };

        // 立即重建 filter（用當前選取的產品）
        _buildFilterUIChip();
        if(typeof window.buildRegionGrid === 'function') window.buildRegionGrid();
    }
}

// 等所有 patch 都跑完後執行
if(document.readyState === 'complete') setTimeout(applyFixes, 600);
else window.addEventListener('load', function(){ setTimeout(applyFixes, 600); });

})();
