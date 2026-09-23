/* feol_import.js */


// ===== ★ 修改：匯入 → 呼叫後端 API =====

function hdImp(inp){

  if(!inp.files||!inp.files.length)return;

  const file=inp.files[0];

  const ext=file.name.split('.').pop().toLowerCase();

  if(ext==='xlsx'||ext==='xls'||ext==='xlsm'){

    // ★ 改為後端 base64 流程（支援圖片匠入）

    toast('⏳ 上傳分析中...');

    var rd=new FileReader();

    rd.onload=function(e){

      var arr=new Uint8Array(e.target.result);

      var bin='';

      var chunk=8192;

      for(var j=0;j<arr.length;j+=chunk){

        bin+=String.fromCharCode.apply(null,arr.subarray(j,Math.min(j+chunk,arr.length)));

      }

      var b64=btoa(bin);

      fetch(API_BASE+'/api/preview_excel_with_pics',{

        method:'POST',

        headers:{'Content-Type':'application/json'},

        body:JSON.stringify({excel_base64:b64})

      })

      .then(function(r){return r.json();})

      .then(function(data){

        if(!data.success){toast('預覽失敗：'+(data.error||'未知'),'err');return;}

        showPreviewWithPics(data);

      })

      .catch(function(e){toast('連線錯誤：'+e.message,'err');});

    };

    rd.readAsArrayBuffer(file);

  }else{

    // CSV：文字讀取

    const rd=new FileReader();

    rd.onload=e=>{

      const txt=e.target.result.replace(/^\uFEFF+/,'');

      const lines=txt.split('\n').filter(l=>l.trim());

      if(lines.length<2){toast('CSV 無資料','err');return;}

      const hds=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());

      ib=lines.slice(1).map(line=>{

        const vs=line.split(',').map(v=>v.replace(/^"|"$/g,'').trim());

        const o={};hds.forEach((h,i)=>o[h]=vs[i]||'');return o;

      }).filter(r=>Object.values(r).some(v=>v));

      showPreview(hds,ib);

    };

    rd.readAsText(file,'UTF-8');

  }

}

function showPreview(hds,rows){

  const is2=document.getElementById('is2');

  is2.innerHTML=`<div class="skd"><div class="num">${hds.length}</div><div class="lbl">欄位</div></div><div class="skd"><div class="num">${rows.length}</div><div class="lbl">筆資料</div></div>`;

  document.getElementById('ih2').innerHTML='<th>#</th>'+hds.map(h=>`<th>${h}</th>`).join('');

  document.getElementById('ib2').innerHTML=rows.slice(0,20).map((row,i)=>`<tr><td>${i+1}</td>${hds.map(h=>`<td>${row[h]!=null?row[h]:''}</td>`).join('')}</tr>`).join('')

    +(rows.length>20?`<tr><td colspan="${hds.length+1}" style="text-align:center;color:var(--gr)">...前20筆預覽，共${rows.length}筆</td></tr>`:'');

  document.getElementById('ip2').style.display='block';

}


// ===== ★ 含圖片預覽（來自後端）=====

var _previewId='';

function showPreviewWithPics(data){

  _previewId=data.preview_id||'';

  var hds=data.headers||[];

  var rows=data.rows||[];

  var rowImages=data.row_images||{};

  var total=data.total||rows.length;

  var is2=document.getElementById('is2');

  is2.innerHTML='<div class="skd"><div class="num">'+hds.length+'</div><div class="lbl">欄位</div></div>'

    +'<div class="skd"><div class="num">'+total+'</div><div class="lbl">筆資料</div></div>';

  document.getElementById('ih2').innerHTML='<th>#</th>'

    +hds.map(function(h){return '<th>'+h+'</th>';}).join('')+'<th>圖片</th>';

  document.getElementById('ib2').innerHTML=rows.slice(0,20).map(function(row,i){

    var rk=String(i+1);

    var imgs=rowImages[rk]||[];

    var imgHtml=imgs.length

      ?imgs.map(function(src){

          return '<img src="'+src+'" style="width:52px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #ccc;margin:2px;">';

        }).join('')

      :'<span style="color:#ccc">—</span>';

    return '<tr><td>'+(i+1)+'</td>'

      +hds.map(function(h){return '<td>'+(row[h]!=null?row[h]:'')+'</td>';}).join('')

      +'<td>'+imgHtml+'</td></tr>';

  }).join('')

  +(total>20?'<tr><td colspan="'+(hds.length+2)+'" style="text-align:center;color:var(--gr)">前20筆預覽，共'+total+'筆</td></tr>':'');

  var ip2=document.getElementById('ip2');

  ip2.style.display='block';

  ip2.dataset.mode='pics';

}

function formatDate(d){

  if(!d||d==='')return '';

  const s=String(d).trim();

  // ISO datetime 格式（如 "2026-07-06T00:00:00.000"）→ 取前10碼

  if(/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0,10);

  // 已經是 YYYY-MM-DD 或 YYYY/MM/DD（完整年份）

  if(/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(s)){

    const p=s.split(/[-\/]/);

    return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;

  }

  // M/D/YY 或 MM/DD/YY（短年份，如 2/1/26）

  if(/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)){

    const p=s.split('/');

    const yr=parseInt(p[2])<50?'20'+p[2]:'19'+p[2];

    return `${yr}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`;

  }

  // 純數字（Excel 序列號，如 46054）

  if(/^\d+$/.test(s)){

    const dt=new Date((parseInt(s)-25569)*86400000);

    const y=dt.getUTCFullYear(),m=dt.getUTCMonth()+1,d2=dt.getUTCDate();

    return `${y}-${String(m).padStart(2,'0')}-${String(d2).padStart(2,'0')}`;

  }

  return s;

}

function cfImp(){

  if(document.getElementById('ip2').dataset.mode==='pics'){cfImpWithPics();return;}

  if(!ib.length)return;

  const g=(row,keys)=>{

    for(const k of keys){

      if(row[k]!==undefined&&row[k]!==null&&row[k]!=='')return String(row[k]);

    }

    return '';

  };

  const records=ib.map(row=>({

    date:    formatDate(g(row,['日期','date','Date','MFG_DAY','mfg_day'])),

    model:   g(row,['Model','model','MODEL','機型','PRODUCT_CODE','product_code']),

    station: g(row,['站點','station','Station','site']),

    line:    g(row,['LINE','Line','line','產線','LINE_ID','line_id']),

    sheetId: g(row,['Sheet ID','SheetID','sheetId','sheet_id','片號','SHEET_ID','Sheet_ID']),

    tc:      g(row,['T/C側','T/C 側','TC','tc','側別','T/C','t/c']),

    x:       g(row,['X(cm)','X (cm)','x','X','X座標']),

    y:       g(row,['Y(cm)','Y (cm)','y','Y','Y座標']),

    lv:      g(row,['程度(LV)','程度 (LV)','程度','LV','lv','level','Level']),

    note:    g(row,['Note','note','備註','NOTE']),

    photos:  []

  })).filter(r=>r.date||r.sheetId);

  if(!records.length){toast('沒有可匯入的有效資料（需要有日期或片號）','err');return;}

  fetch(API_BASE+'/api/import',{

    method:'POST',

    headers:{'Content-Type':'application/json'},

    body:JSON.stringify({records})

  })

  .then(r=>r.json())

  .then(data=>{

    if(data.success){

      toast(`✅ 成功匯入 ${data.count} 筆`);

      ib=[];

      document.getElementById('ip2').style.display='none';

      document.getElementById('if2').value='';

    }else{

      toast('❌ 匯入失敗：'+(data.error||'未知錯誤'),'err');

    }

  })

  .catch(e=>toast('❌ 連線錯誤：'+e.message,'err'));

}


// ===== ★ 含圖片 Excel 匠入確認 =====

function cfImpWithPics(){

  if(!_previewId){toast('無效的預覽ID，請重新上傳','err');return;}

  toast('⏳ 匠入中...');

  fetch(API_BASE+'/api/import_excel_with_pics',{

    method:'POST',

    headers:{'Content-Type':'application/json'},

    body:JSON.stringify({preview_id:_previewId})

  })

  .then(function(r){return r.json();})

  .then(function(data){

    if(data.success){

      toast('✅ 匠入 '+data.count+' 筆，圖片 '+data.photos+' 張');

      _previewId='';

      document.getElementById('ip2').style.display='none';

      document.getElementById('if2').value='';

      document.getElementById('ip2').dataset.mode='';

    }else{

      toast('❌ 匠入失敗：'+(data.error||'未知錯誤'),'err');

    }

  })

  .catch(function(e){toast('❌ 連線錯誤：'+e.message,'err');});

}

function cnImp(){

  _previewId='';document.getElementById('ip2').dataset.mode='';

  ib=[];document.getElementById('ip2').style.display='none';document.getElementById('if2').value='';

}


// ===== 匯入（含圖片）=====

let _picFile=null,_picIb=[],_picPreviewId=null;

function hdImpPic(inp){if(!inp.files||!inp.files.length)return;const file=inp.files[0];_picFile=file;_picPreviewId=null;const ext=file.name.split('.').pop().toLowerCase();const statusEl=document.getElementById('impPicStatus');if(statusEl)statusEl.textContent='⏳ 讀取中...';if(ext==='csv'){const rd=new FileReader();rd.onload=e=>{const txt=e.target.result.replace(/^\uFEFF+/,'');const lines=txt.split('\n').filter(l=>l.trim());if(lines.length<2){toast('CSV 無資料','err');return;}const hds=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());_picIb=lines.slice(1).map(line=>{const vs=line.split(',').map(v=>v.replace(/^"|"$/g,'').trim());const o={};hds.forEach((h,i)=>o[h]=vs[i]||'');return o;}).filter(r=>Object.values(r).some(v=>v));_showPicPreview(hds,_picIb,{},_picIb.length);if(statusEl)statusEl.textContent='';};rd.readAsText(file,'UTF-8');}else{const rd=new FileReader();rd.onload=async e=>{try{const bytes=new Uint8Array(e.target.result);let binary='';const CHUNK=8192;for(let i=0;i<bytes.length;i+=CHUNK)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));const b64=btoa(binary);if(statusEl)statusEl.textContent='⏳ 讀取 Excel 並提取圖片...';const res=await fetch(API_BASE+'/api/preview_excel_with_pics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({excel_base64:b64})});const d=await res.json();if(d.success){_picPreviewId=d.preview_id;_picIb=d.rows;_showPicPreview(d.headers,d.rows,d.row_images||{},d.total);if(statusEl)statusEl.textContent='共 '+d.total+' 筆，'+Object.keys(d.row_images||{}).length+' 列有圖片';}else{if(statusEl)statusEl.textContent='❌ '+(d.error||'預覽失敗');toast('預覽失敗：'+(d.error||''),'err');}}catch(err){if(statusEl)statusEl.textContent='❌ '+err.message;}};rd.readAsArrayBuffer(file);}}

function _showPicPreview(hds,rows,rowImages,total){const is3=document.getElementById('is3'),ih3=document.getElementById('ih3'),ib3=document.getElementById('ib3'),ip3=document.getElementById('ip3');if(!is3||!ip3)return;const hasImgs=Object.keys(rowImages).length>0,tot=total||rows.length;is3.innerHTML='<div class="skd"><div class="num">'+hds.length+'</div><div class="lbl">欄位</div></div><div class="skd"><div class="num">'+tot+'</div><div class="lbl">筆資料</div></div>'+(hasImgs?'<div class="skd"><div class="num">'+Object.keys(rowImages).length+'</div><div class="lbl">列有圖片</div></div>':'');if(ih3)ih3.innerHTML='<th>#</th>'+hds.map(h=>'<th>'+h+'</th>').join('')+(hasImgs?'<th>圖片預覽</th>':'');if(ib3)ib3.innerHTML=rows.slice(0,20).map((row,i)=>{const key=String(i+1),imgs=rowImages[key]||[];const imgTd=hasImgs?(imgs.length>0?'<td style="text-align:center">'+imgs.map(url=>'<img src="'+url+'" style="height:60px;width:auto;border:1px solid #ddd;border-radius:4px;margin:2px;cursor:zoom-in" onclick="opM(\''+url+'\',\'圖片預覽\')">').join('')+'</td>':'<td style="text-align:center;color:#ccc;font-size:12px;">—</td>'):'';return '<tr><td>'+(i+1)+'</td>'+hds.map(h=>'<td>'+(row[h]!=null?row[h]:'')+'</td>').join('')+imgTd+'</tr>';}).join('')+(tot>20?'<tr><td colspan="'+(hds.length+(hasImgs?2:1))+'" style="text-align:center;color:var(--gr)">...共'+tot+'筆，顯示前20筆</td></tr>':'');ip3.style.display='block';}

async function cfImpPic(){if(!_picFile)return;const statusEl=document.getElementById('impPicStatus');const ext=_picFile.name.split('.').pop().toLowerCase();if(statusEl)statusEl.textContent='⏳ 匯入中...';if(ext==='csv'){const g=(row,keys)=>{for(const k of keys){if(row[k]!==undefined&&row[k]!==null&&row[k]!=='')return String(row[k]);}return '';};const records=_picIb.map(row=>({date:formatDate(g(row,['日期','date','Date','MFG_DAY','mfg_day'])),model:g(row,['Model','model','MODEL','機型','PRODUCT_CODE']),station:g(row,['站點','station','Station','site']),line:g(row,['LINE','Line','line','產線','LINE_ID']),sheetId:g(row,['Sheet ID','SheetID','sheetId','sheet_id','片號','SHEET_ID']),tc:g(row,['T/C側','T/C 側','TC','tc','側別','T/C','t/c']),x:g(row,['X(cm)','X (cm)','x','X','X座標']),y:g(row,['Y(cm)','Y (cm)','y','Y','Y座標']),lv:g(row,['程度(LV)','程度 (LV)','程度','LV','lv','level','Level']),note:g(row,['Note','note','備註','NOTE']),photos:[]})).filter(r=>r.date||r.sheetId);if(!records.length){toast('沒有可匯入的有效資料','err');return;}try{const res=await fetch(API_BASE+'/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records})});const d=await res.json();if(d.success){if(statusEl)statusEl.textContent='✅ 匯入完成 '+d.count+' 筆';toast('✅ 成功匯入 '+d.count+' 筆');cnImpPic();}else{if(statusEl)statusEl.textContent='❌ '+(d.error||'未知錯誤');}}catch(e){if(statusEl)statusEl.textContent='❌ 連線錯誤：'+e.message;}}else{if(!_picPreviewId){if(statusEl)statusEl.textContent='❌ 請重新選擇檔案';return;}try{const res=await fetch(API_BASE+'/api/import_excel_with_pics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preview_id:_picPreviewId})});const d=await res.json();if(d.success){const skip=d.skipped>0?'（跳過'+d.skipped+'筆）':'';if(statusEl)statusEl.textContent='✅ '+d.count+' 筆，'+d.photos+' 張圖片 '+skip;toast('✅ 成功匯入 '+d.count+' 筆，'+d.photos+' 張圖片');_picPreviewId=null;cnImpPic();}else{if(statusEl)statusEl.textContent='❌ '+(d.error||'未知錯誤');}}catch(e){if(statusEl)statusEl.textContent='❌ 連線錯誤：'+e.message;}}}

function cnImpPic(){_picFile=null;_picIb=[];_picPreviewId=null;const ip3=document.getElementById('ip3'),f=document.getElementById('if3');if(ip3)ip3.style.display='none';if(f)f.value='';}

window.onload=()=>{

  const _d=new Date();

  const _past=new Date(_d); _past.setDate(_past.getDate()-5);

  const _toStr=_d.toISOString().slice(0,10);

  const _fromStr=_past.toISOString().slice(0,10);

  document.getElementById('sd').value=_toStr;

  addRow();autoLoad();sw('sr');

  document.getElementById('ff').value=_fromStr;

  document.getElementById('ft').value=_toStr;

  setTimeout(()=>doSrch(),200);

  const _smFrom=new Date(_d);_smFrom.setMonth(_smFrom.getMonth()-1);document.getElementById('sm-g-from').value=_smFrom.toISOString().slice(0,10);

  document.getElementById('sm-g-to').value=_toStr;

  const _bd=new Date();

  const _bFrom=new Date(_bd); _bFrom.setDate(_bFrom.getDate()-14);

  if(document.getElementById('b-ff'))document.getElementById('b-ff').value=_bFrom.toISOString().slice(0,10);

  if(document.getElementById('b-ft'))document.getElementById('b-ft').value=_bd.toISOString().slice(0,10);

};

// ═══════════════ BEOL JavaScript ═══════════════

let _beolInited=false;

function swSeg(seg){

  document.querySelectorAll('.seg-btn').forEach((b,i)=>b.classList.toggle('on',['feol','beol'][i]===seg));

  document.querySelectorAll('.seg-wrap').forEach(w=>w.classList.remove('on'));

  document.getElementById('seg-'+seg).classList.add('on');

  if(seg==='beol'){bSw('bsr');if(!_beolInited){_beolInited=true;bDoSrch();}}

}

function bSw(n){

  const seg=document.getElementById('seg-beol');

  seg.querySelectorAll('.t').forEach((t,i)=>t.classList.toggle('on',['bki','bsr','bim','bsm'][i]===n));

  seg.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));

  document.getElementById('pg-'+n).classList.add('on');

}

const BSL={'CGL':['CKCGL100','CKCGL200','CKCGL300','CKCGL400','CKCGL500','CKCGL600','CKCGL700','CKCGL800','CKCGLC00','CKCGLD00','CKCGLE00','CKCGLG00','CKCGLH00','CKCGLL00','CKCGLJ00','CKCGLK00'],'SHL':['CKSHL100','CKSHL200','CKSHL400','CKSHL500'],'PKL':['CKPKL200','CKPKL300','CKPKL400','CKPKL500','CKPKL600','CKPKL700','CKPKL800','CKPKL900','CKPKLA00','CKPKLB00','CKPKLC00','CKPKLD00','CKPKLE00','CKPKLF00','CKPKLG00','CKPKLH00'],'APK':['CKAPK100','CKAPK200','CKAPK300']};

function bSelSt(el,st){document.querySelectorAll('#b-ss .ch').forEach(c=>c.classList.remove('on'));el.classList.add('on');bRlC(st);}

function bRlC(st){const c=document.getElementById('b-sl'),ls=BSL[st]||[];if(!ls.length){c.innerHTML='<span class="lp">此站點無 LINE</span>';return;}c.innerHTML=ls.map(l=>`<div class="lc" onclick="bTogL(this)">${l}</div>`).join('');}

function bTogL(el){document.querySelectorAll('#b-sl .lc').forEach(c=>c.classList.remove('on'));el.classList.add('on');}

function bGL(){const s=document.querySelector('#b-sl .lc.on');return s?s.textContent.trim():'';}

function bUpdFL(){const st=document.getElementById('b-fst').value,ls=st?(BSL[st]||[]):[];const sl=document.getElementById('b-fl');sl.innerHTML='<option value="">全部</option>'+ls.map(l=>`<option>${l}</option>`).join('');}

let bRc=0;const bPs={};

const B_MORPH=['單點','直條','橫條','吸盤','撇狀'];

const B_LV=['乾擦','濕擦','乾溼不可擦'];

function bTogM(el,grp){el.closest('.mc').querySelectorAll('.mi').forEach(c=>c.classList.remove('on'));el.classList.add('on');const inp=document.getElementById(grp+'-oth');if(inp)inp.classList.remove('show');}

function bTogMOther(el,grp){el.closest('.mc').querySelectorAll('.mi').forEach(c=>c.classList.remove('on'));el.classList.add('on');const inp=document.getElementById(grp+'-oth');if(inp)inp.classList.add('show');}

function bGetMC(grp){const el=document.querySelector('.'+grp+'.on');if(!el)return'';if(el.textContent.trim()==='其他'){const inp=document.getElementById(grp+'-oth');return inp?inp.value.trim():'';}return el.textContent.trim();}

function bMorphBtns(i){return B_MORPH.map(m=>`<div class="mi" onclick="bTogM(this,'bmo${i}')">${m}</div>`).join('')+`<div class="mi" onclick="bTogMOther(this,'bmo${i}')">其他</div><input class="other-input" id="bmo${i}-oth" placeholder="請輸入"/>`;}

function bLvBtns(i){return B_LV.map(l=>`<div class="mi" onclick="bTogM(this,'blv${i}')">${l}</div>`).join('')+`<div class="mi" onclick="bTogMOther(this,'blv${i}')">其他</div><input class="other-input" id="blv${i}-oth" placeholder="請輸入"/>`;}

function bAddRow(){bRc++;const i=bRc,tb=document.getElementById('b-eb'),tr=document.createElement('tr');tr.id='br'+i;tr.innerHTML=`<td class="rn">${i}</td><td><input type="text" class="b-cid" placeholder="CHIP ID" style="width:90px"/></td><td><div class="mc btc${i}"><div class="mi" onclick="bTogM(this,'btc${i}')">T</div><div class="mi" onclick="bTogM(this,'btc${i}')">C</div></div></td><td><input type="text" class="b-cx" placeholder="X" style="width:72px"/></td><td><input type="text" class="b-cy" placeholder="Y" style="width:72px"/></td><td><div class="mc bmo${i}" style="flex-wrap:wrap;gap:3px;">${bMorphBtns(i)}</div></td><td><div class="mc blv${i}" style="flex-wrap:wrap;gap:3px;">${bLvBtns(i)}</div></td><td><div class="mc bito${i}"><div class="mi" onclick="bTogM(this,'bito${i}')">上</div><div class="mi" onclick="bTogM(this,'bito${i}')">下</div></div></td><td><textarea rows="2" class="b-note" placeholder="Note..." style="min-width:100px;"></textarea></td><td id="bpc${i}"><label class="pub">📷 照片<input type="file" accept="image/*" multiple onchange="bHdP(this,${i},'ph')" style="display:none"/></label></td><td id="bopc${i}"><label class="pub">🔬 OM<input type="file" accept="image/*" multiple onchange="bHdP(this,${i},'om')" style="display:none"/></label></td><td><button class="bn bd2 bsm" onclick="bDelR(${i})">✕</button></td>`;tb.appendChild(tr);tr.scrollIntoView({behavior:'smooth',block:'nearest'});}

function bAddRowSameID(){const rows=document.querySelectorAll('#b-eb tr');if(!rows.length){toast('沒有上一筆資料','err');return;}const lastRow=rows[rows.length-1];const lastCid=lastRow.querySelector('.b-cid').value.trim();bAddRow();const newRow=document.getElementById('br'+bRc);if(lastCid)newRow.querySelector('.b-cid').value=lastCid;}

function bDelR(i){const tr=document.getElementById('br'+i);if(tr)tr.remove();delete bPs[i+'_ph'];delete bPs[i+'_om'];}

function bHdP(inp,i,type){if(!inp.files||!inp.files.length)return;const key=i+'_'+type;if(!bPs[key])bPs[key]=[];Array.from(inp.files).forEach(f=>{const rd=new FileReader();rd.onload=e=>{bPs[key].push({name:f.name,dataUrl:e.target.result});bRefreshPhotoCell(i,type);};rd.readAsDataURL(f);});}

function bRefreshPhotoCell(i,type){const cellId=type==='om'?'bopc'+i:'bpc'+i;const cell=document.getElementById(cellId);if(!cell)return;const photos=bPs[i+'_'+type]||[];const label=type==='om'?'🔬 OM':'📷 照片';cell.innerHTML=`<label class="pub">${label}<input type="file" accept="image/*" multiple onchange="bHdP(this,${i},'${type}')" style="display:none"/></label>`+photos.map(p=>`<img class="pt" src="${p.dataUrl}" title="${p.name}" onclick="opM('${p.dataUrl}','${p.name.replace(/'/g,"\\'")}')"/>`).join('');}

async function bSaveAll(){const date=document.getElementById('b-date').value;const model=document.getElementById('b-model').value;const empId=document.getElementById('b-emp').value.trim();const stEl=document.querySelector('#b-ss .ch.on');const station=stEl?stEl.textContent.trim():'';const line=bGL();if(!date){toast('請選擇日期','err');return;}if(!station){toast('請選擇站點','err');return;}const rows=document.querySelectorAll('#b-eb tr');if(!rows.length){toast('請至少新增一筆明細','err');return;}const records=[];for(const tr of rows){const i=parseInt(tr.id.replace('br',''));const chipId=tr.querySelector('.b-cid').value.trim();const tc=(tr.querySelector('.btc'+i+' .mi.on')||{}).textContent?.trim()||'';const x=tr.querySelector('.b-cx').value.trim();const y=tr.querySelector('.b-cy').value.trim();const morphology=bGetMC('bmo'+i);const level=bGetMC('blv'+i);const ito=(tr.querySelector('.bito'+i+' .mi.on')||{}).textContent?.trim()||'';const note=tr.querySelector('.b-note').value.trim();const photos=bPs[i+'_ph']||[];const omPhotos=bPs[i+'_om']||[];records.push({chipId,tc,x,y,morphology,level,ito,note,photos:photos.map(p=>({name:p.name,dataUrl:p.dataUrl})),omPhotos:omPhotos.map(p=>({name:p.name,dataUrl:p.dataUrl}))});}document.getElementById('b-si').textContent='儲存中...';try{const res=await fetch(API_BASE+'/api/beol/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,model,station,line,empId,records})});const d=await res.json();if(d.success){toast('✅ 成功儲存 '+d.count+' 筆');document.getElementById('b-eb').innerHTML='';bRc=0;Object.keys(bPs).forEach(k=>delete bPs[k]);document.getElementById('b-si').textContent='';}else{toast('儲存失敗：'+(d.error||''),'err');document.getElementById('b-si').textContent='';}}catch(e){toast('連線錯誤：'+e.message,'err');document.getElementById('b-si').textContent='';}}

let bLastSrch=[];

function bDoSrch(){const params=new URLSearchParams({dateFrom:document.getElementById('b-ff').value||'',dateTo:document.getElementById('b-ft').value||'',model:document.getElementById('b-fm').value||'',station:document.getElementById('b-fst').value||'',line:document.getElementById('b-fl').value||'',tc:document.getElementById('b-ftc').value||'',level:document.getElementById('b-flv').value||'',empId:document.getElementById('b-femp').value||'',chipId:document.getElementById('b-fchip').value||''});fetch(API_BASE+'/api/beol/search?'+params).then(r=>r.json()).then(data=>{if(!data.success){toast('搜尋失敗','err');return;}bLastSrch=data.records||[];const tb=document.getElementById('b-sb2');document.getElementById('b-rs2').textContent='共 '+bLastSrch.length+' 筆';document.getElementById('b-chkAll').checked=false;document.getElementById('b-delBtn').style.display='none';if(!bLastSrch.length){tb.innerHTML='<tr><td colspan="18" class="nd">查無資料</td></tr>';return;}tb.innerHTML=bLastSrch.map((r,i)=>`<tr id="bsr-${i}"><td style="text-align:center"><input type="checkbox" class="b-delChk" onchange="bUpdDelBtn()" data-idx="${i}" data-created-at="${r.createdAt||''}" data-date="${r.date||''}"></td><td>${i+1}</td><td id="bed-date-${i}">${r.date||''}</td><td id="bed-model-${i}">${r.model||''}</td><td id="bed-station-${i}">${r.station||''}</td><td id="bed-line-${i}">${r.line||'-'}</td><td id="bed-chip-${i}">${r.chipId||''}</td><td id="bed-tc-${i}">${r.tc||''}</td><td id="bed-x-${i}">${r.x!=null?r.x:''}</td><td id="bed-y-${i}">${r.y!=null?r.y:''}</td><td id="bed-mo-${i}">${r.morphology||''}</td><td id="bed-lv-${i}">${r.level||''}</td><td id="bed-ito-${i}">${r.ito||''}</td><td id="bed-note-${i}">${r.note||''}</td><td id="bed-ph-${i}">${bPhCell(r.photoUrls)}</td><td id="bed-om-${i}">${bPhCell(r.omPhotoUrls)}</td><td id="bed-emp-${i}">${r.empId||''}</td><td id="bop-${i}"><button class="bn bp bsm" onclick="bStartEdit(${i})">✏️ 修改</button></td></tr>`).join('');}).catch(e=>toast('連線錯誤：'+e.message,'err'));}

function bPhCell(urls){if(!urls||!urls.length)return'<span style="color:#ccc;font-size:12px;">—</span>';return'<div class="ph-cell">'+urls.map(u=>{const fname=u.split('\\').pop()||u;const proxy=API_BASE+'/api/photo?path='+encodeURIComponent(u);return`<img class="pt" src="${proxy}" title="${fname}" onclick="opM('${proxy}','${escQ(fname)}')">`;}).join('')+'</div>';}

function bClrF(){['b-ff','b-ft'].forEach(id=>document.getElementById(id).value='');['b-fm','b-fst','b-ftc','b-flv'].forEach(id=>document.getElementById(id).value='');document.getElementById('b-fl').innerHTML='<option value="">全部</option>';document.getElementById('b-femp').value='';document.getElementById('b-fchip').value='';document.getElementById('b-sb2').innerHTML='<tr><td colspan="18" class="nd">請先設定篩選條件後按「搜尋」</td></tr>';document.getElementById('b-rs2').textContent='';}

function bExpXLSX(){const params=new URLSearchParams({dateFrom:document.getElementById('b-ff').value||'',dateTo:document.getElementById('b-ft').value||'',model:document.getElementById('b-fm').value||'',station:document.getElementById('b-fst').value||'',line:document.getElementById('b-fl').value||'',tc:document.getElementById('b-ftc').value||'',level:document.getElementById('b-flv').value||'',empId:document.getElementById('b-femp').value||''});window.location.href=API_BASE+'/api/beol/export?'+params;}

function bUpdDelBtn(){const chks=document.querySelectorAll('.b-delChk:checked');const btn=document.getElementById('b-delBtn');if(btn)btn.style.display=chks.length>0?'':'none';}

function bTogChkAll(){const all=document.getElementById('b-chkAll').checked;document.querySelectorAll('.b-delChk').forEach(c=>c.checked=all);bUpdDelBtn();}

async function bDelChecked(){const chks=document.querySelectorAll('.b-delChk:checked');if(!chks.length)return;if(!confirm('確定刪除勾選的 '+chks.length+' 筆資料？'))return;const deletions=Array.from(chks).map(c=>({createdAt:c.dataset.createdAt,date:c.dataset.date}));try{const res=await fetch(API_BASE+'/api/beol/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletions})});const d=await res.json();if(d.success){toast('✅ 刪除 '+d.deleted+' 筆');bDoSrch();}else{toast('刪除失敗：'+(d.error||''),'err');}}catch(e){toast('連線錯誤：'+e.message,'err');}}

let bEditingIdx=null;const bEditPs={};

function bStartEdit(i){if(bEditingIdx!==null&&bEditingIdx!==i){if(!confirm('目前有未儲存的修改，確定放棄？'))return;bCancelEdit(bEditingIdx);}bEditingIdx=i;const r=bLastSrch[i];if(!r)return;bEditPs[i]={deleted:[],newFiles:[],newOmFiles:[]};document.getElementById('bop-'+i).innerHTML='<button class="bn bs bsm" onclick="bSaveEditRow('+i+')">✅ 儲存</button> <button class="bn bo bsm" onclick="bCancelEdit('+i+')">❌ 取消</button>';document.getElementById('bed-date-'+i).innerHTML=`<input type="date" id="bei-date-${i}" value="${r.date||''}">`;const mOpts=document.getElementById('b-model').innerHTML;document.getElementById('bed-model-'+i).innerHTML=`<select id="bei-model-${i}">${mOpts}</select>`;const mSel=document.getElementById('bei-model-'+i);if(mSel)mSel.value=r.model||'';const stBtns=['CGL','SHL','PKL','APK'].map(st=>`<div class="ch${st===r.station?' on':''}" onclick="bEditSelSt(this,${i},'${st}')">${st}</div>`).join('');document.getElementById('bed-station-'+i).innerHTML=`<div class="cg" id="bei-st-${i}">${stBtns}</div>`;bEditUpdLine(i,r.station||'',r.line||'');document.getElementById('bed-chip-'+i).innerHTML=`<input type="text" id="bei-chip-${i}" value="${r.chipId||''}" style="width:90px">`;const tcBtns=['T','C'].map(tc=>`<div class="mi${tc===r.tc?' on':''}" onclick="editTogSingle(this)">${tc}</div>`).join('');document.getElementById('bed-tc-'+i).innerHTML=`<div class="mc" id="bei-tc-${i}">${tcBtns}</div>`;document.getElementById('bed-x-'+i).innerHTML=`<input type="number" id="bei-x-${i}" value="${r.x||''}" step="0.1" style="width:68px">`;document.getElementById('bed-y-'+i).innerHTML=`<input type="number" id="bei-y-${i}" value="${r.y||''}" step="0.1" style="width:68px">`;const moOpts=B_MORPH.concat(['其他']);document.getElementById('bed-mo-'+i).innerHTML=`<select id="bei-mo-${i}">${moOpts.map(o=>`<option${o===r.morphology?' selected':''}>${o}</option>`).join('')}</select>`;const lvOpts=B_LV.concat(['其他']);document.getElementById('bed-lv-'+i).innerHTML=`<select id="bei-lv-${i}">${lvOpts.map(o=>`<option${o===r.level?' selected':''}>${o}</option>`).join('')}</select>`;const itoBtns=['上','下'].map(v=>`<div class="mi${v===r.ito?' on':''}" onclick="editTogSingle(this)">${v}</div>`).join('');document.getElementById('bed-ito-'+i).innerHTML=`<div class="mc" id="bei-ito-${i}">${itoBtns}</div>`;document.getElementById('bed-note-'+i).innerHTML=`<textarea id="bei-note-${i}" rows="2" style="min-width:100px">${r.note||''}</textarea>`;document.getElementById('bed-ph-'+i).innerHTML=bPhCell(r.photoUrls);document.getElementById('bed-om-'+i).innerHTML=bPhCell(r.omPhotoUrls);document.getElementById('bed-emp-'+i).innerHTML=`<input type="text" id="bei-emp-${i}" value="${r.empId||''}" style="width:80px">`;}

function bEditSelSt(el,i,st){el.closest('.cg').querySelectorAll('.ch').forEach(c=>c.classList.remove('on'));el.classList.add('on');bEditUpdLine(i,st,'');}

function bEditUpdLine(i,st,sel){const lines=BSL[st]||[];const html=lines.map(l=>`<div class="lc${l===sel?' on':''}" onclick="editTogLine(this)">${l}</div>`).join('');document.getElementById('bed-line-'+i).innerHTML=`<div class="lg" id="bei-ln-${i}">${html||'<span class="lp">無 LINE</span>'}</div>`;}

async function bSaveEditRow(i){const r=bLastSrch[i];if(!r)return;const state=bEditPs[i]||{};const date=(document.getElementById('bei-date-'+i)||{}).value||r.date;const model=(document.getElementById('bei-model-'+i)||{}).value||r.model;const stEl=document.querySelector('#bei-st-'+i+' .ch.on');const station=stEl?stEl.textContent.trim():r.station;const lnEl=document.querySelector('#bei-ln-'+i+' .lc.on');const line=lnEl?lnEl.textContent.trim():r.line;const chipId=(document.getElementById('bei-chip-'+i)||{}).value||r.chipId;const tcEl=document.querySelector('#bei-tc-'+i+' .mi.on');const tc=tcEl?tcEl.textContent.trim():r.tc;const x=(document.getElementById('bei-x-'+i)||{}).value||r.x;const y=(document.getElementById('bei-y-'+i)||{}).value||r.y;const morphology=(document.getElementById('bei-mo-'+i)||{}).value||r.morphology;const level=(document.getElementById('bei-lv-'+i)||{}).value||r.level;const itoEl=document.querySelector('#bei-ito-'+i+' .mi.on');const ito=itoEl?itoEl.textContent.trim():r.ito;const note=(document.getElementById('bei-note-'+i)||{}).value||r.note;const empId=(document.getElementById('bei-emp-'+i)||{}).value||r.empId;const existPh=(r.photoUrls||[]).filter(u=>!(state.deleted||[]).includes(u));const existOm=(r.omPhotoUrls||[]).filter(u=>!(state.deletedOm||[]).includes(u));const newRecord={date,model,station,line,chipId,tc,x,y,morphology,level,ito,note,empId,photoUrls:existPh,omPhotoUrls:existOm,createdAt:r.createdAt};try{const res=await fetch(API_BASE+'/api/beol/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({createdAt:r.createdAt,originalDate:r.date,record:newRecord,newPhotos:state.newFiles||[],newOmPhotos:state.newOmFiles||[]})});const d=await res.json();if(d.success){toast('✅ 已更新');bLastSrch[i]=d.record||newRecord;bCancelEdit(i);}else{toast('更新失敗：'+(d.error||''),'err');}}catch(e){toast('連線錯誤：'+e.message,'err');}}

function bCancelEdit(i){bEditingIdx=null;delete bEditPs[i];const r=bLastSrch[i];if(!r)return;document.getElementById('bop-'+i).innerHTML=`<button class="bn bp bsm" onclick="bStartEdit(${i})">✏️ 修改</button>`;['date','model','station','line','chip','tc','x','y','mo','lv','ito','note','emp'].forEach(f=>{ const el=document.getElementById('bed-'+f+'-'+i); if(el) el.textContent=r[{date:'date',model:'model',station:'station',line:'line',chip:'chipId',tc:'tc',x:'x',y:'y',mo:'morphology',lv:'level',ito:'ito',note:'note',emp:'empId'}[f]]||'';});document.getElementById('bed-ph-'+i).innerHTML=bPhCell(r.photoUrls);document.getElementById('bed-om-'+i).innerHTML=bPhCell(r.omPhotoUrls);}

let bIb=[],bPicFile=null,bPicPreviewId=null;

function bHdImp(inp){if(!inp.files||!inp.files.length)return;const file=inp.files[0];bPicFile=file;bPicPreviewId=null;const ext=file.name.split('.').pop().toLowerCase();const statusEl=document.getElementById('b-impStatus');if(statusEl)statusEl.textContent='⏳ 讀取中...';if(ext==='csv'){const rd=new FileReader();rd.onload=e=>{const txt=e.target.result.replace(/^\uFEFF+/,'');const lines=txt.split('\n').filter(l=>l.trim());if(lines.length<2){toast('CSV 無資料','err');return;}const hds=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());bIb=lines.slice(1).map(line=>{const vs=line.split(',').map(v=>v.replace(/^"|"$/g,'').trim());const o={};hds.forEach((h,i)=>o[h]=vs[i]||'');return o;}).filter(r=>Object.values(r).some(v=>v));bShowPreview(hds,bIb,{},bIb.length);if(statusEl)statusEl.textContent='';};rd.readAsText(file,'UTF-8');}else{const rd=new FileReader();rd.onload=async e=>{try{const bytes=new Uint8Array(e.target.result);let binary='';const CHUNK=8192;for(let i=0;i<bytes.length;i+=CHUNK)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));const b64=btoa(binary);if(statusEl)statusEl.textContent='⏳ 讀取 Excel 並提取圖片...';const res=await fetch(API_BASE+'/api/beol/preview_excel_with_pics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({excel_base64:b64})});const d=await res.json();if(d.success){bPicPreviewId=d.preview_id;bIb=d.rows;bShowPreview(d.headers,d.rows,d.row_images||{},d.total);if(statusEl)statusEl.textContent='共 '+d.total+' 筆，'+Object.keys(d.row_images||{}).length+' 列有圖片';}else{if(statusEl)statusEl.textContent='❌ '+(d.error||'預覽失敗');toast('預覽失敗：'+(d.error||''),'err');}}catch(err){if(statusEl)statusEl.textContent='❌ '+err.message;}};rd.readAsArrayBuffer(file);}}

function bShowPreview(hds,rows,rowImages,total){const is2=document.getElementById('b-is2'),ip2=document.getElementById('b-ip2');if(!is2||!ip2)return;const hasImgs=Object.keys(rowImages).length>0;is2.innerHTML='<div class="skd"><div class="num">'+hds.length+'</div><div class="lbl">欄位</div></div><div class="skd"><div class="num">'+total+'</div><div class="lbl">筆資料</div></div>'+(hasImgs?'<div class="skd"><div class="num">'+Object.keys(rowImages).length+'</div><div class="lbl">列有圖片</div></div>':'');document.getElementById('b-ih2').innerHTML='<th>#</th>'+hds.map(h=>'<th>'+h+'</th>').join('')+(hasImgs?'<th>圖片預覽</th>':'');document.getElementById('b-ib2').innerHTML=rows.slice(0,20).map((row,i)=>{const key=String(i+1),imgs=rowImages[key]||[];const imgTd=hasImgs?(imgs.length>0?'<td>'+imgs.map(u=>'<img src="'+u+'" style="height:60px;width:auto;border:1px solid #ddd;border-radius:4px;margin:2px;">').join('')+'</td>':'<td style="color:#ccc;font-size:12px;">—</td>'):'';return'<tr><td>'+(i+1)+'</td>'+hds.map(h=>'<td>'+(row[h]!=null?row[h]:'')+'</td>').join('')+imgTd+'</tr>';}).join('')+(total>20?'<tr><td colspan="'+(hds.length+(hasImgs?2:1))+'" style="text-align:center;color:var(--gr)">...共'+total+'筆，顯示前20筆</td></tr>':'');ip2.style.display='block';}

async function bCfImp(){if(!bPicFile)return;const statusEl=document.getElementById('b-impStatus');const ext=bPicFile.name.split('.').pop().toLowerCase();if(statusEl)statusEl.textContent='⏳ 匯入中...';if(ext==='csv'){const g=(row,keys)=>{for(const k of keys){if(row[k]!==undefined&&row[k]!==null&&row[k]!=='')return String(row[k]);}return'';};const records=bIb.map(row=>({date:formatDate(g(row,['日期','date','Date'])),model:g(row,['Model','model','MODEL']),station:g(row,['站點','station']),line:g(row,['LINE','Line','line']),chipId:g(row,['CHIP ID','chipId','chip_id']),tc:g(row,['T/C','T/C側','TC','tc']),x:g(row,['X(mm)','X (mm)','x','X']),y:g(row,['Y(mm)','Y (mm)','y','Y']),morphology:g(row,['成像敘述','morphology']),level:g(row,['程度','level']),ito:g(row,['ITO','ito']),note:g(row,['Note','note','NOTE','備註']),photoUrls:[],omPhotoUrls:[]})).filter(r=>r.date||r.chipId);if(!records.length){toast('沒有可匯入的有效資料','err');return;}try{const res=await fetch(API_BASE+'/api/beol/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records})});const d=await res.json();if(d.success){if(statusEl)statusEl.textContent='✅ 匯入完成 '+d.count+' 筆';toast('✅ 成功匯入 '+d.count+' 筆');bCnImp();}else{if(statusEl)statusEl.textContent='❌ '+(d.error||'');toast('匯入失敗','err');}}catch(e){if(statusEl)statusEl.textContent='❌ '+e.message;}}else{if(!bPicPreviewId){toast('請先完成預覽','err');return;}try{const res=await fetch(API_BASE+'/api/beol/import_excel_with_pics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preview_id:bPicPreviewId})});const d=await res.json();if(d.success){if(statusEl)statusEl.textContent='✅ 匯入完成 '+d.count+' 筆（圖片 '+d.photos+' 張）';toast('✅ 成功匯入 '+d.count+' 筆');bCnImp();}else{if(statusEl)statusEl.textContent='❌ '+(d.error||'');toast('匯入失敗','err');}}catch(e){if(statusEl)statusEl.textContent='❌ '+e.message;}}}

function bCnImp(){bIb=[];bPicFile=null;bPicPreviewId=null;const el=document.getElementById('b-if2');if(el)el.value='';document.getElementById('b-ip2').style.display='none';document.getElementById('b-is2').innerHTML='';}

const BSM_CFGS={cgl:{station:'CGL',lineEl:'b-sm-cgl-line',fromEl:'b-sm-cgl-from',toEl:'b-sm-cgl-to',modelEl:'b-sm-cgl-model',tcEl:'b-sm-cgl-tc',lvEl:'b-sm-cgl-lv'},shl:{station:'SHL',lineEl:'b-sm-shl-line',fromEl:'b-sm-shl-from',toEl:'b-sm-shl-to',modelEl:'b-sm-shl-model',tcEl:'b-sm-shl-tc',lvEl:'b-sm-shl-lv'},pkl:{station:'PKL',lineEl:'b-sm-pkl-line',fromEl:'b-sm-pkl-from',toEl:'b-sm-pkl-to',modelEl:'b-sm-pkl-model',tcEl:'b-sm-pkl-tc',lvEl:'b-sm-pkl-lv'},apk:{station:'APK',lineEl:'b-sm-apk-line',fromEl:'b-sm-apk-from',toEl:'b-sm-apk-to',modelEl:'b-sm-apk-model',tcEl:'b-sm-apk-tc',lvEl:'b-sm-apk-lv'}};

const bSmCharts={};const B_SM_LV=['乾擦','濕擦','乾溼不可擦'];const B_SM_LC=['#3498db','#e67e22','#e74c3c'];const B_SM_NA='無LV';let B_SM_LC_NA='#bdc3c7';

const B_SM_THEMES={blue:{lc:['#3498db','#e67e22','#e74c3c'],na:'#bdc3c7'},pink:{lc:['#f890b0','#ffc0d4','#e05888'],na:'#e8edf2'},green:{lc:['#6ec66e','#3a9e3a','#1a6e1a'],na:'#e8edf2'},warm:{lc:['#ffb300','#f57c00','#bf360c'],na:'#e8edf2'},purple:{lc:['#ab47bc','#7b1fa2','#4a148c'],na:'#e8edf2'},cool:{lc:['#26c6da','#0097a7','#004d5a'],na:'#e0f7fa'},neutral:{lc:['#757575','#424242','#212121'],na:'#e0e0e0'},earth:{lc:['#a1887f','#6d4c41','#3e2723'],na:'#efebe9'},morandi:{lc:['#c9b8a8','#a89080','#665040'],na:'#ede8e3'}};

function bSmApplyTheme(){const t=document.getElementById('b-sm-theme')?.value||'blue';const th=B_SM_THEMES[t]||B_SM_THEMES.blue;B_SM_LC.splice(0,B_SM_LC.length,...th.lc);B_SM_LC_NA=th.na;Object.keys(BSM_CFGS).forEach(k=>bSmDraw(k));}

function bSmDrawAll(){const from=document.getElementById('b-sm-from').value;const to=document.getElementById('b-sm-to').value;const model=document.getElementById('b-sm-model').value;Object.keys(BSM_CFGS).forEach(key=>{const cfg=BSM_CFGS[key];if(from)document.getElementById(cfg.fromEl).value=from;if(to)document.getElementById(cfg.toEl).value=to;if(model)document.getElementById(cfg.modelEl).value=model;bSmDraw(key);});}

async function bSmDraw(key){const cfg=BSM_CFGS[key];const params=new URLSearchParams({station:cfg.station,dateFrom:document.getElementById(cfg.fromEl).value||'',dateTo:document.getElementById(cfg.toEl).value||'',model:document.getElementById(cfg.modelEl).value||'',line:document.getElementById(cfg.lineEl).value||'',tc:document.getElementById(cfg.tcEl).value||'',level:document.getElementById(cfg.lvEl).value||''});try{const res=await fetch(API_BASE+'/api/beol/search?'+params);const d=await res.json();if(!d.success)return;const recs=d.records||[];['T','C'].forEach(side=>{const sub=recs.filter(r=>r.tc===side);const dates=[...new Set(sub.map(r=>r.date||'').filter(Boolean))].sort();const byDate={};sub.forEach(r=>{const dt=r.date||'';if(!byDate[dt])byDate[dt]={};const lv=r.level&&B_SM_LV.includes(r.level)?r.level:B_SM_NA;byDate[dt][lv]=(byDate[dt][lv]||0)+1;});bSmDrawChart('b-smc-'+key+'-'+side,dates,byDate,cfg.station+' '+side+'側');});}catch(e){console.error('BEOL SUMMARY 失敗：',e);}}

function bSmDrawChart(cid,dates,byDate,title){const ctx=document.getElementById(cid)?.getContext('2d');if(!ctx)return;if(bSmCharts[cid])bSmCharts[cid].destroy();const datasets=[{label:'無LV',data:dates.map(d=>(byDate[d]&&byDate[d][B_SM_NA])||0),backgroundColor:B_SM_LC_NA,borderWidth:1,datalabels:{display:c=>c.dataset.data[c.dataIndex]>0,color:'#778',font:{size:10,weight:'bold'},formatter:v=>v>0?v:''}},...B_SM_LV.map((lv,i)=>({label:lv,data:dates.map(d=>(byDate[d]&&byDate[d][lv])||0),backgroundColor:B_SM_LC[i],borderWidth:1,datalabels:{display:c=>c.dataset.data[c.dataIndex]>0,color:'#fff',font:{size:10,weight:'bold'},formatter:v=>v>0?v:''}}))];bSmCharts[cid]=new Chart(ctx,{type:'bar',data:{labels:dates,datasets},options:{responsive:true,plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}},datalabels:{anchor:'center',align:'center'}},scales:{x:{stacked:true,ticks:{font:{size:9},maxRotation:45}},y:{stacked:true,beginAtZero:true,ticks:{stepSize:1,font:{size:9}}}}}});const titleEl=ctx.canvas.previousElementSibling;if(titleEl&&titleEl.classList.contains('smtitle'))titleEl.textContent=title;}


