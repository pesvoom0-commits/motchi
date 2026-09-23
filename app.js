(()=>{
  const PASS_KEY='motchi_ai_passphrase';
  const CHAT_KEY='motchi_ai_chat_v1';
  const MAX_HISTORY_MESSAGES=80;

  const cfg=window.MOTCHI_AI_CONFIG||{};
  const base=String(cfg.apiBase||'').replace(/\/$/,'');

  const login=document.getElementById('login');
  const pass=document.getElementById('passphrase');
  const lb=document.getElementById('loginButton');
  const le=document.getElementById('loginError');
  const form=document.getElementById('askForm');
  const q=document.getElementById('question');
  const send=document.getElementById('sendButton');
  const chat=document.getElementById('chat');
  const rem=document.getElementById('remaining');

  let current='';
  let history=loadHistory();

  function escapeHtml(text){
    return String(text||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function renderAiText(text){
    let html=escapeHtml(text);
    html=html.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    html=html.replace(/\r?\n/g,'<br>');
    return html;
  }

  function drawMessage(kind,text){
    const row=document.createElement('div');
    row.className='message '+kind;

    const bubble=document.createElement('div');
    bubble.className='bubble';

    if(kind==='ai'){
      bubble.innerHTML=renderAiText(text);
    }else{
      bubble.textContent=text;
    }

    row.appendChild(bubble);
    chat.appendChild(row);
    chat.scrollTop=chat.scrollHeight;
    return row;
  }

  function addHistory(kind,text){
    history.push({kind,text:String(text||'')});
    if(history.length>MAX_HISTORY_MESSAGES){
      history=history.slice(-MAX_HISTORY_MESSAGES);
    }
    try{
      localStorage.setItem(CHAT_KEY,JSON.stringify(history));
    }catch(e){}
  }

  function loadHistory(){
    try{
      const raw=localStorage.getItem(CHAT_KEY);
      const parsed=raw ? JSON.parse(raw) : [];
      if(!Array.isArray(parsed))return [];
      return parsed.filter(x =>
        x &&
        (x.kind==='user'||x.kind==='ai') &&
        typeof x.text==='string'
      ).slice(-MAX_HISTORY_MESSAGES);
    }catch(e){
      return [];
    }
  }

  function restoreHistory(){
    chat.innerHTML='';
    if(history.length===0){
      drawMessage('ai','美砂さん、なんでも聞いてください。');
      return;
    }
    for(const item of history){
      drawMessage(item.kind,item.text);
    }
  }

  async function api(path,body){
    if(!base)throw new Error('まだAPI接続先が設定されていません。');

    const r=await fetch(base+path,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });

    let d={};
    try{d=await r.json()}catch{}

    if(!r.ok){
      const e=new Error(d.error||'通信に失敗しました');
      e.status=r.status;
      throw e;
    }

    return d;
  }

  async function unlock(value){
    const p=String(value??pass.value).trim();
    if(!p){
      login.hidden=false;
      return;
    }

    le.textContent='';

    try{
      const d=await api('/api/check',{passphrase:p});
      current=p;
      localStorage.setItem(PASS_KEY,p);

      if(Number.isFinite(d.remaining)){
        rem.textContent='今日はあと '+d.remaining+' 回';
      }

      login.hidden=true;
    }catch(e){
      if(e.status===401){
        localStorage.removeItem(PASS_KEY);
      }
      login.hidden=false;
      le.textContent=e.message;
    }
  }

  lb.onclick=()=>unlock();

  pass.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      unlock();
    }
  });

  form.onsubmit=async e=>{
    e.preventDefault();

    const text=q.value.trim();
    if(!text||!current)return;

    drawMessage('user',text);
    addHistory('user',text);

    q.value='';
    send.disabled=true;

    const pending=drawMessage('ai','考えちゅう…');

    try{
      const d=await api('/api/ask',{
        passphrase:current,
        question:text
      });

      const answer=d.answer||'返事が空っぽでした';
      pending.querySelector('.bubble').innerHTML=renderAiText(answer);
      addHistory('ai',answer);

      if(Number.isFinite(d.remaining)){
        rem.textContent='今日はあと '+d.remaining+' 回';
      }
    }catch(e){
      pending.querySelector('.bubble').textContent=e.message;
    }finally{
      send.disabled=false;
    }
  };

  restoreHistory();

  const saved=localStorage.getItem(PASS_KEY)||'';
  if(saved){
    pass.value=saved;
    unlock(saved);
  }else{
    login.hidden=false;
  }
})();
