(()=>{
  'use strict';

  const CHAT_KEY='motchi_ai_chat_v2';
  const chat=document.getElementById('chat');

  function storageGet(key){
    try{return localStorage.getItem(key)||'';}catch(_){return '';}
  }

  function escapeHtml(text){
    return String(text||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function renderAiText(text){
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\r?\n/g,'<br>');
  }

  function formatTime(ts){
    if(!ts)return '';
    const d=new Date(ts);
    if(Number.isNaN(d.getTime()))return '';
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0');
    const mm=String(d.getMinutes()).padStart(2,'0');
    return `${y}/${m}/${day} ${hh}:${mm}`;
  }

  function loadHistory(){
    try{
      const raw=storageGet(CHAT_KEY);
      if(!raw)return [];
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed))return [];
      return parsed.filter(item=>
        item &&
        (item.kind==='user'||item.kind==='ai') &&
        typeof item.text==='string'
      ).map(item=>({
        kind:item.kind,
        text:item.text,
        ts:Number.isFinite(Number(item.ts))?Number(item.ts):null
      }));
    }catch(_){
      return [];
    }
  }

  function avatarSrc(kind){
    return kind==='user' ? '../../misa-icon.jpg' : '../../chatgpt-icon.svg';
  }

  function drawMessage(item,index){
    const row=document.createElement('div');
    row.className='message '+item.kind;
    row.dataset.messageIndex=String(index);

    const avatar=document.createElement('img');
    avatar.className='message-avatar';
    avatar.src=avatarSrc(item.kind);
    avatar.alt='';

    const body=document.createElement('div');
    body.className='message-body';

    const bubble=document.createElement('div');
    bubble.className='bubble';
    if(item.kind==='ai') bubble.innerHTML=renderAiText(item.text);
    else bubble.textContent=item.text;

    const meta=document.createElement('div');
    meta.className='message-meta';
    meta.textContent=formatTime(item.ts);
    meta.hidden=!meta.textContent;

    body.append(bubble,meta);
    if(item.kind==='user') row.append(body,avatar);
    else row.append(avatar,body);
    chat.appendChild(row);
  }

  const history=loadHistory();
  chat.innerHTML='';
  drawMessage({kind:'ai',text:'美砂さん、なんでも聞いてください。',ts:null},-1);
  history.forEach(drawMessage);

  const params=new URLSearchParams(location.search);
  const raw=params.get('message');
  const target=raw!==null?Number(raw):NaN;
  if(Number.isInteger(target)){
    requestAnimationFrame(()=>{
      document.querySelector(`.message[data-message-index="${target}"]`)?.scrollIntoView({block:'center'});
    });
  }
})();
