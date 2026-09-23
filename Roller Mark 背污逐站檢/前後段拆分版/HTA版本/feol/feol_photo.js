/* feol_photo.js */


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

    <div class="pz" style="min-width:52px;padding:5px 4px;" tabindex="0" onpaste="hdPaste(event,${i})" onclick="this.focus()">＋貼上<label class="pz-sub">選檔<input type="file" accept="image/*" multiple onchange="hdP(this,${i})" style="display:none"/></label></div>

  </div>`;

}


// ===== ★ 新增：貼上圖片到照片欄 =====

function hdPaste(event,i){

  const items=(event.clipboardData||event.originalEvent?.clipboardData)?.items;

  if(!items)return;

  const files=[];

  for(const item of items){

    if(item.type.startsWith('image/')){

      const file=item.getAsFile();

      if(file)files.push(file);

    }

  }

  if(!files.length)return;

  event.preventDefault();

  if(!ps[i])ps[i]=[];

  const cell=document.getElementById('pc'+i);

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

      const ext=f.type.split('/')[1]||'png';

      const fn=`${dt}_${md}_${st.replace(/\s/g,'')}_${tc}_${pos}_paste${fi+1}.${ext}`;

      ps[i].push({name:fn,dataUrl:e.target.result});

      ld++;if(ld===files.length)rpC(i,cell);

    };

    rd.readAsDataURL(f);

  });

  toast('📋 已貼上 '+files.length+' 張圖片');

}


// ===== ★ 新增：Y 欄貼上多筆自動展開 =====

function hdYPaste(event,i){

  var clipText=(event.clipboardData||window.clipboardData).getData('text');

  var lines=clipText.split(/\r?\n/).map(function(l){return l.trim();}).filter(function(l){return l!=='';});

  if(lines.length<=1)return;

  event.preventDefault();

  var tr=document.getElementById('r'+i);

  if(!tr)return;

  var sid=(tr.querySelector('.sid')||{value:''}).value.trim();

  var tc=gM(tr.querySelector('.tc'+i));

  var lv=gM(tr.querySelector('.lv'+i));

  var note=(tr.querySelector('textarea')||{value:''}).value.trim();

  var x=(tr.querySelector('.cx')||{value:''}).value;

  var yEl=tr.querySelector('.cy');

  if(yEl)yEl.value=lines[0];

  lines.slice(1).forEach(function(yVal){

    addRow();

    var ni=rc;

    var ntr=document.getElementById('r'+ni);

    if(!ntr)return;

    var ns=ntr.querySelector('.sid');if(ns)ns.value=sid;

    var nx=ntr.querySelector('.cx');if(nx)nx.value=x;

    var ny=ntr.querySelector('.cy');if(ny)ny.value=yVal;

    if(tc)ntr.querySelectorAll('.tc'+ni+' .mi').forEach(function(btn){

      btn.classList.toggle('on',btn.textContent.trim()===tc);

    });

    if(lv)ntr.querySelectorAll('.lv'+ni+' .mi').forEach(function(btn){

      btn.classList.toggle('on',btn.textContent.trim()===lv);

    });

    var nt=ntr.querySelector('textarea');if(nt)nt.value=note;

  });

  toast('已展開 '+lines.length+' 筆');

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


