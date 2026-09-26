(()=>{
  'use strict';
  const CHAT_KEY='motchi_ai_test_chat_v2';
  const chat=document.getElementById('chat');
  const menu=document.getElementById('messageMenu');
  const copyAction=document.getElementById('copyAction');
  const shareAction=document.getElementById('shareAction');
  const cancelAction=document.getElementById('cancelAction');
  const toast=document.getElementById('toast');
  let selected=null,toastTimer=null;

  function load(){
    try{const x=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]');return Array.isArray(x)?x.filter(i=>i&&(i.kind==='user'||i.kind==='ai')&&typeof i.text==='string'):[]}catch(_){return []}
  }
  function formatTime(ts){if(!ts)return '';const d=new Date(ts);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
  function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
  function renderAi(s){return escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\r?\n/g,'<br>')}
  function avatar(kind){return kind==='user'?'../../misa-icon.jpg':'../../chatgpt-icon.svg'}
  function showToast(t){toast.textContent=t;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1200)}
  function draw(item,index){
    const row=document.createElement('div');row.className=`message ${item.kind}`;row.dataset.index=String(index);
    const img=document.createElement('img');img.className='message-avatar';img.src=avatar(item.kind);img.alt='';
    const body=document.createElement('div');body.className='message-body';
    const bubble=document.createElement('div');bubble.className='bubble';if(item.kind==='ai')bubble.innerHTML=renderAi(item.text);else bubble.textContent=item.text;
    const meta=document.createElement('div');meta.className='message-meta';meta.textContent=formatTime(item.ts);if(!meta.textContent)meta.hidden=true;
    body.append(bubble,meta);if(item.kind==='user')row.append(body,img);else row.append(img,body);chat.appendChild(row);installLongPress(bubble,item,row);
  }
  function installLongPress(bubble,item,row){let timer=null,x=0,y=0;const cancel=()=>{if(timer){clearTimeout(timer);timer=null}};bubble.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;x=e.clientX;y=e.clientY;cancel();timer=setTimeout(()=>{selected={item,row};menu.hidden=false},600)});bubble.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-x)>10||Math.abs(e.clientY-y)>10)cancel()});bubble.addEventListener('pointerup',cancel);bubble.addEventListener('pointercancel',cancel)}
  async function copy(){if(!selected)return;try{await navigator.clipboard.writeText(selected.item.text);showToast('コピーしました')}catch(_){showToast('コピーできませんでした')}}
  function wrap(ctx,text,maxWidth){const lines=[];let line='';for(const ch of [...String(text||'')]){if(ch==='\n'){lines.push(line);line='';continue}const test=line+ch;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=ch}else line=test}if(line||!lines.length)lines.push(line);return lines}
  async function share(){if(!selected)return;const item=selected.item,canvas=document.createElement('canvas');canvas.width=1080;const ctx=canvas.getContext('2d');ctx.font='34px sans-serif';const lines=wrap(ctx,item.text,860);canvas.height=Math.max(360,150+lines.length*54);ctx.fillStyle='#f4f0e8';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#222';ctx.font='700 32px sans-serif';ctx.fillText(item.kind==='user'?'美砂':'弟子チャッピー',90,78);ctx.font='34px sans-serif';lines.forEach((l,i)=>ctx.fillText(l,90,145+i*54));const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)return showToast('画像を作れませんでした');const file=new File([blob],'deshi-v1-chat.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file]})}catch(e){if(e?.name!=='AbortError')showToast('共有できませんでした')}}else showToast('この端末では共有できません')}
  copyAction.addEventListener('click',async()=>{menu.hidden=true;await copy()});shareAction.addEventListener('click',async()=>{menu.hidden=true;await share()});cancelAction.addEventListener('click',()=>menu.hidden=true);menu.addEventListener('click',e=>{if(e.target===menu)menu.hidden=true});
  const history=load();draw({kind:'ai',text:'美砂さん、なんでも聞いてください。',ts:null},-1);history.forEach(draw);
  const i=Number(new URLSearchParams(location.search).get('message'));if(Number.isInteger(i)&&i>=0)requestAnimationFrame(()=>document.querySelector(`.message[data-index="${i}"]`)?.scrollIntoView({block:'center'}));
})();
