/* feol_mcmap.js */


// ===== ★ 機台比對：批次比對所有搜尋結果的 Y 值 =====


// ===== ★ 機台比對：單筆手動觸發 =====

function doMachineMatch(idx){

  var r=lastSrch[idx];

  if(!r)return;

  var mc=document.getElementById('mc-'+idx);

  if(mc)mc.innerHTML='<span style="color:#888;font-size:12px;">比對中...</span>';

  var tol=parseFloat(document.getElementById('ftol_machine')?.value)||0.5;

  fetch(API_BASE+'/api/machine/match',{

    method:'POST',

    headers:{'Content-Type':'application/json'},

    body:JSON.stringify({records:[{idx:0,y:r.y||'0',line:r.line||'',station:r.station||''}],tolerance:tol})

  })

  .then(function(res){return res.json();})

  .then(function(data){

    if(!data.success){

      if(mc)mc.innerHTML='<button class="bn bo bsm" onclick="doMachineMatch('+idx+')">&#128269; 重試</button>';

      return;

    }

    var matched=data.results['0']||[];

    var headers=data.headers||[];

    var srcRow=document.getElementById('sr-'+idx);

    if(!srcRow)return;

    var old=document.getElementById('mc-expand-'+idx);

    if(old)old.remove();

    if(!matched.length){

      if(mc)mc.innerHTML='<span style="color:#bbb;font-size:12px;">無比對</span>';

      return;

    }

    if(mc)mc.innerHTML='<button class="bn bp bsm" id="mcbtn-'+idx+'" onclick="toggleMachine('+idx+')">&#128295; 比對到 '+matched.length+' 筆 ▼</button>';

    var expandRow=document.createElement('tr');

    expandRow.id='mc-expand-'+idx;

    expandRow.style.display='none';

    var diffColor=function(d){return Math.abs(d)<=0.5?'#27ae60':Math.abs(d)<=1?'#e67e22':'#c0392b';};

    var tHead=headers.map(function(h){

      return '<th style="background:var(--p);color:#fff;padding:4px 10px;white-space:nowrap;border:1px solid #3a7fc1;font-size:12px;">'+h+'</th>';

    }).join('')+'<th style="background:var(--p);color:#fff;padding:4px 10px;border:1px solid #3a7fc1;font-size:12px;">差距(cm)</th>';

    var tBody=matched.map(function(m,mi){

      var diff=parseFloat(m.y1||0)-parseFloat(r.y||0);

      var tds=headers.map(function(h){

        return '<td style="padding:4px 10px;border:1px solid #e8edf3;font-size:12px;'+(mi%2?'background:#f9fbff;':'')+'">'+(m[h]!=null?m[h]:'')+'</td>';

      }).join('');

      var diffTd='<td style="padding:4px 10px;border:1px solid #e8edf3;font-size:12px;text-align:center;font-weight:600;color:'+diffColor(diff)+';'+(mi%2?'background:#f9fbff;':'')+'">'+(diff>=0?'+':'')+diff.toFixed(2)+'</td>';

      return '<tr>'+tds+diffTd+'</tr>';

    }).join('');

    var _grps=groupByMcToolIdName(matched);

    var _mapsHtml=_grps.map(function(grp,gi){

      var cid='mc-map-'+idx+'-'+gi;

      var lbl=(grp.tool_id||'')+' '+(grp.tool_name||'');

      return '<div style="text-align:center;margin-right:12px;">'

        +'<div style="font-size:10px;color:#1a3a6b;font-weight:600;margin-bottom:2px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+lbl+'">'+lbl+'</div>'

        +'<canvas id="'+cid+'" width="220" height="250" style="border:1px solid #bbb;border-radius:4px;cursor:zoom-in;display:block;background:#e8eef5;"'

        +' onclick="openMcMapModal('+idx+','+gi+')" title="點擊放大"></canvas>'

        +'</div>';

    }).join('');

    var colspan=document.querySelector('.st thead tr')?.children.length||16;

    expandRow.innerHTML=

      '<td colspan="'+colspan+'" style="padding:10px 16px;background:#eef5ff;border-left:4px solid var(--p);">'

      +'<div style="font-weight:600;color:var(--p);margin-bottom:6px;font-size:13px;">'

      +'&#128295; 機台比對 — Y='+r.y+' cm，line='+r.line+'，共 '+matched.length+' 筆（由近到遠）</div>'

      +'<div style="overflow-x:auto;margin-bottom:14px;">'

      +'<table style="border-collapse:collapse;"><thead><tr>'+tHead+'</tr></thead><tbody>'+tBody+'</tbody></table>'

      +'</div>'

      +'<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start;">'+_mapsHtml+'</div>'

      +'</td>';

    srcRow.insertAdjacentElement('afterend',expandRow);

    _grps.forEach(function(grp,gi){

      initMcMap('mc-map-'+idx+'-'+gi,grp.records,parseFloat(r.y)||0);

    });

  })

  .catch(function(e){

    if(mc)mc.innerHTML='<button class="bn bo bsm" onclick="doMachineMatch('+idx+')">&#128269; 機台比對</button>';

    console.error('機台比對失敗:',e);

  });

}

function matchMachineData(records){

  if(!records||!records.length)return;

  const tolerance=parseFloat(document.getElementById('ftol_machine')?.value)||0.5;

  const matchRecords=records.map((r,i)=>({

    idx:i, y:r.y||'0', line:r.line||'', station:r.station||''

  }));

  if(matchRecords.every(r=>!r.y||r.y==='0')){

    records.forEach((r,i)=>{

      const mc=document.getElementById('mc-'+i);

      if(mc)mc.innerHTML='<span style="color:#bbb;font-size:12px;">Y 值空白</span>';

    });

    return;

  }

  fetch(API_BASE+'/api/machine/match',{

    method:'POST',

    headers:{'Content-Type':'application/json'},

    body:JSON.stringify({records:matchRecords, tolerance:tolerance})

  })

  .then(r=>r.json())

  .then(data=>{

    if(!data.success){

      records.forEach((r,i)=>{

        const mc=document.getElementById('mc-'+i);

        if(mc)mc.innerHTML='<span style="color:#e74c3c;font-size:12px;">比對失敗</span>';

      });

      return;

    }

    const results=data.results;

    const headers=data.headers||[];

    document.querySelectorAll('[id^="mc-expand-"]').forEach(el=>el.remove());

    records.forEach((r,i)=>{

      const mc=document.getElementById('mc-'+i);

      if(!mc)return;

      const matched=results[String(i)]||[];

      if(!matched.length){

        mc.innerHTML='<span style="color:#bbb;font-size:12px;">無比對</span>';

        return;

      }

      mc.innerHTML=

        '<button class="bn bp bsm" id="mcbtn-'+i+'" onclick="toggleMachine('+i+')">'

        +'🔧 比對到 '+matched.length+' 筆 ▼</button>';

      const srcRow=document.getElementById('sr-'+i);

      if(!srcRow)return;

      const expandRow=document.createElement('tr');

      expandRow.id='mc-expand-'+i;

      expandRow.style.display='none';

      const diffColor=diff=>Math.abs(diff)<=0.5?'#27ae60':Math.abs(diff)<=1?'#e67e22':'#c0392b';

      const tHead=headers.map(h=>

        '<th style="background:var(--p);color:#fff;padding:4px 10px;white-space:nowrap;'

        +'border:1px solid #3a7fc1;font-size:12px;">'+h+'</th>'

      ).join('')

      +'<th style="background:var(--p);color:#fff;padding:4px 10px;border:1px solid #3a7fc1;'

      +'font-size:12px;white-space:nowrap;">差距(cm)</th>';

      const tBody=matched.map((m,mi)=>{

        const diff=parseFloat(m.y1||0)-parseFloat(r.y||0);

        const tds=headers.map(h=>

          '<td style="padding:4px 10px;border:1px solid #e8edf3;font-size:12px;'

          +(mi%2?'background:#f9fbff;':'')+'">'

          +(m[h]!=null?m[h]:'')+'</td>'

        ).join('');

        const diffTd=

          '<td style="padding:4px 10px;border:1px solid #e8edf3;font-size:12px;'

          +'text-align:center;font-weight:600;color:'+diffColor(diff)+';'

          +(mi%2?'background:#f9fbff;':'')+'">'

          +(diff>=0?'+':'')+diff.toFixed(2)+'</td>';

        return '<tr>'+tds+diffTd+'</tr>';

      }).join('');

      const colspan=document.querySelector('.st thead tr')?.children.length||16;

      var _mcGroups=groupByMcToolIdName(matched);

      var _mcMapsHtml=_mcGroups.map(function(grp,gi){

        var cid='mc-map-'+i+'-'+gi;

        var lbl=(grp.tool_id||'')+' '+(grp.tool_name||'');

        return '<div style="margin-bottom:8px;">'

          +'<div style="font-size:10px;color:#1a3a6b;font-weight:600;margin-bottom:2px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+lbl+'">'+lbl+'</div>'

          +'<canvas id="'+cid+'" width="200" height="227" style="border:1px solid #ccc;border-radius:4px;cursor:zoom-in;display:block;background:#f5f7fa;" '

          +'onclick="openMcMapModal('+i+','+gi+')" title="\u9ede\u64ca\u653e\u5927"></canvas>'

          +'</div>';

      }).join('');

      expandRow.innerHTML=

        '<td colspan="'+colspan+'" style="padding:10px 16px;background:#eef5ff;'

        +'border-left:4px solid var(--p);">'

        +'<div style="font-weight:600;color:var(--p);margin-bottom:6px;font-size:13px;">'

        +'🔧 機台比對 — Y='+r.y+' cm，line='+r.line+'，共 '+matched.length+' 筆（由近到遠）</div>'

        +'<div style="overflow-x:auto;margin-bottom:12px;">'

        +'<table style="border-collapse:collapse;">'

        +'<thead><tr>'+tHead+'</tr></thead>'

        +'<tbody>'+tBody+'</tbody>'

        +'</table></div>'

        +'<div style="display:flex;flex-wrap:wrap;gap:10px;padding-top:6px;">'+_mcMapsHtml+'</div>'

        +'</td>';

      srcRow.insertAdjacentElement('afterend', expandRow);

      _mcPendingMaps[i]=_mcGroups.map(function(grp,gi){return {canvasId:'mc-map-'+i+'-'+gi,matchedRecs:grp.records,userY_cm:parseFloat(r.y)||0};});

    });

  })

  .catch(e=>console.error('機台比對失敗：', e));

}


// ===== ★ 機台位置圖 =====

var _mcBgImg=null, _mcBgLoading=false, _mcBgCbs=[];

function loadMcBgImg(cb){

  if(_mcBgImg){cb(_mcBgImg);return;}

  _mcBgCbs.push(cb);

  if(_mcBgLoading)return;

  _mcBgLoading=true;

  var img=new Image();

  img.onload=function(){_mcBgImg=img;_mcBgCbs.forEach(function(f){f(img);});_mcBgCbs=[];};

  img.onerror=function(){_mcBgLoading=false;_mcBgImg=null;_mcBgCbs.forEach(function(f){f(null);});_mcBgCbs=[];};

  img.src=API_BASE+'/api/machine/map_image';

}

function groupByMcToolIdName(matched){

  var groups={};

  matched.forEach(function(m){

    var k=(m.tool_id||'')+'|'+(m.tool_name||'');

    if(!groups[k])groups[k]={tool_id:m.tool_id,tool_name:m.tool_name,records:[]};

    groups[k].records.push(m);

  });

  return Object.values(groups);

}


// ===== ★ 機台圖 hover tooltip =====

function setupMcMapHover(canvas,ckey){
  /* v4: 只更新指針，單一 window listener 負責所有 hover */
  _mcActiveHover={canvas:canvas,ckey:ckey};
}

function drawMcMap(canvas,bgImg,allRecs,matchedRecs,userY_cm){

  var W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d');

  var XM=2500,YM=2200;  // mm, 原點在右上

  var PAD=W<=220?8:14;

  var IW=W-PAD*2,IH=H-PAD*2;

  // 原點在右上：X 累加方向從右到左，Y 累加方向從上到下

  var tx=function(x_mm){return PAD+(XM-x_mm)/XM*IW;};  // X 翻轉

  var ty=function(y_mm){return PAD+y_mm/YM*IH;};

  ctx.clearRect(0,0,W,H);

  if(bgImg){

    ctx.drawImage(bgImg,PAD,PAD,IW,IH);

    ctx.fillStyle='rgba(255,255,255,0.35)';ctx.fillRect(PAD,PAD,IW,IH);

  }else{

    ctx.fillStyle='#e0e8f0';ctx.fillRect(0,0,W,H);

    ctx.strokeStyle='#a0b4c8';ctx.lineWidth=0.8;

    for(var ci=0;ci<=11;ci++){var lx=PAD+ci/11*IW;ctx.beginPath();ctx.moveTo(lx,PAD);ctx.lineTo(lx,PAD+IH);ctx.stroke();}

    for(var ri=0;ri<=7;ri++){var ly=PAD+ri/7*IH;ctx.beginPath();ctx.moveTo(PAD,ly);ctx.lineTo(PAD+IW,ly);ctx.stroke();}

  }

  ctx.strokeStyle='#7a96b0';ctx.lineWidth=1;ctx.strokeRect(PAD,PAD,IW,IH);

  // 機台 y1(cm)×10=mm 畫深藍線

  var allY_mm=[];

  allRecs.forEach(function(m){

    var ym=parseFloat(m.y1||0)*10;

    if(!isNaN(ym)&&allY_mm.indexOf(ym)<0)allY_mm.push(ym);

  });

  var lw=W<=220?2:3;

  ctx.strokeStyle='#1a3a6b';ctx.lineWidth=lw;ctx.globalAlpha=0.85;

  allY_mm.forEach(function(ym){

    var segs=[];

    allRecs.forEach(function(m){

      if(Math.abs(parseFloat(m.y1||0)*10-ym)<0.1){

        var x1=parseFloat(m.x1||0),x2=parseFloat(m.x2||0);

        if(x2>x1&&x2>0)segs.push([x1,x2]);

      }

    });

    var cy=ty(ym);

    if(segs.length>0){

      // 有線段：注意 X 翻轉（原點在右）

      segs.forEach(function(s){ctx.beginPath();ctx.moveTo(tx(s[0]),cy);ctx.lineTo(tx(s[1]),cy);ctx.stroke();});

    }else{

      ctx.beginPath();ctx.moveTo(PAD,cy);ctx.lineTo(PAD+IW,cy);ctx.stroke();

    }

  });

  // user Y(cm)×10=mm 畫紅線

  ctx.globalAlpha=1;

  if(userY_cm&&!isNaN(userY_cm)&&userY_cm>0){

    var rcy=ty(userY_cm*10);

    ctx.strokeStyle='#e74c3c';ctx.lineWidth=lw+1;

    ctx.beginPath();ctx.moveTo(PAD,rcy);ctx.lineTo(PAD+IW,rcy);ctx.stroke();

  }

  // 右下角計數

  ctx.globalAlpha=0.8;

  ctx.fillStyle='rgba(0,0,0,0.5)';

  var lbl2='— '+allY_mm.length+' / — 1';

  var tw2=ctx.measureText(lbl2).width+8;

  ctx.fillRect(W-PAD-tw2,H-PAD-16,tw2,16);

  ctx.fillStyle='#fff';ctx.font='bold '+(W<=220?9:10)+'px sans-serif';ctx.textAlign='center';

  ctx.fillText(lbl2,W-PAD-tw2/2,H-PAD-4);

  ctx.globalAlpha=1;ctx.textAlign='start';

}

var _mcPendingMaps={};

var _mcMapData={};
/* ★ v4 MC Map hover — 單一 window listener + _mcActiveHover 指針 */
var _mcActiveHover={canvas:null,ckey:null};
(function(){
  var _tip=null;
  function tip(){if(!_tip)_tip=document.getElementById('mcMapTooltip');return _tip;}

  window.addEventListener('mousemove',function(e){
    var ah=_mcActiveHover;
    if(!ah||!ah.canvas||!ah.ckey){var t=tip();if(t)t.style.display='none';return;}
    var canvas=ah.canvas,ckey=ah.ckey;
    var d=_mcMapData[ckey];
    if(!d||!d.allRecs||!d.allRecs.length){var t=tip();if(t)t.style.display='none';return;}

    /* canvas 必須可見 */
    var rect=canvas.getBoundingClientRect();
    if(rect.width===0||rect.height===0){var t=tip();if(t)t.style.display='none';return;}

    /* 確認滑鼠在 canvas 範圍內 */
    if(e.clientX<rect.left||e.clientX>rect.right||
       e.clientY<rect.top||e.clientY>rect.bottom){
      var t=tip();if(t)t.style.display='none';return;
    }

    /* 預建唯一 y_cm Map（只建一次） */
    if(!d._yMap){
      d._yMap={};
      d.allRecs.forEach(function(m){
        var v=parseFloat(m.y1);
        if(isNaN(v))return;
        var k=v.toFixed(3);
        if(!d._yMap[k])d._yMap[k]=m;
      });
      d._yKeys=Object.keys(d._yMap).map(Number).sort(function(a,b){return a-b;});
    }

    var PAD=canvas.width<=220?8:14;
    var IH=canvas.height-PAD*2;
    var YM=2200;

    /* 頁面座標 → y_cm */
    var scaleY=canvas.height/rect.height;
    var cy=(e.clientY-rect.top)*scaleY;
    var y_cm=(cy-PAD)/IH*(YM/10);

    /* 線性掃描找最近 y1（keys 最多 ~50，速度夠） */
    var keys=d._yKeys,best=null,bestDist=Infinity;
    for(var ki=0;ki<keys.length;ki++){
      var dist=Math.abs(keys[ki]-y_cm);
      if(dist<bestDist){bestDist=dist;best=d._yMap[keys[ki].toFixed(3)];}
    }

    var threshold=(YM/10)*0.08;
    var t2=tip();
    if(!t2)return;
    if(best&&bestDist<threshold){
      var isMatched=d.matchedRecs&&d.matchedRecs.some(function(m){
        return Math.abs(parseFloat(m.y1||0)-parseFloat(best.y1||0))<0.05;
      });
      t2.innerHTML=
        '<div style="font-weight:700;font-size:13px;color:#fff;margin-bottom:4px;">'
        +'y1 = '+(best.y1||'?')+' cm'
        +(isMatched?' &nbsp;<span style="color:#ff0;font-size:11px;">★ 比對到</span>':'')
        +'</div>'
        +'<hr style="border:0;border-top:1px solid rgba(200,220,255,.3);margin:4px 0;">'
        +'<div style="font-size:11px;color:#adf;margin-bottom:3px;">'+(best.tool_id||'')+' '+(best.tool_name||'')+'</div>'
        +'<table style="border-collapse:collapse;font-size:11px;">'
        +'<tr><td style="color:#cde;padding-right:8px;">pos</td><td>'+(best.pos||'-')+'</td></tr>'
        +'<tr><td style="color:#cde;">class</td><td>'+(best['class']||'-')+'</td></tr>'
        +'<tr><td style="color:#cde;">class_desc</td><td style="max-width:160px;word-break:break-word;">'+(best.class_desc||'-')+'</td></tr>'
        +'<tr><td style="color:#cde;">x1</td><td>'+(best.x1||'-')+' mm</td></tr>'
        +'</table>';
      t2.style.display='block';
      var tx=e.clientX+16,ty=e.clientY-12;
      if(tx+330>window.innerWidth)tx=e.clientX-340;
      if(ty+220>window.innerHeight)ty=e.clientY-230;
      if(tx<4)tx=4;if(ty<4)ty=4;
      t2.style.left=tx+'px';t2.style.top=ty+'px';
    }else{
      t2.style.display='none';
    }
  });
})();

/* ★ v4: 單一全域 hover listener */
var _mcActiveHover={canvas:null,ckey:null};
(function(){
  var tip=null;
  function ensureTip(){if(!tip)tip=document.getElementById('mcMapTooltip');return tip;}

  window.addEventListener('mousemove',function(e){
    var ah=_mcActiveHover;
    if(!ah||!ah.canvas||!ah.ckey){if(ensureTip())tip.style.display='none';return;}
    var canvas=ah.canvas,ckey=ah.ckey;
    var d=_mcMapData[ckey];
    if(!d||!d.allRecs||!d.allRecs.length){if(ensureTip())tip.style.display='none';return;}

    /* 確認 canvas 目前可見且在頁面上 */
    var rect=canvas.getBoundingClientRect();
    if(rect.width===0||rect.height===0){if(ensureTip())tip.style.display='none';return;}

    /* 確認滑鼠在 canvas 範圍內 */
    if(e.clientX<rect.left||e.clientX>rect.right||
       e.clientY<rect.top||e.clientY>rect.bottom){
      if(ensureTip())tip.style.display='none';return;
    }

    /* 預建唯一 y_cm Map（只建一次） */
    if(!d._yMap){
      d._yMap={};
      d.allRecs.forEach(function(m){
        var v=parseFloat(m.y1);
        if(isNaN(v))return;
        var k=v.toFixed(3);
        if(!d._yMap[k])d._yMap[k]=m;
      });
      d._yKeys=Object.keys(d._yMap).map(Number).sort(function(a,b){return a-b;});
    }

    var PAD=canvas.width<=220?8:14;
    var IH=canvas.height-PAD*2;
    var YM=2200;/* mm */

    /* 頁面座標 → canvas 像素座標 → y_cm */
    var scaleY=canvas.height/rect.height;
    var cy=(e.clientY-rect.top)*scaleY;
    var y_cm=(cy-PAD)/IH*(YM/10);/* YM in mm → /10 = cm */

    /* 找最近的 y1（cm），線性掃描（keys 最多 ~50 條，很快） */
    var keys=d._yKeys;
    var best=null,bestDist=Infinity;
    for(var ki=0;ki<keys.length;ki++){
      var dist=Math.abs(keys[ki]-y_cm);
      if(dist<bestDist){bestDist=dist;best=d._yMap[keys[ki].toFixed(3)];}
    }

    var threshold=(YM/10)*0.08;/* 17.6 cm：每根線間距約 7-8cm，2倍寬鬆 */
    if(!ensureTip())return;
    if(best&&bestDist<threshold){
      var isMatched=d.matchedRecs&&d.matchedRecs.some(function(m){
        return Math.abs(parseFloat(m.y1||0)-parseFloat(best.y1||0))<0.05;
      });
      tip.innerHTML=
        '<div style="font-weight:700;font-size:13px;color:#fff;margin-bottom:4px;">'
        +'y1 = '+(best.y1||'?')+' cm'
        +(isMatched?' &nbsp;<span style="color:#ff0;font-size:11px;">★ 比對到</span>':'')
        +'</div>'
        +'<hr style="border:0;border-top:1px solid rgba(200,220,255,.3);margin:4px 0;">'
        +'<div style="font-size:11px;color:#adf;margin-bottom:3px;">'+(best.tool_id||'')+' '+(best.tool_name||'')+'</div>'
        +'<table style="border-collapse:collapse;font-size:11px;">'
        +'<tr><td style="color:#cde;padding-right:8px;">pos</td><td>'+(best.pos||'-')+'</td></tr>'
        +'<tr><td style="color:#cde;">class</td><td>'+(best['class']||'-')+'</td></tr>'
        +'<tr><td style="color:#cde;">class_desc</td><td style="max-width:160px;word-break:break-word;">'+(best.class_desc||'-')+'</td></tr>'
        +'<tr><td style="color:#cde;">x1</td><td>'+(best.x1||'-')+' mm</td></tr>'
        +'</table>';
      tip.style.display='block';
      var tx=e.clientX+16,ty=e.clientY-12;
      if(tx+330>window.innerWidth)tx=e.clientX-340;
      if(ty+220>window.innerHeight)ty=e.clientY-230;
      if(tx<4)tx=4;if(ty<4)ty=4;
      tip.style.left=tx+'px';tip.style.top=ty+'px';
    }else{
      tip.style.display='none';
    }
  });
})();

function initMcMap(canvasId,matchedRecs,userY_cm){

  var canvas=document.getElementById(canvasId);

  if(!canvas)return;

  var tool_id=matchedRecs[0]?matchedRecs[0].tool_id:'';

  var tool_name=matchedRecs[0]?matchedRecs[0].tool_name:'';

  var ckey=canvasId;

  fetch(API_BASE+'/api/machine/all_positions?'+new URLSearchParams({tool_id:tool_id,tool_name:tool_name}))

  .then(function(r){return r.json();})

  .then(function(data){

    var all=data.success?data.records:matchedRecs;if(all.length>0&&tool_id){var _filtered=all.filter(function(r){return r.tool_id===tool_id&&r.tool_name===tool_name;});if(_filtered.length>0)all=_filtered;}

    _mcMapData[ckey]={allRecs:all,matchedRecs:matchedRecs,userY_cm:userY_cm};

    setupMcMapHover(canvas,ckey);

    loadMcBgImg(function(bg){drawMcMap(canvas,bg,all,matchedRecs,userY_cm);});

  })

  .catch(function(){

    _mcMapData[ckey]={allRecs:matchedRecs,matchedRecs:matchedRecs,userY_cm:userY_cm};

    loadMcBgImg(function(bg){drawMcMap(canvas,bg,matchedRecs,matchedRecs,userY_cm);});

  });

}

function openMcMapModal(rowIdx,groupIdx){

  var ckey='mc-map-'+rowIdx+'-'+groupIdx;

  var d=_mcMapData[ckey];

  if(!d)return;

  var mc=document.getElementById('mcMapModalCanvas');

  if(!mc)return;

  var lbl=document.getElementById('mcMapModalLabel');

  if(lbl){var r0=d.matchedRecs[0]||{};lbl.textContent=(r0.tool_id||'')+' '+(r0.tool_name||'');}

  loadMcBgImg(function(bg){drawMcMap(mc,bg,d.allRecs,d.matchedRecs,d.userY_cm);});

  setupMcMapHover(mc,ckey);

  const _mcm=document.getElementById('mcMapModal');if(_mcm.parentElement!==document.body)document.body.appendChild(_mcm);_mcm.style.display='flex';

}

function closeMcMapModal(e){

  if(e&&e.target!==document.getElementById('mcMapModal'))return;

  _mcActiveHover={canvas:null,ckey:null};var _t=document.getElementById('mcMapTooltip');if(_t)_t.style.display='none';_mcActiveHover={canvas:null,ckey:null};var _mct=document.getElementById('mcMapTooltip');if(_mct)_mct.style.display='none';document.getElementById('mcMapModal').style.display='none';

}


// ===== ★ 機台比對：展開 / 收起 =====


// ===== ★ 機台比對：展開 / 收起 =====

function toggleMachine(idx){

  const row=document.getElementById('mc-expand-'+idx);

  const btn=document.getElementById('mcbtn-'+idx);

  if(!row||!btn)return;

  if(row.style.display==='none'){

    row.style.display='';

    btn.innerHTML=btn.innerHTML.replace('▼','▲');

    // 首次展開才畫圖

    if(_mcPendingMaps[idx]){

      _mcPendingMaps[idx].forEach(function(d){

        initMcMap(d.canvasId,d.matchedRecs,d.userY_cm);

      });

      delete _mcPendingMaps[idx];

    }

  }else{

    row.style.display='none';

    btn.innerHTML=btn.innerHTML.replace('▲','▼');

  }

}


