/* feol_search.js */


// ===== ★ 修改：搜尋 → 呼叫後端 API =====

let lastSrch=[];

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

    const rawRs=data.records||[];const _lvNorm={'0':'0','0.0':'0','1':'1','1.0':'1','1.5':'1.5','2':'2.0','2.0':'2.0','3':'3.0','3.0':'3.0'};const _flv=flv||'';const _nflv=_flv?(_lvNorm[_flv]||_flv):'';const rs=_nflv?rawRs.filter(r=>(_lvNorm[String(r.lv||'').trim()]||String(r.lv||'').trim())===_nflv):rawRs;

    lastSrch=rs;

    var beb=document.getElementById('bulkEditBtn');if(beb)beb.style.display=rs.length?'inline-block':'none';

    document.getElementById('rs2').textContent=`共找到 ${rs.length} 筆`;

    const tb=document.getElementById('sb2');

    if(!rs.length){tb.innerHTML='<tr><td colspan="17" class="nd">查無資料</td></tr>';return;}

    // ★ 機台比對改為手動

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

      <td id="mc-${i}"><button class="bn bo bsm" onclick="doMachineMatch(${i})">🔍 機台比對</button></td>

      <td id="ni-${i}"><span style="color:#bbb;font-size:12px;">比對中...</span></td>

      <td id="op-${i}"><button class="bn bp bsm" onclick="startEdit(${i})">✏️ 修改</button></td>

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

  if(!lastSrch||!lastSrch.length){toast('請先執行搜尋再匯出','err');return;}

  const header=['日期','Model','站點','LINE','Sheet ID','T/C','X(cm)','Y(cm)','程度','Note','照片數','工號','機台比對','是否新增線'];

  const rows=lastSrch.map((r,i)=>{

    const mcEl=document.getElementById('mc-'+i);

    const niEl=document.getElementById('ni-'+i);

    return [

      r.date||'', r.model||'', r.station||'', r.line||'-',

      r.sheetId||'', r.tc||'',

      r.x!=null?r.x:'', r.y!=null?r.y:'',

      r.lv||'', r.note||'',

      (r.photoUrls||[]).length,

      r.empId||'',

      mcEl?mcEl.innerText.replace(/\s+/g,' ').trim():'',

      niEl?niEl.innerText.replace(/\s+/g,' ').trim():''

    ];

  });

  const ws=XLSX.utils.aoa_to_sheet([header,...rows]);

  ws['!cols']=[{wch:12},{wch:16},{wch:8},{wch:12},{wch:14},{wch:5},

               {wch:8},{wch:8},{wch:6},{wch:20},{wch:6},{wch:8},{wch:12},{wch:12}];

  const wb=XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb,ws,'背汙檢查');

  const ff=document.getElementById('ff').value||'all';

  const ft=document.getElementById('ft').value||'all';

  XLSX.writeFile(wb,'背汙檢查_'+ff+'_'+ft+'.xlsx');

  toast('✅ 匯出 '+lastSrch.length+' 筆');

}


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

  // 操作按鈕

  document.getElementById('op-'+i).innerHTML =

    '<button class="bn bs bsm" onclick="saveEditRow('+i+')">✅ 儲存</button> '

    +'<button class="bn bo bsm" onclick="cancelEdit('+i+')">❌ 取消</button>';

  // 日期

  document.getElementById('ed-date-'+i).innerHTML =

    '<input type="date" id="ei-date-'+i+'" value="'+(r.date||'')+'">';

  // Model（複製 Key In 頁面的下拉選單）

  const smEl = document.getElementById('sm');

  const modelOpts = smEl ? smEl.innerHTML : '';

  document.getElementById('ed-model-'+i).innerHTML =

    '<select id="ei-model-'+i+'">'+modelOpts+'</select>';

  const mdSel = document.getElementById('ei-model-'+i);

  if(mdSel) mdSel.value = r.model||'';

  // 站點（按鈕）

  const stations=['PI 前','PI 後','PA 後','ODF 後','AGX 後','BS ITO 後'];

  const stBtns = stations.map(st=>

    '<div class="ch'+(st===r.station?' on':'')+'" '

    +'onclick="editSelSt(this,'+i+',\''+st+'\')">'+(st)+'</div>'

  ).join('');

  document.getElementById('ed-station-'+i).innerHTML =

    '<div class="cg" id="ei-st-'+i+'">'+stBtns+'</div>';

  // LINE（連動）

  editUpdLine(i, r.station||'', r.line||'');

  // Sheet ID

  document.getElementById('ed-sid-'+i).innerHTML =

    '<input type="text" id="ei-sid-'+i+'" value="'+(r.sheetId||'')+'" style="width:90px">';

  // T/C

  const tcBtns=['T','C'].map(tc=>

    '<div class="mi'+(tc===r.tc?' on':'')+'" '

    +'onclick="editTogSingle(this)">'+tc+'</div>'

  ).join('');

  document.getElementById('ed-tc-'+i).innerHTML =

    '<div class="mc" id="ei-tc-'+i+'">'+tcBtns+'</div>';

  // X / Y

  document.getElementById('ed-x-'+i).innerHTML =

    '<input type="number" id="ei-x-'+i+'" value="'+(r.x||'')+'" step="0.1" style="width:68px">';

  document.getElementById('ed-y-'+i).innerHTML =

    '<input type="number" id="ei-y-'+i+'" value="'+(r.y||'')+'" step="0.1" style="width:68px">';

  // LV

  const lvBtns=['0','1','1.5','2.0','3.0'].map(lv=>

    '<div class="mi'+(lv===r.lv?' on':'')+'" '

    +'onclick="editTogSingle(this)">'+lv+'</div>'

  ).join('');

  // T/C

  document.getElementById('ed-tc-'+i).innerHTML =

    '<div class="mc" id="ei-tc-'+i+'">'  

    + '<div class="mi'+(r.tc==='T'?' on':''  )+'" onclick="editTogSingle(this)">T</div>'

    + '<div class="mi'+(r.tc==='C'?' on':''  )+'" onclick="editTogSingle(this)">C</div>'

    + '</div>';

  document.getElementById('ed-lv-'+i).innerHTML =

    '<div class="mc" id="ei-lv-'+i+'">'+lvBtns+'</div>';

  // Note

  document.getElementById('ed-note-'+i).innerHTML =

    '<textarea id="ei-note-'+i+'" rows="2" style="min-width:100px">'+(r.note||'')+'</textarea>';

  // 照片

  editRenderPhotos(i, r.photoUrls||[]);

  // ★ Fix: 替換操作欄為儲存/取消按鈕
  document.getElementById('ed-empId-'+i).innerHTML =
    '<input type="text" id="ei-empId-'+i+'" value="'+(r.empId||'')+'" style="width:80px">';

  document.getElementById('op-'+i).innerHTML =
    '<button class="bn bs bsm" onclick="saveEditRow('+i+')">💾 儲存</button>'
    + ' <button class="bn bo bsm" onclick="cancelEdit('+i+')">✕ 取消</button>';

  // 工號

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

function editDelPhoto(i, url){

  editPhotoState[i].deleted.push(url);

  editRenderPhotos(i, lastSrch[i].photoUrls||[]);

}

function editDelNew(i, fi){

  editPhotoState[i].newFiles.splice(fi,1);

  editRenderPhotos(i, lastSrch[i].photoUrls||[]);

}

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

function gEditVal(id){

  const el=document.getElementById(id);

  return el?el.value:'';

}

function gEditMC(id){

  const el=document.querySelector('#'+id+' .mi.on');

  return el?el.textContent.trim():'';

}

function cancelEdit(i){

  if(editingIdx===i)editingIdx=null;

  delete editPhotoState[i];

  const r=lastSrch[i];

  if(!r)return;

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

  const r=lastSrch[i];

  if(!r)return;

  const state=editPhotoState[i]||{deleted:[],newFiles:[]};

  // 收集各欄位

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

    body:JSON.stringify({

      createdAt:r.createdAt,

      originalDate:r.date,

      record:newRec,

      newPhotos:state.newFiles,

      deletedPhotos:state.deleted

    })

  })

  .then(res=>res.json())

  .then(data=>{

    if(data.success){

      toast('✅ 更新成功');

      lastSrch[i]=data.record||newRec;

      cancelEdit(i);

    }else{

      toast('❌ 更新失敗：'+(data.error||'未知'),'err');

    }

  })

  .catch(e=>toast('❌ 連線錯誤：'+e.message,'err'));

}


// ===== ★ 是否新增比對 =====

function checkIsNew(records){

  if(!records||!records.length)return;

  const tolerance=parseFloat(document.getElementById('ftol_isnew')?.value)||0.5;

  const reqRecords=records.map((r,i)=>({

    idx:i, sheetId:r.sheetId||'', station:r.station||'', y:r.y||''

  }));

  fetch(API_BASE+'/api/check/isnew',{

    method:'POST',

    headers:{'Content-Type':'application/json'},

    body:JSON.stringify({records:reqRecords, tolerance:tolerance})

  })

  .then(r=>r.json())

  .then(data=>{

    if(!data.success)return;

    data.results.forEach((val,i)=>{

      const cell=document.getElementById('ni-'+i);

      if(!cell)return;

      if(val&&val.isNew===true) cell.innerHTML='<span style="color:#c0392b;font-weight:700;font-size:13px;background:#fde8e8;padding:2px 8px;border-radius:4px;">Y 新增</span>';

      else if(val&&val.isNew===false) cell.innerHTML='<span style="color:#27ae60;font-weight:700;font-size:13px;background:#e8f8ee;padding:2px 8px;border-radius:4px;">N 已有</span>';

      else cell.innerHTML='<span style="color:#bbb;font-size:12px;">-</span>';

    });

  })

  .catch(e=>console.error('是否新增比對失敗',e));

}


// ===== ★ 多選刪除功能 =====

function togChkAll(){

  const all=document.getElementById('chkAll');

  document.querySelectorAll('.delChk').forEach(c=>c.checked=all.checked);

  updDelBtn();

}

function updDelBtn(){

  const n=document.querySelectorAll('.delChk:checked').length;

  const btn=document.getElementById('delBtn');

  const msg=document.getElementById('delMsg');

  if(btn) btn.style.display=n>0?'inline-block':'none';

  if(msg) msg.textContent=n>0?`已勾選 ${n} 筆`:'';

}

function delChecked(){

  const chks=document.querySelectorAll('.delChk:checked');

  if(!chks.length){toast('請先勾選要刪除的項目','err');return;}

  // ★ 密碼確認

  const pwd=prompt(`⚠️ 即將刪除 ${chks.length} 筆資料，請輸入密碼確認：`);

  if(pwd===null)return;

  if(pwd!=='999'){toast('❌ 密碼錯誤，取消刪除','err');return;}

  if(!confirm(`確定要刪除勾選的 ${chks.length} 筆資料嗎？刪除後無法復原！`))return;

  const deletions=[];

  chks.forEach(c=>deletions.push({

    createdAt:c.getAttribute('data-created-at'),

    date:c.getAttribute('data-date')

  }));

  toast('⏳ 刪除中...');

  fetch(API_BASE+'/api/delete',{

    method:'POST',

    headers:{'Content-Type':'application/json'},

    body:JSON.stringify({deletions})

  })

  .then(r=>r.json())

  .then(data=>{

    if(data.success){toast(`✅ 已刪除 ${data.count} 筆`);doSrch();}

    else toast('❌ 刪除失敗：'+(data.error||'未知錯誤'),'err');

  })

  .catch(e=>toast('❌ 連線錯誤：'+e.message,'err'));

}


