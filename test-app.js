(()=>{
  'use strict';

  const PASS_KEY='motchi_ai_test_passphrase';
  const CHAT_KEY='motchi_ai_test_chat_v1';
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
  const clearButton=document.getElementById('clearButton');
  const status=document.getElementById('status');
  const chat=document.getElementById('chat');

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

    if(kind==='ai') bubble.innerHTML=renderAiText(text);
    else bubble.textContent=text;

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

  function buildConversationContext(){
    return history
      .filter(item =>
        item &&
        (item.kind==='user'||item.kind==='ai') &&
        typeof item.text==='string' &&
        item.text.trim()
      )
      .slice(-8)
      .map(item=>({
        role:item.kind==='user' ? 'user' : 'assistant',
        text:item.text.slice(0,4000)
      }));
  }

  function restoreHistory(){
    chat.innerHTML='';
    drawMessage('ai','テスト準備できてます。なんでもどうぞ。');
    history.forEach(item=>drawMessage(item.kind,item.text));
  }

  function setBusy(busy){
    sendButton.disabled=busy;
    sendButton.textContent=busy ? '考え中…' : '送信する';
    sendButton.setAttribute('aria-busy',busy ? 'true' : 'false');
  }

  async function api(path,body){
    if(!base)throw new Error('API接続先が設定されていません。');

    let response;
    try{
      response=await fetch(base+path,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify(body)
      });
    }catch(e){
      throw new Error('通信に失敗しました');
    }

    let data={};
    try{data=await response.json();}catch(e){}

    if(!response.ok){
      const err=new Error(data.error||'通信に失敗しました');
      err.status=response.status;
      throw err;
    }

    return data;
  }

  function forceLogout(message){
    current='';
    storageRemove(PASS_KEY);
    login.hidden=false;
    loginError.textContent=message||'あいことばをもう一度入力してください。';
  }

  async function unlock(value){
    const candidate=String(value!==undefined ? value : pass.value).trim();
    if(!candidate){
      login.hidden=false;
      return;
    }

    loginError.textContent='';
    loginButton.disabled=true;
    loginButton.textContent='確認中…';

    try{
      await api('/api/test/check',{passphrase:candidate});
      current=candidate;
      storageSet(PASS_KEY,candidate);
      login.hidden=true;
      question.focus();
    }catch(e){
      if(e.status===401){
        storageRemove(PASS_KEY);
        loginError.textContent=e.message;
      }else{
        loginError.textContent='通信が不安定です。もう一度試してください。';
      }
      login.hidden=false;
    }finally{
      loginButton.disabled=false;
      loginButton.textContent='ひらく';
    }
  }

  loginButton.addEventListener('click',()=>unlock());

  pass.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      unlock();
    }
  });

  clearButton.addEventListener('click',()=>{
    const ok=window.confirm('テスト画面の会話履歴をすべて消しますか？');
    if(!ok)return;

    history=[];
    storageRemove(CHAT_KEY);
    restoreHistory();
    status.textContent='テスト画面の履歴をクリアしました';
    question.focus();
  });

  form.addEventListener('submit',async event=>{
    event.preventDefault();

    const text=question.value.trim();
    if(!text||!current||sendButton.disabled)return;

    const conversation=buildConversationContext();
    drawMessage('user',text);
    addHistory('user',text);
    question.value='';
    setBusy(true);
    status.textContent='';

    const pendingRow=drawMessage('ai','考えちゅう…');

    try{
      const data=await api('/api/test/ask',{
        passphrase:current,
        question:text,
        conversation
      });

      const answer=data.answer||'返事が空っぽでした';
      pendingRow.querySelector('.bubble').innerHTML=renderAiText(answer);
      addHistory('ai',answer);
    }catch(e){
      if(e.status===401){
        pendingRow.remove();
        forceLogout();
        return;
      }

      pendingRow.querySelector('.bubble').textContent='エラー: '+e.message;
    }finally{
      setBusy(false);
      question.focus();
    }
  });

  restoreHistory();

  const savedPass=storageGet(PASS_KEY);
  if(savedPass){
    current=savedPass;
    pass.value=savedPass;
    login.hidden=true;
  }else{
    login.hidden=false;
  }
})();
