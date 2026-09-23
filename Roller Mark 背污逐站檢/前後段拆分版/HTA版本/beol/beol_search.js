let lastSrch=[];

// 修改說明 202609041720：
//   問題2修正：doSrch 改名為 bDoSrch，對應 beol_b_main.js 與 beol.html 的呼叫
//   其他所有邏輯、內容完全不動

function doSrch(){
  const ff=document.getElementById('ff').value,ft=document.getElementById('ft').value;
  const fm=document.getElementById('fm').value,fst=document.getElementById('fst').value;
  const fl=document.getElementById('fl').value,ftc=document.getElementById('ftc').value;
  const flv=document.getElementById('flv').value;
  const femp=document.getElementById('femp');
  const params=new URLSearchParams({
    dateFrom:ff||'',dateTo:ft||'',model:fm||'',
    station:fst||'',line:fl||'',tc:ftc||'',level:flv||'',
    empId:femp?femp.value.trim():'',
    sheetId:(document.getElementById('fsheetid')||{value:''}).value.trim()
  });
  fetch(API_BASE+'/api/search?'+params)
  .then(r=>r.json())
  .then(data=>{
    if(!data.success){toast('查詢失敗：'+data.error,'err');return;}
    const rs=data.records||[];
    lastSrch=rs;
    document.getElementById('rs').textContent=`共找到 ${rs.length} 筆`;
    const tb=document.getElementById('sb');
    if(!rs.length){tb.innerHTML='<tr><td colspan="15" class="nd">查無資料</td></tr>';return;}
    setTimeout(()=>matchMachineData(rs), 50);
    setTimeout(()=>checkIsNew(rs), 100);
    setTimeout(()=>updDelBtn(), 50);
    tb.innerHTML=rs.map((r,i)=>`<tr id="sr-${i}">
      <td style="text-align:center"><input type="checkbox" class="delChk" onchange="updDelBtn()" data-idx="${i}" data-created-at="${r.createdAt||''}" data-date="${r.date||''}"></td>
      <td>${i+1}</td>
      <td id="ed-date-${i}">${r.date||''}</td>
      <td id="ed-model-${i}">${r.model||''}</td>
      <td id="ed-station-${i}">${r.station||''}</td>
      <td id="ed-line-${i}">${r.line||'-'}</td>
      <td id="ed-sid-${i}">${r.sheetId||''}</td>
      <td id="ed-tc-${i}">${r.tc||''}</td>
      <td id="ed-x-${i}">${r.x!=null?r.x:''}</td>
      <td id="ed-y-${i}">${r.y!=null?r.y:''}</td>
      <td id="ed-lv-${i}">${bdg(r.lv)}</td>
      <td id="ed-note-${i}">${r.note||''}</td>
      <td id="ed-photo-${i}">${phCell(r.photoUrls)}</td>
      <td id="ed-empId-${i}">${r.empId||''}</td>
      <td id="op-${i}"><button class="bn bp bsm" onclick="startEdit(${i})">✏️ 修改</button></td>
    </tr>`).join('');
  })
  .catch(e=>toast('連線錯誤：'+e.message,'err'));
}

function bDoSrch(){
  const ff=document.getElementById('b-ff').value,ft=document.getElementById('b-ft').value;
  const fm=document.getElementById('b-fm').value,fst=document.getElementById('b-fst').value;
  const fl=document.getElementById('b-fl').value,ftc=document.getElementById('b-ftc').value;
  const flv=document.getElementById('b-flv').value;
  const femp=document.getElementById('b-femp');
  const fchip=document.getElementById('b-fchip');
  const fmid=document.getElementById('b-fmid');
  const params=new URLSearchParams({
    dateFrom:ff||'',dateTo:ft||'',model:fm||'',
    station:fst||'',line:fl||'',tc:ftc||'',level:flv||'',
    empId:femp?femp.value.trim():'',
    chipId:fchip?fchip.value.trim():'',
    midId:fmid?fmid.value.trim():''
  });
  fetch(API_BASE+'/api/beol/search?'+params)
  .then(r=>r.json())
  .then(data=>{
    if(!data.success){toast('查詢失敗：'+data.error,'err');return;}
    const rs=data.records||[];
    bLastSrch=rs;
    document.getElementById('b-rs2').textContent=`共找到 ${rs.length} 筆`;
    const tb=document.getElementById('b-sb2');
    if(!rs.length){tb.innerHTML='<tr><td colspan="19" class="nd">查無資料</td></tr>';return;}
    setTimeout(()=>bUpdDelBtn(), 50);
    tb.innerHTML=rs.map((r,i)=>`<tr>
      <td style="text-align:center"><input type="checkbox" class="b-delChk" onchange="bUpdDelBtn()" data-idx="${i}" data-created-at="${r.createdAt||''}" data-date="${r.date||''}"></td>
      <td>${i+1}</td>
      <td id="bed-date-${i}">${r.date||''}</td>
      <td id="bed-model-${i}">${r.model||''}</td>
      <td id="bed-station-${i}">${r.station||''}</td>
      <td id="bed-line-${i}">${r.line||'-'}</td>
      <td id="bed-mid-${i}">${r.midId||''}</td>
      <td id="bed-chip-${i}">${r.chipId||''}</td>
      <td id="bed-tc-${i}">${r.tc||''}</td>
      <td id="bed-x-${i}">${r.x!=null?r.x:''}</td>
      <td id="bed-y-${i}">${r.y!=null?r.y:''}</td>
      <td id="bed-mo-${i}">${r.morphology||''}</td>
      <td id="bed-lv-${i}">${r.level||''}</td>
      <td id="bed-ito-${i}">${r.ito||''}</td>
      <td id="bed-note-${i}">${r.note||''}</td>
      <td id="bed-ph-${i}">${bPhCell(r.photoUrls)}</td>
      <td id="bed-om-${i}">${bPhCell(r.omPhotoUrls)}</td>
      <td id="bed-emp-${i}">${r.empId||''}</td>
      <td id="bop-${i}"><button class="bn bp bsm" onclick="bStartEdit(${i})">✏️ 修改</button></td>
    </tr>`).join('');
  })
  .catch(e=>toast('連線錯誤：'+e.message,'err'));
}



function phCell(photoUrls){

  if(!photoUrls||!photoUrls.length)return '<span style="color:#ccc;font-size:12px;">—</span>';

  return `<div class="ph-cell">${photoUrls.map(url=>{

    const fname=url.split('\\').pop()||url;

    const proxyUrl=API_BASE+'/api/photo?path='+encodeURIComponent(url);

    return `<img class="pt" src="${proxyUrl}" title="${fname}" onclick="opM('${proxyUrl}','${escQ(fname)}')">`;

  }).join('')}</div>`;

}

function escQ(s){return (s||'').replace(/'/g,"\\'");}

function bdg(lv){const nm={'0':'0','0.0':'0','1':'1','1.0':'1','1.5':'1.5','2':'2.0','2.0':'2.0','3':'3.0','3.0':'3.0'};const nv=nm[String(lv).trim()]!==undefined?nm[String(lv).trim()]:String(lv||'').trim();const c={'0':'bl0','1':'bl1','1.5':'bl15','2.0':'bl2','3.0':'bl3'}[nv]||'bl0';return`<span class="bdg ${c}">LV ${lv||'-'}</span>`;}

function clrF(){

  document.getElementById('ff').value='';document.getElementById('ft').value='';

  document.getElementById('fm').value='';document.getElementById('fst').value='';

  document.getElementById('fl').innerHTML='<option value="">全部</option>';

  document.getElementById('ftc').value='';document.getElementById('flv').value='';

  document.getElementById('sb2').innerHTML='<tr><td colspan="16" class="nd">請先設定篩選條件後按「搜尋」</td></tr>';

  document.getElementById('rs2').textContent='';

  const fempEl=document.getElementById('femp');if(fempEl)fempEl.value='';

  const fsidEl=document.getElementById('fsheetid');if(fsidEl)fsidEl.value='';

}



// ===== ★ 修改：匯出 Excel → 呼叫後端 =====

function expXLSX(){

  const params=new URLSearchParams({

    dateFrom:document.getElementById('ff').value||'',

    dateTo:document.getElementById('ft').value||'',

    model:document.getElementById('fm').value||'',

    station:document.getElementById('fst').value||'',

    line:document.getElementById('fl').value||'',

    tc:document.getElementById('ftc').value||'',

    level:document.getElementById('flv').value||'',

    empId:(document.getElementById('femp')||{}).value||''

  });

  window.location.href=API_BASE+'/api/export?'+params;

}



// ===== 照片放大 Modal（與原始版完全一致） =====

function opM(src,name){

  var pmo=document.getElementById('pmo');

  if(pmo && pmo.parentElement!==document.body){document.body.appendChild(pmo);}

  document.getElementById('pmi').src=src;

  document.getElementById('pmt').textContent=name||'';

  pmo.classList.add('on');

  document.body.style.overflow='hidden';

}

function clPM(e){

  if(!e||e.target.id==='pmo'||e.target.classList.contains('mc2')){

    document.getElementById('pmo').classList.remove('on');

    document.getElementById('pmi').src='';

    document.body.style.overflow='';

  }

}

document.addEventListener('keydown',e=>{if(e.key==='Escape')clPM({target:{id:'pmo'}});});



// ===== ★ 搜尋結果編輯功能 =====

let editingIdx = null;

const editPhotoState = {};



function startEdit(i){

  if(editingIdx !== null && editingIdx !== i){

    if(!confirm('目前有未儲存的修改，確定放棄？'))return;

    cancelEdit(editingIdx);

  }

  editingIdx = i;

  const r = lastSrch[i];

  if(!r)return;

  editPhotoState[i] = {deleted:[], newFiles:[]};



  document.getElementById('op-'+i).innerHTML =

    '<button class="bn bs bsm" onclick="saveEditRow('+i+')">✅ 儲存</button> '

    +'<button class="bn bo bsm" onclick="cancelEdit('+i+')">❌ 取消</button>';



  document.getElementById('ed-date-'+i).innerHTML =

    '<input type="date" id="ei-date-'+i+'" value="'+(r.date||'')+'">';



  const smEl = document.getElementById('sm');

  const modelOpts = smEl ? smEl.innerHTML : '';

  document.getElementById('ed-model-'+i).innerHTML =

    '<select id="ei-model-'+i+'">'+modelOpts+'</select>';

  const mdSel = document.getElementById('ei-model-'+i);

  if(mdSel) mdSel.value = r.model||'';



  const stations=['PI 前','PI 後','PA 後','ODF 後','AGX 後','BS ITO 後'];

  const stBtns = stations.map(st=>

    '<div class="ch'+(st===r.station?' on':'')+'" '

    +'onclick="editSelSt(this,'+i+',\''+st+'\')">'+(st)+'</div>'

  ).join('');

  document.getElementById('ed-station-'+i).innerHTML =

    '<div class="cg" id="ei-st-'+i+'">'+stBtns+'</div>';



  editUpdLine(i, r.station||'', r.line||'');



  document.getElementById('ed-sid-'+i).innerHTML =

    '<input type="text" id="ei-sid-'+i+'" value="'+(r.sheetId||'')+'" style="width:90px">';



  const tcBtns=['T','C'].map(tc=>

    '<div class="mi'+(tc===r.tc?' on':'')+'" '

    +'onclick="editTogSingle(this)">'+tc+'</div>'

  ).join('');

  document.getElementById('ed-tc-'+i).innerHTML =

    '<div class="mc" id="ei-tc-'+i+'">'+tcBtns+'</div>';



  document.getElementById('ed-x-'+i).innerHTML =

    '<input type="number" id="ei-x-'+i+'" value="'+(r.x||'')+'" step="0.1" style="width:68px">';

  document.getElementById('ed-y-'+i).innerHTML =

    '<input type="number" id="ei-y-'+i+'" value="'+(r.y||'')+'" step="0.1" style="width:68px">';



  const lvBtns=['0','1','1.5','2.0','3.0'].map(lv=>

    '<div class="mi'+(lv===r.lv?' on':'')+'" '

    +'onclick="editTogSingle(this)">'+lv+'</div>'

  ).join('');

  document.getElementById('ed-lv-'+i).innerHTML =

    '<div class="mc" id="ei-lv-'+i+'">'+lvBtns+'</div>';



  document.getElementById('ed-note-'+i).innerHTML =

    '<textarea id="ei-note-'+i+'" rows="2" style="min-width:100px">'+(r.note||'')+'</textarea>';



  editRenderPhotos(i, r.photoUrls||[]);



  document.getElementById('ed-empId-'+i).innerHTML =

    '<input type="text" id="ei-empId-'+i+'" value="'+(r.empId||'')+'" style="width:80px">';

}


function editSelSt(el, i, st){
  el.closest('.cg').querySelectorAll('.ch').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  editUpdLine(i, st, '');
}

function editUpdLine(i, station, selLine){
  const lines = SL[station]||[];
  const lnBtns = lines.map(l=>
    '<div class="lc'+(l===selLine?' on':'')+'" onclick="editTogLine(this)">'+l+'</div>'
  ).join('');
  document.getElementById('ed-line-'+i).innerHTML =
    '<div class="lg" id="ei-ln-'+i+'">'+(lnBtns||'<span class="lp">無 LINE</span>')+'</div>';
}

function editTogLine(el){
  el.closest('.lg').querySelectorAll('.lc').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
}

function editTogSingle(el){
  el.closest('.mc').querySelectorAll('.mi').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
}

function editRenderPhotos(i, urls){
  const state = editPhotoState[i];
  const existingHtml = urls
    .filter(u=>!state.deleted.includes(u))
    .map(u=>{
      const fname=u.split('\\').pop()||u;
      const proxy=API_BASE+'/api/photo?path='+encodeURIComponent(u);
      const safeU=u.replace(/'/g,"\\'");
      return '<div style="display:inline-block;position:relative;margin:2px">'
        +'<img src="'+proxy+'" style="width:52px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #ccc;">'
        +'<button onclick="editDelPhoto('+i+',\''+safeU+'\')" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#e74c3c;color:#fff;border:none;cursor:pointer;font-size:11px;">✕</button>'
        +'</div>';
    }).join('');
  const newHtml = state.newFiles.map((f,fi)=>
    '<div style="display:inline-block;position:relative;margin:2px">'
    +'<img src="'+f.dataUrl+'" style="width:52px;height:40px;object-fit:cover;border-radius:4px;border:2px solid #27ae60;">'
    +'<button onclick="editDelNew('+i+','+fi+')" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#e74c3c;color:#fff;border:none;cursor:pointer;font-size:11px;">✕</button>'
    +'</div>'
  ).join('');
  document.getElementById('ed-photo-'+i).innerHTML =
    '<div style="display:flex;flex-wrap:wrap;gap:2px;align-items:center;">'
    +existingHtml+newHtml
    +'<label style="cursor:pointer;padding:4px 8px;border:1.5px dashed #ccc;border-radius:5px;font-size:12px;color:#888;">'
    +'＋<input type="file" accept="image/*" multiple style="display:none" onchange="editAddPhoto('+i+',this)"></label>'
    +'</div>';
}

function editDelPhoto(i, url){ editPhotoState[i].deleted.push(url); editRenderPhotos(i, lastSrch[i].photoUrls||[]); }
function editDelNew(i, fi){ editPhotoState[i].newFiles.splice(fi,1); editRenderPhotos(i, lastSrch[i].photoUrls||[]); }

function editAddPhoto(i, inp){
  const files=Array.from(inp.files);
  const rec=lastSrch[i];
  const dt=(rec.date||'').replace(/-/g,'');
  const md=rec.model||'MDL';
  const st=(rec.station||'').replace(/\s/g,'');
  let loaded=0;
  files.forEach((f,fi)=>{
    const rd=new FileReader();
    rd.onload=e=>{
      const ext=f.name.split('.').pop();
      const fn=dt+'_'+md+'_'+st+'_edit_'+Date.now()+'_'+fi+'.'+ext;
      editPhotoState[i].newFiles.push({name:fn,dataUrl:e.target.result});
      loaded++;
      if(loaded===files.length)editRenderPhotos(i,rec.photoUrls||[]);
    };
    rd.readAsDataURL(f);
  });
}

function gEditVal(id){ const el=document.getElementById(id); return el?el.value:''; }
function gEditMC(id){ const el=document.querySelector('#'+id+' .mi.on'); return el?el.textContent.trim():''; }

function cancelEdit(i){
  if(editingIdx===i)editingIdx=null;
  delete editPhotoState[i];
  const r=lastSrch[i]; if(!r)return;
  document.getElementById('ed-date-'+i).innerHTML=r.date||'';
  document.getElementById('ed-model-'+i).innerHTML=r.model||'';
  document.getElementById('ed-station-'+i).innerHTML=r.station||'';
  document.getElementById('ed-line-'+i).innerHTML=r.line||'-';
  document.getElementById('ed-sid-'+i).innerHTML=r.sheetId||'';
  document.getElementById('ed-tc-'+i).innerHTML=r.tc||'';
  document.getElementById('ed-x-'+i).innerHTML=r.x!=null?r.x:'';
  document.getElementById('ed-y-'+i).innerHTML=r.y!=null?r.y:'';
  document.getElementById('ed-lv-'+i).innerHTML=bdg(r.lv);
  document.getElementById('ed-note-'+i).innerHTML=r.note||'';
  document.getElementById('ed-photo-'+i).innerHTML=phCell(r.photoUrls);
  document.getElementById('ed-empId-'+i).innerHTML=r.empId||'';
  document.getElementById('op-'+i).innerHTML=
    '<button class="bn bp bsm" onclick="startEdit('+i+')">✏️ 修改</button>';
}

function saveEditRow(i){
  const r=lastSrch[i]; if(!r)return;
  const state=editPhotoState[i]||{deleted:[],newFiles:[]};
  const stEl=document.querySelector('#ei-st-'+i+' .ch.on');
  const lnEl=document.querySelector('#ei-ln-'+i+' .lc.on');
  const newRec={
    date:     gEditVal('ei-date-'+i)||r.date,
    model:    gEditVal('ei-model-'+i)||r.model,
    station:  stEl?stEl.textContent.trim():r.station,
    line:     lnEl?lnEl.textContent.trim():r.line,
    sheetId:  gEditVal('ei-sid-'+i)||r.sheetId,
    tc:       gEditMC('ei-tc-'+i)||r.tc,
    x:        gEditVal('ei-x-'+i)||r.x,
    y:        gEditVal('ei-y-'+i)||r.y,
    lv:       gEditMC('ei-lv-'+i)||r.lv,
    note:     gEditVal('ei-note-'+i),
    empId:    gEditVal('ei-empId-'+i)||r.empId,
    photoUrls:(r.photoUrls||[]).filter(u=>!state.deleted.includes(u)),
    createdAt:r.createdAt,
    updatedAt:new Date().toISOString()
  };
  toast('⏳ 儲存中...');
  fetch(API_BASE+'/api/update',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({createdAt:r.createdAt,originalDate:r.date,record:newRec,newPhotos:state.newFiles,deletedPhotos:state.deleted})
  })
  .then(res=>res.json())
  .then(data=>{
    if(data.success){ toast('✅ 更新成功'); lastSrch[i]=data.record||newRec; cancelEdit(i); }
    else{ toast('❌ 更新失敗：'+(data.error||'未知'),'err'); }
  })
  .catch(e=>toast('❌ 連線錯誤：'+e.message,'err'));
}

// ===== ★ 是否新增比對 =====
function checkIsNew(records){
  if(!records||!records.length)return;
  const tolerance=parseFloat(document.getElementById('ftol_isnew')?.value)||0.5;
  const reqRecords=records.map((r,i)=>({idx:i, sheetId:r.sheetId||'', station:r.station||'', y:r.y||''}));
  fetch(API_BASE+'/api/check/isnew',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:reqRecords, tolerance:tolerance})})
  .then(r=>r.json())
  .then(data=>{
    if(!data.success)return;
    data.results.forEach((val,i)=>{
      const cell=document.getElementById('ni-'+i); if(!cell)return;
      if(val&&val.isNew===true) cell.innerHTML='<span style="color:#c0392b;font-weight:700;font-size:13px;background:#fde8e8;padding:2px 8px;border-radius:4px;">Y 新增</span>';
      else if(val&&val.isNew===false) cell.innerHTML='<span style="color:#27ae60;font-weight:700;font-size:13px;background:#e8f8ee;padding:2px 8px;border-radius:4px;">N 已有</span>';
      else cell.innerHTML='<span style="color:#bbb;font-size:12px;">-</span>';
    });
  })
  .catch(e=>console.error('是否新增比對失敗',e));
}

// ===== ★ 機台比對 =====
function matchMachineData(records){
  if(!records||!records.length)return;
  const tolerance=parseFloat(document.getElementById('ftol_machine')?.value)||0.5;
  const matchRecords=records.map((r,i)=>({idx:i, y:r.y||'0', line:r.line||'', station:r.station||''}));
  if(matchRecords.every(r=>!r.y||r.y==='0')){
    records.forEach((r,i)=>{ const mc=document.getElementById('mc-'+i); if(mc)mc.innerHTML='<span style="color:#bbb;font-size:12px;">Y 值空白</span>'; });
    return;
  }
  fetch(API_BASE+'/api/machine/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:matchRecords, tolerance:tolerance})})
  .then(r=>r.json())
  .then(data=>{
    if(!data.success){ records.forEach((r,i)=>{ const mc=document.getElementById('mc-'+i); if(mc)mc.innerHTML='<span style="color:#e74c3c;font-size:12px;">比對失敗</span>'; }); return; }
    const results=data.results; const headers=data.headers||[];
    document.querySelectorAll('[id^="mc-expand-"]').forEach(el=>el.remove());
    records.forEach((r,i)=>{
      const mc=document.getElementById('mc-'+i); if(!mc)return;
      const matched=results[String(i)]||[];
      if(!matched.length){ mc.innerHTML='<span style="color:#bbb;font-size:12px;">無比對</span>'; return; }
      mc.innerHTML='<button class="bn bp bsm" id="mcbtn-'+i+'" onclick="toggleMachine('+i+')">🔧 比對到 '+matched.length+' 筆 ▼</button>';
      const srcRow=document.getElementById('sr-'+i); if(!srcRow)return;
      const expandRow=document.createElement('tr'); expandRow.id='mc-expand-'+i; expandRow.style.display='none';
      const diffColor=diff=>Math.abs(diff)<=0.5?'#27ae60':Math.abs(diff)<=1?'#e67e22':'#c0392b';
      const tHead=headers.map(h=>'<th style="background:var(--p);color:#fff;padding:4px 10px;white-space:nowrap;border:1px solid #3a7fc1;font-size:12px;">'+h+'</th>').join('')+'<th style="background:var(--p);color:#fff;padding:4px 10px;border:1px solid #3a7fc1;font-size:12px;white-space:nowrap;">差距(cm)</th>';
      const tBody=matched.map((m,mi)=>{ const diff=parseFloat(m.y1||0)-parseFloat(r.y||0); const tds=headers.map(h=>'<td style="padding:4px 10px;border:1px solid #e8edf3;font-size:12px;'+(mi%2?'background:#f9fbff;':'')+'\">'+(m[h]!=null?m[h]:'')+'</td>').join(''); const diffTd='<td style="padding:4px 10px;border:1px solid #e8edf3;font-size:12px;text-align:center;font-weight:600;color:'+diffColor(diff)+';'+(mi%2?'background:#f9fbff;':'')+'\">'+(diff>=0?'+':'')+diff.toFixed(2)+'</td>'; return '<tr>'+tds+diffTd+'</tr>'; }).join('');
      const colspan=document.querySelector('.st thead tr')?.children.length||16;
      expandRow.innerHTML='<td colspan="'+colspan+'" style="padding:10px 16px;background:#eef5ff;border-left:4px solid var(--p);">'+'<div style="font-weight:600;color:var(--p);margin-bottom:6px;font-size:13px;">🔧 機台比對 — Y='+r.y+' cm，line='+r.line+'，共 '+matched.length+' 筆（由近到遠）</div>'+'<div style="overflow-x:auto;"><table style="border-collapse:collapse;"><thead><tr>'+tHead+'</tr></thead><tbody>'+tBody+'</tbody></table></div></td>';
      srcRow.insertAdjacentElement('afterend', expandRow);
    });
  })
  .catch(e=>console.error('機台比對失敗：', e));
}

function toggleMachine(idx){
  const row=document.getElementById('mc-expand-'+idx); const btn=document.getElementById('mcbtn-'+idx);
  if(!row||!btn)return;
  if(row.style.display==='none'){ row.style.display=''; btn.innerHTML=btn.innerHTML.replace('▼','▲'); }
  else{ row.style.display='none'; btn.innerHTML=btn.innerHTML.replace('▲','▼'); }
}

function toast(msg,type){ const t=document.getElementById('toast'); if(!t){console.warn('toast:',msg);return;} t.textContent=msg;t.className='on'+(type==='err'?' err':''); setTimeout(()=>{t.className='';},2800); }

function hdImp(inp){
  if(!inp.files||!inp.files.length)return;
  const file=inp.files[0]; const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='xlsx'||ext==='xls'){
    const rd=new FileReader();
    rd.onload=e=>{ try{ const wb=XLSX.read(e.target.result,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false,dateNF:'yyyy-mm-dd'}); if(!rows.length){toast('Excel 無資料','err');return;} ib=rows; const hds=Object.keys(rows[0]); showPreview(hds,rows); }catch(err){ toast('Excel 解析失敗：'+err.message,'err'); } };
    rd.readAsArrayBuffer(file);
  }else{
    const rd=new FileReader();
    rd.onload=e=>{ const txt=e.target.result.replace(/^\uFEFF+/,''); const lines=txt.split('\n').filter(l=>l.trim()); if(lines.length<2){toast('CSV 無資料','err');return;} const hds=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim()); ib=lines.slice(1).map(line=>{ const vs=line.split(',').map(v=>v.replace(/^"|"$/g,'').trim()); const o={};hds.forEach((h,i)=>o[h]=vs[i]||'');return o; }).filter(r=>Object.values(r).some(v=>v)); showPreview(hds,ib); };
    rd.readAsText(file,'UTF-8');
  }
}

function showPreview(hds,rows){ const is2=document.getElementById('is2'); is2.innerHTML=`<div class="skd"><div class="num">${hds.length}</div><div class="lbl">欄位</div></div><div class="skd"><div class="num">${rows.length}</div><div class="lbl">筆資料</div></div>`; document.getElementById('ih2').innerHTML='<th>#</th>'+hds.map(h=>`<th>${h}</th>`).join(''); document.getElementById('ib2').innerHTML=rows.slice(0,20).map((row,i)=>`<tr><td>${i+1}</td>${hds.map(h=>`<td>${row[h]!=null?row[h]:''}</td>`).join('')}</tr>`).join('')+(rows.length>20?`<tr><td colspan="${hds.length+1}" style="text-align:center;color:var(--gr)">...前20筆預覽，共${rows.length}筆</td></tr>`:''); document.getElementById('ip2').style.display='block'; }

function formatDate(d){ if(!d||d==='')return ''; const s=String(d).trim(); if(/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0,10); if(/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(s)){ const p=s.split(/[-\/]/); return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`; } if(/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)){ const p=s.split('/'); const yr=parseInt(p[2])<50?'20'+p[2]:'19'+p[2]; return `${yr}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`; } if(/^\d+$/.test(s)){ const dt=new Date((parseInt(s)-25569)*86400000); const y=dt.getUTCFullYear(),m=dt.getUTCMonth()+1,d2=dt.getUTCDate(); return `${y}-${String(m).padStart(2,'0')}-${String(d2).padStart(2,'0')}`; } return s; }

function cfImp(){
  if(!ib.length)return;
  const g=(row,keys)=>{ for(const k of keys){ if(row[k]!==undefined&&row[k]!==null&&row[k]!=='')return String(row[k]); } return ''; };
  const records=ib.map(row=>({ date:formatDate(g(row,['日期','date','Date','MFG_DAY','mfg_day'])), model:g(row,['Model','model','MODEL','機型','PRODUCT_CODE','product_code']), station:g(row,['站點','station','Station','site']), line:g(row,['LINE','Line','line','產線','LINE_ID','line_id']), sheetId:g(row,['Sheet ID','SheetID','sheetId','sheet_id','片號','SHEET_ID','Sheet_ID']), tc:g(row,['T/C側','T/C 側','TC','tc','側別','T/C','t/c']), x:g(row,['X(cm)','X (cm)','x','X','X座標']), y:g(row,['Y(cm)','Y (cm)','y','Y','Y座標']), lv:g(row,['程度(LV)','程度 (LV)','程度','LV','lv','level','Level']), note:g(row,['Note','note','備註','NOTE']), photos:[] })).filter(r=>r.date||r.sheetId);
  if(!records.length){toast('沒有可匯入的有效資料（需要有日期或片號）','err');return;}
  fetch(API_BASE+'/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records})})
  .then(r=>r.json())
  .then(data=>{ if(data.success){ toast(`✅ 成功匯入 ${data.count} 筆`); ib=[]; document.getElementById('ip2').style.display='none'; document.getElementById('if2').value=''; }else{ toast('❌ 匯入失敗：'+(data.error||'未知錯誤'),'err'); } })
  .catch(e=>toast('❌ 連線錯誤：'+e.message,'err'));
}

function cnImp(){ ib=[];document.getElementById('ip2').style.display='none';document.getElementById('if2').value=''; }

function autoLoad(){ const existing=lR(); if(existing.length>0){ const b=document.getElementById('pb'); b.style.display='block'; b.textContent=`✅ 已有 ${existing.length} 筆資料（localStorage）`; } }

function togChkAll(){ const all=document.getElementById('chkAll'); document.querySelectorAll('.delChk').forEach(c=>c.checked=all.checked); updDelBtn(); }
function updDelBtn(){ const n=document.querySelectorAll('.delChk:checked').length; const btn=document.getElementById('delBtn'); const msg=document.getElementById('delMsg'); if(btn) btn.style.display=n>0?'inline-block':'none'; if(msg) msg.textContent=n>0?`已勾選 ${n} 筆`:''; }

function delChecked(){
  const chks=document.querySelectorAll('.delChk:checked');
  if(!chks.length){toast('請先勾選要刪除的項目','err');return;}
  const pwd=prompt(`⚠️ 即將刪除 ${chks.length} 筆資料，請輸入密碼確認：`);
  if(pwd===null)return;
  if(pwd!=='999'){toast('❌ 密碼錯誤，取消刪除','err');return;}
  if(!confirm(`確定要刪除勾選的 ${chks.length} 筆資料嗎？刪除後無法復原！`))return;
  const deletions=[];
  chks.forEach(c=>deletions.push({createdAt:c.getAttribute('data-created-at'),date:c.getAttribute('data-date')}));
  toast('⏳ 刪除中...');
  fetch(API_BASE+'/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletions})})
  .then(r=>r.json())
  .then(data=>{ if(data.success){toast(`✅ 已刪除 ${data.count} 筆`);bDoSrch();}
    else toast('❌ 刪除失敗：'+(data.error||'未知錯誤'),'err'); })
  .catch(e=>toast('❌ 連線錯誤：'+e.message,'err'));
}

// ===== Summary 圖表 =====
if(typeof ChartDataLabels!=='undefined'){Chart.register(ChartDataLabels);}
