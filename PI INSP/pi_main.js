/* PI_Insp_Map 主邏輯
 * 原始：PI_Insp_Map1014.html <script>
 * 已移除：SAMPLE_DATA 大型陣列
 * 後端 API：http://10.36.38.240:5106
 */

const canvas = document.getElementById('canvas');
        const ctx    = canvas.getContext('2d');
        const CANVAS_WIDTH=500, CANVAS_HEIGHT=440, REAL_WIDTH=2500, REAL_HEIGHT=2200;
        const SCALE = CANVAS_WIDTH / REAL_WIDTH;
        canvas.width=CANVAS_WIDTH; canvas.height=CANVAS_HEIGHT;

        let allPoints=[], markedPoints=new Set(), allMarkedIndices=[], loadedRedPoints=[];
        let outOfBoundsCount=0, iframesLoaded=false;
        let excludedPoints = new Set();
        const BOUNDARY_X=1222.6, BOUNDARY_Y_LOW=700, BOUNDARY_Y_HIGH=1420;
        let currentMode = 'CF';

        // ===== 範例資料（前 20 筆）=====
        const SAMPLE_DATA = [
    // 範例資料已移除，請透過「智慧貼上」輸入資料
].join('\n');

        // ===== 模式定義 =====
        const MODES = {
            CF: {
                labels: ['C','F','B','E','A','D'],
                regionMap: function(x,y){ const l=x<=BOUNDARY_X; if(y<BOUNDARY_Y_LOW) return l?'A':'D'; if(y<BOUNDARY_Y_HIGH) return l?'B':'E'; return l?'C':'F'; },
                filterOrder: ['C','B','A','F','E','D'],
                filterLabels: {'C':'C (左上)','B':'B (左中)','A':'A (左下)','F':'F (右上)','E':'E (右中)','D':'D (右下)'},
                desc: 'CF 模式：C(左上) A(左下) / F(右上) D(右下)',
                gridNames: ['C 左上','F 右上','B 左中','E 右中','A 左下','D 右下'],
                canvasLabels: [
                    {label:'C',x:BOUNDARY_X*0.5,y:(1420+2200)*0.5},{label:'F',x:(BOUNDARY_X+REAL_WIDTH)*0.5,y:(1420+2200)*0.5},
                    {label:'B',x:BOUNDARY_X*0.5,y:(700+1420)*0.5},{label:'E',x:(BOUNDARY_X+REAL_WIDTH)*0.5,y:(700+1420)*0.5},
                    {label:'A',x:BOUNDARY_X*0.5,y:700*0.5},{label:'D',x:(BOUNDARY_X+REAL_WIDTH)*0.5,y:700*0.5}
                ]
            },
            TFT: {
                labels: ['A','D','B','E','C','F'],
                regionMap: function(x,y){ const l=x<=BOUNDARY_X; if(y<BOUNDARY_Y_LOW) return l?'C':'F'; if(y<BOUNDARY_Y_HIGH) return l?'B':'E'; return l?'A':'D'; },
                filterOrder: ['A','B','C','D','E','F'],
                filterLabels: {'A':'A (左上)','B':'B (左中)','C':'C (左下)','D':'D (右上)','E':'E (右中)','F':'F (右下)'},
                desc: 'TFT 模式：A(左上) C(左下) / D(右上) F(右下)',
                gridNames: ['A 左上','D 右上','B 左中','E 右中','C 左下','F 右下'],
                canvasLabels: [
                    {label:'A',x:BOUNDARY_X*0.5,y:(1420+2200)*0.5},{label:'D',x:(BOUNDARY_X+REAL_WIDTH)*0.5,y:(1420+2200)*0.5},
                    {label:'B',x:BOUNDARY_X*0.5,y:(700+1420)*0.5},{label:'E',x:(BOUNDARY_X+REAL_WIDTH)*0.5,y:(700+1420)*0.5},
                    {label:'C',x:BOUNDARY_X*0.5,y:700*0.5},{label:'F',x:(BOUNDARY_X+REAL_WIDTH)*0.5,y:700*0.5}
                ]
            }
        };

        // ===== 圖片切換 =====
        function toggleImgPreview(){
            const p = document.getElementById('imgPreview');
            p.classList.toggle('open');
        }

        // ===== 載入範例資料 =====
        function loadSampleData(){
            document.getElementById('dataInput').value = SAMPLE_DATA;
            showMessage('✅ 已載入 20 筆範例資料，按「載入數據」繼續', 'success');
        }

        function setMode(mode){
            currentMode = mode;
            document.getElementById('btnCF').classList.toggle('active', mode==='CF');
            document.getElementById('btnTFT').classList.toggle('active', mode==='TFT');
            document.getElementById('modeDesc').textContent = MODES[mode].desc;
            buildFilterUI();
            buildRegionGrid();
            updateDisplay();
            if(allMarkedIndices.length>0){ refreshRedPointsDisplay(); updateRegionGrid(); }
        }

        function buildFilterUI(){
            const mode=MODES[currentMode], order=mode.filterOrder, labels=mode.filterLabels;
            const cur={};
            ['A','B','C','D','E','F'].forEach(r=>{ const el=document.getElementById('filter'+r); cur[r]=el?el.checked:true; });
            const col1=order.slice(0,3), col2=order.slice(3,6);
            let html='';
            for(let i=0;i<3;i++){
                const r1=col1[i], r2=col2[i];
                html+='<div class="checkbox-item"><input type="checkbox" id="filter'+r1+'" '+(cur[r1]!==false?'checked':'')+' onchange="updateDisplay();refreshRedPointsDisplay();"><label for="filter'+r1+'">'+labels[r1]+'</label></div>';
                html+='<div class="checkbox-item"><input type="checkbox" id="filter'+r2+'" '+(cur[r2]!==false?'checked':'')+' onchange="updateDisplay();refreshRedPointsDisplay();"><label for="filter'+r2+'">'+labels[r2]+'</label></div>';
            }
            document.getElementById('filterGroup').innerHTML=html;
        }

        function buildRegionGrid(){
            const names=MODES[currentMode].gridNames;
            ['nameTop1','nameTop2','nameMid1','nameMid2','nameBot1','nameBot2'].forEach((id,i)=>{ document.getElementById(id).textContent=names[i]; });
        }

        function toggleTheme(){
            document.body.classList.toggle('dark-mode');
            document.querySelector('.theme-toggle').textContent=document.body.classList.contains('dark-mode')?'☀️ 亮色模式':'🌙 深色模式';
            localStorage.setItem('theme',document.body.classList.contains('dark-mode')?'dark':'light');
            updateDisplay();
        }
        function initTheme(){
            if(localStorage.getItem('theme')==='dark'){ document.body.classList.add('dark-mode'); document.querySelector('.theme-toggle').textContent='☀️ 亮色模式'; }
        }

        function drawBackground(){
            const isDark=document.body.classList.contains('dark-mode');
            ctx.fillStyle=isDark?'#1e1e1e':'#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.strokeStyle=isDark?'#444':'#ddd'; ctx.lineWidth=1;
            const xLine=BOUNDARY_X*SCALE;
            ctx.beginPath();ctx.moveTo(xLine,0);ctx.lineTo(xLine,canvas.height);ctx.stroke();
            const yLow=canvas.height-BOUNDARY_Y_LOW*SCALE, yHigh=canvas.height-BOUNDARY_Y_HIGH*SCALE;
            ctx.beginPath();ctx.moveTo(0,yLow);ctx.lineTo(canvas.width,yLow);ctx.stroke();
            ctx.beginPath();ctx.moveTo(0,yHigh);ctx.lineTo(canvas.width,yHigh);ctx.stroke();
            ctx.fillStyle=isDark?'#888':'#999'; ctx.font='bold 20px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
            MODES[currentMode].canvasLabels.forEach(r=>ctx.fillText(r.label,r.x*SCALE,canvas.height-r.y*SCALE));
        }

        document.getElementById('dataInput').addEventListener('paste',(e)=>{
            e.preventDefault();
            const html=e.clipboardData.getData('text/html');
            if(html){const p=parseExcelHtml(html);if(p){document.getElementById('dataInput').value=p;return;}}
            document.getElementById('dataInput').value=e.clipboardData.getData('text/plain');
        });
        function parseExcelHtml(html){
            const doc=new DOMParser().parseFromString(html,'text/html'); const rows=doc.querySelectorAll('tr');
            if(!rows.length) return null;
            return [...rows].map(row=>{const cells=row.querySelectorAll('td,th');if(!cells.length)return null;return [...cells].map(cell=>{const a=cell.querySelector('a');return(a&&a.href)?(a.textContent.trim()+'|'+a.href):cell.textContent.trim();}).join('\t');}).filter(Boolean).join('\n');
        }

        function loadData(){
            const text=document.getElementById('dataInput').value.trim();
            if(!text){showMessage('請先貼上數據','warning');return;}
            allPoints=[];markedPoints.clear();allMarkedIndices=[];loadedRedPoints=[];excludedPoints.clear();outOfBoundsCount=0;
            text.split('\n').forEach(line=>{
                if(!line.trim()) return;
                const cols=line.split('\t'); if(cols.length<4) return;
                let id=cols[0].trim(),url=null;
                if(id.includes('|')){const p=id.split('|');id=p[0];url=p[1];}
                else if(cols.length>=5){const u=cols[4].trim();if(u.includes('|'))url=u.split('|')[1];else if(u.startsWith('http')||u.startsWith('//'))url=u;}
                const x=parseFloat(cols[2])/1000, y=parseFloat(cols[3])/1000;
                if(isNaN(x)||isNaN(y)) return;
                if(!isPointInBounds(x,y)) outOfBoundsCount++;
                allPoints.push({id,url,x,y});
            });
            updateDisplay();
            showMessage('✅ 已載入 '+allPoints.length+' 個點'+(outOfBoundsCount>0?'<br>⚠️ 有 '+outOfBoundsCount+' 個點超出範圍':''),'success');
        }

        function isPointInBounds(x,y){return x>=0&&x<=REAL_WIDTH&&y>=0&&y<=REAL_HEIGHT;}
        function getRegion(x,y){return MODES[currentMode].regionMap(x,y);}
        function getFilters(){return{A:document.getElementById('filterA')?document.getElementById('filterA').checked:true,B:document.getElementById('filterB')?document.getElementById('filterB').checked:true,C:document.getElementById('filterC')?document.getElementById('filterC').checked:true,D:document.getElementById('filterD')?document.getElementById('filterD').checked:true,E:document.getElementById('filterE')?document.getElementById('filterE').checked:true,F:document.getElementById('filterF')?document.getElementById('filterF').checked:true};}

        function updateDisplay(){document.getElementById('pointSizeValue').textContent=document.getElementById('pointSize').value;drawBackground();drawPoints();}

        function drawPoints(){
            const filters=getFilters(), sz=parseInt(document.getElementById('pointSize').value);
            allPoints.forEach((point,idx)=>{
                if(!isPointInBounds(point.x,point.y)) return;
                if(!filters[getRegion(point.x,point.y)]) return;
                ctx.fillStyle = excludedPoints.has(idx) ? '#00cc44' : markedPoints.has(idx) ? '#ff4444' : '#999999';
                ctx.beginPath(); ctx.arc(point.x*SCALE,canvas.height-point.y*SCALE,sz,0,Math.PI*2); ctx.fill();
            });
        }

        function dbscan(points,eps,minPts){
            const clusters=[],visited=new Set(),clustered=new Set();
            for(let i=0;i<points.length;i++){
                if(visited.has(i)) continue; visited.add(i);
                const nb=getNeighbors(points,i,eps); if(nb.length<minPts) continue;
                const cluster=[i];
                for(let j=0;j<nb.length;j++){const ni=nb[j];if(!visited.has(ni)){visited.add(ni);const nn=getNeighbors(points,ni,eps);if(nn.length>=minPts)nb.push(...nn);}if(!clustered.has(ni)){cluster.push(ni);clustered.add(ni);}}
                if(cluster.length>=minPts) clusters.push(cluster);
            }
            return clusters;
        }
        function getNeighbors(points,idx,eps){const p=points[idx];return points.reduce((a,q,i)=>{if(i!==idx&&Math.hypot(p.x-q.x,p.y-q.y)<=eps)a.push(i);return a;},[]);}

        function linReg(pts){
            const n=pts.length; if(n<2) return null;
            const minX=Math.min(...pts.map(p=>p.x)); let sx=0,sy=0,sxy=0,sx2=0;
            pts.forEach(p=>{const x=p.x-minX;sx+=x;sy+=p.y;sxy+=x*p.y;sx2+=x*x;});
            const den=n*sx2-sx*sx; if(Math.abs(den)<1e-10) return null;
            const m=(n*sxy-sx*sy)/den, b=(sy-m*sx)/n;
            let angle=Math.atan(m)*180/Math.PI; if(angle<0)angle+=180; if(angle>90)angle=180-angle;
            const syMean=sy/n; let ssTot=0,ssRes=0;
            pts.forEach(p=>{const x=p.x-minX;const yp=m*x+b;ssRes+=(p.y-yp)**2;ssTot+=(p.y-syMean)**2;});
            const r2=ssTot<1e-10?1:Math.max(0,1-ssRes/ssTot);
            const spanX=Math.max(...pts.map(p=>p.x))-minX, spanY=Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y));
            return{m,b,minX,angle:Math.abs(angle),r2,span:Math.max(spanX,spanY)};
        }

        function extendAlongLine(seedPts,allCandidates,extendRadius){
            let pts=[...seedPts]; const usedIdx=new Set(seedPts.map(p=>p._idx));
            for(let iter=0;iter<20;iter++){
                const reg=linReg(pts); if(!reg) break;
                const minX=Math.min(...pts.map(p=>p.x)), maxX=Math.max(...pts.map(p=>p.x)); let found=false;
                allCandidates.forEach((q,i)=>{
                    if(usedIdx.has(i)) return;
                    const dist=Math.abs(q.y-(reg.m*(q.x-reg.minX)+reg.b));
                    if(dist<=extendRadius*0.5&&(q.x<minX+extendRadius||q.x>maxX-extendRadius)){pts.push({...q,_idx:i});usedIdx.add(i);found=true;}
                });
                if(!found) break;
            }
            return pts;
        }

        function detectAngle(){
            if(!allPoints.length){showMessage('請先載入數據','warning');return;}
            const eps=parseFloat(document.getElementById('clusterRadius').value), minPts=parseInt(document.getElementById('minPoints').value);
            const target=parseFloat(document.getElementById('targetAngle').value), tol=parseFloat(document.getElementById('angleTolerance').value);
            const r2Min=parseFloat(document.getElementById('strictness').value), extR=parseFloat(document.getElementById('extendRadius').value);

            const inBound=allPoints.filter(p=>isPointInBounds(p.x,p.y));
            const inBoundIdx=allPoints.map((p,i)=>isPointInBounds(p.x,p.y)?i:-1).filter(i=>i!==-1);
            const inBoundWithIdx=inBound.map((p,i)=>({...p,_idx:i}));
            markedPoints.clear();allMarkedIndices=[];loadedRedPoints=[];excludedPoints.clear();iframesLoaded=false;

            const clusters=dbscan(inBound,eps,minPts); let validClusters=0; const allFoundIdx=new Set();
            clusters.forEach(ci=>{
                const pts=ci.map(i=>({...inBound[i],_idx:i})); const reg=linReg(pts);
                if(!reg||Math.abs(reg.angle-target)>tol||reg.r2<r2Min||reg.span<eps*1.5) return;
                const extended=extendAlongLine(pts,inBoundWithIdx,extR); const extReg=linReg(extended);
                if(!extReg||Math.abs(extReg.angle-target)>tol*1.5||extReg.r2<r2Min*0.8) return;
                extended.forEach(p=>{if(!allFoundIdx.has(p._idx))allFoundIdx.add(p._idx);}); validClusters++;
            });

            allFoundIdx.forEach(i=>{const oi=inBoundIdx[i];markedPoints.add(oi);allMarkedIndices.push(oi);});
            updateDisplay();
            loadedRedPoints=allMarkedIndices.map(idx=>({...allPoints[idx],_allIdx:idx}));
            refreshRedPointsDisplay(); updateRegionGrid();
            document.getElementById('actionBox').style.display=allMarkedIndices.length>0?'flex':'none';
            document.getElementById('iframeColHeader').style.display='none';
            document.getElementById('showImgBtn').textContent='🖼️ 顯示圖片'; iframesLoaded=false;
            showMessage('✨ 線性延伸檢測完成<br>初始點群: '+clusters.length+' 個<br>符合條件: '+validClusters+' 個<br>共 '+allMarkedIndices.length+' 個紅點','info');
        }

        // ===== ✅ 排除點：X→O，不刪列，不重建 DOM =====
        function excludePoint(allIdx){
            const btn = document.getElementById('exbtn_' + allIdx);
            const row = document.getElementById('exrow_' + allIdx);
            if(!btn || !row) return;

            if(excludedPoints.has(allIdx)){
                // 恢復
                excludedPoints.delete(allIdx);
                markedPoints.add(allIdx);
                btn.textContent = '✕';
                btn.className = 'exclude-btn active';
                btn.title = '排除此點';
                row.classList.remove('excluded-row');
            } else {
                // 排除
                excludedPoints.add(allIdx);
                markedPoints.delete(allIdx);
                btn.textContent = '○';
                btn.className = 'exclude-btn excluded';
                btn.title = '點擊恢復';
                row.classList.add('excluded-row');
            }
            // 只更新 canvas 和計數，不重建表格 → iframe 不重載！
            updateDisplay();
            updateCountOnly();
            updateRegionGrid();
        }

        // 只更新紅點數字，不重建表格
        function updateCountOnly(){
            const filters=getFilters();
            const filtered=loadedRedPoints.filter(p=>!excludedPoints.has(p._allIdx)&&filters[getRegion(p.x,p.y)]);
            const activeTotal=allMarkedIndices.filter(idx=>!excludedPoints.has(idx)).length;
            document.getElementById('redPointCount').textContent='顯示 '+filtered.length+' / 共 '+activeTotal+' 張';
            document.getElementById('pageInfo').textContent='有效 '+activeTotal+' 筆 | 已排除 '+excludedPoints.size+' 筆';
        }

        function updateRegionGrid(){
            const stats={A:0,B:0,C:0,D:0,E:0,F:0};
            allMarkedIndices.forEach(idx=>{if(!excludedPoints.has(idx))stats[getRegion(allPoints[idx].x,allPoints[idx].y)]++;});
            const labels=MODES[currentMode].labels;
            const numIds=['numTop1','numTop2','numMid1','numMid2','numBot1','numBot2'];
            const cellIds=['cellTop1','cellTop2','cellMid1','cellMid2','cellBot1','cellBot2'];
            labels.forEach((r,i)=>{document.getElementById(numIds[i]).textContent=stats[r];document.getElementById(cellIds[i]).style.background=stats[r]>0?'rgba(255,105,180,0.25)':'rgba(255,105,180,0.05)';});
            document.getElementById('regionGrid').style.display='grid';
        }

        function copyTableText(){
            const filters=getFilters();
            const rows=loadedRedPoints.filter(p=>!excludedPoints.has(p._allIdx)&&filters[getRegion(p.x,p.y)]);
            if(!rows.length){showToast('❌ 沒有資料可複製');return;}
            const header='ID\t區域\tX (µm)\tY (µm)';
            const lines=rows.map(p=>p.id+'\t'+getRegion(p.x,p.y)+'\t'+Math.round(p.x*1000)+'\t'+Math.round(p.y*1000));
            const text=[header,...lines].join('\n');
            navigator.clipboard.writeText(text).then(()=>showToast('✅ 已複製！可貼到 Excel')).catch(()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('✅ 已複製！');});
        }

        function showToast(msg){const t=document.getElementById('copyToast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

        function loadIframes(){
            iframesLoaded=true;
            document.getElementById('iframeColHeader').style.display='';
            document.getElementById('showImgBtn').textContent='🖼️ 圖片已載入';
            refreshRedPointsDisplay();
            showToast('🖼️ 圖片載入中...');
        }

        function refreshRedPointsDisplay(){
            const filters=getFilters();
            const filtered=loadedRedPoints.filter(p=>filters[getRegion(p.x,p.y)]);
            const tableBody=document.getElementById('tableBody');
            const activeTotal=allMarkedIndices.filter(idx=>!excludedPoints.has(idx)).length;
            const colSpan=iframesLoaded?6:5;

            document.getElementById('redPointCount').textContent=allMarkedIndices.length>0?'顯示 '+filtered.filter(p=>!excludedPoints.has(p._allIdx)).length+' / 共 '+activeTotal+' 張':'共 0 張';
            document.getElementById('pageInfo').textContent='有效 '+activeTotal+' 筆 | 已排除 '+excludedPoints.size+' 筆';

            if(!filtered.length){tableBody.innerHTML='<tr><td colspan="'+colSpan+'" style="text-align:center;color:var(--text-secondary);">此篩選條件無紅點</td></tr>';return;}

            tableBody.innerHTML=filtered.map(point=>{
                const region=getRegion(point.x,point.y);
                const xVal=Math.round(point.x*1000), yVal=Math.round(point.y*1000);
                const isExcluded=excludedPoints.has(point._allIdx);
                const btnClass=isExcluded?'exclude-btn excluded':'exclude-btn active';
                const btnText=isExcluded?'○':'✕';
                const btnTitle=isExcluded?'點擊恢復':'排除此點';
                const rowClass=isExcluded?'excluded-row':'';
                const iframeTd=iframesLoaded?(point.url?'<td class="iframe-cell"><div class="iframe-clip"><iframe class="iframe-mini" src="'+point.url+'" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe></div></td>':'<td style="color:var(--text-secondary);font-size:11px;padding:8px;">-</td>'):'';
                return '<tr id="exrow_'+point._allIdx+'" class="'+rowClass+'">'
                    +'<td class="exclude-cell"><button id="exbtn_'+point._allIdx+'" class="'+btnClass+'" onclick="excludePoint('+point._allIdx+')" title="'+btnTitle+'">'+btnText+'</button></td>'
                    +'<td class="id-cell"><span class="red-marker">●</span>'+point.id+'</td>'
                    +'<td><span class="region-badge">'+region+'</span></td>'
                    +'<td>'+xVal+'</td><td>'+yVal+'</td>'
                    +iframeTd+'</tr>';
            }).join('');
        }

        function clearAll(){
            allPoints=[];markedPoints.clear();allMarkedIndices=[];loadedRedPoints=[];outOfBoundsCount=0;iframesLoaded=false;excludedPoints.clear();
            document.getElementById('dataInput').value='';
            document.getElementById('redPointCount').textContent='共 0 張';
            document.getElementById('tableBody').innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);">等待檢測...</td></tr>';
            document.getElementById('pageInfo').textContent='0 / 0';
            document.getElementById('messageArea').innerHTML='';
            document.getElementById('regionGrid').style.display='none';
            document.getElementById('actionBox').style.display='none';
            document.getElementById('iframeColHeader').style.display='none';
            document.getElementById('imgPreview').classList.remove('open');
            updateDisplay();
        }

        function showMessage(msg,type){document.getElementById('messageArea').innerHTML='<div class="message '+type+'">'+msg+'</div>';}


        // ═══ 手動框選 (Manual Selection) ═══
        let detectTabMode='linear', selTool='circle';
        let selHistory=[], manualSelected=new Set();
        let selDragging=false, selStartX=0, selStartY=0, selCurX=0, selCurY=0;
        let polyVertices=[], polyDrawing=false, polyMouseX=0, polyMouseY=0;
        const POLY_CLOSE_R=12;

        function switchDetectTab(tab){
            detectTabMode=tab;
            document.getElementById('tabLinear').classList.toggle('active',tab==='linear');
            document.getElementById('tabManual').classList.toggle('active',tab==='manual');
            // ★ 明確指定 display 值，不用空字串
            document.getElementById('linearDetectPanel').style.display=tab==='linear'?'block':'none';
            document.getElementById('manualSelectPanel').style.display=tab==='manual'?'block':'none';
            if(tab==='manual'){
                manualSelected.clear(); selHistory=[]; polyVertices=[]; polyDrawing=false;
                markedPoints=new Set(); allMarkedIndices=[]; loadedRedPoints=[]; excludedPoints=new Set(); iframesLoaded=false;
                document.getElementById('actionBox').style.display='none';
                document.getElementById('redPointCount').textContent='共 0 張';
                document.getElementById('pageInfo').textContent='0 / 0';
                document.getElementById('regionGrid').style.display='none';
                document.getElementById('tableBody').innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);">請在畫布上圈選點位</td></tr>';
                document.getElementById('selCountMsg').textContent='';
                setSelTool(selTool);
                redrawManualCanvas();
            } else {
                canvas.className=''; removeSelListeners(); updateDisplay();
            }
        }

        function setSelTool(tool){
            selTool=tool; polyVertices=[]; polyDrawing=false;
            ['toolCircle','toolRect','toolPolygon'].forEach(id=>document.getElementById(id).classList.remove('active'));
            document.getElementById({circle:'toolCircle',rect:'toolRect',polygon:'toolPolygon'}[tool]).classList.add('active');
            document.getElementById('selHint').textContent={
                circle:'拖拽滑鼠在畫布上圓形圈選（起點=圓心，拖拽距離=半徑）',
                rect:'拖拽滑鼠在畫布上方框框選',
                polygon:'在畫布上依序點選頂點，靠近起點紅圈自動閉合（至少 3 點）'
            }[tool];
            canvas.className='sel-'+tool;
            removeSelListeners();
            if(detectTabMode==='manual') addSelListeners();
        }

        function addSelListeners(){
            if(selTool==='polygon'){
                canvas._selClick=onPolyClick; canvas._selMove=onPolyMove;
                canvas.addEventListener('click',canvas._selClick);
                canvas.addEventListener('mousemove',canvas._selMove);
            } else {
                canvas._selDown=onDragStart; canvas._selMove=onDragMove; canvas._selUp=onDragEnd;
                canvas.addEventListener('mousedown',canvas._selDown);
                canvas.addEventListener('mousemove',canvas._selMove);
                canvas.addEventListener('mouseup',canvas._selUp);
            }
        }
        function removeSelListeners(){
            if(canvas._selClick){canvas.removeEventListener('click',canvas._selClick);canvas._selClick=null;}
            if(canvas._selDown){canvas.removeEventListener('mousedown',canvas._selDown);canvas._selDown=null;}
            if(canvas._selMove){canvas.removeEventListener('mousemove',canvas._selMove);canvas._selMove=null;}
            if(canvas._selUp){canvas.removeEventListener('mouseup',canvas._selUp);canvas._selUp=null;}
        }

        function getCanvasPos(e){
            const r=canvas.getBoundingClientRect();
            return{x:(e.clientX-r.left)*(canvas.width/r.width), y:(e.clientY-r.top)*(canvas.height/r.height)};
        }
        function ptCX(pt){return pt.x*SCALE;}
        function ptCY(pt){return canvas.height-pt.y*SCALE;}

        function onDragStart(e){const p=getCanvasPos(e);selDragging=true;selStartX=selCurX=p.x;selStartY=selCurY=p.y;}
        function onDragMove(e){
            if(!selDragging)return;
            const p=getCanvasPos(e);selCurX=p.x;selCurY=p.y;
            redrawManualCanvas();drawSelPreview();
        }
        function onDragEnd(e){
            if(!selDragging)return; selDragging=false;
            const p=getCanvasPos(e);selCurX=p.x;selCurY=p.y;
            commitSel(selTool==='circle'?ptsInCircle(selStartX,selStartY,selCurX,selCurY):ptsInRect(selStartX,selStartY,selCurX,selCurY),selTool);
        }
        function onPolyClick(e){
            const p=getCanvasPos(e);
            if(polyDrawing&&polyVertices.length>0){
                const dx=p.x-polyVertices[0].x,dy=p.y-polyVertices[0].y;
                if(Math.sqrt(dx*dx+dy*dy)<=POLY_CLOSE_R){
                    if(polyVertices.length<3){showMessage('⚠️ 至少需要 3 個頂點才能閉合','warning');return;}
                    commitSel(ptsInPoly(polyVertices),'polygon');
                    polyVertices=[];polyDrawing=false;redrawManualCanvas();return;
                }
            }
            polyVertices.push({x:p.x,y:p.y});polyDrawing=true;redrawManualCanvas();drawPolyProgress();
        }
        function onPolyMove(e){
            if(!polyDrawing)return;
            const p=getCanvasPos(e);polyMouseX=p.x;polyMouseY=p.y;
            redrawManualCanvas();drawPolyProgress();
        }
        function ptsInCircle(cx,cy,x2,y2){
            const r2=(x2-cx)**2+(y2-cy)**2;
            return allPoints.reduce((a,pt,i)=>{if((ptCX(pt)-cx)**2+(ptCY(pt)-cy)**2<=r2)a.push(i);return a;},[]);
        }
        function ptsInRect(x1,y1,x2,y2){
            const[mnX,mxX]=[Math.min(x1,x2),Math.max(x1,x2)],[mnY,mxY]=[Math.min(y1,y2),Math.max(y1,y2)];
            return allPoints.reduce((a,pt,i)=>{const px=ptCX(pt),py=ptCY(pt);if(px>=mnX&&px<=mxX&&py>=mnY&&py<=mxY)a.push(i);return a;},[]);
        }
        function ptsInPoly(verts){
            return allPoints.reduce((a,pt,i)=>{
                const px=ptCX(pt),py=ptCY(pt);let ins=false;
                for(let j=0,k=verts.length-1;j<verts.length;k=j++){
                    const{x:xi,y:yi}=verts[j],{x:xj,y:yj}=verts[k];
                    if(((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))ins=!ins;
                }
                if(ins)a.push(i);return a;
            },[]);
        }
        function commitSel(newIdx,type){
            const added=newIdx.filter(i=>!manualSelected.has(i));
            if(!added.length)return;
            added.forEach(i=>manualSelected.add(i));
            selHistory.push({type,indices:added});
            redrawManualCanvas();updateManualResults();
        }
        function selUndo(){
            if(polyDrawing&&polyVertices.length>0){
                polyVertices.pop();if(!polyVertices.length)polyDrawing=false;
                redrawManualCanvas();drawPolyProgress();return;
            }
            if(!selHistory.length)return;
            selHistory.pop().indices.forEach(i=>manualSelected.delete(i));
            redrawManualCanvas();updateManualResults();
        }
        function selClearAll(){
            manualSelected.clear();selHistory=[];polyVertices=[];polyDrawing=false;
            redrawManualCanvas();updateManualResults();
        }
        function redrawManualCanvas(){
            drawBackground();
            const sz=parseInt(document.getElementById('pointSize').value)||3;
            allPoints.forEach((pt,i)=>{
                if(!isPointInBounds(pt.x,pt.y))return;
                ctx.beginPath();ctx.arc(ptCX(pt),ptCY(pt),sz,0,Math.PI*2);
                ctx.fillStyle=manualSelected.has(i)?'#ff4444':'#aaaaaa';ctx.fill();
            });
        }
        function drawSelPreview(){
            ctx.save();ctx.strokeStyle='#e67e22';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.fillStyle='rgba(230,126,34,0.08)';
            if(selTool==='circle'){
                const r=Math.sqrt((selCurX-selStartX)**2+(selCurY-selStartY)**2);
                ctx.beginPath();ctx.arc(selStartX,selStartY,r,0,Math.PI*2);ctx.fill();ctx.stroke();
            }else{
                const x=Math.min(selStartX,selCurX),y=Math.min(selStartY,selCurY),w=Math.abs(selCurX-selStartX),h=Math.abs(selCurY-selStartY);
                ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
            }
            ctx.restore();
        }
        function drawPolyProgress(){
            if(!polyVertices.length)return;
            ctx.save();
            ctx.strokeStyle='#3498db';ctx.lineWidth=1.5;ctx.setLineDash([]);
            ctx.beginPath();ctx.moveTo(polyVertices[0].x,polyVertices[0].y);
            polyVertices.forEach(v=>ctx.lineTo(v.x,v.y));ctx.stroke();
            ctx.setLineDash([4,3]);ctx.beginPath();
            ctx.moveTo(polyVertices[polyVertices.length-1].x,polyVertices[polyVertices.length-1].y);
            ctx.lineTo(polyMouseX,polyMouseY);ctx.stroke();
            ctx.setLineDash([]);ctx.strokeStyle='#e74c3c';ctx.lineWidth=2;
            ctx.beginPath();ctx.arc(polyVertices[0].x,polyVertices[0].y,POLY_CLOSE_R,0,Math.PI*2);ctx.stroke();
            ctx.fillStyle='#3498db';
            polyVertices.forEach(v=>{ctx.beginPath();ctx.arc(v.x,v.y,3,0,Math.PI*2);ctx.fill();});
            ctx.restore();
        }
        function updateManualResults(){
            const selected=[];
            manualSelected.forEach(i=>{if(allPoints[i])selected.push(Object.assign({},allPoints[i],{_allIdx:i}));});
            selected.sort((a,b)=>a._allIdx-b._allIdx);
            loadedRedPoints=selected;allMarkedIndices=selected.map(p=>p._allIdx);
            markedPoints=new Set(allMarkedIndices);excludedPoints=new Set();
            const cnt=selected.length;
            document.getElementById('selCountMsg').textContent=cnt>0?`✅ 已框選 ${cnt} 個點（可多次累積）`:'尚未框選任何點';
            document.getElementById('actionBox').style.display=cnt>0?'flex':'none';
            if(cnt>0){refreshRedPointsDisplay();updateRegionGrid();}
            else{
                document.getElementById('redPointCount').textContent='共 0 張';
                document.getElementById('pageInfo').textContent='0 / 0';
                document.getElementById('regionGrid').style.display='none';
                document.getElementById('tableBody').innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);">尚未框選任何點</td></tr>';
            }
        }

        initTheme(); buildFilterUI(); buildRegionGrid(); updateDisplay();
