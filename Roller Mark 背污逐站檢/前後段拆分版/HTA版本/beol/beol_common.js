const API_BASE = window.location.origin;



// ===== 基礎設定（與原始版完全一致） =====

const SL={

  'PI 前':['CKPIC100','CKPIC200','CKPIC300','CKPIC400','CKPIC500'],

  'PI 後':['CKPIC100','CKPIC200','CKPIC300','CKPIC400','CKPIC500'],

  'PA 後':['CKPAC100','CKPAC200'],

  'ODF 後':['CKODF100','CKODF200','CKODF300','CKODF400','CKODF500']

};

const SK='beiwu_records';

function lR(){try{return JSON.parse(localStorage.getItem(SK)||'[]');}catch(e){return[];}}

function sR(r){localStorage.setItem(SK,JSON.stringify(r));}

let ib=[];



// ===== Tab 切換（與原始版完全一致） =====

function sw(n){

  document.querySelectorAll('.t').forEach((t,i)=>t.classList.toggle('on',['ki','sr','im','sm'][i]===n));

  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));

  document.getElementById('pg-'+n).classList.add('on');
  if(n==='bsm') bsmInit();

  // 切頁不自動搜尋

}



// ===== 站點 → LINE（與原始版完全一致） =====

function selSt(el,st){

  document.querySelectorAll('#ss .ch').forEach(c=>c.classList.remove('on'));

  el.classList.add('on');rlC(st);

}

function rlC(st){

  const c=document.getElementById('sl'),ls=SL[st]||[];

  if(!ls.length){c.innerHTML='<span class="lp">此站點無 LINE</span>';return;}

  c.innerHTML=ls.map(l=>`<div class="lc" onclick="togL(this)">${l}</div>`).join('');

}

function togL(el){document.querySelectorAll('#sl .lc').forEach(c=>c.classList.remove('on'));el.classList.add('on');}

function gL(){const s=document.querySelector('#sl .lc.on');return s?s.textContent.trim():'';}

function updFL(){

  const st=document.getElementById('fst').value,ls=st?(SL[st]||[]):[];

  const sl=document.getElementById('fl');

  sl.innerHTML='<option value="">全部</option>'+ls.map(l=>`<option>${l}</option>`).join('');

}



// ===== Key In 明細列（與原始版完全一致） =====

let rc=0;const ps={};