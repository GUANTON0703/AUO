/* ══════════════════════════════════════════════════════
   批次新增面板
══════════════════════════════════════════════════════ */
var _bpRows=[];

function toggleBatch(){
  var p=document.getElementById('batch-panel');if(!p)return;
  var open=p.classList.toggle('show');
  if(open){
    var bd=document.getElementById('bp-date');
    if(bd&&!bd.value){var t=new Date();bd.value=t.toISOString().slice(0,10);}
    var bts=document.getElementById('bp-title-sel');
    var fts=document.getElementById('ftsel');
    if(bts&&fts){
      bts.innerHTML=fts.innerHTML;
      bts.value=fts.value||'';
      var bti=document.getElementById('bp-title-inp');
      if(bti){bti.style.display='none';bti.value='';}
      if(bts)bts.style.display='';
    }
  }
}

function bpClear(){
  document.getElementById('bp-ids').value='';
  document.getElementById('bp-table-sec').style.display='none';
  document.getElementById('bp-count').textContent='';
  document.getElementById('bp-prog').textContent='';
  _bpRows=[];
  bpStat('','hide');
}

function bpParseIDs(){
  var raw=document.getElementById('bp-ids').value;
  var ids=raw.split(/[\n\r\t,;]+/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
  var seen={},uniq=[];
  ids.forEach(function(id){if(!seen[id]){seen[id]=1;uniq.push(id);}});
  return uniq;
}

async function bpQuery(){
  var ids=bpParseIDs();
  if(!ids.length){bpStat('請貼入至少一個 Chip ID','err');return;}
  var dateVal=document.getElementById('bp-date').value;
  if(!dateVal){bpStat('請選擇日期','err');return;}
  document.getElementById('bp-count').textContent='查詢 Oracle 中…';
  bpStat('查詢中…','info');
  try{
    var data=await post('/api/chip-detail-batch',{chip_ids:ids,user:_u||''});
    var raw=data.results||[];
    var records=raw.map(function(r){
      return {
        chip_id:     r.chip_id,
        found:       r.found||false,
        model:       r.model||'',
        grade:       r.grade||'',
        defect:      r.defect||'',
        jnd:         r.jnd||'',
        description: '',
        judgment:    '',
        tool_id:     r.tool_id||'',
        pol:         r.pol||'',
        x_start:     r.x_start||'',
        y_start:     r.y_start||'',
      };
    });
    _bpRows=records;
    bpRenderTable(records);
    records.forEach(function(r,i){
      if(r.defect) bpDefLookup(i, r.defect);
    });
    var found=records.filter(function(r){return r.found;}).length;
    document.getElementById('bp-count').textContent=ids.length+' 筆 ID，Oracle 找到 '+found+' 筆資料';
    bpStat('查詢完成','ok');
  }catch(e){
    bpStat('查詢失敗：'+e.message,'err');
    document.getElementById('bp-count').textContent='';
  }
}

function bpRenderTable(rows){
  var tbody=document.getElementById('bp-tbody');if(!tbody)return;
  tbody.innerHTML='';
  rows.forEach(function(r,i){
    var statusTd=r.found
      ?'<td class="bp-found" style="text-align:center;font-size:11px" title="DB 已有資料（'+esc(r.from_user||'')+' '+esc(r.from_date||'')+'）">✅</td>'
      :'<td class="bp-notfound" style="font-size:10px">未找到</td>';
    var tr=document.createElement('tr');
    tr.innerHTML=
      '<td style="text-align:center;color:var(--tm);font-size:11px">'+(i+1)+'</td>'
      +'<td style="font-weight:700;color:var(--ci);font-size:12px;max-width:85px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.chip_id)+'</td>'
      +statusTd
      +'<td><input class="bpi" id="bm'+i+'" value="'+esc(r.model||'')+'"></td>'
      +'<td style="max-width:36px"><input class="bpi" id="bg'+i+'" value="'+esc(r.grade||'')+'"></td>'
      +'<td><input class="bpi" id="bd'+i+'" value="'+esc(r.defect||'')+'" oninput="bpDefLookup('+i+',this.value)"></td>'
      +'<td style="min-width:130px;white-space:normal"><textarea class="bpi" id="bds'+i+'" rows="2">'+esc(r.description||'')+'</textarea></td>'
      +'<td style="min-width:80px;white-space:normal"><input class="bpi" id="bj'+i+'" value="'+esc(r.judgment||'')+'"></td>'
      +'<td><input class="bpi" id="bjn'+i+'" value="'+esc(r.jnd||'')+'"></td>'
      +'<td><input class="bpi" id="bt'+i+'" value="'+esc(r.tool_id||'')+'"></td>'
      +'<td><input class="bpi" id="bp2'+i+'" value="'+esc(r.pol||'')+'"></td>';
    tbody.appendChild(tr);
  });
  document.getElementById('bp-table-sec').style.display='block';
}

async function bpDefLookup(i,defectCode){
  if(!defectCode||defectCode.length<2)return;
  try{
    var r=await get('/api/defect-lookup?defect='+encodeURIComponent(defectCode.trim()));
    if(r.found){
      var desc=document.getElementById('bds'+i);
      var jdg=document.getElementById('bj'+i);
      if(desc&&!desc.value.trim())desc.value=r.description||'';
      if(jdg&&!jdg.value.trim())jdg.value=r.judgment||'';
    }
  }catch(e){}
}

async function bpSaveAll(){
  if(!_bpRows.length){bpStat('沒有資料可儲存','err');return;}
  if(!_u){bpStat('請先登入','err');return;}
  var dateVal=document.getElementById('bp-date').value;
  if(!dateVal){bpStat('請選擇日期','err');return;}
  var _bpTitleInp=document.getElementById('bp-title-inp');
  var _bpTitleSel=document.getElementById('bp-title-sel');
  var title='';
  if(_bpTitleInp&&_bpTitleInp.style.display!=='none'){
    title=_bpTitleInp.value.trim();
  }else{
    var _tv=_bpTitleSel?_bpTitleSel.value:'';
    title=(_tv&&_tv!=='__new__')?_tv:'';
  }
  if(!title){bpStat('請選擇或輸入標題','err');return;}
  var dateStr=dateVal.replace(/-/g,'');
  var prog=document.getElementById('bp-prog');
  var ok=0,fail=0;
  prog.textContent='儲存中…';

  for(var i=0;i<_bpRows.length;i++){
    var r=_bpRows[i];
    var model =(document.getElementById('bm'+i)||{value:''}).value.trim();
    var grade =(document.getElementById('bg'+i)||{value:''}).value.trim();
    var defect=(document.getElementById('bd'+i)||{value:''}).value.trim();
    var desc  =(document.getElementById('bds'+i)||{value:''}).value.trim();
    var jdg   =(document.getElementById('bj'+i)||{value:''}).value.trim();
    var tool  =(document.getElementById('bt'+i)||{value:''}).value.trim();
    var pol   =(document.getElementById('bp2'+i)||{value:''}).value.trim();
    var form={
      name:_u,chip_id:r.chip_id,date:dateStr,
      model:model,grade:grade,defect:defect,
      jnd:(document.getElementById('bjn'+i)||{value:''}).value.trim()||r.jnd||'',
      appearance:desc,judgment:jdg,
      tool_id:tool,pol:pol,
      x_start:r.x_start||'',x_end:'',y_start:r.y_start||'',y_end:'',
      title:title
    };
    try{
      var res=await post('/api/save',{form:form});
      if(res.success)ok++;else fail++;
    }catch(e){fail++;}
    prog.textContent='進度 '+(i+1)+'/'+_bpRows.length+' （✅'+ok+' ❌'+fail+'）';
  }

  saveTitleLocal(title);
  if(typeof loadTitles==='function')loadTitles();
  bpStat('完成！✅ '+ok+' 筆成功'+(fail?' ❌'+fail+' 失敗':''),'ok');
  prog.textContent='';
  if(typeof loadReport==='function')loadReport();
}

function bpOnTitleChange(){
  var sel=document.getElementById('bp-title-sel');
  var inp=document.getElementById('bp-title-inp');
  if(!sel||!inp)return;
  if(sel.value==='__new__'){
    sel.style.display='none';
    inp.style.display='block';
    inp.value='';
    inp.focus();
  }
}

function bpOnTitleBlur(){
  var sel=document.getElementById('bp-title-sel');
  var inp=document.getElementById('bp-title-inp');
  if(!sel||!inp)return;
  if(!inp.value.trim()){
    inp.style.display='none';
    sel.style.display='';
    for(var i=0;i<sel.options.length;i++){
      if(sel.options[i].value!=='__new__'){sel.selectedIndex=i;break;}
    }
  }
}

function bpStat(msg,type){
  var el=document.getElementById('bp-stat');if(!el)return;
  if(type==='hide'||!msg){el.style.display='none';return;}
  el.textContent=msg;
  el.className='bp-tag '+(type||'info');
  el.style.display='inline-block';
}
