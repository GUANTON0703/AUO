function addRow(){

  rc++;const i=rc,tb=document.getElementById('eb'),tr=document.createElement('tr');

  tr.id='r'+i;tr.innerHTML=`

  <td class="rn">${i}</td>

  <td><input type="text" class="sid" placeholder="Sheet ID" style="width:90px"/></td>

  <td><div class="mc tc${i}">

    <div class="mi" onclick="togM(this,'tc${i}')">T</div>

    <div class="mi" onclick="togM(this,'tc${i}')">C</div>

  </div></td>

  <td><input type="text" class="cx" placeholder="X" style="width:72px"/></td>

  <td><input type="text" class="cy" placeholder="Y" style="width:72px"/></td>

  <td><div class="mc lv${i}">

    <div class="mi" onclick="togM(this,'lv${i}')">0</div>

    <div class="mi" onclick="togM(this,'lv${i}')">1</div>

    <div class="mi" onclick="togM(this,'lv${i}')">1.5</div>

    <div class="mi" onclick="togM(this,'lv${i}')">2.0</div>

    <div class="mi" onclick="togM(this,'lv${i}')">3.0</div>

  </div></td>

  <td><textarea rows="2" placeholder="Note..."></textarea></td>

  <td id="pc${i}">

    <label class="pub">📷 上傳

      <input type="file" accept="image/*" multiple onchange="hdP(this,${i})" style="display:none"/>

    </label>

  </td>

  <td><button class="bn bd2 bsm" onclick="delR(${i})">✕</button></td>`;

  tb.appendChild(tr);

  scrollToRow(tr);

}



// ===== ★ 新增：新增一筆 同ID =====

function addRowSameID(){

  const rows=document.querySelectorAll('#eb tr');

  if(!rows.length){toast('沒有上一筆資料，請先新增一筆','err');return;}

  const lastRow=rows[rows.length-1];

  const lastIdx=parseInt(lastRow.id.replace('r',''));

  const lastSid=lastRow.querySelector('.sid').value.trim();

  const lastTcSel=lastRow.querySelector('.tc'+lastIdx+' .mi.on');

  const lastTc=lastTcSel?lastTcSel.textContent.trim():'';



  rc++;const i=rc,tb=document.getElementById('eb'),tr=document.createElement('tr');

  tr.id='r'+i;tr.innerHTML=`

  <td class="rn">${i}</td>

  <td><input type="text" class="sid" placeholder="Sheet ID" style="width:90px" value="${lastSid}"/></td>

  <td><div class="mc tc${i}">

    <div class="mi" onclick="togM(this,'tc${i}')">T</div>

    <div class="mi" onclick="togM(this,'tc${i}')">C</div>

  </div></td>

  <td><input type="text" class="cx" placeholder="X" style="width:72px"/></td>

  <td><input type="text" class="cy" placeholder="Y" style="width:72px"/></td>

  <td><div class="mc lv${i}">

    <div class="mi" onclick="togM(this,'lv${i}')">0</div>

    <div class="mi" onclick="togM(this,'lv${i}')">1</div>

    <div class="mi" onclick="togM(this,'lv${i}')">1.5</div>

    <div class="mi" onclick="togM(this,'lv${i}')">2.0</div>

    <div class="mi" onclick="togM(this,'lv${i}')">3.0</div>

  </div></td>

  <td><textarea rows="2" placeholder="Note..."></textarea></td>

  <td id="pc${i}">

    <label class="pub">📷 上傳

      <input type="file" accept="image/*" multiple onchange="hdP(this,${i})" style="display:none"/>

    </label>

  </td>

  <td><button class="bn bd2 bsm" onclick="delR(${i})">✕</button></td>`;

  tb.appendChild(tr);

  // 自動選取上一筆的 T/C

  if(lastTc){

    tr.querySelector('.tc'+i).querySelectorAll('.mi').forEach(m=>{

      if(m.textContent.trim()===lastTc)togM(m,'tc'+i);

    });

  }

  scrollToRow(tr);

}



// ===== 滾動到指定列 =====

function scrollToRow(tr){

  setTimeout(()=>{

    const rect=tr.getBoundingClientRect();

    const absTop=rect.top+window.pageYOffset;

    window.scrollTo({top:absTop-100,behavior:'smooth'});

  },50);

}



function delR(i){const r=document.getElementById('r'+i);if(r)r.remove();rnR();}

function rnR(){document.querySelectorAll('#eb tr').forEach((t,i)=>{const c=t.querySelector('.rn');if(c)c.textContent=i+1;});}

function togM(el,cls){el.closest('.'+cls).querySelectorAll('.mi').forEach(c=>c.classList.remove('on'));el.classList.add('on');}

function gM(c){const s=c?c.querySelector('.mi.on'):null;return s?s.textContent.trim():'';}

function gCV(sel){const e=document.querySelector(sel);return e?e.textContent.trim():'';}



// ===== 照片上傳（與原始版完全一致） =====

function hdP(inp,i){

  if(!inp.files.length)return;

  if(!ps[i])ps[i]=[];

  const cell=document.getElementById('pc'+i),files=Array.from(inp.files);

  const dt=document.getElementById('sd').value.replace(/-/g,'');

  const md=document.getElementById('sm').value||'MDL';

  const st=gCV('#ss .ch.on')||'ST';

  const tr=document.getElementById('r'+i);

  const tc=gM(tr?tr.querySelector('.tc'+i):null)||'TC';

  const x=(tr?tr.querySelector('.cx'):null)?.value||'';

  const y=(tr?tr.querySelector('.cy'):null)?.value||'';

  const pos=(x||y)?`X${x}_Y${y}`:'pos';

  let ld=0;

  files.forEach((f,fi)=>{

    const rd=new FileReader();

    rd.onload=e=>{

      const ext=f.name.split('.').pop();

      const fn=`${dt}_${md}_${st.replace(/\s/g,'')}_${tc}_${pos}_${fi+1}.${ext}`;

      ps[i].push({name:fn,dataUrl:e.target.result});

      ld++;if(ld===files.length)rpC(i,cell);

    };rd.readAsDataURL(f);

  });

}

function rpC(i,cell){

  const ph=ps[i]||[];if(!ph.length)return;

  cell.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">

    ${ph.map((p,pi)=>`<img class="pt" src="${p.dataUrl}" title="${p.name}" onclick="opM('${p.dataUrl}','${p.name}')">`).join('')}

    <span style="font-size:11px;color:var(--p);font-weight:600;">${ph.length}張</span>

    <label class="pub" style="margin-top:2px;">＋<input type="file" accept="image/*" multiple onchange="hdP(this,${i})" style="display:none"/></label>

  </div>`;

}



// ===== ★ 修改：儲存 → 呼叫後端 API =====

function saveAll(){

  const dt=document.getElementById('sd').value;

  const md=document.getElementById('sm').value;

  const st=gCV('#ss .ch.on');

  const ln=gL();

  if(!dt||!md||!st){toast('請先填共用條件：日期、Model、站點','err');return;}

  if((SL[st]||[]).length>0&&!ln){toast('此站點請選擇 LINE','err');return;}

  const rows=document.querySelectorAll('#eb tr');

  if(!rows.length){toast('請新增至少一筆明細','err');return;}



  let add=0;

  const records=[];

  rows.forEach(tr=>{

    const i=parseInt(tr.id.replace('r',''));

    const sid=(tr.querySelector('.sid')||{}).value?.trim()||'';

    const x=(tr.querySelector('.cx')||{}).value||'';

    const y=(tr.querySelector('.cy')||{}).value||'';

    const nt=tr.querySelector('textarea')?tr.querySelector('textarea').value.trim():'';

    const tc=gM(tr.querySelector('.tc'+i));

    const lv=gM(tr.querySelector('.lv'+i));

    const ph=(ps[i]||[]).map(p=>({name:p.name,dataUrl:p.dataUrl}));

    if(!sid&&!tc&&!lv&&!x&&!y)return;

    records.push({

      date:dt,model:md,station:st,line:ln,

      sheetId:sid,tc,x:x||null,y:y||null,lv,note:nt,photos:ph

    });

    add++;

  });



  if(!add){toast('沒有有效明細','err');return;}



  toast('⏳ 儲存中...');



  const empId=document.getElementById('emp').value.trim();

  records.forEach(r=>r.empId=empId);

  fetch(API_BASE+'/api/save',{

    method:'POST',

    headers:{'Content-Type':'application/json'},

    body:JSON.stringify({date:dt,model:md,station:st,line:ln,records})

  })

  .then(r=>r.json())

  .then(data=>{

    if(data.success){

      toast(`✅ 已儲存 ${add} 筆`);

      document.getElementById('eb').innerHTML='';rc=0;

      Object.keys(ps).forEach(k=>delete ps[k]);

      document.getElementById('si').textContent=`上次儲存：${new Date().toLocaleTimeString('zh-TW')}，共 ${add} 筆`;

      addRow();

    }else{

      toast('❌ 儲存失敗：'+(data.error||'未知錯誤'),'err');

    }

  })

  .catch(e=>toast('❌ 連線錯誤：'+e.message,'err'));

}



// ===== ★ 修改：搜尋 → 呼叫後端 API =====