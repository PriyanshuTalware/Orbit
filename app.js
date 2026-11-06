(() => {
const $ = id => document.getElementById(id);
const canvas = $('canvas'), wrap = $('canvasWrap'); let ctx = canvas.getContext('2d');
const DB='orbit-infinite-v1', STORE='workspace';
let state={books:[],activeBook:null,activePage:null,theme:'light'};
let tool='select', color='#27324a', size=3, opacity=1, bg='dots', zoom=1, pan={x:0,y:0};
let drawing=false, start=null, current=null, spaceDown=false, selected=null, dragOffset=null;
let undoStack=[], redoStack=[], saveTimer=null, lastPointer={x:0,y:0};
const uid=()=>Math.random().toString(36).slice(2,10);
const defaultPage=()=>({id:uid(),name:'Untitled canvas',bg:'dots',items:[]});
const defaultBook=()=>({id:uid(),name:'My notebook',pages:[defaultPage()]});
function activeBook(){return state.books.find(b=>b.id===state.activeBook)}
function activePage(){return activeBook()?.pages.find(p=>p.id===state.activePage)}
function snapshot(){return JSON.stringify(activePage()?.items||[])}
function pushUndo(){undoStack.push(snapshot());if(undoStack.length>60)undoStack.shift();redoStack=[];updateUndo()}
function updateUndo(){$('undoBtn').disabled=!undoStack.length;$('redoBtn').disabled=!redoStack.length}
function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function persist(){try{const db=await dbOpen();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,'main');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();$('saveState').textContent='All changes saved'}catch(e){$('saveState').textContent='Could not save locally'}}
function scheduleSave(){ $('saveState').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(persist,450)}
async function init(){try{const db=await dbOpen();const saved=await new Promise(res=>{const r=db.transaction(STORE).objectStore(STORE).get('main');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)});db.close();if(saved&&saved.books?.length)state=saved;}catch(e){}if(!state.books.length){const b=defaultBook();state.books=[b];state.activeBook=b.id;state.activePage=b.pages[0].id}document.body.classList.toggle('dark',state.theme==='dark');renderLists();fitCanvas();render();persist()}
function renderLists(){const bl=$('bookList');bl.innerHTML='';state.books.forEach(b=>{const el=document.createElement('div');el.className='book-item'+(b.id===state.activeBook?' active':'');el.innerHTML='<span class="book-icon">▤</span><span></span>';el.lastChild.textContent=b.name;el.onclick=()=>{state.activeBook=b.id;state.activePage=b.pages[0]?.id;undoStack=[];redoStack=[];renderLists();render();scheduleSave()};bl.append(el)});const pl=$('pageList');pl.innerHTML='';(activeBook()?.pages||[]).forEach(p=>{const el=document.createElement('div');el.className='page-item'+(p.id===state.activePage?' active':'');el.innerHTML='<span class="page-icon">▧</span><span></span>';el.lastChild.textContent=p.name;el.onclick=()=>{state.activePage=p.id;bg=p.bg||'dots';undoStack=[];redoStack=[];renderLists();render();scheduleSave()};pl.append(el)});$('bookTitle').textContent=activeBook()?.name||'';$('pageTitle').textContent=activePage()?.name||'';$('canvasName').textContent=activePage()?.name||''}
function resize(){const r=wrap.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);render()}
function fitCanvas(){resize();pan={x:wrap.clientWidth/2,y:wrap.clientHeight/2};zoom=1;render()}
function world(sx,sy){return {x:(sx-pan.x)/zoom,y:(sy-pan.y)/zoom}}
function screen(p){return {x:p.x*zoom+pan.x,y:p.y*zoom+pan.y}}
function drawBackground(w,h){ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--canvas').trim()||'#fff';ctx.fillRect(0,0,w,h);if(bg==='blank')return;const step=(bg==='dots'?24:32)*zoom;if(step<5)return;const ox=((pan.x%step)+step)%step,oy=((pan.y%step)+step)%step;ctx.save();ctx.fillStyle=document.body.classList.contains('dark')?'#465067':'#dfe3ed';ctx.strokeStyle=document.body.classList.contains('dark')?'#30394d':'#e8ebf2';ctx.lineWidth=1;
if(bg==='dots'){for(let x=ox;x<w;x+=step)for(let y=oy;y<h;y+=step){ctx.beginPath();ctx.arc(x,y,Math.max(.65,zoom*.85),0,Math.PI*2);ctx.fill()}}
else if(bg==='grid'){for(let x=ox;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=oy;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}}
else if(bg==='lines'){for(let y=oy;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}}ctx.restore()}
function drawItem(it){ctx.save();ctx.globalAlpha=it.opacity??1;ctx.strokeStyle=it.color||color;ctx.fillStyle=it.color||color;ctx.lineWidth=(it.size||3)*zoom;ctx.lineCap='round';ctx.lineJoin='round';
if(it.type==='path'){if(it.points.length){ctx.beginPath();ctx.moveTo(it.points[0].x,it.points[0].y);it.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke()}}
if(it.type==='rect'){ctx.strokeRect(it.x,it.y,it.w,it.h)}
if(it.type==='ellipse'){ctx.beginPath();ctx.ellipse(it.x+it.w/2,it.y+it.h/2,Math.abs(it.w/2),Math.abs(it.h/2),0,0,Math.PI*2);ctx.stroke()}
if(it.type==='line'||it.type==='arrow'){ctx.beginPath();ctx.moveTo(it.x1,it.y1);ctx.lineTo(it.x2,it.y2);ctx.stroke();if(it.type==='arrow'){const a=Math.atan2(it.y2-it.y1,it.x2-it.x1),len=13;ctx.beginPath();ctx.moveTo(it.x2,it.y2);ctx.lineTo(it.x2-len*Math.cos(a-.45),it.y2-len*Math.sin(a-.45));ctx.moveTo(it.x2,it.y2);ctx.lineTo(it.x2-len*Math.cos(a+.45),it.y2-len*Math.sin(a+.45));ctx.stroke()}}
if(it.type==='text'){ctx.fillStyle=it.color||color;ctx.font=`${it.fontSize||22}px "DM Sans", sans-serif`;ctx.textBaseline='top';const lines=(it.text||'').split('\n');lines.forEach((line,i)=>ctx.fillText(line,it.x,it.y+i*(it.fontSize||22)*1.35))}
if(it.type==='image'&&it.src){const im=new Image();im.onload=()=>{const p=screen({x:it.x,y:it.y});ctx.drawImage(im,p.x,p.y,it.w*zoom,it.h*zoom)};im.src=it.src}
ctx.restore()}
function render(){if(!ctx||!canvas.width)return;const dpr=Math.min(devicePixelRatio||1,2),w=canvas.width/dpr,h=canvas.height/dpr;ctx.setTransform(dpr,0,0,dpr,0,0);drawBackground(w,h);ctx.save();ctx.translate(pan.x,pan.y);ctx.scale(zoom,zoom);(activePage()?.items||[]).forEach(drawItem);if(current)drawItem(current);ctx.restore();$('zoomLabel').textContent=Math.round(zoom*100)+'%';$('emptyHint').classList.toggle('hidden',!!activePage()?.items?.length)}
function setTool(t){tool=t;document.querySelectorAll('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));$('toolStatus').textContent=t[0].toUpperCase()+t.slice(1)+' tool';canvas.style.cursor=t==='hand'?'grab':t==='text'?'text':t==='select'?'default':'crosshair'}
function pointerPos(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
function distanceToSegment(p,a,b){
const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
if(!len)return Math.hypot(p.x-a.x,p.y-a.y);
const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len));
return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
}
let eraserChanged=false;
function eraseAt(p){
const items=activePage()?.items||[], radius=Math.max(9,size*2.5)/zoom;
let removed=false;
for(let i=items.length-1;i>=0;i--){
const it=items[i];let hit=false;
if(it.type==='path'){
const pts=it.points||[];
for(let j=0;j<pts.length;j++){
if(j===0 ? Math.hypot(p.x-pts[j].x,p.y-pts[j].y)<=radius :
distanceToSegment(p,pts[j-1],pts[j])<=radius+(it.size||2)/2){hit=true;break}
}
}else if(it.type==='line'||it.type==='arrow'){
hit=distanceToSegment(p,{x:it.x1,y:it.y1},{x:it.x2,y:it.y2})<=radius+(it.size||2)/2;
}else{
const x=it.x??0,y=it.y??0,w=it.w??220,h=it.h??45;
hit=p.x>=Math.min(x,x+w)-radius&&p.x<=Math.max(x,x+w)+radius&&
p.y>=Math.min(y,y+h)-radius&&p.y<=Math.max(y,y+h)+radius;
}
if(hit){if(!eraserChanged){pushUndo();eraserChanged=true}items.splice(i,1);removed=true}
}
if(removed)render();
}
function hitTest(p){const items=activePage()?.items||[];for(let i=items.length-1;i>=0;i--){const it=items[i];let x=it.x??it.x1,y=it.y??it.y1,w=it.w??((it.x2??x)-x),h=it.h??((it.y2??y)-y);if(it.type==='path'){const pts=it.points||[];if(pts.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<12/zoom))return i}else if(it.type==='text'){if(p.x>=x-5&&p.x<=x+220&&p.y>=y-5&&p.y<=y+50)return i}else if(p.x>=Math.min(x,x+w)-8&&p.x<=Math.max(x,x+w)+8&&p.y>=Math.min(y,y+h)-8&&p.y<=Math.max(y,y+h)+8)return i}return -1}
function onDown(e){if(e.button!==0&&e.pointerType!=='touch')return;canvas.setPointerCapture?.(e.pointerId);const s=pointerPos(e),p=world(s.x,s.y);lastPointer=s;
if(tool==='hand'||spaceDown||e.button===1){drawing=true;start=s;canvas.style.cursor='grabbing';return}
if(tool==='select'){const idx=hitTest(p);selected=idx;if(idx>=0){pushUndo();const it=activePage().items[idx];dragOffset={x:p.x-(it.x??it.x1??0),y:p.y-(it.y??it.y1??0)}}render();return}
if(tool==='text'){const text=prompt('Write something on your canvas:','');if(text){pushUndo();activePage().items.push({type:'text',x:p.x,y:p.y,text,color,size,fontSize:Math.max(14,size*6),opacity});scheduleSave();render()}return}
if(tool==='eraser'){drawing=true;start=p;eraserChanged=false;eraseAt(p);return}
drawing=true;start=p;
if(tool==='pen'||tool==='highlighter'){current={type:'path',points:[p],color,size:tool==='highlighter'?size*4:size,opacity:tool==='highlighter'?.28:opacity}}
else if(['rect','ellipse'].includes(tool))current={type:tool,x:p.x,y:p.y,w:0,h:0,color,size,opacity};
else if(['line','arrow'].includes(tool))current={type:tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color,size,opacity}
render()}
function onMove(e){const s=pointerPos(e),p=world(s.x,s.y);$('coords').textContent=Math.round(p.x)+', '+Math.round(p.y);if(!drawing){return}
if(tool==='hand'||spaceDown||e.buttons===4){pan.x+=s.x-start.x;pan.y+=s.y-start.y;start=s;render();return}
if(tool==='eraser'){eraseAt(p);return}
if(tool==='select'&&selected>=0&&dragOffset){const it=activePage().items[selected];const dx=p.x-dragOffset.x,dy=p.y-dragOffset.y;if(it.type==='path'){const old=it._last||{x:it.points[0].x,y:it.points[0].y};const ddx=dx-(it.x??0),ddy=dy-(it.y??0);it.points.forEach(q=>{q.x+=ddx;q.y+=ddy});it.x=dx;it.y=dy}else if(it.type==='line'||it.type==='arrow'){const ddx=dx-(it.x1||0),ddy=dy-(it.y1||0);it.x1+=ddx;it.x2+=ddx;it.y1+=ddy;it.y2+=ddy}else{it.x=dx;it.y=dy}render();return}
if(!current)return;
if(current.type==='path')current.points.push(p);
else if(current.type==='rect'||current.type==='ellipse'){current.w=p.x-start.x;current.h=p.y-start.y}
else{current.x2=p.x;current.y2=p.y}render()}
function onUp(){if(!drawing)return;drawing=false;canvas.style.cursor=tool==='hand'?'grab':'crosshair';if(current){pushUndo();activePage().items.push(current);current=null;scheduleSave()}if(tool==='eraser'&&eraserChanged){scheduleSave()}if(tool==='select'&&selected>=0){scheduleSave()}dragOffset=null;render()}
canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onUp);
canvas.addEventListener('wheel',e=>{e.preventDefault();const s=pointerPos(e),before=world(s.x,s.y),factor=e.deltaY<0?1.1:.9;zoom=Math.max(.15,Math.min(4,zoom*factor));pan.x=s.x-before.x*zoom;pan.y=s.y-before.y*zoom;render()},{passive:false});
function zoomAt(f){const x=wrap.clientWidth/2,y=wrap.clientHeight/2,p=world(x,y);zoom=Math.max(.15,Math.min(4,zoom*f));pan={x:x-p.x*zoom,y:y-p.y*zoom};render()}
$('zoomIn').onclick=()=>zoomAt(1.2);$('zoomOut').onclick=()=>zoomAt(.83);$('fitBtn').onclick=()=>{zoom=1;pan={x:wrap.clientWidth/2,y:wrap.clientHeight/2};render()};
document.querySelectorAll('.tool[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('swatches').addEventListener('click',e=>{const b=e.target.closest('.swatch');if(!b)return;color=b.dataset.color;document.querySelectorAll('.swatch').forEach(x=>x.classList.toggle('selected',x===b));$('customColor').value=color});
$('customColor').oninput=e=>{color=e.target.value;document.querySelectorAll('.swatch').forEach(x=>x.classList.remove('selected'))};
$('sizeRange').oninput=e=>{size=+e.target.value;$('sizeValue').textContent=size};
$('opacityRange').oninput=e=>{opacity=+e.target.value/100;$('opacityValue').textContent=e.target.value+'%'};
function toggle(id){[...document.querySelectorAll('.popover')].forEach(p=>{if(p.id!==id)p.classList.add('hidden')});$(id).classList.toggle('hidden')}
$('bgBtn').onclick=()=>toggle('backgroundMenu');$('exportBtn').onclick=()=>toggle('exportMenu');$('helpBtn').onclick=()=>toggle('helpMenu');
$('backgroundMenu').querySelectorAll('[data-bg]').forEach(b=>b.onclick=()=>{bg=b.dataset.bg;activePage().bg=bg;scheduleSave();$('backgroundMenu').classList.add('hidden');render()});
$('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';document.body.classList.toggle('dark',state.theme==='dark');scheduleSave();render()};
function openModal(title,desc,placeholder,confirm,callback){$('modalTitle').textContent=title;$('modalDesc').textContent=desc;$('modalInput').placeholder=placeholder;$('modalInput').value='';$('modalConfirm').textContent=confirm;$('modalBackdrop').classList.remove('hidden');$('modalInput').focus();$('modalConfirm').onclick=()=>{const v=$('modalInput').value.trim();if(v){callback(v);$('modalBackdrop').classList.add('hidden')}}}
$('modalClose').onclick=$('modalCancel').onclick=()=>$('modalBackdrop').classList.add('hidden');
$('newBookBtn').onclick=()=>openModal('Create notebook','Start a fresh space for your ideas.','Notebook name','Create',name=>{const b={...defaultBook(),name};state.books.push(b);state.activeBook=b.id;state.activePage=b.pages[0].id;renderLists();render();scheduleSave()});
$('newPageBtn').onclick=()=>openModal('New page','Add another canvas to this notebook.','Page name','Create',name=>{const p=defaultPage();p.name=name;activeBook().pages.push(p);state.activePage=p.id;bg=p.bg;renderLists();render();scheduleSave()});
$('renameBookBtn').onclick=()=>openModal('Rename notebook','Choose a new notebook name.',activeBook().name,'Save',name=>{activeBook().name=name;renderLists();scheduleSave()});
$('imageTool').onclick=()=>$('imageInput').click();
$('imageInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{const im=new Image();im.onload=()=>{pushUndo();activePage().items.push({type:'image',src:reader.result,x:world(wrap.clientWidth/2,wrap.clientHeight/2).x,y:world(wrap.clientWidth/2,wrap.clientHeight/2).y,w:Math.min(im.width,360),h:Math.min(im.height,260)});scheduleSave();render()};im.src=reader.result};reader.readAsDataURL(f);e.target.value=''};
function undo(){if(!undoStack.length)return;redoStack.push(snapshot());activePage().items=JSON.parse(undoStack.pop());updateUndo();scheduleSave();render()}
function redo(){if(!redoStack.length)return;undoStack.push(snapshot());activePage().items=JSON.parse(redoStack.pop());updateUndo();scheduleSave();render()}
$('undoBtn').onclick=undo;$('redoBtn').onclick=redo;
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return}if(e.key===' '){spaceDown=true;e.preventDefault()}if(e.key==='Delete'||e.key==='Backspace'){if(selected>=0){pushUndo();activePage().items.splice(selected,1);selected=-1;scheduleSave();render()}}if(!e.ctrlKey&&!e.metaKey){const keys={v:'select',h:'hand',p:'pen',i:'highlighter',e:'eraser',t:'text',r:'rect',o:'ellipse',l:'line',a:'arrow'};if(keys[e.key.toLowerCase()])setTool(keys[e.key.toLowerCase()])}});
document.addEventListener('keyup',e=>{if(e.key===' '){spaceDown=false;if(tool==='hand')canvas.style.cursor='grab'}});
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportCanvas(){const w=2400,h=1600,tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;const c=tmp.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,w,h);c.save();c.translate(w/2,h/2);c.scale(1.5,1.5);c.translate(-pan.x,-pan.y);(activePage().items||[]).forEach(it=>{ // render through shared item painter
const old=ctx;ctx=c;drawItem(it);ctx=old});c.restore();tmp.toBlob(b=>download(b,(activePage().name||'canvas')+'.png'))}
$('pngExport').onclick=()=>{exportCanvas();$('exportMenu').classList.add('hidden')};
$('pdfExport').onclick=()=>{window.print();$('exportMenu').classList.add('hidden')};
$('jsonExport').onclick=()=>{download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'orbit-workspace.json');$('exportMenu').classList.add('hidden')};
$('jsonImport').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);if(!data.books||!Array.isArray(data.books))throw Error();state=data;renderLists();render();scheduleSave();alert('Workspace imported successfully.')}catch(err){alert('That file does not look like an Orbit backup.')}};r.readAsText(f);e.target.value=''};
$('sidebarToggle').onclick=()=>$('sidebar').classList.toggle('open');
window.addEventListener('resize',resize);
window.addEventListener('beforeunload',()=>{if(saveTimer)persist()});
init();
})();