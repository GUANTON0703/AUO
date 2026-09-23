/* feol_bulkedit.js */


// ===== ★ 統一修改 =====

function openBulkEdit(){

  if(!lastSrch||!lastSrch.length){toast('請先搜尋得到資料','err');return;}

  document.getElementById('beHint').textContent='將修改目前搜尋到的 '+lastSrch.length+' 筆資料';

  beFieldChange();

  const _bem=document.getElementById('bulkEditModal');if(_bem.parentElement!==document.body)document.body.appendChild(_bem);_bem.style.display='flex';

}

function closeBulkEdit(){

  document.getElementById('bulkEditModal').style.display='none';

}

function beFieldChange(){

  var field=document.getElementById('beField').value;

  var area=document.getElementById('beValueArea');

  var ss='width:100%;padding:7px;border:1px solid #ccc;border-radius:5px;font-size:14px;margin-top:4px;';

  if(field==='station'){

    area.innerHTML='<select id="beValue" style="'+ss+'">'+['PI 前','PI 後','PA 後','ODF 後','AGX 後','BS ITO 後'].map(function(s){return '<option>'+s+'</option>';}).join('')+'</select>';

  }else if(field==='tc'){

    area.innerHTML='<select id="beValue" style="'+ss+'"><option>T</option><option>C</option></select>';

  }else if(field==='lv'){

    area.innerHTML='<select id="beValue" style="'+ss+'">'+['0','1','1.5','2.0','3.0'].map(function(v){return '<option>'+v+'</option>';}).join('')+'</select>';

  }else if(field==='line'){

    var st=document.getElementById('fst').value;

    var lines=st?(SL[st]||[]):[...new Set(Object.values(SL).flat())].sort();

    area.innerHTML='<select id="beValue" style="'+ss+'">'+lines.map(function(l){return '<option>'+l+'</option>';}).join('')+'</select>';

  }else if(field==='date'){

    area.innerHTML='<input type="date" id="beValue" style="'+ss+'" />';

  }else{

    area.innerHTML='<input type="text" id="beValue" style="'+ss+'" placeholder="請輸入新值"/>';

  }

}

function bulkEditConfirm(){

  var field=document.getElementById('beField').value;

  var velEl=document.getElementById('beValue');

  if(!velEl){toast('請先選擇欄位','err');return;}

  var value=velEl.value.trim();

  var fieldLabel=document.getElementById('beField').options[document.getElementById('beField').selectedIndex].text;

  toast('⏳ 修改中...');

  fetch(API_BASE+'/api/bulk_update',{

    method:'POST',

    headers:{'Content-Type':'application/json'},

    body:JSON.stringify({records:lastSrch,field:field,value:value})

  })

  .then(function(r){return r.json();})

  .then(function(data){

    if(data.success){

      toast('✅ 已修改 '+data.count+' 筆');

      closeBulkEdit();

      doSrch();

    }else{

      toast('❌ 修改失敗：'+(data.error||'未知'),'err');

    }

  })

  .catch(function(e){toast('❌ 連線錯誤：'+e.message,'err');});

}


