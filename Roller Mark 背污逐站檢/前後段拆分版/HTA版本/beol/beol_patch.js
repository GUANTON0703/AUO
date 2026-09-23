/* patch_beol_202608211323 — 安全網覆蓋 */
(function(){
  /* FIX1: bHdPaste 防抖 */
  window.bHdPaste = function(e,i,type){
    if(window._bPasteGuard){e.preventDefault();e.stopPropagation();return;}
    window._bPasteGuard=true;
    setTimeout(function(){window._bPasteGuard=false;},120);
    e.stopPropagation();
    var items=(e.clipboardData||window.clipboardData||{}).items;
    if(!items)return;
    for(var ii=0;ii<items.length;ii++){
      if(items[ii].type.indexOf('image')!==-1){
        var blob=items[ii].getAsFile();
        if(!blob)continue;
        (function(b,_i,_t){
          var rd=new FileReader();
          rd.onload=function(ev){
            var key=_i+'_'+_t;
            if(!bPs[key])bPs[key]=[];
            bPs[key].push({name:'paste_'+Date.now()+'.png',dataUrl:ev.target.result});
            bRefreshPhotoCell(_i,_t);
            bSetPasteFocus(_i,_t);
          };
          rd.readAsDataURL(b);
        })(blob,i,type);
        e.preventDefault();
        break;
      }
    }
  };

  /* FIX2: 攔截 bRefreshPhotoCell，在其執行後移除 file input 元素 */
  var _origRefresh = window.bRefreshPhotoCell;
  if(typeof _origRefresh === 'function'){
    window.bRefreshPhotoCell = function(i, type){
      _origRefresh.call(this, i, type);
      /* 移除該 cell 內所有 input[type=file] 及其觸發 label/button */
      setTimeout(function(){
        var row = document.querySelector('tr[data-row="'+i+'"]') ||
                  (document.querySelectorAll('#bTbody tr')[i-1]);
        var scope = row || document;
        scope.querySelectorAll('input[type="file"]').forEach(function(el){
          /* 找相鄰的 label 或 button 一併移除 */
          var p=el.parentElement;
          if(p && (p.tagName==='LABEL'||p.tagName==='BUTTON')) p.remove();
          else el.remove();
        });
        /* 移除明確標有「選擇」「資料夾」文字的按鈕 */
        scope.querySelectorAll('button,label').forEach(function(el){
          if(/選擇|資料夾|Browse|folder/i.test(el.textContent)) el.remove();
        });
      }, 0);
    };
  }
})();