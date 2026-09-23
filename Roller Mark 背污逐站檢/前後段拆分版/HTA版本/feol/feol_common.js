/* feol_common.js */


// ===== ★ 新增：後端 API 位址 =====

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

  // 切頁不自動搜尋

if(n==='sm'){smApplyGlobal();}}


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

  const st=document.getElementById('fst').value;

  let ls;

  if(st){

    ls=SL[st]||[];

  }else{

    const all=new Set();

    Object.values(SL).forEach(function(arr){

      arr.forEach(function(l){all.add(l);});

    });

    ls=[...all].sort();

  }

  const sl=document.getElementById('fl');

  sl.innerHTML='<option value="">全部</option>'+ls.map(function(l){return '<option>'+l+'</option>';}).join('');

}

// ★ 頁面載入時初始化搜尋頁 LINE 下拉

updFL();


// ===== Toast（與原始版完全一致） =====

function toast(msg,type){

  const t=document.getElementById('toast');

  t.textContent=msg;t.className='on'+(type==='err'?' err':'');

  setTimeout(()=>{t.className='';},2800);

}


// ===== 自動載入（保留 autoLoad 給本機 CSV 用） =====

function autoLoad(){

  const existing=lR();

  if(existing.length>0){

    const b=document.getElementById('pb');

    b.style.display='block';

    b.textContent=`✅ 已有 ${existing.length} 筆資料（localStorage）`;

    return;

  }

}


