// ═══════════════ BEOL JavaScript ═══════════════
// 修改說明 202609041502：
//   修正1：X/Y 貼入多列 → 自動新增列並複製中片ID/CHIP ID/TC
//   新功能1：CHIP ID 輸入時自動帶出中片ID（字母對應表）
// 修改說明 202609041631：
//   修正C：照片欄 paste 焦點互斥問題修正 — 每欄獨立，貼完後 reset，限一張
//   修正D：CHIP ID→中片ID 自動帶出限制 MODEL：M270DAN07/M270DAN13/M270QAN11/M270HAN01
//   修正B：bptDrawChart 重寫 — X軸=MFG_DAY；柱狀圖=TOTAL；折線圖=NG ratio
//          新增 bptInitControls()，讀製程單選與程度複選控件
// 修改說明 202609041720：
//   修正1：BEOL SUMMARY — 還原 bsmDedup/bsmCountByDate/bsmNgByDate/bsmDates/
//          _bsmDraw/bsmDrawChipFilter/bsmDrawMidTotal/bsmDrawMidFilter/
//          _bsmShowTooltip/_bsmHideTooltip（前版誤刪）
// ════════════════════════════════════════════════

let _beolInited=false;
function swSeg(seg){
  document.querySelectorAll('.seg-btn').forEach((b,i)=>b.classList.toggle('on',['feol','beol'][i]===seg));
  document.querySelectorAll('.seg-wrap').forEach(w=>w.classList.remove('on'));
  document.getElementById('seg-'+seg).classList.add('on');
  if(seg==='beol'){bSw('bsr');if(!_beolInited){_beolInited=true;bDoSrch();}}
}
function bSw(n){
  const seg=document.getElementById('seg-beol');
  seg.querySelectorAll('.t').forEach((t,i)=>t.classList.toggle('on',['bki','bsr','bim','bsm','bpt'][i]===n));
  seg.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.getElementById('pg-'+n).classList.add('on');
  if(n==='bsm'){bsmInitDates();bsmApply();}
  if(n==='bpt'){bptInitDates();}
}
const BSL={'CGL':['CKCGL100','CKCGL200','CKCGL300','CKCGL400','CKCGL500','CKCGL600','CKCGL700','CKCGL800','CKCGLC00','CKCGLD00','CKCGLE00','CKCGLG00','CKCGLH00','CKCGLL00','CKCGLJ00','CKCGLK00'],'SHL':['CKSHL100','CKSHL200','CKSHL400','CKSHL500'],'PKL':['CKPKL200','CKPKL300','CKPKL400','CKPKL500','CKPKL600','CKPKL700','CKPKL800','CKPKL900','CKPKLA00','CKPKLB00','CKPKLC00','CKPKLD00','CKPKLE00','CKPKLF00','CKPKLG00','CKPKLH00'],'APK':['CKAPK100','CKAPK200','CKAPK300']};
function bSelSt(el,st){document.querySelectorAll('#b-ss .ch').forEach(c=>c.classList.remove('on'));el.classList.add('on');bRlC(st);}
function bRlC(st){const c=document.getElementById('b-sl'),ls=BSL[st]||[];if(!ls.length){c.innerHTML='<span class="lp">此站點無 LINE</span>';return;}c.innerHTML=ls.map(l=>`<div class="lc" onclick="bTogL(this)">${l}</div>`).join('');}
function bTogL(el){document.querySelectorAll('#b-sl .lc').forEach(c=>c.classList.remove('on'));el.classList.add('on');}
function bGL(){const s=document.querySelector('#b-sl .lc.on');return s?s.textContent.trim():'';}
function bUpdFL(){const st=document.getElementById('b-fst').value,ls=st?(BSL[st]||[]):[];const sl=document.getElementById('b-fl');sl.innerHTML='<option value="">全部</option>'+ls.map(l=>`<option>${l}</option>`).join('');}
let bRc=0;const bPs={};
const B_MORPH=['單點','直條','橫條','吸盤','撇狀'];
const B_LV=['乾擦','濕擦','乾溼不可擦','不可見'];

// ★ CHIP ID → 中片ID 字母對應表
const CHIP_TO_MID_MAP = {
  'A':'B','B':'B','G':'B','H':'B',
  'C':'D','D':'D','J':'D','K':'D',
  'E':'F','F':'F','L':'F','M':'F',
  'N':'P','P':'P','U':'P','V':'P',
  'Q':'R','R':'R','W':'R','X':'R',
  'S':'T','T':'T','Y':'T','Z':'T'
};

// ★ 修正D：只有這四個 MODEL 才自動帶出中片ID
const CHIP_AUTO_MID_MODELS = ['M270DAN07','M270DAN13','M270QAN11','M270HAN01'];

function bChipToMid(chipId){
  if(!chipId) return '';
  const last = chipId.slice(-1).toUpperCase();
  const midSuffix = CHIP_TO_MID_MAP[last];
  if(!midSuffix) return '';
  return chipId.slice(0,-1) + midSuffix;
}

function bTogM(el,grp){el.closest('.mc').querySelectorAll('.mi').forEach(c=>c.classList.remove('on'));el.classList.add('on');const inp=document.getElementById(grp+'-oth');if(inp)inp.classList.remove('show');}
function bTogMOther(el,grp){el.closest('.mc').querySelectorAll('.mi').forEach(c=>c.classList.remove('on'));el.classList.add('on');const inp=document.getElementById(grp+'-oth');if(inp)inp.classList.add('show');}
function bGetMC(grp){const el=document.querySelector('.'+grp+'.on');if(!el)return'';if(el.textContent.trim()==='其他'){const inp=document.getElementById(grp+'-oth');return inp?inp.value.trim():'';}return el.textContent.trim();}
function bMorphBtns(i){return B_MORPH.map(m=>`<div class="mi" onclick="bTogM(this,'bmo${i}')">${m}</div>`).join('')+`<div class="mi" onclick="bTogMOther(this,'bmo${i}')">其他</div><input class="other-input" id="bmo${i}-oth" placeholder="請輸入"/>`;}
function bLvBtns(i){return B_LV.map(l=>`<div class="mi" onclick="bTogM(this,'blv${i}')">${l}</div>`).join('')+`<div class="mi" onclick="bTogMOther(this,'blv${i}')">其他</div><input class="other-input" id="blv${i}-oth" placeholder="請輸入"/>`;}

function bAddRow(){
  bRc++;
  const i=bRc,tb=document.getElementById('b-eb'),tr=document.createElement('tr');
  tr.id='br'+i;
  tr.innerHTML=`<td class="rn">${i}</td>
    <td><input type="text" class="b-mid" placeholder="中片ID" style="width:90px"/></td>
    <td><input type="text" class="b-cid" placeholder="CHIP ID" style="width:90px" oninput="bAutoMid(this,${i})"/></td>
    <td><div class="mc btc${i}"><div class="mi" onclick="bTogM(this,'btc${i}')">T</div><div class="mi" onclick="bTogM(this,'btc${i}')">C</div></div></td>
    <td><input type="text" class="b-cx" placeholder="X" style="width:72px"/></td>
    <td><input type="text" class="b-cy" placeholder="Y" style="width:72px"/></td>
    <td><div class="mc bmo${i}" style="flex-wrap:wrap;gap:3px;">${bMorphBtns(i)}</div></td>
    <td><div class="mc blv${i}" style="flex-wrap:wrap;gap:3px;">${bLvBtns(i)}</div></td>
    <td><div class="mc bito${i}"><div class="mi" onclick="bTogM(this,'bito${i}')">上</div><div class="mi" onclick="bTogM(this,'bito${i}')">下</div></div></td>
    <td><textarea rows="2" class="b-note" placeholder="Note..." style="min-width:100px;"></textarea></td>
    <td id="bpc${i}"></td>
    <td id="bopc${i}"></td>
    <td><button class="bn bd2 bsm" onclick="bDelR(${i})">✕</button></td>`;
  tb.appendChild(tr);
  bRefreshPhotoCell(i,'ph');
  bRefreshPhotoCell(i,'om');
  const xInp = tr.querySelector('.b-cx');
  const yInp = tr.querySelector('.b-cy');
  xInp.addEventListener('paste', (e)=>bHandleXYPaste(e, i, 'x'));
  yInp.addEventListener('paste', (e)=>bHandleXYPaste(e, i, 'y'));
  tr.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ★ 修正D：CHIP ID 輸入時自動帶出中片ID（限制 MODEL）
function bAutoMid(cidInp, rowIdx){
  const model = (document.getElementById('b-model')||{}).value||'';
  if(!CHIP_AUTO_MID_MODELS.includes(model)) return;
  const tr = document.getElementById('br'+rowIdx);
  if(!tr) return;
  const midInp = tr.querySelector('.b-mid');
  if(!midInp) return;
  const mid = bChipToMid(cidInp.value.trim());
  if(mid) midInp.value = mid;
}

// X/Y 貼入多列 → 自動新增列並複製中片ID/CHIP ID/TC
function bHandleXYPaste(e, sourceRowIdx, field){
  e.preventDefault();
  const text = (e.clipboardData||window.clipboardData).getData('text');
  if(!text) return;
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l!=='');
  if(!lines.length) return;
  const srcTr = document.getElementById('br'+sourceRowIdx);
  if(!srcTr) return;
  const srcMid = srcTr.querySelector('.b-mid')?.value||'';
  const srcCid = srcTr.querySelector('.b-cid')?.value||'';
  const srcTcEl = srcTr.querySelector(`.btc${sourceRowIdx} .mi.on`);
  const srcTc = srcTcEl ? srcTcEl.textContent.trim() : '';
  const firstVal = lines[0].split(/[\t,\s]+/)[0];
  if(field==='x') srcTr.querySelector('.b-cx').value = firstVal;
  else            srcTr.querySelector('.b-cy').value = firstVal;
  for(let li=1; li<lines.length; li++){
    const val = lines[li].split(/[\t,\s]+/)[0];
    if(!val) continue;
    bRc++;
    const ni = bRc;
    const tb = document.getElementById('b-eb');
    const tr = document.createElement('tr');
    tr.id = 'br'+ni;
    tr.innerHTML=`<td class="rn">${ni}</td>
      <td><input type="text" class="b-mid" placeholder="中片ID" style="width:90px" value="${escHtml(srcMid)}"/></td>
      <td><input type="text" class="b-cid" placeholder="CHIP ID" style="width:90px" value="${escHtml(srcCid)}" oninput="bAutoMid(this,${ni})"/></td>
      <td><div class="mc btc${ni}"><div class="mi${srcTc==='T'?' on':''}" onclick="bTogM(this,'btc${ni}')">T</div><div class="mi${srcTc==='C'?' on':''}" onclick="bTogM(this,'btc${ni}')">C</div></div></td>
      <td><input type="text" class="b-cx" placeholder="X" style="width:72px" value="${field==='x'?escHtml(val):''}"/></td>
      <td><input type="text" class="b-cy" placeholder="Y" style="width:72px" value="${field==='y'?escHtml(val):''}"/></td>
      <td><div class="mc bmo${ni}" style="flex-wrap:wrap;gap:3px;">${bMorphBtns(ni)}</div></td>
      <td><div class="mc blv${ni}" style="flex-wrap:wrap;gap:3px;">${bLvBtns(ni)}</div></td>
      <td><div class="mc bito${ni}"><div class="mi" onclick="bTogM(this,'bito${ni}')">上</div><div class="mi" onclick="bTogM(this,'bito${ni}')">下</div></div></td>
      <td><textarea rows="2" class="b-note" placeholder="Note..." style="min-width:100px;"></textarea></td>
      <td id="bpc${ni}"></td>
      <td id="bopc${ni}"></td>
      <td><button class="bn bd2 bsm" onclick="bDelR(${ni})">✕</button></td>`;
    tb.appendChild(tr);
    bRefreshPhotoCell(ni,'ph');
    bRefreshPhotoCell(ni,'om');
    const xI = tr.querySelector('.b-cx');
    const yI = tr.querySelector('.b-cy');
    xI.addEventListener('paste', (ev)=>bHandleXYPaste(ev, ni, 'x'));
    yI.addEventListener('paste', (ev)=>bHandleXYPaste(ev, ni, 'y'));
  }
}

function escHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function bAddRowSameID(){const rows=document.querySelectorAll('#b-eb tr');if(!rows.length){toast('沒有上一筆資料','err');return;}const lastRow=rows[rows.length-1];const lastCid=lastRow.querySelector('.b-cid').value.trim();const lastMid=lastRow.querySelector('.b-mid')?.value.trim()||'';bAddRow();const newRow=document.getElementById('br'+bRc);if(lastCid)newRow.querySelector('.b-cid').value=lastCid;if(lastMid)newRow.querySelector('.b-mid').value=lastMid;}
function bDelR(i){const tr=document.getElementById('br'+i);if(tr)tr.remove();delete bPs[i+'_ph'];delete bPs[i+'_om'];}
function bHdP(inp,i,type){if(!inp.files||!inp.files.length)return;const key=i+'_'+type;if(!bPs[key])bPs[key]=[];Array.from(inp.files).forEach(f=>{const rd=new FileReader();rd.onload=e=>{bPs[key].push({name:f.name,dataUrl:e.target.result});bRefreshPhotoCell(i,type);};rd.readAsDataURL(f);});}

function bRefreshPhotoCell(i,type){
  var cellId=type==='om'?'bopc'+i:'bpc'+i;
  var cell=document.getElementById(cellId);if(!cell)return;
  var photos=bPs[i+'_'+type]||[];
  var label=type==='om'?'🔬 OM照片':'📷 照片';
  if(!photos.length){
    cell.innerHTML='<div class="pz" tabindex="0"'
      +' onclick="bSetPasteFocus('+i+',\''+type+'\');this.focus()"'
      +' onpaste="bHdPaste(event,'+i+',\''+type+'\')">'
      +label+'<label class="pz-sub">或點此選檔'
      +'<input type="file" accept="image/*" multiple'
      +' onchange="bHdP(this,'+i+',\''+type+'\')" style="display:none"/>'
      +'</label></div>';
  }else{
    // 修正C：覆蓋，限一張
    var imgs=photos.map(function(p){
      return '<img class="pt" src="'+p.dataUrl+'" title="'+p.name
        +'" onclick="opM(\''+p.dataUrl+'\',\''+p.name.replace(/'/g,"\\'")+'\')"/>';
    }).join('');
    cell.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">'
      +imgs+'<span style="font-size:11px;color:var(--p);font-weight:600;">'+photos.length+'張</span>'
      +'<label class="pub" style="font-size:11px;padding:3px 8px;cursor:pointer;">＋'
      +'<input type="file" accept="image/*" multiple'
      +' onchange="bHdP(this,'+i+',\''+type+'\')" style="display:none"/>'
      +'</label>'
      +'</div>';
  }
}

// ===== BEOL Ctrl+V 貼上照片（修正C：各自獨立，限一張，貼後不互搶焦點）=====
var bPasteFocus = null;
function bSetPasteFocus(rowIdx, type){ bPasteFocus = {rowIdx:rowIdx, type:type}; }
document.addEventListener('paste', function(e){
  if(!bPasteFocus) return;
  var items=(e.clipboardData||(e.originalEvent&&e.originalEvent.clipboardData)||{}).items;
  if(!items) return;
  var hasImg=false;
  for(var ii=0;ii<items.length;ii++){
    if(items[ii].type.indexOf('image')!==-1){
      hasImg=true;
      var blob=items[ii].getAsFile();
      if(!blob) continue;
      (function(b,focus){
        var rd=new FileReader();
        rd.onload=function(ev){
          var key=focus.rowIdx+'_'+focus.type;
          // 修正C：覆蓋，限一張
          bPs[key]=[{name:'paste_'+Date.now()+'.png',dataUrl:ev.target.result}];
          bRefreshPhotoCell(focus.rowIdx,focus.type);
        };
        rd.readAsDataURL(b);
      })(blob,bPasteFocus);
    }
  }
  if(hasImg){
    e.preventDefault();
    // 修正C：貼完後立即 reset，避免殘留焦點影響下一次貼上目標欄
    bPasteFocus = null;
  }
});

function bHdPaste(event,rowIdx,type){
  var items=(event.clipboardData||{}).items||[];
  var hasImg=false;
  for(var ii=0;ii<items.length;ii++){
    if(items[ii].type.indexOf('image')!==-1){
      hasImg=true;
      var blob=items[ii].getAsFile();
      if(!blob) continue;
      (function(b,ri,tp){
        var rd=new FileReader();
        rd.onload=function(ev){
          var key=ri+'_'+tp;
          // 修正C：覆蓋，限一張
          bPs[key]=[{name:'paste_'+Date.now()+'.png',dataUrl:ev.target.result}];
          bRefreshPhotoCell(ri,tp);
        };
        rd.readAsDataURL(b);
      })(blob,rowIdx,type);
    }
  }
  if(hasImg) event.preventDefault();
}

async function bSaveAll(){const date=document.getElementById('b-date').value;const model=document.getElementById('b-model').value;const empId=document.getElementById('b-emp').value.trim();const stEl=document.querySelector('#b-ss .ch.on');const station=stEl?stEl.textContent.trim():'';const line=bGL();if(!date){toast('請選擇日期','err');return;}if(!station){toast('請選擇站點','err');return;}const rows=document.querySelectorAll('#b-eb tr');if(!rows.length){toast('請至少新增一筆明細','err');return;}const records=[];for(const tr of rows){const i=parseInt(tr.id.replace('br',''));const midId=tr.querySelector('.b-mid')?.value.trim()||'';const chipId=tr.querySelector('.b-cid').value.trim();const tc=(tr.querySelector('.btc'+i+' .mi.on')||{}).textContent?.trim()||'';const x=tr.querySelector('.b-cx').value.trim();const y=tr.querySelector('.b-cy').value.trim();const morphology=bGetMC('bmo'+i);const level=bGetMC('blv'+i);const ito=(tr.querySelector('.bito'+i+' .mi.on')||{}).textContent?.trim()||'';const note=tr.querySelector('.b-note').value.trim();const photos=bPs[i+'_ph']||[];const omPhotos=bPs[i+'_om']||[];records.push({midId,chipId,tc,x,y,morphology,level,ito,note,photos:photos.map(p=>({name:p.name,dataUrl:p.dataUrl})),omPhotos:omPhotos.map(p=>({name:p.name,dataUrl:p.dataUrl}))});}document.getElementById('b-si').textContent='儲存中...';try{const res=await fetch(API_BASE+'/api/beol/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,model,station,line,empId,records})});const d=await res.json();if(d.success){toast('✅ 儲存成功 '+d.count+' 筆');document.getElementById('b-si').textContent='✅ 已儲存 '+d.count+' 筆';document.getElementById('b-eb').innerHTML='';bRc=0;Object.keys(bPs).forEach(k=>delete bPs[k]);}else{toast('儲存失敗：'+(d.error||''),'err');document.getElementById('b-si').textContent='';};}catch(e){toast('連線錯誤：'+e.message,'err');document.getElementById('b-si').textContent='';}}

// ===== BEOL 搜尋 =====
let bLastSrch=[];
function bPhCell(urls){if(!urls||!urls.length)return'<span style="color:#ccc;font-size:12px;">—</span>';return'<div class="ph-cell">'+urls.map(u=>{const fname=u.split('\\').pop()||u;const proxy=API_BASE+'/api/photo?path='+encodeURIComponent(u);return`<img class="pt" src="${proxy}" title="${fname}" onclick="opM('${proxy}','${escQ(fname)}')">`;}).join('')+'</div>';}
function escQ(s){return (s||'').replace(/'/g,"\\'");}
function bClrF(){['b-ff','b-ft'].forEach(id=>document.getElementById(id).value='');['b-fm','b-fst','b-ftc','b-flv'].forEach(id=>document.getElementById(id).value='');document.getElementById('b-fl').innerHTML='<option value="">全部</option>';document.getElementById('b-femp').value='';document.getElementById('b-fchip').value='';document.getElementById('b-fmid').value='';document.getElementById('b-sb2').innerHTML='<tr><td colspan="19" class="nd">請先設定篩選條件後按「搜尋」</td></tr>';document.getElementById('b-rs2').textContent='';}
function bExpXLSX(){const params=new URLSearchParams({dateFrom:document.getElementById('b-ff').value||'',dateTo:document.getElementById('b-ft').value||'',model:document.getElementById('b-fm').value||'',station:document.getElementById('b-fst').value||'',line:document.getElementById('b-fl').value||'',tc:document.getElementById('b-ftc').value||'',level:document.getElementById('b-flv').value||'',empId:document.getElementById('b-femp').value||''});window.location.href=API_BASE+'/api/beol/export?'+params;}
function bUpdDelBtn(){const chks=document.querySelectorAll('.b-delChk:checked');const btn=document.getElementById('b-delBtn');if(btn)btn.style.display=chks.length>0?'':'none';}
function bTogChkAll(){const all=document.getElementById('b-chkAll').checked;document.querySelectorAll('.b-delChk').forEach(c=>c.checked=all);bUpdDelBtn();}
async function bDelChecked(){const chks=document.querySelectorAll('.b-delChk:checked');if(!chks.length)return;if(!confirm('確定刪除勾選的 '+chks.length+' 筆資料？'))return;const deletions=Array.from(chks).map(c=>({createdAt:c.dataset.createdAt,date:c.dataset.date}));try{const res=await fetch(API_BASE+'/api/beol/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletions})});const d=await res.json();if(d.success){toast('✅ 刪除 '+d.deleted+' 筆');bDoSrch();}else{toast('刪除失敗：'+(d.error||''),'err');}}catch(e){toast('連線錯誤：'+e.message,'err');}}
let bEditingIdx=null;const bEditPs={};
function bEditSelSt(el,i,st){el.closest('.cg').querySelectorAll('.ch').forEach(c=>c.classList.remove('on'));el.classList.add('on');bEditUpdLine(i,st,'');}
function bEditUpdLine(i,st,sel){const lines=BSL[st]||[];const html=lines.map(l=>`<div class="lc${l===sel?' on':''}" onclick="editTogLine(this)">${l}</div>`).join('');document.getElementById('bed-line-'+i).innerHTML=`<div class="lg" id="bei-ln-${i}">${html||'<span class="lp">無 LINE</span>'}</div>`;}
function bCancelEdit(i){bEditingIdx=null;delete bEditPs[i];const r=bLastSrch[i];if(!r)return;document.getElementById('bop-'+i).innerHTML=`<button class="bn bp bsm" onclick="bStartEdit(${i})">✏️ 修改</button>`;['date','model','station','line','mid','chip','tc','x','y','mo','lv','ito','note','emp'].forEach(f=>{const el=document.getElementById('bed-'+f+'-'+i);if(el)el.textContent=r[{date:'date',model:'model',station:'station',line:'line',mid:'midId',chip:'chipId',tc:'tc',x:'x',y:'y',mo:'morphology',lv:'level',ito:'ito',note:'note',emp:'empId'}[f]]||'';});document.getElementById('bed-ph-'+i).innerHTML=bPhCell(r.photoUrls);document.getElementById('bed-om-'+i).innerHTML=bPhCell(r.omPhotoUrls);}

let bIb=[],bPicFile=null,bPicPreviewId=null;
function bHdImp(inp){if(!inp.files||!inp.files.length)return;const file=inp.files[0];bPicFile=file;bPicPreviewId=null;const ext=file.name.split('.').pop().toLowerCase();const statusEl=document.getElementById('b-impStatus');if(statusEl)statusEl.textContent='⏳ 讀取中...';if(ext==='csv'){const rd=new FileReader();rd.onload=e=>{const txt=e.target.result.replace(/^\uFEFF+/,'');const lines=txt.split('\n').filter(l=>l.trim());if(lines.length<2){toast('CSV 無資料','err');return;}const hds=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());bIb=lines.slice(1).map(line=>{const vs=line.split(',').map(v=>v.replace(/^"|"$/g,'').trim());const o={};hds.forEach((h,i)=>o[h]=vs[i]||'');return o;}).filter(r=>Object.values(r).some(v=>v));bShowPreview(hds,bIb,{},bIb.length);if(statusEl)statusEl.textContent='';};rd.readAsText(file,'UTF-8');}else{const rd=new FileReader();rd.onload=async e=>{try{const bytes=new Uint8Array(e.target.result);let binary='';const CHUNK=8192;for(let i=0;i<bytes.length;i+=CHUNK)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));const b64=btoa(binary);if(statusEl)statusEl.textContent='⏳ 讀取 Excel 並提取圖片...';const res=await fetch(API_BASE+'/api/beol/preview_excel_with_pics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({excel_base64:b64})});const d=await res.json();if(!d.success){if(statusEl)statusEl.textContent='❌ '+(d.error||'');return;}bPicPreviewId=d.preview_id;const g=(row,keys)=>keys.reduce((v,k)=>v||row[k]||'','');bIb=d.rows.map((row,ri)=>({date:g(row,['日期','date','Date','DATE']),model:g(row,['Model','model','MODEL']),station:g(row,['站點','station','Station']),line:g(row,['LINE','Line','line']),midId:g(row,['中片ID','midId']),chipId:g(row,['CHIP ID','chipId','chip_id']),tc:g(row,['T/C','T/C側','TC','tc']),x:g(row,['X(mm)','X (mm)','x','X']),y:g(row,['Y(mm)','Y (mm)','y','Y']),morphology:g(row,['成像敘述','morphology']),level:g(row,['程度','level']),ito:g(row,['ITO','ito']),note:g(row,['Note','note','NOTE','備註']),photoUrls:[],omPhotoUrls:[]}));bShowPreview(d.headers,d.rows,d.row_images||{},d.total);if(statusEl)statusEl.textContent='✅ 共 '+d.total+' 筆';}catch(e){if(statusEl)statusEl.textContent='❌ '+e.message;}};rd.readAsArrayBuffer(file);}}
function bShowPreview(hds,rows,rowImgs,total){const ih=document.getElementById('b-ih2');const ib=document.getElementById('b-ib2');if(!ih||!ib)return;ih.innerHTML='<th>#</th>'+hds.map(h=>`<th>${h}</th>`).join('')+'<th>照片預覽</th>';ib.innerHTML=rows.map((r,ri)=>{const imgs=rowImgs[String(ri+1)]||[];const imgHtml=imgs.map(url=>`<img class="pt" src="${url}" style="height:36px;cursor:pointer;" onclick="opM('${url}','row${ri+1}')">`).join('');return`<tr><td>${ri+1}</td>${hds.map(h=>`<td>${r[h]||''}</td>`).join('')}<td>${imgHtml||'—'}</td></tr>`;}).join('');document.getElementById('b-is2').textContent=`共 ${total} 筆`;document.getElementById('b-ip2').style.display='';}
async function bCfImp(){const statusEl=document.getElementById('b-impStatus');if(bPicFile&&bPicFile.name.match(/\.(xlsx|xls)$/i)){if(!bIb.length){toast('沒有可匯入的有效資料','err');return;}const g=(row,keys)=>keys.reduce((v,k)=>v||row[k]||'','');const records=bIb.map(row=>({date:g(row,['日期','date','Date','DATE']),model:g(row,['Model','model','MODEL']),station:g(row,['站點','station','Station']),line:g(row,['LINE','Line','line']),midId:g(row,['中片ID','midId']),chipId:g(row,['CHIP ID','chipId','chip_id']),tc:g(row,['T/C','T/C側','TC','tc']),x:g(row,['X(mm)','X (mm)','x','X']),y:g(row,['Y(mm)','Y (mm)','y','Y']),morphology:g(row,['成像敘述','morphology']),level:g(row,['程度','level']),ito:g(row,['ITO','ito']),note:g(row,['Note','note','NOTE','備註']),photoUrls:[],omPhotoUrls:[]})).filter(r=>r.date||r.chipId);if(!records.length){toast('沒有可匯入的有效資料','err');return;}try{const res=await fetch(API_BASE+'/api/beol/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records})});const d=await res.json();if(d.success){if(statusEl)statusEl.textContent='✅ 匯入完成 '+d.count+' 筆';toast('✅ 成功匯入 '+d.count+' 筆');bCnImp();}else{if(statusEl)statusEl.textContent='❌ '+(d.error||'');toast('匯入失敗','err');}}catch(e){if(statusEl)statusEl.textContent='❌ '+e.message;}}else{if(!bPicPreviewId){toast('請先完成預覽','err');return;}try{const res=await fetch(API_BASE+'/api/beol/import_excel_with_pics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preview_id:bPicPreviewId})});const d=await res.json();if(d.success){if(statusEl)statusEl.textContent='✅ 匯入完成 '+d.count+' 筆（圖片 '+d.photos+' 張）';toast('✅ 成功匯入 '+d.count+' 筆');bCnImp();}else{if(statusEl)statusEl.textContent='❌ '+(d.error||'');toast('匯入失敗','err');}}catch(e){if(statusEl)statusEl.textContent='❌ '+e.message;}}}
function bCnImp(){bIb=[];bPicFile=null;bPicPreviewId=null;const el=document.getElementById('b-if2');if(el)el.value='';document.getElementById('b-ip2').style.display='none';document.getElementById('b-is2').innerHTML='';}


// ===== BEOL SUMMARY =====
// 修正1（202609041720）：還原前版誤刪的完整繪圖邏輯
const _bsmCharts = {};
let _bsmAllRecs = [];
const BSM_NG_LV = ['乾擦','濕擦','乾溼不可擦'];

function bsmInitDates(){
  var today = new Date();
  var from14 = new Date(today); from14.setDate(today.getDate()-14);
  var toStr = today.toISOString().slice(0,10);
  var fromStr = from14.toISOString().slice(0,10);
  var gf=document.getElementById('bsm-g-from'), gt=document.getElementById('bsm-g-to');
  if(gf&&!gf.value) gf.value=fromStr;
  if(gt&&!gt.value) gt.value=toStr;
}

async function bsmApply(){
  var from  = (document.getElementById('bsm-g-from')||{}).value||'';
  var to    = (document.getElementById('bsm-g-to')||{}).value||'';
  var model = (document.getElementById('bsm-g-model')||{}).value||'';
  var st    = (document.getElementById('bsm-g-st')||{}).value||'';
  var lv    = (document.getElementById('bsm-g-lv')||{}).value||'';
  var params = new URLSearchParams({dateFrom:from,dateTo:to,model:model,station:st,level:lv});
  try{
    var res = await fetch(API_BASE+'/api/beol/search?'+params).then(r=>r.json());
    if(!res.success){console.error('BEOL SUMMARY 查詢失敗');return;}
    _bsmAllRecs = res.records||[];
    var models = [...new Set(_bsmAllRecs.map(r=>r.model||'').filter(Boolean))].sort();
    ['bsm-g-model','bsm-T-cf-model','bsm-C-cf-model','bsm-T-mf-model','bsm-C-mf-model'].forEach(function(id){
      var el=document.getElementById(id); if(!el) return;
      var cur=el.value;
      el.innerHTML='<option value="">全部</option>'+models.map(m=>'<option'+(m===cur?' selected':'')+'>'+m+'</option>').join('');
    });
    bsmRedrawAll();
  }catch(e){console.error('BEOL SUMMARY 失敗：',e);}
}

function bsmRedrawAll(){
  ['T','C'].forEach(function(s){
    bsmDrawChipTotal(s);
    bsmDrawChipFilter(s);
    bsmDrawMidTotal(s);
    bsmDrawMidFilter(s);
  });
}

// 去重：同一天同一TC，idField 相同只算一筆；無 id 的記錄不計
function bsmDedup(recs, idField){
  var seen=new Set();
  return recs.filter(function(r){
    var v=r[idField]||''; if(!v) return false;
    var key=(r.date||'')+'|'+(r.tc||'')+'|'+v;
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// 去重後計算每日母數
function bsmCountByDate(recs, idField){
  var byDate={};
  bsmDedup(recs,idField).forEach(function(r){var d=r.date||'';byDate[d]=(byDate[d]||0)+1;});
  return byDate;
}

// 去重後計算指定程度的每日 NG 數（lvArr 為空 → 計算全部 BSM_NG_LV）
function bsmNgByDate(recs, idField, lvArr){
  var useArr = lvArr&&lvArr.length ? lvArr : BSM_NG_LV;
  var filtered = recs.filter(function(r){return useArr.indexOf(r.level||'')!==-1;});
  var byDate={};
  bsmDedup(filtered,idField).forEach(function(r){var d=r.date||'';byDate[d]=(byDate[d]||0)+1;});
  return byDate;
}

function bsmDates(recs){
  return [...new Set(recs.map(r=>r.date||'').filter(Boolean))].sort();
}

function bsmDrawChipTotal(side){
  var recs=_bsmAllRecs.filter(r=>r.tc===side);
  var dates=bsmDates(recs);
  var tot=bsmCountByDate(recs,'chipId');
  var ng =bsmNgByDate(recs,'chipId',[]);
  var lv0=bsmNgByDate(recs,'chipId',['乾擦']);
  var lv1=bsmNgByDate(recs,'chipId',['濕擦']);
  var lv2=bsmNgByDate(recs,'chipId',['乾溼不可擦']);
  var col=(document.getElementById('color-'+side+'-chip-total')||{value:'#3498db'}).value;
  _bsmDraw('bsm-'+side+'-chip-total',dates,tot,ng,col,recs,'chipId',{lv0:lv0,lv1:lv1,lv2:lv2},'total','');
}

function bsmDrawChipFilter(side){
  var flv =(document.getElementById('bsm-'+side+'-cf-lv')||{}).value||'';
  var fst =(document.getElementById('bsm-'+side+'-cf-st')||{}).value||'';
  var fito=(document.getElementById('bsm-'+side+'-cf-ito')||{}).value||'';
  var fmod=(document.getElementById('bsm-'+side+'-cf-model')||{}).value||'';
  var recs=_bsmAllRecs.filter(function(r){
    return r.tc===side&&(fst?r.station===fst:true)&&(fito?r.ito===fito:true)&&(fmod?r.model===fmod:true);
  });
  var dates=bsmDates(recs);
  var tot=bsmCountByDate(recs,'chipId');
  var ng =bsmNgByDate(recs,'chipId',flv?[flv]:[]);
  var col=(document.getElementById('color-'+side+'-chip-filter')||{value:'#2ecc71'}).value;
  _bsmDraw('bsm-'+side+'-chip-filter',dates,tot,ng,col,recs,'chipId',null,'filter',flv||'全部NG');
}

function bsmDrawMidTotal(side){
  var recs=_bsmAllRecs.filter(r=>r.tc===side&&r.midId);
  var sec=document.getElementById('bsm-'+side+'-mid-section');
  if(sec) sec.style.display=recs.length?'':'none';
  if(!recs.length) return;
  var dates=bsmDates(recs);
  var tot=bsmCountByDate(recs,'midId');
  var ng =bsmNgByDate(recs,'midId',[]);
  var lv0=bsmNgByDate(recs,'midId',['乾擦']);
  var lv1=bsmNgByDate(recs,'midId',['濕擦']);
  var lv2=bsmNgByDate(recs,'midId',['乾溼不可擦']);
  var col=(document.getElementById('color-'+side+'-mid-total')||{value:'#9b59b6'}).value;
  _bsmDraw('bsm-'+side+'-mid-total',dates,tot,ng,col,recs,'midId',{lv0:lv0,lv1:lv1,lv2:lv2},'total','');
}

function bsmDrawMidFilter(side){
  var recs=_bsmAllRecs.filter(r=>r.tc===side&&r.midId);
  if(!recs.length) return;
  var flv =(document.getElementById('bsm-'+side+'-mf-lv')||{}).value||'';
  var fst =(document.getElementById('bsm-'+side+'-mf-st')||{}).value||'';
  var fito=(document.getElementById('bsm-'+side+'-mf-ito')||{}).value||'';
  var fmod=(document.getElementById('bsm-'+side+'-mf-model')||{}).value||'';
  var fr=recs.filter(function(r){
    return (fst?r.station===fst:true)&&(fito?r.ito===fito:true)&&(fmod?r.model===fmod:true);
  });
  var dates=bsmDates(fr);
  var tot=bsmCountByDate(fr,'midId');
  var ng =bsmNgByDate(fr,'midId',flv?[flv]:[]);
  var col=(document.getElementById('color-'+side+'-mid-filter')||{value:'#e67e22'}).value;
  _bsmDraw('bsm-'+side+'-mid-filter',dates,tot,ng,col,fr,'midId',null,'filter',flv||'全部NG');
}

function _bsmDraw(cid,dates,totByDate,ngByDate,barColor,recs,idField,lvDet,mode,selLvLabel){
  var canvas=document.getElementById(cid); if(!canvas) return;
  if(_bsmCharts[cid]) _bsmCharts[cid].destroy();
  var tots  =dates.map(d=>totByDate[d]||0);
  var ngs   =dates.map(d=>ngByDate[d]||0);
  var ratios=dates.map(function(d,i){return tots[i]>0?parseFloat(((ngs[i]/tots[i])*100).toFixed(2)):null;});
  _bsmCharts[cid]=new Chart(canvas,{
    type:'bar',
    data:{labels:dates,datasets:[
      {label:'總覆判數量',data:tots,backgroundColor:barColor,borderColor:barColor,borderWidth:1,yAxisID:'yLeft',order:2},
      {label:'NG Ratio(%)',data:ratios,type:'line',borderColor:'#e74c3c',
       backgroundColor:'rgba(231,76,60,0.1)',pointBackgroundColor:'#e74c3c',
       borderWidth:2,pointRadius:4,fill:false,tension:0.3,yAxisID:'yRight',order:1}
    ]},
    options:{
      responsive:true,
      plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}},tooltip:{enabled:false}},
      scales:{
        yLeft:{type:'linear',position:'left',beginAtZero:true,
               title:{display:true,text:'總覆判數量',font:{size:10}},ticks:{stepSize:1,font:{size:9}}},
        yRight:{type:'linear',position:'right',beginAtZero:true,max:100,
                title:{display:true,text:'NG Ratio (%)',font:{size:10}},
                ticks:{font:{size:9},callback:function(v){return v+'%';}},
                grid:{drawOnChartArea:false}}
      },
      onHover:function(evt,els){
        if(els&&els.length>0){
          _bsmShowTooltip(evt,dates[els[0].index],recs,idField,totByDate,ngByDate,lvDet,mode,selLvLabel);
        } else { _bsmHideTooltip(); }
      }
    }
  });
  canvas.onmouseleave=_bsmHideTooltip;
}

function _bsmShowTooltip(evt,date,recs,idField,totByDate,ngByDate,lvDet,mode,selLvLabel){
  var tt=document.getElementById('bsm-tooltip'); if(!tt) return;
  var dayRecs=recs.filter(r=>r.date===date);
  var models=[...new Set(dayRecs.map(r=>r.model||'').filter(Boolean))].sort();
  if(!models.length) models=[''];
  var html='<div style="font-weight:700;color:#1a6bb5;margin-bottom:6px;font-size:12px;">&#128197; '+date+'</div>';
  models.forEach(function(mod){
    var mr=mod?dayRecs.filter(r=>r.model===mod):dayRecs;
    var tot=totByDate[date]||0;
    var ng =ngByDate[date]||0;
    var ratio=tot>0?((ng/tot)*100).toFixed(1):'0.0';
    html+='<div style="margin-bottom:4px;">';
    if(mod) html+='<span style="font-weight:600;color:#555;font-size:11px;">'+mod+'</span><br>';
    if(mode==='total'&&lvDet){
      var lv0=lvDet.lv0?lvDet.lv0[date]||0:0;
      var lv1=lvDet.lv1?lvDet.lv1[date]||0:0;
      var lv2=lvDet.lv2?lvDet.lv2[date]||0:0;
      html+='<span style="font-size:11px;">總計：'+tot+' 片｜NG：'+ng+' ('+ratio+'%)</span><br>';
      html+='<span style="font-size:10px;color:#888;">乾擦：'+lv0+'｜濕擦：'+lv1+'｜乾溼不可擦：'+lv2+'</span>';
    } else {
      html+='<span style="font-size:11px;">總計：'+tot+'｜'+selLvLabel+'：'+ng+' ('+ratio+'%)</span>';
    }
    html+='</div>';
  });
  tt.innerHTML=html;
  tt.style.display='block';
  var rect=evt.chart.canvas.getBoundingClientRect();
  var x=evt.native?evt.native.clientX:evt.x;
  var y=evt.native?evt.native.clientY:evt.y;
  tt.style.left=(x-rect.left+16)+'px';
  tt.style.top =(y-rect.top-20)+'px';
}

function _bsmHideTooltip(){
  var tt=document.getElementById('bsm-tooltip');
  if(tt) tt.style.display='none';
}

function bsmApplyTheme(){
  var theme=(document.getElementById('bsm-g-theme')||{}).value||'earth';
  console.log('[bsm] theme =', theme);
}

function bsmCloseZoom(){
  var modal=document.getElementById('bsm-zoom-modal');
  if(modal) modal.style.display='none';
  if(window._bsmZoomChart){window._bsmZoomChart.destroy();window._bsmZoomChart=null;}
}

function bsmOpenZoom(cid,title,chartData){
  var modal=document.getElementById('bsm-zoom-modal');
  var titleEl=document.getElementById('bsm-zoom-title');
  if(!modal) return;
  if(titleEl) titleEl.textContent=title||'';
  modal.style.display='flex';
  var zcanvas=document.getElementById('bsm-zoom-canvas');
  if(!zcanvas||!chartData) return;
  if(window._bsmZoomChart) window._bsmZoomChart.destroy();
  window._bsmZoomChart=new Chart(zcanvas,{
    type:chartData.type||'bar',
    data:JSON.parse(JSON.stringify(chartData.data)),
    options:Object.assign({},chartData.options,{responsive:true,maintainAspectRatio:false})
  });
}


// ===== BY製程時間SUMMARY =====
const _bptCharts = {};
let _bptRecords = [];

function bptInitDates(){
  var today = new Date();
  var from14 = new Date(today); from14.setDate(today.getDate()-14);
  var toStr = today.toISOString().slice(0,10);
  var fromStr = from14.toISOString().slice(0,10);
  var gf=document.getElementById('bpt-from'), gt=document.getElementById('bpt-to');
  if(gf&&!gf.value) gf.value=fromStr;
  if(gt&&!gt.value) gt.value=toStr;
}

async function bptQuery(){
  const statusEl = document.getElementById('bpt-status');
  statusEl.textContent = '⏳ 查詢中...';
  const from  = document.getElementById('bpt-from').value||'';
  const to    = document.getElementById('bpt-to').value||'';
  const model = document.getElementById('bpt-model').value||'';
  if(!from||!to){ toast('請選擇時間區間','err'); statusEl.textContent=''; return; }
  try{
    const res = await fetch(API_BASE+'/api/beol/process_summary',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({dateFrom:from, dateTo:to, model})
    });
    const d = await res.json();
    if(!d.success){ toast('❌ '+(d.error||'查詢失敗'),'err'); statusEl.textContent=''; return; }
    _bptRecords = d.records||[];
    statusEl.textContent = '✅ 共 '+_bptRecords.length+' 筆';
    bptRenderTable(_bptRecords);
    bptDrawChart(_bptRecords);
  }catch(e){
    toast('連線錯誤：'+e.message,'err');
    statusEl.textContent='';
  }
}


function bptRenderTable(records){
  const tbody = document.getElementById('bpt-tbody');
  if(!records.length){ tbody.innerHTML='<tr><td colspan="15" class="nd">無資料</td></tr>'; return; }
  tbody.innerHTML = records.map((r,i)=>`<tr>
    <td>${i+1}</td>
    <td>${r.date||''}</td>
    <td>${r.model||''}</td>
    <td>${r.station||''}</td>
    <td>${r.line||''}</td>
    <td>${r.chipId||''}</td>
    <td>${r.midId||''}</td>
    <td>${r.tc||''}</td>
    <td>${r.level||''}</td>
    <td>${r.TFT_GLASS_ID||''}</td>
    <td>${r.CF_GLASS_ID||''}</td>
    <td>${r.PRODUCT_CODE||''}</td>
    <td>${r.OP_ID||''}</td>
    <td>${r.EQP_ID||''}</td>
    <td>${r.MFG_DAY||''}</td>
  </tr>`).join('');
}

// ★ 修正B：bptDrawChart 重寫
// X軸 = MFG_DAY；柱狀圖（左Y）= TOTAL KEY IN 數量（依製程OP_ID篩選）
// 折線圖（右Y）= NG ratio = 勾選程度筆數 / TOTAL × 100%
function bptDrawChart(records){
  // destroy existing
  if(_bptCharts['bpt-t']) _bptCharts['bpt-t'].destroy();
  if(_bptCharts['bpt-c']) _bptCharts['bpt-c'].destroy();

  var PALETTE=['#2980b9','#e67e22','#27ae60','#8e44ad','#e74c3c',
               '#1abc9c','#f39c12','#d35400','#16a085','#7f8c8d',
               '#2c3e50','#c0392b','#8e44ad','#2471a3','#1e8449'];

  function hexRgba(hex,a){
    var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }

  if(!records||!records.length) return;

  var selOp=(document.getElementById('bpt-op-sel')||{}).value||'';
  var filtered=selOp?records.filter(function(r){return r.OP_ID===selOp;}):records;
  if(!filtered.length) return;

  // X軸：所有 MFG_DAY
  var allDates=[...new Set(filtered.map(function(r){return r.MFG_DAY||r.date||'';}).filter(Boolean))].sort();

  // OP_ID 列表
  var allOps=selOp?[selOp]:[...new Set(filtered.map(function(r){return r.OP_ID||'(無)';}).filter(Boolean))].sort();

  function buildDatasets(sideRec){
    return allOps.map(function(op,i){
      var color=PALETTE[i%PALETTE.length];
      var byDate={};
      allDates.forEach(function(d){byDate[d]=0;});
      sideRec.filter(function(r){return (r.OP_ID||'(無)')===op;}).forEach(function(r){
        var d=r.MFG_DAY||r.date||''; if(!d) return;
        byDate[d]=(byDate[d]||0)+1;
      });
      return {
        label:op,
        data:allDates.map(function(d){return byDate[d]||0;}),
        borderColor:color,
        backgroundColor:hexRgba(color,0.12),
        pointBackgroundColor:color,
        pointRadius:4,borderWidth:2,fill:false,tension:0.3
      };
    });
  }

  function buildCfg(sideRec){
    return {
      type:'line',
      data:{labels:allDates,datasets:buildDatasets(sideRec)},
      options:{
        responsive:true,
        plugins:{
          legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}},
          tooltip:{callbacks:{label:function(ctx){
            return ctx.dataset.label+': '+ctx.raw+' 筆';
          }}}
        },
        scales:{
          x:{ticks:{font:{size:9},maxRotation:45,autoSkip:true,maxTicksLimit:30}},
          y:{type:'linear',beginAtZero:true,
             title:{display:true,text:'KEY IN 數量',font:{size:10}},
             ticks:{stepSize:1,font:{size:9}}}
        }
      }
    };
  }

  var tRec=filtered.filter(function(r){return r.tc==='T';});
  var cRec=filtered.filter(function(r){return r.tc==='C';});
  var ctT=document.getElementById('bpt-chart-t');
  var ctC=document.getElementById('bpt-chart-c');
  if(ctT) _bptCharts['bpt-t']=new Chart(ctT,buildCfg(tRec));
  if(ctC) _bptCharts['bpt-c']=new Chart(ctC,buildCfg(cRec));
}


function bptExport(){
  if(!_bptRecords.length){ toast('無資料可匯出','err'); return; }
  const headers = ['#','日期','Model','站點','LINE','CHIP ID','中片ID','T/C','程度',
                   'TFT_GLASS_ID','CF_GLASS_ID','PRODUCT_CODE','OP_ID','EQP_ID','MFG_DAY'];
  const rows = _bptRecords.map((r,i)=>[
    i+1, r.date||'', r.model||'', r.station||'', r.line||'',
    r.chipId||'', r.midId||'', r.tc||'', r.level||'',
    r.TFT_GLASS_ID||'', r.CF_GLASS_ID||'', r.PRODUCT_CODE||'',
    r.OP_ID||'', r.EQP_ID||'', r.MFG_DAY||''
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers,...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BY製程時間SUMMARY');
  XLSX.writeFile(wb, 'BEOL_BY製程時間SUMMARY_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

// ===== BEOL 搜尋結果 行內編輯 =====

function escHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function bStartEdit(i){
  if(bEditingIdx!==null && bEditingIdx!==i){
    if(!confirm('目前有未儲存的修改，確定放棄？'))return;
    bCancelEdit(bEditingIdx);
  }
  bEditingIdx=i;
  const r=bLastSrch[i]; if(!r)return;
  bEditPs[i]={newPhotos:[],newOmPhotos:[]};

  document.getElementById('bop-'+i).innerHTML=
    '<button class="bn bs bsm" onclick="bSaveEditRow('+i+')">&#x2705; 儲存</button> '+
    '<button class="bn bo bsm" onclick="bCancelEdit('+i+')">&#x274C; 取消</button>';

  document.getElementById('bed-date-'+i).innerHTML=
    '<input type="date" id="bei-date-'+i+'" value="'+(r.date||'')+'">';

  document.getElementById('bed-model-'+i).innerHTML=
    '<input type="text" id="bei-model-'+i+'" value="'+escHtml(r.model||'')+'" style="width:110px">';

  var _bSt=r.station||'';
  var stBtns=Object.keys(BSL).map(function(st){
    return '<div class="ch'+(st===_bSt?' on':'')+'" onclick="bEditSelSt2(this,'+i+')">'+st+'</div>';
  }).join('');
  document.getElementById('bed-station-'+i).innerHTML=
    '<div class="cg" id="bei-st-'+i+'">'+stBtns+'</div>';

  bEditUpdLine(i, r.station||'', r.line||'');

  document.getElementById('bed-mid-'+i).innerHTML=
    '<input type="text" id="bei-mid-'+i+'" value="'+escHtml(r.midId||'')+'" style="width:90px">';
  document.getElementById('bed-chip-'+i).innerHTML=
    '<input type="text" id="bei-chip-'+i+'" value="'+escHtml(r.chipId||'')+'" style="width:90px">';

  var _bTc=r.tc||'';
  var tcBtns=['T','C'].map(function(tc){
    return '<div class="mi'+(tc===_bTc?' on':'')+'" onclick="bTogM(this,\'bei-tc-'+i+'\')">'+tc+'</div>';
  }).join('');
  document.getElementById('bed-tc-'+i).innerHTML=
    '<div class="mc" id="bei-tc-'+i+'">'+tcBtns+'</div>';

  document.getElementById('bed-x-'+i).innerHTML=
    '<input type="number" id="bei-x-'+i+'" value="'+(r.x||'')+'" step="0.1" style="width:68px">';
  document.getElementById('bed-y-'+i).innerHTML=
    '<input type="number" id="bei-y-'+i+'" value="'+(r.y||'')+'" step="0.1" style="width:68px">';

  document.getElementById('bed-mo-'+i).innerHTML=
    '<input type="text" id="bei-mo-'+i+'" value="'+escHtml(r.morphology||'')+'" style="width:90px">';

  var _bLv=r.level||'';
  var lvBtns=B_LV.map(function(lv){
    return '<div class="mi'+(lv===_bLv?' on':'')+'" onclick="bTogM(this,\'bei-lv-'+i+'\')">'+lv+'</div>';
  }).join('');
  document.getElementById('bed-lv-'+i).innerHTML=
    '<div class="mc" id="bei-lv-'+i+'" style="flex-wrap:wrap;gap:3px;">'+lvBtns+'</div>';

  var _bIto=r.ito||'';
  var itoBtns=['上','下'].map(function(it){
    return '<div class="mi'+(it===_bIto?' on':'')+'" onclick="bTogM(this,\'bei-ito-'+i+'\')">'+it+'</div>';
  }).join('');
  document.getElementById('bed-ito-'+i).innerHTML=
    '<div class="mc" id="bei-ito-'+i+'">'+itoBtns+'</div>';

  document.getElementById('bed-note-'+i).innerHTML=
    '<textarea id="bei-note-'+i+'" rows="2" style="min-width:100px">'+escHtml(r.note||'')+'</textarea>';

  document.getElementById('bed-emp-'+i).innerHTML=
    '<input type="text" id="bei-emp-'+i+'" value="'+escHtml(r.empId||'')+'" style="width:70px">';

  bEditRenderPhotoCell(i,'ph',  r.photoUrls  ||[]);
  bEditRenderPhotoCell(i,'om',  r.omPhotoUrls||[]);
}

function bEditSelSt2(el,i){
  var st=el.textContent.trim();
  el.closest('.cg').querySelectorAll('.ch').forEach(function(c){c.classList.remove('on');});
  el.classList.add('on');
  bEditUpdLine(i,st,'');
}

async function bSaveEditRow(i){
  const r=bLastSrch[i]; if(!r){toast('找不到原始記錄','err');return;}
  function gv(id){var el=document.getElementById(id);return el?el.value:'';}
  function mc(id){var el=document.querySelector('#'+id+' .mi.on');return el?el.textContent.trim():'';}
  function getSt(){var el=document.querySelector('#bei-st-'+i+' .ch.on');return el?el.textContent.trim():'';}
  function getLn(){var el=document.querySelector('#bei-ln-'+i+' .lc.on');return el?el.textContent.trim():'';}
  const ep=bEditPs[i]||{newPhotos:[],newOmPhotos:[]};
  const record={
    date:       gv('bei-date-'+i)   ||r.date,
    model:      gv('bei-model-'+i)  ||r.model,
    station:    getSt()             ||r.station,
    line:       getLn()             ||r.line,
    midId:      gv('bei-mid-'+i),
    chipId:     gv('bei-chip-'+i),
    tc:         mc('bei-tc-'+i)     ||r.tc,
    x:          gv('bei-x-'+i),
    y:          gv('bei-y-'+i),
    morphology: gv('bei-mo-'+i),
    level:      mc('bei-lv-'+i)     ||r.level,
    ito:        mc('bei-ito-'+i)    ||r.ito,
    note:       gv('bei-note-'+i),
    empId:      gv('bei-emp-'+i)    ||r.empId,
    photoUrls:  r.photoUrls  ||[],
    omPhotoUrls:r.omPhotoUrls||[]
  };
  toast('⏳ 儲存中...');
  try{
    const res=await fetch(API_BASE+'/api/beol/update',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        createdAt:   r.createdAt||'',
        originalDate:r.date||'',
        record:      record,
        newPhotos:   ep.newPhotos.map(function(p){return{name:p.name,dataUrl:p.dataUrl};}),
        newOmPhotos: ep.newOmPhotos.map(function(p){return{name:p.name,dataUrl:p.dataUrl};})
      })
    });
    const d=await res.json();
    if(d.success){
      toast('✅ 修改成功');
      bLastSrch[i]=Object.assign({},r,record,d.record||{});
      bCancelEdit(i);
    }else{
      toast('❌ 修改失敗：'+(d.error||'未知'),'err');
    }
  }catch(e){
    toast('❌ 連線錯誤：'+e.message,'err');
  }
}

function bEditRenderPhotoCell(i,type,existingUrls){
  var cellId=type==='om'?'bed-om-'+i:'bed-ph-'+i;
  var cell=document.getElementById(cellId); if(!cell)return;
  var label=type==='om'?'OM照片':'照片';
  var key=type==='om'?'newOmPhotos':'newPhotos';
  if(!bEditPs[i])bEditPs[i]={newPhotos:[],newOmPhotos:[]};
  var html='<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;">';
  existingUrls.forEach(function(u){
    var fname=u.split('\\').pop()||u;
    var proxy=API_BASE+'/api/photo?path='+encodeURIComponent(u);
    html+='<img class="pt" src="'+proxy+'" title="'+fname+'" style="height:36px">';
  });
  (bEditPs[i][key]||[]).forEach(function(p){
    html+='<img class="pt" src="'+p.dataUrl+'" title="'+p.name+'" style="height:36px">';
  });
  html+='<label style="font-size:11px;cursor:pointer;padding:2px 8px;background:#e8f0fe;border-radius:4px;">+'+label
      +'<input type="file" accept="image/*" style="display:none" onchange="bEditAddPhoto(this,'+i+',\''+type+'\')"></label>';
  html+='</div>';
  cell.innerHTML=html;
}

function bEditAddPhoto(inp,i,type){
  if(!inp.files||!inp.files.length)return;
  var key=type==='om'?'newOmPhotos':'newPhotos';
  if(!bEditPs[i])bEditPs[i]={newPhotos:[],newOmPhotos:[]};
  var r=bLastSrch[i];
  Array.from(inp.files).forEach(function(f){
    var rd=new FileReader();
    rd.onload=function(e){
      bEditPs[i][key].push({name:f.name,dataUrl:e.target.result});
      bEditRenderPhotoCell(i,type,r?(type==='om'?r.omPhotoUrls:r.photoUrls)||[]:[]);
    };
    rd.readAsDataURL(f);
  });
}
