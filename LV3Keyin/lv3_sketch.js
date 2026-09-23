/* ══════════════════════════════════════════════════════
   lv3_sketch.js — 示意圖小畫家 canvas 所有邏輯
══════════════════════════════════════════════════════ */
var _sk = { tool:'pen', color:'#e74c3c', size:4, drawing:false, lx:0, ly:0 };
var _sketchOpen   = false;
var _sketch_data  = null;
var _skMidMode    = false;
var _curModel     = '';

function toggleSketch(){
  var box=document.getElementById('sketch-box');
  if(!box)return;
  _sketchOpen=!_sketchOpen;
  box.style.display=_sketchOpen?'block':'none';
  if(_sketchOpen) initSketchCanvas();
}

function initSketchCanvas(){
  var cvs=document.getElementById('sketch-cvs');
  if(!cvs||cvs._inited)return;
  cvs._inited=true;
  var ctx=cvs.getContext('2d');
  ctx.fillStyle='#c8c8c8';
  ctx.fillRect(0,0,cvs.width||300,cvs.height||220);
  drawSketchDefault();

  cvs.onmousedown=function(e){
    _sk.drawing=true;
    var r=cvs.getBoundingClientRect();
    _sk.lx=e.clientX-r.left;
    _sk.ly=e.clientY-r.top;
    if(_sk.tool==='spray') skSpray(cvs,ctx,_sk.lx,_sk.ly);
  };
  cvs.onmousemove=function(e){
    if(!_sk.drawing)return;
    var r=cvs.getBoundingClientRect();
    var x=e.clientX-r.left, y=e.clientY-r.top;
    if(_sk.tool==='pen'||_sk.tool==='eraser'){
      ctx.beginPath();
      ctx.strokeStyle=(_sk.tool==='eraser')?'#c8c8c8':_sk.color;
      ctx.lineWidth=(_sk.tool==='eraser')?_sk.size*3:_sk.size;
      ctx.lineCap='round';
      ctx.moveTo(_sk.lx,_sk.ly);
      ctx.lineTo(x,y);
      ctx.stroke();
    } else if(_sk.tool==='spray'){
      skSpray(cvs,ctx,x,y);
    }
    _sk.lx=x; _sk.ly=y;
  };
  cvs.onmouseup=cvs.onmouseleave=function(){
    if(_sk.drawing){
      _sk.drawing=false;
      _sketch_data=cvs.toDataURL('image/png');
    }
  };
  /* touch */
  cvs.ontouchstart=function(e){
    e.preventDefault();
    var r=cvs.getBoundingClientRect();
    var t=e.touches[0];
    _sk.drawing=true;
    _sk.lx=t.clientX-r.left;
    _sk.ly=t.clientY-r.top;
  };
  cvs.ontouchmove=function(e){
    e.preventDefault();
    if(!_sk.drawing)return;
    var r=cvs.getBoundingClientRect();
    var t=e.touches[0];
    var x=t.clientX-r.left, y=t.clientY-r.top;
    ctx.beginPath();
    ctx.strokeStyle=(_sk.tool==='eraser')?'#c8c8c8':_sk.color;
    ctx.lineWidth=(_sk.tool==='eraser')?_sk.size*3:_sk.size;
    ctx.lineCap='round';
    ctx.moveTo(_sk.lx,_sk.ly);
    ctx.lineTo(x,y);
    ctx.stroke();
    _sk.lx=x; _sk.ly=y;
  };
  cvs.ontouchend=function(){
    _sk.drawing=false;
    _sketch_data=cvs.toDataURL('image/png');
  };
}

function skSpray(cvs,ctx,x,y){
  ctx.fillStyle=_sk.color;
  for(var i=0;i<18;i++){
    var angle=Math.random()*2*Math.PI;
    var r=Math.random()*(_sk.size*3);
    ctx.beginPath();
    ctx.arc(x+r*Math.cos(angle),y+r*Math.sin(angle),0.8,0,2*Math.PI);
    ctx.fill();
  }
  _sketch_data=cvs.toDataURL('image/png');
}

function onMidCrossChange(){
  var cb=document.getElementById('sk-mid-cross');
  if(!cb)return;
  _skMidMode=cb.checked;
  var cvs=document.getElementById('sketch-cvs');
  if(cvs){
    cvs._inited=false;
    var ctx=cvs.getContext('2d');
    ctx.fillStyle='#c8c8c8';
    ctx.fillRect(0,0,cvs.width||300,cvs.height||220);
    drawSketchDefault();
    _sketch_data=null;
  }
}

function setSkTool(t, el){
  _sk.tool=t;
  document.querySelectorAll('.sk-tool-btn').forEach(function(b){b.style.background='#7f8c8d';});
  if(el) el.style.background='var(--bp)';
}

function clearSketch(){
  var cvs = document.getElementById('sketch-cvs');
  if(!cvs) return;
  cvs._inited = false;
  var ctx = cvs.getContext('2d');
  ctx.fillStyle='#c8c8c8';
  ctx.fillRect(0,0,cvs.width||300,cvs.height||220);
  drawSketchBlackBox();
  _sketch_data = null;
}

function updateNextBtn(){
  var btn=document.getElementById('bnext');
  if(btn)btn.style.display=(_imgIdx<2)?'':'none';
}

async function nextPhoto(){
  if(_imgIdx>=2)return;
  _nextPhotoMode=true;
  await submitForm();
}

function updateSketchForModel(model){
  _curModel=model||'';
  var cvs=document.getElementById('sketch-cvs');
  if(!cvs)return;
  var m23=(_curModel.length>=3)?_curModel.slice(1,3):'';
  var h=(m23==='49')?132:165;
  cvs.style.height=h+'px';
  cvs._inited=false;
  clearSketch();
}

function drawSketchDefault(){
  var cvs=document.getElementById('sketch-cvs');
  if(!cvs)return;
  var w=cvs.width||300;
  var h=cvs.height||parseInt(cvs.style.height)||220;
  var ctx=cvs.getContext('2d');
  if(_skMidMode){
    ctx.save();
    ctx.strokeStyle='#000000';
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(h/2));
    ctx.lineTo(w, Math.round(h/2));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(Math.round(w/2), 0);
    ctx.lineTo(Math.round(w/2), h);
    ctx.stroke();
    ctx.restore();
  } else {
    var bw=Math.round(w*0.10)||30;
    var bh=Math.round(h*0.15)||25;
    var isBot=(_curModel==='T215HVN03'||_curModel==='P550HVN06');
    var y=isBot?(h-bh):0;
    ctx.fillStyle='#000000';
    ctx.fillRect(0,y,bw,bh);
  }
}
function drawSketchBlackBox(){ drawSketchDefault(); }

function loadSketchFromUrl(url){
  if(!_sketchOpen) toggleSketch();
  setTimeout(function(){
    var cvs = document.getElementById('sketch-cvs');
    if(!cvs) return;
    initSketchCanvas();
    var img = new Image();
    img.crossOrigin='anonymous';
    img.onload = function(){
      var ctx=cvs.getContext('2d');
      ctx.drawImage(img,0,0,cvs.width,cvs.height);
      _sketch_data=cvs.toDataURL('image/png');
    };
    img.src=url+'&t='+Date.now();
  }, 120);
}
