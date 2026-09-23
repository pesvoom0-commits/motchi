(()=>{
  const K='motchi_ai_passphrase',
    cfg=window.MOTCHI_AI_CONFIG||{},
    base=String(cfg.apiBase||'').replace(/\/$/,'');

  const login=document.getElementById('login'),
    pass=document.getElementById('passphrase'),
    remember=document.getElementById('rememberPassphrase'),
    lb=document.getElementById('loginButton'),
    le=document.getElementById('loginError'),
    form=document.getElementById('askForm'),
    q=document.getElementById('question'),
    send=document.getElementById('sendButton'),
    chat=document.getElementById('chat'),
    rem=document.getElementById('remaining');

  let current='';

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

    // **太字**
    html=html.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');

    // 改行
    html=html.replace(/\r?\n/g,'<br>');

    return html;
  }

  function msg(kind,text){
    const r=document.createElement('div');
    r.className='message '+kind;

    const b=document.createElement('div');
    b.className='bubble';

    if(kind==='ai'){
      b.innerHTML=renderAiText(text);
    }else{
      b.textContent=text;
    }

    r.appendChild(b);
    chat.appendChild(r);
    chat.scrollTop=chat.scrollHeight;
    return r;
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

  async function unlock(){
    const p=pass.value.trim();
    if(!p)return;

    try{
      const d=await api('/api/check',{passphrase:p});
      current=p;

      if(remember.checked)localStorage.setItem(K,p);
      if(Number.isFinite(d.remaining))rem.textContent='今日はあと '+d.remaining+' 回';

      login.hidden=true;
    }catch(e){
      le.textContent=e.message;
    }
  }

  lb.onclick=unlock;

  form.onsubmit=async e=>{
    e.preventDefault();

    const text=q.value.trim();
    if(!text||!current)return;

    msg('user',text);
    q.value='';
    send.disabled=true;

    const p=msg('ai','考えちゅう…');

    try{
      const d=await api('/api/ask',{
        passphrase:current,
        question:text
      });

      p.querySelector('.bubble').innerHTML=renderAiText(d.answer||'返事が空っぽでした');

      if(Number.isFinite(d.remaining)){
        rem.textContent='今日はあと '+d.remaining+' 回';
      }
    }catch(e){
      p.querySelector('.bubble').textContent=e.message;
    }finally{
      send.disabled=false;
    }
  };

  const s=localStorage.getItem(K)||'';
  if(s){
    pass.value=s;
    unlock();
  }
})();
