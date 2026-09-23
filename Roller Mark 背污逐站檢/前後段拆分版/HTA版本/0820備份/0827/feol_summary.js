/* feol_summary.js */


// ===== Summary 圖表 =====


// ===== Summary 分頁 =====

if(typeof ChartDataLabels!=='undefined'){Chart.register(ChartDataLabels);}

const SM_CFG={pi1:{station:'PI 前',hasLine:false,tolId:null,showId:null},pi2:{station:'PI 後',hasLine:true,tolId:'sm-pi2-tol',showId:'sm-pi2-show'},pa:{station:'PA 後',hasLine:true,tolId:'sm-pa-tol',showId:'sm-pa-show'},odf:{station:'ODF 後',hasLine:true,tolId:'sm-odf-tol',showId:'sm-odf-show'}};

const SM_LV=['0','1','1.5','2.0','3.0'];const SM_LL=['LV0','LV1','LV1.5','LV2.0','LV3.0'];

const SM_LC=['#efebe9','#d7ccc8','#a1887f','#6d4c41','#3e2723'];

const SM_NA='__na__';const SM_LC_NA='#e8edf2';

const SM_THEMES={pink:{lc:['#fff5f8','#ffe0ea','#ffc0d4','#f890b0','#e05888'],na:'#e8edf2'},blue:{lc:['#e8f4fd','#bde0fb','#7ec8f7','#3aa0e8','#1565c0'],na:'#e8edf2'},green:{lc:['#e8f8e8','#b2dfc4','#6ec66e','#3a9e3a','#1a6e1a'],na:'#e8edf2'},warm:{lc:['#fff8e1','#ffe082','#ffb300','#f57c00','#bf360c'],na:'#e8edf2'},purple:{lc:['#f3e5f5','#ce93d8','#ab47bc','#7b1fa2','#4a148c'],na:'#e8edf2'},cool:{lc:['#e0f7fa','#80deea','#26c6da','#0097a7','#004d5a'],na:'#e8edf2'},neutral:{lc:['#f5f5f5','#bdbdbd','#757575','#424242','#212121'],na:'#e0e0e0'},earth:{lc:['#efebe9','#d7ccc8','#a1887f','#6d4c41','#3e2723'],na:'#e8edf2'},morandi:{lc:['#e8ddd4','#c9b8a8','#a89080','#876860','#665040'],na:'#ede8e3'}};

function smApplyTheme(){const t=document.getElementById('sm-g-theme')?.value||'earth';const th=SM_THEMES[t]||SM_THEMES.pink;SM_LC.splice(0,SM_LC.length,...th.lc);Object.keys(SM_CFG).forEach(k=>smDraw(k));}

const smCharts={};let smInited=false;

function smNormLV(v){if(v===null||v===undefined||v==='')return SM_NA;const s=String(v).trim();const m={'0':'0','0.0':'0','1':'1','1.0':'1','1.5':'1.5','2':'2.0','2.0':'2.0','3':'3.0','3.0':'3.0'};return m[s]!==undefined?m[s]:(s?s:SM_NA);}

function smInit(){smInitDates();smFillModels();if(!smInited){smInited=true;Object.keys(SM_CFG).forEach(k=>smDraw(k));}}

function smInitDates(){const now=new Date(),ago=new Date(now);ago.setMonth(ago.getMonth()-1);const today=dateStr(now),monthAgo=dateStr(ago);const ff=document.getElementById('ff'),ft=document.getElementById('ft');if(ff&&!ff.value)ff.value=monthAgo;if(ft&&!ft.value)ft.value=today;const gf=document.getElementById('sm-g-from'),gt=document.getElementById('sm-g-to');if(gf&&!gf.value)gf.value=monthAgo;if(gt&&!gt.value)gt.value=today;Object.keys(SM_CFG).forEach(k=>{const f=document.getElementById('sm-'+k+'-from'),t=document.getElementById('sm-'+k+'-to');if(f&&!f.value)f.value=monthAgo;if(t&&!t.value)t.value=today;});}

function smFillModels(){const models=window._smModels||[];if(!models.length)return;const gm=document.getElementById('sm-g-model');if(gm){const cur=gm.value;gm.innerHTML='<option value="">全部</option>'+models.map(m=>'<option>'+m+'</option>').join('');if(cur)gm.value=cur;}Object.keys(SM_CFG).forEach(k=>{const s=document.getElementById('sm-'+k+'-model');if(!s)return;const cur=s.value;s.innerHTML='<option value="">全部</option>'+models.map(m=>'<option>'+m+'</option>').join('');if(cur)s.value=cur;});}

function smApplyGlobal(){const gFrom=document.getElementById('sm-g-from')?.value||'';const gTo=document.getElementById('sm-g-to')?.value||'';const gModel=document.getElementById('sm-g-model')?.value||'';const gTc=document.getElementById('sm-g-tc')?.value||'';const gLv=document.getElementById('sm-g-lv')?.value||'';const gTol=document.getElementById('sm-g-tol')?.value||'';const gShow=document.getElementById('sm-g-show')?.value||'';Object.keys(SM_CFG).forEach(k=>{if(gFrom){const f=document.getElementById('sm-'+k+'-from');if(f)f.value=gFrom;}if(gTo){const t=document.getElementById('sm-'+k+'-to');if(t)t.value=gTo;}if(gModel){const m=document.getElementById('sm-'+k+'-model');if(m)m.value=gModel;}if(gTc){const tc=document.getElementById('sm-'+k+'-tc');if(tc)tc.value=gTc;}if(gLv){const lv=document.getElementById('sm-'+k+'-lv');if(lv)lv.value=gLv;}if(gTol&&SM_CFG[k].tolId){const tol=document.getElementById(SM_CFG[k].tolId);if(tol)tol.value=gTol;}if(gShow&&SM_CFG[k].showId){const sh=document.getElementById(SM_CFG[k].showId);if(sh)sh.value=gShow;}smDraw(k);});}

function smDedup(recs){const seen=new Set();return recs.filter(r=>{const key=r.date+'|'+(r.tc||'')+'|'+(r.y||'');if(seen.has(key))return false;seen.add(key);return true;});}

function smAgg(recs){const byDate={};recs.forEach(r=>{const d=r.date||'';const lv=smNormLV(r.lv);if(!byDate[d])byDate[d]={};byDate[d][lv]=(byDate[d][lv]||0)+1;});return{dates:Object.keys(byDate).sort(),byDate};}

async function smDraw(key){const cfg=SM_CFG[key];if(!cfg)return;const gv=id=>{const e=document.getElementById(id);return e?e.value:'';};const from=gv('sm-'+key+'-from')||gv('sm-g-from'),to=gv('sm-'+key+'-to')||gv('sm-g-to');const model=gv('sm-'+key+'-model')||gv('sm-g-model'),line=gv('sm-'+key+'-line');const tc=gv('sm-'+key+'-tc')||gv('sm-g-tc'),lv=gv('sm-'+key+'-lv')||gv('sm-g-lv');const tolEl=cfg.tolId?document.getElementById(cfg.tolId):null;const tol=parseFloat(tolEl?.value||'1')||1;const showEl=cfg.showId?document.getElementById(cfg.showId):null;const showMode=showEl?showEl.value:(cfg.hasLine?'new':'all');const params=new URLSearchParams({dateFrom:from,dateTo:to,model,station:cfg.station,line:line||'',tc:tc||'',level:lv||''});let allRecs=[];try{const data=await fetch(API_BASE+'/api/search?'+params).then(r=>r.json());if(!data.success)return;allRecs=data.records||[];const ms=[...new Set(allRecs.map(r=>r.model||'').filter(Boolean))].sort();if(ms.length){window._smModels=[...new Set([...(window._smModels||[]),...ms])].sort();smFillModels();}}catch(e){return;}const deduped=smDedup(allRecs);let isNewArr=[];if(cfg.hasLine&&deduped.length>0&&showMode==='new'){try{const reqRecords=deduped.map((r,i)=>({idx:i,sheetId:r.sheetId||'',station:r.station||'',y:r.y||''}));const niData=await fetch(API_BASE+'/api/check/isnew',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:reqRecords,tolerance:tol})}).then(r=>r.json());if(niData.success){const raw=niData.results;if(Array.isArray(raw)){isNewArr=raw;}else if(raw&&typeof raw==='object'){isNewArr=deduped.map((_,i)=>raw[String(i)]||raw[i]||'N');}}}catch(e){isNewArr=[];}}['T','C'].forEach(side=>{let chartRecs;if(cfg.hasLine&&showMode==='new'){chartRecs=deduped.filter((r,i)=>r.tc===side&&(isNewArr[i]&&isNewArr[i].isNew===true));}else{chartRecs=deduped.filter(r=>r.tc===side);}const{dates:_nd,byDate}=smAgg(chartRecs);

// ★ 日期軸取自所有紀錄（含沒有新增的日期，柱子=0也顯示）

const _allDates=[...new Set(deduped.filter(r=>r.tc===side).map(r=>r.date||'').filter(Boolean))].sort();

const dates=_allDates.length?_allDates:_nd;let newByDate=null;if(cfg.hasLine){newByDate={};deduped.forEach((r,i)=>{if(r.tc!==side)return;if(isNewArr[i]&&isNewArr[i].isNew===true){const d=r.date||'';newByDate[d]=(newByDate[d]||0)+1;}});}const titleSuffix=cfg.hasLine?(showMode==='new'?' ▸ 僅新增線':' ▸ 全部'):'';const allSideRecs=deduped.filter(r=>r.tc===side);const avgNumRecs=allRecs.filter(r=>r.tc===side);const avgDenomRecs=allRecs.filter(r=>r.tc===side);

smDrawChart('smc-'+key+'-'+side,dates,byDate,newByDate,cfg.station+' '+side+'側',chartRecs,titleSuffix,allSideRecs,avgNumRecs,avgDenomRecs);});}

/* ★ Summary Y 分布圖 輔助函數 */
var SM_Y_COLORS={'3.0':'#c0392b','3':'#c0392b','2.0':'#2980b9','2':'#2980b9','1.5':'#27ae60','1':'#8e44ad','1.0':'#8e44ad','0':'#95a5a6','__na__':'#bdc3c7'};

function drawSmYMap(dayRecs,date){
  var canvas=document.getElementById('smYMapCanvas');
  var titleEl=document.getElementById('smYMapTitle');
  var legendEl=document.getElementById('smYMapLegend');
  if(!canvas)return;
  var W=canvas.width,H=canvas.height;
  var ctx=canvas.getContext('2d');

  /* 白底背景 */
  ctx.fillStyle='#f7f9ff';ctx.fillRect(0,0,W,H);

  var LPAD=30,RPAD=8,TPAD=8,BPAD=8;
  var IW=W-LPAD-RPAD,IH=H-TPAD-BPAD;

  /* Y 範圍（0-220 cm，可擴展） */
  var yVals=dayRecs.map(function(r){return parseFloat(r.y);}).filter(function(v){return !isNaN(v);});
  var YMax=yVals.length>0?Math.max(220,Math.max.apply(null,yVals)):220;
  var YMin=0;
  function toCY(yv){return TPAD+(1-(yv-YMin)/(YMax-YMin))*IH;}

  /* 格線 + Y 軸刻度 */
  var fs=Math.max(8,Math.round(W/32));/* 字體跟 canvas 寬等比 */
  ctx.font=fs+'px sans-serif';ctx.textAlign='right';
  for(var yy=0;yy<=YMax;yy+=50){
    var py=toCY(yy);
    ctx.strokeStyle='#dde8f8';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(LPAD,py);ctx.lineTo(W-RPAD,py);ctx.stroke();
    ctx.fillStyle='#7a8faa';
    ctx.fillText(yy,LPAD-3,py+fs*0.35);
  }

  /* 內框 */
  ctx.strokeStyle='#c0d0e8';ctx.lineWidth=1;
  ctx.strokeRect(LPAD,TPAD,IW,IH);

  /* 畫各 Y 點（只畫橫線，不畫圓點） */
  var lvCounts={};
  dayRecs.forEach(function(r){
    var yv=parseFloat(r.y);if(isNaN(yv))return;
    var lv=r.lv!=null&&r.lv!==''?String(r.lv):'__na__';
    var color=SM_Y_COLORS[lv]||'#888';
    var py=toCY(yv);
    /* 橫線：粗 2.5px，左端留小缺口讓線條有層次感 */
    ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.globalAlpha=0.82;
    ctx.beginPath();
    ctx.moveTo(LPAD+2,py);
    ctx.lineTo(W-RPAD-1,py);
    ctx.stroke();
    lvCounts[lv]=(lvCounts[lv]||0)+1;
  });
  ctx.globalAlpha=1;

  /* Y 軸線 */
  ctx.strokeStyle='#a0b8d8';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(LPAD,TPAD);ctx.lineTo(LPAD,TPAD+IH);ctx.stroke();

  /* Title */
  if(titleEl)titleEl.textContent='📍 Y 分布　'+date+'　共 '+dayRecs.length+' 條';

  /* Legend */
  if(legendEl){
    var LM=[['3.0','#c0392b','LV3.0'],['2.0','#2980b9','LV2.0'],
            ['1.5','#27ae60','LV1.5'],['1.0','#8e44ad','LV1.0'],
            ['1','#8e44ad','LV1'],
            ['0','#95a5a6','LV0'],['__na__','#bdc3c7','無LV']];
    var seen={};
    legendEl.innerHTML=LM.filter(function(x){
      if(seen[x[2]])return false;
      if(!(lvCounts[x[0]]||0))return false;
      seen[x[2]]=true;return true;
    }).map(function(x){
      var cnt=lvCounts[x[0]]||0;
      return '<span style="display:inline-flex;align-items:center;gap:3px;">'
        +'<span style="display:inline-block;width:18px;height:3px;border-radius:2px;background:'+x[1]+';"></span>'
        +'<span style="color:#2a4a6e;font-weight:600;">'+x[2]+'</span>'
        +'<span style="color:#6a8ab8;">×'+cnt+'</span></span>';
    }).join('');
  }
}

function showSmYMap(clientX,clientY,recs,date){
  var panel=document.getElementById('smYMapPanel');
  if(!panel)return;
  /* 確保一般 hover 用標準尺寸 256×336 */
  var _nc=document.getElementById('smYMapCanvas');
  if(_nc&&(_nc.width!==256||_nc.height!==336)){_nc.width=256;_nc.height=336;}
  var dayRecs=recs.filter(function(r){
    return r.date===date&&r.y!=null&&r.y!=='';
  });
  if(!dayRecs.length){panel.style.display='none';return;}
  drawSmYMap(dayRecs,date);
  panel.style.display='block';
  /* 定位：右側優先，不超出螢幕 */
  var pw=300,ph=420;
  var tx=clientX+20,ty=clientY-40;
  if(tx+pw>window.innerWidth)tx=clientX-pw-12;
  if(ty+ph>window.innerHeight)ty=window.innerHeight-ph-10;
  if(tx<4)tx=4;if(ty<4)ty=4;
  panel.style.left=tx+'px';panel.style.top=ty+'px';
}

function hideSmYMap(){
  var panel=document.getElementById('smYMapPanel');
  if(panel)panel.style.display='none';
}

function smDrawChart(cid,dates,byDate,newByDate,title,expRecs,titleSuffix,allSideRecs,avgNumRecs,avgDenomRecs){

const ctx=document.getElementById(cid)?.getContext('2d');

if(!ctx)return;

if(smCharts[cid])smCharts[cid].destroy();

const titleEl=ctx.canvas.previousElementSibling;

if(titleEl&&titleEl.classList.contains('smtitle')){

  const hint=titleSuffix

    ?'<span style="font-size:10px;font-weight:600;color:'+(titleSuffix.includes('新增')?'#e67e22':'#888')+';">'+titleSuffix+'</span>'

    :'';

  titleEl.innerHTML=title+' '+hint+'<span style="font-size:10px;color:#aaa;font-weight:400;">（點擊放大）</span>';

}

const avgByDate={};const sheetsPerDate={};

dates.forEach(d=>{

  const _numRecs=(avgNumRecs||expRecs).filter(r=>r.date===d);

  const total=_numRecs.length;

  const _denomRecs=(avgDenomRecs||expRecs).filter(r=>r.date===d);

  const sheets=new Set(_denomRecs.map(r=>r.sheetId).filter(s=>s)).size||1;

  sheetsPerDate[d]=sheets;

  avgByDate[d]=total>0?Math.round(total/sheets*10)/10:0;

});

const lblColors=['#666','#fff','#fff','#fff','#fff'];

// ★ 改動1：「平均條/片」改用左側 y 軸（移除 y2）

const datasets=[

  {label:'無LV',data:dates.map(d=>(byDate[d]&&byDate[d][SM_NA])||0),

   backgroundColor:SM_LC_NA,borderWidth:2,borderColor:'#fff',

   order:2,stack:'bar',

   yAxisID:'y',

   datalabels:{display:c=>c.dataset.data[c.dataIndex]>0,color:'#778',

     font:{size:15,weight:'bold'},formatter:val=>val>0?val:''}},

  ...SM_LV.map((lv,i)=>({

    label:SM_LL[i],data:dates.map(d=>(byDate[d]&&byDate[d][lv])||0),

    backgroundColor:SM_LC[i],borderWidth:2,borderColor:'#fff',

    order:2,stack:'bar',

    yAxisID:'y',

    datalabels:{display:c=>c.dataset.data[c.dataIndex]>0,color:lblColors[i],

      font:{size:15,weight:'bold'},formatter:val=>val>0?val:''}}))

];

if(newByDate){

  datasets.push({

    label:'新增線',data:dates.map(d=>newByDate[d]||0),

    type:'line',borderColor:'#e67e22',backgroundColor:'rgba(230,126,34,.1)',

    order:1,

    borderWidth:2,pointRadius:4,pointBackgroundColor:'#e67e22',

    fill:false,tension:0.3,yAxisID:'y',datalabels:{display:false}

  });

}

// ★ 改動1：yAxisID 從 'y2' 改為 'y'

datasets.push({

  label:'平均條/片',data:dates.map(d=>avgByDate[d]||0),

  type:'line',borderColor:'#8e44ad',backgroundColor:'rgba(142,68,173,.12)',

  order:1,

  borderWidth:2,pointRadius:4,pointBackgroundColor:'#8e44ad',

  fill:false,tension:0.3,

  yAxisID:'y',

  datalabels:{display:false}

});

// ★ 改動3：tooltip callback — 折線懸停顯示 Y+LV 明細

function buildTooltipAfterBody(items){

  const d=items[0]?.label;

  if(!d)return[];

  const tot=SM_LV.reduce((s,lv)=>s+(byDate[d]&&byDate[d][lv]||0),0)+((byDate[d]&&byDate[d][SM_NA])||0);

  const avg=avgByDate[d]||0;

  const sh=sheetsPerDate[d]||0;

  const newCnt=newByDate?newByDate[d]||0:0;

  const lines=[

    '看片總數: '+sh,

    '合計: '+tot+(newByDate?'  新增: '+newCnt:'')+' | 平均: '+avg+'條/片'

  ];

  // 判斷 hover 的折線種類

  const hoverLineLabel=items.find(it=>it.dataset.type==='line')?.dataset.label||'';

  if(hoverLineLabel==='新增線'&&newByDate&&newCnt>0){

    const dayRecs=expRecs.filter(r=>r.date===d);

    lines.push('');

    lines.push('── 新增線 '+newCnt+' 條 ──');

    // 按 LV 分組

    const lvGroups={};

    dayRecs.forEach(r=>{

      const lv=r.lv!=null&&r.lv!==''?String(r.lv):'無LV';

      if(!lvGroups[lv])lvGroups[lv]=[];

      lvGroups[lv].push(r.y!=null&&r.y!==''?r.y:'?');

    });

    // LV 排序（高到低）

    const lvOrder=['3.0','3','2.0','2','1.5','1','0','無LV'];

    const sortedKeys=Object.keys(lvGroups).sort((a,b)=>{

      const ai=lvOrder.findIndex(x=>x===a),bi=lvOrder.findIndex(x=>x===b);

      if(ai!==-1&&bi!==-1)return ai-bi;

      if(ai!==-1)return -1;

      if(bi!==-1)return 1;

      return parseFloat(b)-parseFloat(a)||0;

    });

    sortedKeys.forEach(lv=>{

      const sortedY=lvGroups[lv].slice().sort((a,b)=>parseFloat(a)-parseFloat(b));const yStr=sortedY.join('  ');

      lines.push('LV'+lv+'  Y='+yStr);

    });

  }else if(hoverLineLabel==='平均條/片'){

    lines.push('');

    lines.push('平均條/片: '+avg);

  }

  // ★ PI前（newByDate===null）：顯示所有來料 Y 值

  if(newByDate===null){

    const dayRecs=expRecs.filter(r=>r.date===d);

    if(dayRecs.length>0){

      lines.push('');

      lines.push('── 來料位置 ──');

      const lvG2={};

      dayRecs.forEach(r=>{

        const lv2=r.lv!=null&&r.lv!==''?String(r.lv):'無LV';

        if(!lvG2[lv2])lvG2[lv2]=[];

        lvG2[lv2].push(r.y!=null&&r.y!==''?r.y:'?');

      });

      const lo2=['3.0','3','2.0','2','1.5','1','0','無LV'];

      const sk2=Object.keys(lvG2).sort((a,b)=>{

        const ai=lo2.findIndex(x=>x===a),bi=lo2.findIndex(x=>x===b);

        if(ai!==-1&&bi!==-1)return ai-bi;

        if(ai!==-1)return -1;

        if(bi!==-1)return 1;

        return parseFloat(b)-parseFloat(a)||0;

      });

      sk2.forEach(lv2=>{

        const sy2=lvG2[lv2].slice().sort((a,b)=>parseFloat(a)-parseFloat(b));

        lines.push('LV'+lv2+'  Y='+sy2.join('  '));

      });

    }

  }

  return lines;

}

smCharts[cid]=new Chart(ctx,{

  type:'bar',

  data:{labels:dates,datasets},

  options:{

    responsive:true,

    maintainAspectRatio:false,

    interaction:{mode:'index',intersect:false},

    plugins:{

      legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}},

      tooltip:{

        filter:(item)=>item.raw!==0,

        callbacks:{afterBody:buildTooltipAfterBody}

      },

      datalabels:{anchor:'center',align:'center'}

    },

    scales:{

      x:{stacked:true,ticks:{font:{size:9},maxRotation:45}},

      // ★ 改動1：只保留左側 y 軸，移除 y2

      y:{stacked:true,beginAtZero:true,

         ticks:{stepSize:1,font:{size:9}},

         title:{display:true,text:'條數',font:{size:10}}}

    },

    // ★ 改動2：onClick 改為放大圖表

    onClick:function(_evt,_els){
      if(_els&&_els.length>0){
        var _zi=_els[0].index;
        var _zdate=dates[_zi];
        var _zrecs=expRecs;
        smZoom(cid,title);
        hideSmYMap();/* 由 onHover 動態顯示 */
      }else{
        smZoom(cid,title);
      }
    },
    onHover:function(event,activeElements){
      if(activeElements&&activeElements.length>0){
        var idx=activeElements[0].index;
        var date=dates[idx];
        var ne=(event&&event.native)?event.native:event;
        if(ne&&ne.clientX!=null)showSmYMap(ne.clientX,ne.clientY,expRecs,date);
      }else{
        hideSmYMap();
      }
    }

  }});

smCharts[cid]._tooltipFn=buildTooltipAfterBody;
smCharts[cid]._dates=dates;
smCharts[cid]._expRecs=expRecs;

}

// ★ 圖表放大 modal（v5 修正：canvas wrapper 固定高度）

// ★ 圖表放大 modal（v7：createElement，無引號衝突）

function smZoom(cid,title){
  var modal=document.getElementById('smZoomModal');

  if(!modal){
    /* ── modal 背景 ── */
    modal=document.createElement('div');
    modal.id='smZoomModal';
    modal.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:5000;align-items:center;justify-content:center;cursor:zoom-out;';

    /* ── inner（NOT flex，維持 Chart.js 正常渲染）── */
    var inner=document.createElement('div');
    inner.id='smZoomInner';
    inner.style.cssText='position:relative;background:#fff;border-radius:10px;padding:16px 16px 12px;width:95vw;max-width:2200px;cursor:default;box-sizing:border-box;';
    inner.onclick=function(e){e.stopPropagation();};

    /* ── 關閉按鈕 ── */
    var closeBtn=document.createElement('button');
    closeBtn.innerHTML='&#10005;';
    closeBtn.style.cssText='position:absolute;top:-12px;right:-12px;width:34px;height:34px;border-radius:50%;background:#fff;border:none;cursor:pointer;font-size:18px;font-weight:700;color:#555;box-shadow:0 2px 8px rgba(0,0,0,.3);z-index:1;';
    closeBtn.onclick=function(){modal.style.display='none';_smZoomHideYMap();};

    /* ── 標題 ── */
    var titleDiv=document.createElement('div');
    titleDiv.id='smZoomTitle';
    titleDiv.style.cssText='font-weight:700;color:#1a6bb5;font-size:18px;margin-bottom:10px;flex:0 0 auto;';

    /* ════════════════════════════════════════════════
       contentRow：明確 height → flex-row 子元素可取到高度
       ════════════════════════════════════════════════ */
    var contentRow=document.createElement('div');
    contentRow.id='smZoomContentRow';
    /* calc：78vh - 標題約 38px - 上下 padding 28px */
    contentRow.style.cssText='display:flex;flex-direction:row;height:calc(78vh - 38px);gap:12px;';

    /* ────────────────────────────────────────────────
       左欄：Y map
       flex-direction:column 讓 canvas 可以 flex:1 撐滿
       ──────────────────────────────────────────────── */
    var ymapCol=document.createElement('div');
    ymapCol.id='smZoomYMapCol';
    ymapCol.style.cssText=[
      'display:none',
      'flex:0 0 290px',
      'width:290px',
      'min-width:290px',
      'flex-direction:column',  /* 啟用後才生效（display:flex 由 show 時設） */
      'gap:6px',
      'background:#f7f9ff',
      'border:1.5px solid #c5d5ee',
      'border-radius:10px',
      'padding:10px 10px 8px',
      'box-sizing:border-box',
    ].join(';') + ';';

    /* Y map 標題（flex:0，固定高度）*/
    var ymapTitle=document.createElement('div');
    ymapTitle.id='smZoomYMapTitle';
    ymapTitle.style.cssText='flex:0 0 auto;font-size:12px;color:#2563a8;font-weight:700;';
    ymapCol.appendChild(ymapTitle);

    /* canvas 包裝（flex:1 撐滿剩餘高度）*/
    var ymapCanvasWrap=document.createElement('div');
    ymapCanvasWrap.id='smZoomYMapCanvasWrap';
    ymapCanvasWrap.style.cssText='flex:1;min-height:0;position:relative;overflow:hidden;border-radius:5px;border:1px solid #dde8f8;';

    var ymapCanvas=document.createElement('canvas');
    ymapCanvas.id='smZoomYMapCanvas';
    /* CSS 讓元素撐滿包裝 div；實際 buffer size 由 offsetWidth/offsetHeight 決定 */
    ymapCanvas.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    ymapCanvasWrap.appendChild(ymapCanvas);
    ymapCol.appendChild(ymapCanvasWrap);

    /* 圖例（flex:0，底部）*/
    var ymapLegend=document.createElement('div');
    ymapLegend.id='smZoomYMapLegend';
    ymapLegend.style.cssText='flex:0 0 auto;display:flex;flex-wrap:wrap;gap:3px 8px;font-size:10px;';
    ymapCol.appendChild(ymapLegend);

    /* ────────────────────────────────────────────────
       右欄：Chart.js（flex:1，剩餘寬度）
       ──────────────────────────────────────────────── */
    var chartWrap=document.createElement('div');
    chartWrap.id='smZoomWrap';
    chartWrap.style.cssText='flex:1;min-width:0;position:relative;';

    var zCanvas=document.createElement('canvas');
    zCanvas.id='smZoomCanvas';
    zCanvas.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    chartWrap.appendChild(zCanvas);

    contentRow.appendChild(ymapCol);
    contentRow.appendChild(chartWrap);

    inner.appendChild(closeBtn);
    inner.appendChild(titleDiv);
    inner.appendChild(contentRow);
    modal.appendChild(inner);

    modal.onclick=function(){modal.style.display='none';_smZoomHideYMap();};
    document.body.appendChild(modal);
  }

  var srcChart=smCharts[cid];
  if(!srcChart)return;

  document.getElementById('smZoomTitle').textContent=title+' — 放大檢視';
  modal.style.display='flex';

  /* ── 建立 zoom chart ── */
  var zoomCtx=document.getElementById('smZoomCanvas').getContext('2d');
  if(window._smZoomChart){window._smZoomChart.destroy();window._smZoomChart=null;}

  var opts=JSON.parse(JSON.stringify(srcChart.config.options));
  opts.responsive=true;
  opts.maintainAspectRatio=false;
  opts.onClick=null;

  if(srcChart._tooltipFn){
    if(!opts.plugins)opts.plugins={};
    if(!opts.plugins.tooltip)opts.plugins.tooltip={};
    if(!opts.plugins.tooltip.callbacks)opts.plugins.tooltip.callbacks={};
    opts.plugins.tooltip.callbacks.afterBody=srcChart._tooltipFn;
  }

  try{
    if(opts.scales&&opts.scales.x){
      if(!opts.scales.x.ticks)opts.scales.x.ticks={};
      opts.scales.x.ticks.font={size:18};
    }
    if(opts.scales&&opts.scales.y){
      if(!opts.scales.y.ticks)opts.scales.y.ticks={};
      opts.scales.y.ticks.font={size:18};
      if(opts.scales.y.title)opts.scales.y.title.font={size:20};
    }
    if(opts.plugins&&opts.plugins.legend&&opts.plugins.legend.labels){
      opts.plugins.legend.labels.font={size:18};
      opts.plugins.legend.labels.boxWidth=18;
    }
  }catch(e){}

  var _zDates=srcChart._dates||[];
  var _zRecs=srcChart._expRecs||[];

  opts.onHover=function(event,activeElements){
    var ymapCol=document.getElementById('smZoomYMapCol');
    if(!ymapCol)return;
    if(activeElements&&activeElements.length>0){
      var idx=activeElements[0].index;
      var date=_zDates[idx];
      if(!date){_smZoomHideYMap();return;}
      var dayRecs=_zRecs.filter(function(r){
        return r.date===date&&r.y!=null&&r.y!=='';
      });
      if(!dayRecs.length){_smZoomHideYMap();return;}

      var wasHidden=(ymapCol.style.display!=='flex');
      /* 先顯示欄位（flex-column），讓 DOM layout 發生 */
      ymapCol.style.display='flex';

      /* requestAnimationFrame：等 reflow 後才能取到 offsetHeight */
      requestAnimationFrame(function(){
        _smZoomDrawYMap(dayRecs,date);
        if(wasHidden&&window._smZoomChart){
          /* 圖表 resize（左欄出現，右欄寬度變化）*/
          requestAnimationFrame(function(){
            if(window._smZoomChart)window._smZoomChart.resize();
          });
        }
      });
    }else{
      _smZoomHideYMap();
    }
  };

  window._smZoomChart=new Chart(zoomCtx,{
    type:srcChart.config.type,
    data:JSON.parse(JSON.stringify(srcChart.config.data)),
    options:opts
  });
}

function _smZoomHideYMap(){
  var ymapCol=document.getElementById('smZoomYMapCol');
  if(!ymapCol||ymapCol.style.display==='none')return;
  ymapCol.style.display='none';
  requestAnimationFrame(function(){
    if(window._smZoomChart)window._smZoomChart.resize();
  });
}

function _smZoomDrawYMap(dayRecs,date){
  var canvas=document.getElementById('smZoomYMapCanvas');
  var titleEl=document.getElementById('smZoomYMapTitle');
  var legendEl=document.getElementById('smZoomYMapLegend');
  if(!canvas)return;

  /* ★ 用 offsetWidth/offsetHeight 取得 CSS 佈局後的實際像素大小 */
  var W=canvas.offsetWidth||270;
  var H=canvas.offsetHeight||500;
  /* 設 buffer size = 實際顯示大小（1:1，避免模糊）*/
  canvas.width=W;
  canvas.height=H;

  var ctx=canvas.getContext('2d');
  ctx.fillStyle='#f7f9ff'; ctx.fillRect(0,0,W,H);

  var LPAD=36,RPAD=8,TPAD=12,BPAD=12;
  var IW=W-LPAD-RPAD, IH=H-TPAD-BPAD;

  var yVals=dayRecs.map(function(r){return parseFloat(r.y);}).filter(function(v){return !isNaN(v);});
  var YMax=yVals.length>0?Math.max(220,Math.max.apply(null,yVals)):220;
  function toCY(yv){return TPAD+(1-yv/YMax)*IH;}

  /* 格線 + Y 軸標籤 */
  ctx.font='10px sans-serif'; ctx.textAlign='right'; ctx.textBaseline='middle';
  var step=(YMax<=220)?50:(YMax<=500?100:200);
  for(var yy=0;yy<=YMax;yy+=step){
    var py=toCY(yy);
    ctx.strokeStyle='#dde8f8'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(LPAD,py); ctx.lineTo(W-RPAD,py); ctx.stroke();
    ctx.fillStyle='#7a8faa'; ctx.fillText(yy,LPAD-3,py);
  }

  /* 外框 */
  ctx.strokeStyle='#c0d0e8'; ctx.lineWidth=1;
  ctx.strokeRect(LPAD,TPAD,IW,IH);

  /* Y 橫線 */
  var LV_COLORS={
    '3.0':'#c0392b','2.0':'#2980b9',
    '1.5':'#27ae60','1.0':'#8e44ad',
    '0':'#95a5a6','__na__':'#bdc3c7'
  };
  var lvCounts={};
  dayRecs.forEach(function(r){
    var yv=parseFloat(r.y); if(isNaN(yv))return;
    var lv=(r.lv!=null&&r.lv!=='')?String(r.lv):'__na__';
    var color=LV_COLORS[lv]||'#888';
    var py=toCY(yv);
    ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.globalAlpha=0.85;
    ctx.beginPath(); ctx.moveTo(LPAD+2,py); ctx.lineTo(W-RPAD-2,py); ctx.stroke();
    lvCounts[lv]=(lvCounts[lv]||0)+1;
  });
  ctx.globalAlpha=1;

  /* Y 軸線 */
  ctx.strokeStyle='#a0b8d8'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(LPAD,TPAD); ctx.lineTo(LPAD,TPAD+IH); ctx.stroke();

  /* 標題 */
  if(titleEl)titleEl.textContent='📍 Y 分布　'+date+'　共 '+dayRecs.length+' 條';

  /* 圖例 */
  if(legendEl){
    var LM=[
      ['3.0','#c0392b','LV3.0'],['2.0','#2980b9','LV2.0'],
      ['1.5','#27ae60','LV1.5'],['1.0','#8e44ad','LV1.0'],
      ['0','#95a5a6','LV0'],['__na__','#bdc3c7','無LV']
    ];
    legendEl.innerHTML=LM
      .filter(function(x){return(lvCounts[x[0]]||0)>0;})
      .map(function(x){
        return '<span style="display:inline-flex;align-items:center;gap:3px;">'
          +'<span style="display:inline-block;width:16px;height:3px;border-radius:2px;background:'+x[1]+';"></span>'
          +'<span style="color:#2a4a6e;font-weight:600;">'+x[2]+'</span>'
          +'<span style="color:#6a8ab8;">×'+(lvCounts[x[0]]||0)+'</span></span>';
      }).join('');
  }
}

async function smExport(recs,date,title){if(!date||!recs)return;const rows=recs.filter(r=>r.date===date);if(!rows.length){alert('該日期無資料');return;}if(typeof XLSX==='undefined'){alert('Excel 庫未載入');return;}let matchResults={},matchHdrs=[];try{const tol=parseFloat(document.getElementById('ftol_machine')?.value)||1;const mRecs=rows.map((r,i)=>({idx:i,y:r.y||'0',line:r.line||'',station:r.station||''}));const resp=await fetch(API_BASE+'/api/machine/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:mRecs,tolerance:tol})});const mData=await resp.json();if(mData.success){matchResults=mData.results||{};matchHdrs=mData.headers||[];}}catch(e){}const wantKeys=['tool_id','tool_name','pos','class_desc','x1','y1'];function fuzzyFind(want,hdrs){const wl=want.toLowerCase().replace(/[_\s]/g,'');let f=hdrs.find(h=>h===want);if(f)return f;f=hdrs.find(h=>h.toLowerCase()===want.toLowerCase());if(f)return f;f=hdrs.find(h=>h.toLowerCase().replace(/[_\s]/g,'')===wl);if(f)return f;f=hdrs.find(h=>h.toLowerCase().replace(/[_\s]/g,'').includes(wl)||wl.includes(h.toLowerCase().replace(/[_\s]/g,'')));return f||null;}const resolvedKeys=wantKeys.map(w=>fuzzyFind(w,matchHdrs)).filter(k=>k!==null);const useKeys=resolvedKeys.length>0?resolvedKeys:matchHdrs.filter(h=>h!=='_id');const h=['日期','Model','站點','LINE','Sheet ID','T/C側','X(cm)','Y(cm)','程度(LV)','Note','工號','機台比對(tool_id/tool_name/pos/class_desc/x1/y1)'];const d=rows.map((r,i)=>{const base=[r.date,r.model,r.station,r.line||'',r.sheetId||'',r.tc,r.x!=null?r.x:'',r.y!=null?r.y:'',r.lv,r.note||'',r.empId||''];const matched=matchResults[String(i)]||[];if(matched.length>0&&useKeys.length>0){base.push(matched.map((m,mi)=>(mi+1)+'. '+useKeys.map(k=>k+':'+(m[k]!=null?String(m[k]):'—')).join(' / ')).join('\n'));}else{base.push('');}return base;});const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([h,...d]);ws['!cols']=[{wch:12},{wch:14},{wch:10},{wch:11},{wch:14},{wch:7},{wch:8},{wch:8},{wch:10},{wch:20},{wch:10},{wch:60}];const range=XLSX.utils.decode_range(ws['!ref']);for(let R=1;R<=range.e.r;R++){const cr=XLSX.utils.encode_cell({r:R,c:11});if(ws[cr]&&ws[cr].v){ws[cr].s={alignment:{wrapText:true,vertical:'top'}};}}XLSX.utils.book_append_sheet(wb,ws,'詳細');XLSX.writeFile(wb,'背汙檢_'+title.replace(/\s+/g,'_')+'_'+date+'.xlsx');}


