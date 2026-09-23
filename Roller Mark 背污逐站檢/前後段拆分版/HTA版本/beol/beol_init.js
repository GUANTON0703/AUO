window.onload=()=>{
  const _d=new Date();
  const _past=new Date(_d); _past.setDate(_past.getDate()-30);
  const _toStr=_d.toISOString().slice(0,10);
  const _fromStr=_past.toISOString().slice(0,10);
  document.getElementById('sd').value=_toStr;
  addRow();autoLoad();sw('sr');
  document.getElementById('ff').value=_fromStr;
  document.getElementById('ft').value=_toStr;
  // doSrch() 跳過（BEOL 頁面）
  setTimeout(()=>{if(typeof bDoSrch==='function')bDoSrch();},300);
  const _bd=new Date();
  const _bFrom=new Date(_bd); _bFrom.setDate(_bFrom.getDate()-14);
  document.getElementById('b-ff').value=_bFrom.toISOString().slice(0,10);
  document.getElementById('b-ft').value=_bd.toISOString().slice(0,10);
  // Q2: 預設顯示 BEOL 搜尋頁
  swSeg('beol');
  // Q3: KEY IN 預設今天
  var _bDate=document.getElementById('b-date');
  if(_bDate&&!_bDate.value) _bDate.value=_bd.toISOString().slice(0,10);
};