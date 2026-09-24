(()=>{
  'use strict';

  const PASS_KEY='motchi_ai_passphrase';
  const CHAT_KEY='motchi_ai_chat_v2';
  const REMAINING_KEY='motchi_ai_remaining_v1';
  const PENDING_KEY='motchi_ai_pending_v1';
  const MAX_HISTORY_MESSAGES=80;

  const shells=[...document.querySelectorAll('main.shell')];
  shells.slice(1).forEach(node=>node.remove());
  const firstShell=shells[0]||document.querySelector('main.shell');
  if(firstShell){
    const cards=[...firstShell.querySelectorAll(':scope > .card')];
    cards.slice(1).forEach(node=>node.remove());
  }

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
  const utilityBar=document.getElementById('utilityBar');
  const lockButton=document.getElementById('lockButton');

  let current='';
  let history=loadHistory();
  let recovering=false;

  function storageGet(key){
    try{return localStorage.getItem(key)||'';}catch(e){return '';}
  }

  function storageSet(key,value){
    try{localStorage.setItem(key,value);}catch(e){}
  }

  function storageRemove(key){
    try{localStorage.removeItem(key);}catch(e){}
  }

  function sleep(ms){
    return new Promise(resolve=>setTimeout(resolve,ms));
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

  function buildConversationContext(){
    const ignoreAi=/^(エラー:|考えちゅう…|返事を受け取り中…|前の返事を取りにいってます…|通信が不安定です)/;

    return history
      .filter(item =>
        item &&
        (item.kind==='user'||item.kind==='ai') &&
        typeof item.text==='string' &&
        item.text.trim() &&
        !(item.kind==='ai' && ignoreAi.test(item.text.trim()))
      )
      .slice(-8)
      .map(item=>({
        role:item.kind==='user' ? 'user' : 'assistant',
        text:item.text.slice(0,4000)
      }));
  }

  function restoreHistory(){
    if(!chat)return;

    chat.innerHTML='';
    drawMessage('ai','美砂さん、なんでも聞いてください。');
    history.forEach(item=>drawMessage(item.kind,item.text));
  }

  function setButtonBusy(button,busy,busyText,normalText){
    if(!button)return;
    button.disabled=busy;
    button.textContent=busy ? busyText : normalText;
    button.setAttribute('aria-busy',busy ? 'true' : 'false');
  }

  function setRemaining(value){
    if(!Number.isFinite(value))return;
    remaining.textContent='今日はあと '+value+' 回';
    storageSet(REMAINING_KEY,String(value));

    if(value<=0){
      sendButton.disabled=true;
      sendButton.textContent='今日はここまで';
      sendButton.setAttribute('aria-busy','false');
    }
  }

  function limitMessage(){
    return '今日は20回使い切ったよ。また明日ね🐔';
  }

  function showCachedRemaining(){
    const cached=Number(storageGet(REMAINING_KEY));
    if(Number.isFinite(cached) && storageGet(REMAINING_KEY)!==''){
      setRemaining(cached);
    }
  }

  function newRequestId(){
    if(window.crypto && typeof window.crypto.randomUUID==='function'){
      return window.crypto.randomUUID().replace(/-/g,'');
    }
    return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,12);
  }

  function savePending(item){
    storageSet(PENDING_KEY,JSON.stringify(item));
  }

  function loadPending(){
    try{
      const raw=storageGet(PENDING_KEY);
      if(!raw)return null;
      const parsed=JSON.parse(raw);
      if(!parsed || !parsed.requestId)return null;
      return parsed;
    }catch(e){
      return null;
    }
  }

  function clearPending(){
    storageRemove(PENDING_KEY);
  }

  function showLockedState(message=''){
    current='';
    storageRemove(PASS_KEY);
    if(pass)pass.value='';
    if(loginError)loginError.textContent=message;
    if(utilityBar)utilityBar.hidden=true;
    if(login)login.hidden=false;
    setTimeout(()=>pass?.focus(),0);
  }

  function showUnlockedState(){
    if(utilityBar)utilityBar.hidden=false;
    if(login)login.hidden=true;
  }

  async function api(path,body){
    if(!base)throw new Error('まだAPI接続先が設定されていません。');

    let response;
    try{
      response=await fetch(base+path,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify(body)
      });
    }catch(networkError){
      const err=new Error('通信が途中で切れました');
      err.network=true;
      throw err;
    }

    let data={};
    try{data=await response.json();}catch(e){}

    if(!response.ok && response.status!==202){
      const err=new Error(data.error||'通信に失敗しました');
      err.status=response.status;
      throw err;
    }

    data.httpStatus=response.status;
    return data;
  }

  function forceLogout(message){
    showLockedState(message||'あいことばをもう一度入力してください。');
  }

  async function refreshUsage(candidate,attempt=0){
    try{
      const data=await api('/api/check',{passphrase:candidate});
      if(Number.isFinite(data.remaining))setRemaining(data.remaining);
      return true;
    }catch(e){
      if(e.status===401){
        forceLogout('あいことばをもう一度入力してください。');
        return false;
      }

      if(attempt===0){
        setTimeout(()=>refreshUsage(candidate,1),4000);
      }
      return false;
    }
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
      if(Number.isFinite(data.remaining))setRemaining(data.remaining);
      showUnlockedState();
      resumePendingIfNeeded();
    }catch(e){
      if(e.status===401){
        storageRemove(PASS_KEY);
        loginError.textContent=e.message;
      }else{
        loginError.textContent='通信が不安定です。もう一度「ひらく」を押してみてください。';
      }
      login.hidden=false;
      if(utilityBar)utilityBar.hidden=true;
    }finally{
      setButtonBusy(loginButton,false,'確認中…','ひらく');
    }
  }

  async function recoverAnswer(requestId,pendingRow,maxAttempts=20){
    if(recovering)return false;
    recovering=true;

    try{
      for(let i=0;i<maxAttempts;i++){
        if(i>0)await sleep(1500);

        try{
          const data=await api('/api/result',{
            passphrase:current,
            requestId
          });

          if(Number.isFinite(data.remaining))setRemaining(data.remaining);

          if(data.state==='completed'){
            const answer=data.answer||'返事が空っぽでした';
            pendingRow.querySelector('.bubble').innerHTML=renderAiText(answer);
            addHistory('ai',answer);
            clearPending();
            return true;
          }

          if(data.state==='unknown' && i>=3){
            break;
          }

          pendingRow.querySelector('.bubble').textContent='返事を受け取り中…';
        }catch(e){
          if(e.status===401){
            forceLogout();
            return false;
          }
        }
      }

      pendingRow.querySelector('.bubble').textContent='通信が不安定です。少し時間をおいて、ページを開き直してください。返事が完成していれば自動で回収します。';
      return false;
    }finally{
      recovering=false;
    }
  }

  async function resumePendingIfNeeded(){
    const item=loadPending();
    if(!item || !current || recovering)return;

    setButtonBusy(sendButton,true,'受け取り中…','送信する');
    const pendingRow=drawMessage('ai','前の返事を取りにいってます…');

    try{
      await recoverAnswer(item.requestId,pendingRow,12);
    }finally{
      setButtonBusy(sendButton,false,'受け取り中…','送信する');
    }
  }

  if(loginButton){
    loginButton.addEventListener('click',()=>unlock());
  }

  if(lockButton){
    lockButton.addEventListener('click',()=>{
      showLockedState('');
    });
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
      if(!text||!current||sendButton.disabled)return;

      const requestId=newRequestId();
      const conversation=buildConversationContext();

      drawMessage('user',text);
      addHistory('user',text);
      savePending({requestId,question:text,createdAt:Date.now()});

      question.value='';
      setButtonBusy(sendButton,true,'考え中…','送信する');

      const pendingRow=drawMessage('ai','考えちゅう…');

      try{
        const data=await api('/api/ask',{
          passphrase:current,
          question:text,
          requestId,
          conversation
        });

        if(Number.isFinite(data.remaining))setRemaining(data.remaining);

        if(data.httpStatus===202 || data.state==='pending'){
          pendingRow.querySelector('.bubble').textContent='返事を受け取り中…';
          await recoverAnswer(requestId,pendingRow);
          return;
        }

        const answer=data.answer||'返事が空っぽでした';
        pendingRow.querySelector('.bubble').innerHTML=renderAiText(answer);
        addHistory('ai',answer);
        clearPending();

      }catch(e){
        if(e.status===401){
          pendingRow.remove();
          forceLogout();
          return;
        }

        if(e.status===429){
          const message=limitMessage();
          pendingRow.querySelector('.bubble').textContent=message;
          addHistory('ai',message);
          clearPending();
          setRemaining(0);
          return;
        }

        pendingRow.querySelector('.bubble').textContent='返事を受け取り中…';
        await recoverAnswer(requestId,pendingRow);

      }finally{
        const cachedRemaining=Number(storageGet(REMAINING_KEY));
        if(storageGet(REMAINING_KEY)!=='' && cachedRemaining<=0){
          sendButton.disabled=true;
          sendButton.textContent='今日はここまで';
          sendButton.setAttribute('aria-busy','false');
        }else{
          setButtonBusy(sendButton,false,'考え中…','送信する');
        }
        question.focus();
      }
    });
  }

  restoreHistory();
  showCachedRemaining();

  const savedPass=storageGet(PASS_KEY);
  if(savedPass){
    current=savedPass;
    pass.value=savedPass;
    showUnlockedState();
    refreshUsage(savedPass);
    resumePendingIfNeeded();
  }else{
    showLockedState('');
  }
})();
