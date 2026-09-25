(()=>{
  'use strict';

  const PASS_KEY='motchi_ai_test_passphrase';
  const CHAT_KEY='motchi_ai_test_chat_v2';
  const REMAINING_KEY='motchi_ai_test_remaining_v1';
  const PENDING_KEY='motchi_ai_test_pending_v1';
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
  const clearButton=document.getElementById('clearButton');
  const adminUsageButton=document.getElementById('adminUsageButton');
  const testDiagnostic=document.getElementById('testDiagnostic');
  let productionUsage={remaining:null,limit:null,used:null};

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

  function renderLoadingState(node,text){
    if(!node)return;

    const label=String(text||'')
      .replace(/[.…]+$/,'')
      .trim();

    node.textContent=label;
    node.setAttribute('aria-label',label+'…');

    const dots=document.createElement('span');
    dots.className='loading-dots';
    dots.setAttribute('aria-hidden','true');

    for(let i=0;i<3;i++){
      const dot=document.createElement('span');
      dot.textContent='.';
      dots.appendChild(dot);
    }

    node.appendChild(dots);
  }

  function setPendingMessage(row,text){
    const bubble=row?.querySelector('.bubble');
    if(bubble)renderLoadingState(bubble,text);
  }

  function formatMessageTime(ts){
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

  function avatarSrc(kind){
    return kind==='user' ? './misa-icon.jpg' : './chatgpt-icon.svg';
  }

  function drawMessage(kind,text,ts=null){
    const row=document.createElement('div');
    row.className='message '+kind;

    const avatar=document.createElement('img');
    avatar.className='message-avatar';
    avatar.src=avatarSrc(kind);
    avatar.alt=kind==='user' ? '美砂さん' : 'ChatGPT';

    const body=document.createElement('div');
    body.className='message-body';

    const bubble=document.createElement('div');
    bubble.className='bubble';

    if(kind==='ai'){
      bubble.innerHTML=renderAiText(text);
    }else{
      bubble.textContent=text;
    }

    const meta=document.createElement('div');
    meta.className='message-meta';
    meta.textContent=formatMessageTime(ts);
    if(!meta.textContent)meta.hidden=true;

    body.appendChild(bubble);
    body.appendChild(meta);

    if(kind==='user'){
      row.appendChild(body);
      row.appendChild(avatar);
    }else{
      row.appendChild(avatar);
      row.appendChild(body);
    }

    chat.appendChild(row);
    chat.scrollTop=chat.scrollHeight;
    return row;
  }

  function updateMessage(row,text,ts=Date.now()){
    const bubble=row?.querySelector('.bubble');
    const meta=row?.querySelector('.message-meta');
    if(bubble){
      bubble.innerHTML=renderAiText(text);
      bubble.removeAttribute('aria-label');
    }
    if(meta){
      meta.textContent=formatMessageTime(ts);
      meta.hidden=!meta.textContent;
    }
    return ts;
  }

  function saveHistory(){
    storageSet(CHAT_KEY,JSON.stringify(history.slice(-MAX_HISTORY_MESSAGES)));
  }

  function addHistory(kind,text,ts=Date.now()){
    history.push({kind,text:String(text||''),ts});
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
      ).map(item=>({
        kind:item.kind,
        text:item.text,
        ts:Number.isFinite(Number(item.ts)) ? Number(item.ts) : null
      })).slice(-MAX_HISTORY_MESSAGES);
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
    history.forEach(item=>drawMessage(item.kind,item.text,item.ts));
  }

  function setButtonBusy(button,busy,busyText,normalText){
    if(!button)return;
    button.disabled=busy;

    if(busy){
      renderLoadingState(button,busyText);
    }else{
      button.textContent=normalText;
      button.removeAttribute('aria-label');
    }

    button.setAttribute('aria-busy',busy ? 'true' : 'false');
  }

  function setRemaining(value){
    remaining.textContent='TEST MODE';
  }

  function renderProductionUsage(data){
    if(!data)return;
    productionUsage={
      remaining:Number(data.remaining),
      limit:Number(data.limit),
      used:Number(data.used)
    };
    if(adminUsageButton && Number.isFinite(productionUsage.remaining)){
      adminUsageButton.textContent='本番残り '+productionUsage.remaining+' 回';
    }
  }

  async function refreshProductionUsage(){
    if(!current)return;
    try{
      const data=await api('/api/test/admin/usage',{passphrase:current});
      renderProductionUsage(data);
    }catch(e){
      if(adminUsageButton)adminUsageButton.textContent='本番残り -- 回';
    }
  }

  function limitMessage(){
    return '今日は20回使い切ったよ。また明日ね🐔';
  }

  function showCachedRemaining(){
    remaining.textContent='TEST MODE';
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

  async function api(path,body,timeoutMs){
    if(!base)throw new Error('まだAPI接続先が設定されていません。');

    const defaultTimeout =
      path==='/api/test/ask' ? 60000 :
      path==='/api/test/result' ? 10000 :
      path==='/api/result' ? 8000 :
      12000;

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs||defaultTimeout);

    let response;
    try{
      response=await fetch(base+path,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify(body),
        signal:controller.signal
      });
    }catch(networkError){
      const timedOut=networkError && networkError.name==='AbortError';
      const err=new Error(timedOut ? '通信がタイムアウトしました' : '通信が途中で切れました');
      err.network=true;
      err.timeout=timedOut;
      throw err;
    }finally{
      clearTimeout(timer);
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
    if(!candidate)return false;
    await refreshProductionUsage();
    return true;
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
      const data=await api('/api/test/check',{passphrase:candidate});
      current=candidate;
      storageSet(PASS_KEY,candidate);
      showUnlockedState();
      remaining.textContent='TEST MODE';
      refreshProductionUsage();
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

  async function pollTestResult(item,pendingRow,maxAttempts=22){
    for(let i=0;i<maxAttempts;i++){
      if(i>0)await sleep(1800);

      try{
        const data=await api('/api/test/result',{
          passphrase:current,
          requestId:item.requestId
        });

        if(data.state==='completed'){
          const answer=data.answer||'返事が空っぽでした';
          const aiTs=updateMessage(pendingRow,answer,Date.now());
          addHistory('ai',answer,aiTs);
          clearPending();
          refreshProductionUsage();
          return {done:true};
        }

        if(data.state==='unknown'){
          return {done:false,unknown:true};
        }

        setPendingMessage(pendingRow,'返事を受け取り中');

      }catch(e){
        if(e.status===401){
          forceLogout();
          return {done:false,auth:true};
        }
        setPendingMessage(pendingRow,'返事を受け取り中');
      }
    }

    return {done:false};
  }

  async function retryPendingAsk(item,pendingRow){
    try{
      const data=await api('/api/test/ask',{
        passphrase:current,
        question:item.question,
        requestId:item.requestId,
        conversation:Array.isArray(item.conversation) ? item.conversation : []
      });

      if(data.state==='completed' || (data.answer && data.httpStatus!==202)){
        const answer=data.answer||'返事が空っぽでした';
        const aiTs=updateMessage(pendingRow,answer,Date.now());
        addHistory('ai',answer,aiTs);
        clearPending();

        if(testDiagnostic){
          testDiagnostic.textContent=data.testDiagnostic||item.testDiagnostic||'';
          testDiagnostic.hidden=!testDiagnostic.textContent;
        }

        refreshProductionUsage();
        return true;
      }

      if(data.testDiagnostic){
        item.testDiagnostic=data.testDiagnostic;
        savePending(item);
      }

      setPendingMessage(pendingRow,'返事を受け取り中');
      const polled=await pollTestResult(item,pendingRow,28);
      return Boolean(polled.done);

    }catch(e){
      setPendingMessage(pendingRow,'返事を受け取り中');
      return false;
    }
  }

  async function recoverAnswer(item,pendingRow){
    if(recovering)return false;
    recovering=true;

    try{
      // First give the original Worker time to finish and write the temporary result.
      let result=await pollTestResult(item,pendingRow,12);
      if(result.done)return true;

      // If the original mobile connection killed the job, retry the exact same
      // requestId. Apps Script prevents immediate duplicates and allows stale retries.
      setPendingMessage(pendingRow,'もう一度つないでます');
      const retried=await retryPendingAsk(item,pendingRow);
      if(retried)return true;

      result=await pollTestResult(item,pendingRow,12);
      if(result.done)return true;

      pendingRow.querySelector('.bubble').textContent=
        '返事の受け取りに時間がかかっています。ページを開き直すと、続きから確認します。';
      return false;

    }finally{
      recovering=false;
    }
  }

  async function resumePendingIfNeeded(){
    const item=loadPending();
    if(!item || !item.requestId || !item.question || !current || recovering)return;

    setButtonBusy(sendButton,true,'受け取り中…','送信する');
    const pendingRow=drawMessage('ai','');
    setPendingMessage(pendingRow,'前の返事を取りにいってます');

    try{
      await recoverAnswer(item,pendingRow);
    }finally{
      setButtonBusy(sendButton,false,'受け取り中…','送信する');
      remaining.textContent='TEST MODE';
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

  if(clearButton){
    clearButton.addEventListener('click',()=>{
      const ok=window.confirm('テスト画面の会話履歴をすべて消しますか？');
      if(!ok)return;
      history=[];
      saveHistory();
      clearPending();
      restoreHistory();
      if(testDiagnostic){
        testDiagnostic.textContent='';
        testDiagnostic.hidden=true;
      }
      question?.focus();
    });
  }

  if(adminUsageButton){
    adminUsageButton.addEventListener('click',async()=>{
      if(!current)return;
      await refreshProductionUsage();

      const currentValue=Number.isFinite(productionUsage.remaining)
        ? productionUsage.remaining
        : '';

      const raw=window.prompt(
        '本番の残り回数を直接変更します。0〜'+(productionUsage.limit||20)+'で入力してください。',
        String(currentValue)
      );
      if(raw===null)return;

      const value=Math.floor(Number(raw));
      if(!Number.isFinite(value)){
        window.alert('数字で入力してください。');
        return;
      }

      try{
        const data=await api('/api/test/admin/set-remaining',{
          passphrase:current,
          remaining:value
        });
        renderProductionUsage(data);
      }catch(e){
        window.alert(e.message||'変更に失敗しました。');
      }
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

      const userTs=Date.now();
      drawMessage('user',text,userTs);
      addHistory('user',text,userTs);
      savePending({
        requestId,
        question:text,
        conversation,
        createdAt:Date.now(),
        testDiagnostic:''
      });

      question.value='';
      setButtonBusy(sendButton,true,'考え中…','送信する');

      const pendingRow=drawMessage('ai','');
      setPendingMessage(pendingRow,'考えちゅう');

      try{
        const data=await api('/api/test/ask',{
          passphrase:current,
          question:text,
          requestId,
          conversation
        });

        if(data.httpStatus===202 || data.state==='pending'){
          const item=loadPending()||{
            requestId,
            question:text,
            conversation,
            createdAt:Date.now(),
            testDiagnostic:''
          };

          if(data.testDiagnostic){
            item.testDiagnostic=data.testDiagnostic;
            savePending(item);
          }

          setPendingMessage(pendingRow,'返事を受け取り中');
          await recoverAnswer(item,pendingRow);
          return;
        }

        const answer=data.answer||'返事が空っぽでした';
        const aiTs=updateMessage(pendingRow,answer,Date.now());
        addHistory('ai',answer,aiTs);
        clearPending();

        if(testDiagnostic){
          testDiagnostic.textContent=data.testDiagnostic||'';
          testDiagnostic.hidden=!data.testDiagnostic;
        }

        refreshProductionUsage();

      }catch(e){
        if(e.status===401){
          pendingRow.remove();
          forceLogout();
          return;
        }

        if(e.status===429){
          const message=limitMessage();
          const aiTs=updateMessage(pendingRow,message,Date.now());
          addHistory('ai',message,aiTs);
          clearPending();
          setRemaining(0);
          return;
        }

        const item=loadPending()||{
          requestId,
          question:text,
          conversation,
          createdAt:Date.now(),
          testDiagnostic:''
        };
        setPendingMessage(pendingRow,'返事を受け取り中');
        await recoverAnswer(item,pendingRow);

      }finally{
        setButtonBusy(sendButton,false,'考え中…','送信する');
        remaining.textContent='TEST MODE';
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
      remaining.textContent='TEST MODE';
      refreshProductionUsage();
      resumePendingIfNeeded();
  }else{
    showLockedState('');
  }
})();
