(()=>{
  'use strict';

  const PASS_KEY='motchi_ai_passphrase';
  const CHAT_KEY='motchi_ai_chat_v2';
  const MAX_HISTORY_MESSAGES=80;

  const cfg=window.MOTCHI_AI_CONFIG||{};
  const base=String(cfg.apiBase||'').replace(/\/$/,'');

  const login=document.getElementById('login');
  const pass=document.getElementById('passphrase');
  const loginButton=document.getElementById('loginButton');
  const loginError=document.getElementById('loginError');
  const form=document.getElementById('askForm');
  const question=document.getElementById('question');
  const sendButton=document.getElementById('sendButton');
  const chat=document.getElementById('chat');
  const remaining=document.getElementById('remaining');

  let current='';
  let history=loadHistory();

  function storageGet(key){
    try{return localStorage.getItem(key)||'';}catch(e){return '';}
  }

  function storageSet(key,value){
    try{localStorage.setItem(key,value);}catch(e){}
  }

  function storageRemove(key){
    try{localStorage.removeItem(key);}catch(e){}
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

  function saveHistory(){
    storageSet(CHAT_KEY,JSON.stringify(history.slice(-MAX_HISTORY_MESSAGES)));
  }

  function addHistory(kind,text){
    history.push({kind,text:String(text||'')});
    if(history.length>MAX_HISTORY_MESSAGES){
      history=history.slice(-MAX_HISTORY_MESSAGES);
    }
    saveHistory();
  }

  function loadHistory(){
    try{
      const raw=storageGet(CHAT_KEY);
      if(!raw)return [];
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed))return [];

      return parsed.filter(item =>
        item &&
        (item.kind==='user'||item.kind==='ai') &&
        typeof item.text==='string'
      ).slice(-MAX_HISTORY_MESSAGES);
    }catch(e){
      return [];
    }
  }

  function restoreHistory(){
    if(!chat)return;

    if(history.length===0){
      // index.html にある最初の吹き出しをそのまま使う
      return;
    }

    chat.innerHTML='';
    history.forEach(item=>drawMessage(item.kind,item.text));
  }

  function setButtonBusy(button,busy,busyText,normalText){
    if(!button)return;
    button.disabled=busy;
    button.textContent=busy ? busyText : normalText;
    button.setAttribute('aria-busy',busy ? 'true' : 'false');
  }

  async function api(path,body){
    if(!base)throw new Error('まだAPI接続先が設定されていません。');

    const response=await fetch(base+path,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });

    let data={};
    try{data=await response.json();}catch(e){}

    if(!response.ok){
      const err=new Error(data.error||'通信に失敗しました');
      err.status=response.status;
      throw err;
    }

    return data;
  }

  async function unlock(value){
    const candidate=String(value!==undefined ? value : pass.value).trim();

    if(!candidate){
      login.hidden=false;
      return;
    }

    loginError.textContent='';
    setButtonBusy(loginButton,true,'確認中…','ひらく');

    try{
      const data=await api('/api/check',{passphrase:candidate});
      current=candidate;
      storageSet(PASS_KEY,candidate);

      if(Number.isFinite(data.remaining)){
        remaining.textContent='今日はあと '+data.remaining+' 回';
      }

      login.hidden=true;
    }catch(e){
      if(e.status===401){
        storageRemove(PASS_KEY);
      }
      login.hidden=false;
      loginError.textContent=e.message;
    }finally{
      setButtonBusy(loginButton,false,'確認中…','ひらく');
    }
  }

  if(loginButton){
    loginButton.addEventListener('click',()=>unlock());
  }

  if(pass){
    pass.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();
        unlock();
      }
    });
  }

  if(form){
    form.addEventListener('submit',async event=>{
      event.preventDefault();

      const text=question.value.trim();
      if(!text||!current)return;

      drawMessage('user',text);
      addHistory('user',text);

      question.value='';
      setButtonBusy(sendButton,true,'考え中…','送信する');

      const pending=drawMessage('ai','考えちゅう…');

      try{
        const data=await api('/api/ask',{
          passphrase:current,
          question:text
        });

        const answer=data.answer||'返事が空っぽでした';
        pending.querySelector('.bubble').innerHTML=renderAiText(answer);
        addHistory('ai',answer);

        if(Number.isFinite(data.remaining)){
          remaining.textContent='今日はあと '+data.remaining+' 回';
        }
      }catch(e){
        const errorText='エラー: '+e.message;
        pending.querySelector('.bubble').textContent=errorText;
        addHistory('ai',errorText);
      }finally{
        setButtonBusy(sendButton,false,'考え中…','送信する');
        question.focus();
      }
    });
  }

  restoreHistory();

  const savedPass=storageGet(PASS_KEY);
  if(savedPass){
    pass.value=savedPass;
    unlock(savedPass);
  }else{
    login.hidden=false;
  }
})();
