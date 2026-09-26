(()=>{
  'use strict';

  const PASS_KEY='motchi_ai_test_passphrase';
  const CHAT_KEY='motchi_ai_test_chat_generation_2';
  const LEGACY_CHAT_KEY='motchi_ai_test_chat_v2';
  const PENDING_KEY='motchi_ai_test_pending_v2';
  const MODEL_KEY='motchi_ai_test_model_v2';
  const MAX_HISTORY_MESSAGES=120;

  const cfg=window.MOTCHI_AI_CONFIG||{};
  const base=String(cfg.apiBase||'').replace(/\/$/,'');

  const app=$('app');
  const header=$('v2Header');
  const login=$('login');
  const pass=$('passphrase');
  const loginButton=$('loginButton');
  const loginError=$('loginError');
  const titleButton=$('titleButton');
  const searchInput=$('searchInput');
  const archiveButton=$('archiveButton');
  const adminButton=$('adminButton');
  const chatView=$('chatView');
  const searchView=$('searchView');
  const archiveListView=$('archiveListView');
  const archiveView=$('archiveView');
  const chat=$('chat');
  const searchResults=$('searchResults');
  const archiveCards=$('archiveCards');
  const archiveChat=$('archiveChat');
  const returnCurrentButton=$('returnCurrentButton');
  const returnCurrentFromListButton=$('returnCurrentFromListButton');
  const form=$('askForm');
  const question=$('question');
  const sendButton=$('sendButton');
  const adminBackdrop=$('adminBackdrop');
  const adminClose=$('adminClose');
  const modelLuna=$('modelLuna');
  const modelTerra=$('modelTerra');
  const lastSync=$('lastSync');
  const productionRemaining=$('productionRemaining');
  const remainingInput=$('remainingInput');
  const remainingMinus=$('remainingMinus');
  const remainingPlus=$('remainingPlus');
  const remainingSave=$('remainingSave');
  const clearButton=$('clearButton');
  const lockButton=$('lockButton');
  const messageMenuBackdrop=$('messageMenuBackdrop');
  const copyAction=$('copyAction');
  const shareAction=$('shareAction');
  const detailAction=$('detailAction');
  const menuCancel=$('menuCancel');
  const detailBackdrop=$('detailBackdrop');
  const detailClose=$('detailClose');
  const detailMeta=$('detailMeta');
  const detailDiagnostic=$('detailDiagnostic');
  const detailRequest=$('detailRequest');
  const toast=$('toast');

  let current='';
  let history=loadHistory(CHAT_KEY);
  let selectedMessage=null;
  let productionUsage={remaining:null,limit:20,used:null};
  let model=storageGet(MODEL_KEY)||'luna';
  let toastTimer=null;
  let recovering=false;

  function $(id){return document.getElementById(id)}
  function storageGet(key){try{return localStorage.getItem(key)||''}catch(_){return ''}}
  function storageSet(key,value){try{localStorage.setItem(key,value)}catch(_){}}
  function storageRemove(key){try{localStorage.removeItem(key)}catch(_){}}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n))}

  function escapeHtml(text){
    return String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function renderAiText(text){
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\r?\n/g,'<br>');
  }
  function formatTime(ts){
    if(!ts)return '';
    const d=new Date(ts); if(Number.isNaN(d.getTime()))return '';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function formatDate(ts){
    if(!ts)return '';
    const d=new Date(ts); if(Number.isNaN(d.getTime()))return '';
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }
  function showToast(text){
    toast.textContent=text; toast.classList.add('show'); clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.classList.remove('show'),1300);
  }
  function loadHistory(key){
    try{
      const raw=storageGet(key); if(!raw)return [];
      const parsed=JSON.parse(raw); if(!Array.isArray(parsed))return [];
      return parsed.filter(x=>x&&(x.kind==='user'||x.kind==='ai')&&typeof x.text==='string').map(x=>({
        kind:x.kind,text:x.text,ts:Number(x.ts)||null,details:x.details&&typeof x.details==='object'?x.details:null
      })).slice(-MAX_HISTORY_MESSAGES);
    }catch(_){return []}
  }
  function saveHistory(){storageSet(CHAT_KEY,JSON.stringify(history.slice(-MAX_HISTORY_MESSAGES)))}
  function addHistory(kind,text,ts=Date.now(),details=null){
    const item={kind,text:String(text||''),ts,details}; history.push(item);
    if(history.length>MAX_HISTORY_MESSAGES)history=history.slice(-MAX_HISTORY_MESSAGES);
    saveHistory(); return history.length-1;
  }
  function buildConversationContext(){
    const ignoreAi=/^(エラー:|考えちゅう|返事を受け取り中|前の返事を取りにいってます|通信が不安定です)/;
    return history.filter(x=>x.text.trim()&&!(x.kind==='ai'&&ignoreAi.test(x.text.trim()))).slice(-8).map(x=>({role:x.kind==='user'?'user':'assistant',text:x.text.slice(0,4000)}));
  }
  function avatarSrc(kind){return kind==='user'?'./misa-icon.jpg':'./chatgpt-icon.svg'}

  function drawMessage(item,index,container=chat,legacy=false){
    const row=document.createElement('div');
    row.dataset.messageIndex=String(index);
    row.dataset.kind=item.kind;
    row.className=legacy?`legacy-message ${item.kind}`:`message ${item.kind}`;
    const avatar=document.createElement('img'); avatar.src=avatarSrc(item.kind); avatar.alt=''; avatar.className=legacy?'legacy-avatar':'message-avatar';
    const body=document.createElement('div'); body.className=legacy?'legacy-body':'message-body';
    const bubble=document.createElement('div'); bubble.className=legacy?'legacy-bubble':'bubble';
    if(item.kind==='ai')bubble.innerHTML=renderAiText(item.text); else bubble.textContent=item.text;
    const meta=document.createElement('div'); meta.className=legacy?'legacy-meta':'message-meta'; meta.textContent=formatTime(item.ts); if(!meta.textContent)meta.hidden=true;
    body.append(bubble,meta);
    if(item.kind==='user')row.append(body,avatar); else row.append(avatar,body);
    container.appendChild(row);
    installLongPress(row,bubble,item,index,legacy);
    return row;
  }

  function restoreChat(){
    chat.innerHTML='';
    drawMessage({kind:'ai',text:'美砂さん、なんでも聞いてください。',ts:null},-1,chat,false);
    history.forEach((item,index)=>drawMessage(item,index,chat,false));
    requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'auto'}));
  }

  function updateMessage(row,text,details){
    const index=Number(row.dataset.messageIndex);
    const bubble=row.querySelector('.bubble'); const meta=row.querySelector('.message-meta');
    if(bubble){bubble.innerHTML=renderAiText(text)}
    const ts=Date.now(); if(meta){meta.textContent=formatTime(ts);meta.hidden=false}
    if(Number.isInteger(index)&&index>=0&&history[index]){
      history[index]={...history[index],text,ts,details}; saveHistory();
    }
  }

  function renderLoading(row,label){
    const bubble=row.querySelector('.bubble'); if(!bubble)return;
    bubble.textContent=label;
    const dots=document.createElement('span'); dots.className='loading-dots';
    for(let i=0;i<3;i++){const s=document.createElement('span');s.textContent='.';dots.appendChild(s)}
    bubble.appendChild(dots);
  }

  function showView(name){
    const isArchive=name==='archive';
    header.hidden=isArchive;
    chatView.hidden=name!=='chat';
    searchView.hidden=name!=='search';
    archiveListView.hidden=name!=='archives';
    archiveView.hidden=!isArchive;
    if(name!=='search'&&document.activeElement===searchInput)searchInput.blur();
    window.scrollTo({top:0,behavior:'auto'});
  }

  function openCurrent(){
    searchInput.value=''; showView('chat'); restoreChat();
  }

  function excerpt(text,query,max=40){
    const src=String(text||'').replace(/\s+/g,' ').trim();
    if(!query)return src.slice(0,max);
    const lower=src.toLowerCase(), q=query.toLowerCase(); const at=lower.indexOf(q);
    if(at<0)return src.slice(0,max);
    const side=Math.max(0,Math.floor((max-q.length)/2));
    let start=Math.max(0,at-side); let out=src.slice(start,start+max);
    if(start>0)out='…'+out.slice(1); if(start+max<src.length)out=out.slice(0,-1)+'…'; return out;
  }

  function renderSearch(query){
    const q=String(query||'').trim();
    if(!q){searchResults.innerHTML='<div class="empty-state">検索ワードを入力してください。</div>';return}
    const legacy=loadHistory(LEGACY_CHAT_KEY);
    const rows=[];
    history.forEach((item,index)=>{if(item.text.toLowerCase().includes(q.toLowerCase()))rows.push({version:'現在',source:'current',index,item})});
    legacy.forEach((item,index)=>{if(item.text.toLowerCase().includes(q.toLowerCase()))rows.push({version:'v1',source:'v1',index,item})});
    rows.sort((a,b)=>(b.item.ts||0)-(a.item.ts||0));
    searchResults.innerHTML='';
    if(!rows.length){searchResults.innerHTML='<div class="empty-state">一致する会話はありません。</div>';return}
    rows.forEach(r=>{
      const btn=document.createElement('button'); btn.type='button'; btn.className='search-result';
      btn.innerHTML=`<span class="search-result-top"><span>${formatDate(r.item.ts)||'日付不明'}</span><span class="version-pill">${r.version}</span></span><span class="search-result-excerpt">${escapeHtml(excerpt(r.item.text,q,40))}</span>`;
      btn.addEventListener('click',()=>jumpToSearchResult(r)); searchResults.appendChild(btn);
    });
  }

  function jumpToSearchResult(result){
    if(result.source==='current'){
      searchInput.value=''; showView('chat'); restoreChat();
      requestAnimationFrame(()=>document.querySelector(`.message[data-message-index="${result.index}"]`)?.scrollIntoView({block:'center'}));
    }else{
      searchInput.value=''; location.href=`./archive/v1/?message=${encodeURIComponent(result.index)}`;
    }
  }

  function archiveDefinitions(){
    return [{id:'v1',label:'v1',period:'〜 2026.09',name:'前の弟子チャッピー',description:'v2へ切り替わる前の画面と、その頃の会話。'}];
  }

  function renderArchiveCards(){
    archiveCards.innerHTML='';
    archiveDefinitions().forEach(def=>{
      const card=document.createElement('button'); card.type='button'; card.className='archive-card';
      card.innerHTML=`<div><h2>${def.label}</h2><div class="period">${def.period}</div><p>${def.description}</p></div><div class="archive-thumb" aria-hidden="true"><div class="mini-head"></div><div class="mini-line"></div><div class="mini-bubble"></div><div class="mini-line"></div><div class="mini-bubble"></div></div>`;
      card.addEventListener('click',()=>{ if(def.id==='v1') location.href='./archive/v1/'; }); archiveCards.appendChild(card);
    });
  }

  function openArchive(id,jumpIndex=null){
    if(id!=='v1')return;
    const legacy=loadHistory(LEGACY_CHAT_KEY);
    archiveChat.innerHTML='';
    drawMessage({kind:'ai',text:'美砂さん、なんでも聞いてください。',ts:null},-1,archiveChat,true);
    legacy.forEach((item,index)=>drawMessage(item,index,archiveChat,true));
    showView('archive');
    if(Number.isInteger(jumpIndex))requestAnimationFrame(()=>document.querySelector(`.legacy-message[data-message-index="${jumpIndex}"]`)?.scrollIntoView({block:'center'}));
  }

  function installLongPress(row,bubble,item,index,legacy){
    if(bubble.dataset.longpress==='1')return; bubble.dataset.longpress='1';
    let timer=null,startX=0,startY=0;
    const cancel=()=>{if(timer){clearTimeout(timer);timer=null}};
    bubble.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      startX=e.clientX;startY=e.clientY;cancel();
      timer=setTimeout(()=>{timer=null;selectedMessage={row,bubble,item,index,legacy};openMessageMenu()},600);
    });
    bubble.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-startX)>10||Math.abs(e.clientY-startY)>10)cancel()});
    bubble.addEventListener('pointerup',cancel); bubble.addEventListener('pointercancel',cancel);
  }

  function openMessageMenu(){
    if(!selectedMessage)return;
    detailAction.hidden=selectedMessage.legacy||selectedMessage.item.kind!=='ai'||selectedMessage.index<0;
    messageMenuBackdrop.hidden=false;
  }
  function closeMessageMenu(){messageMenuBackdrop.hidden=true}

  async function copySelected(){
    const text=selectedMessage?.item?.text||''; if(!text)return;
    try{await navigator.clipboard.writeText(text);showToast('コピーしました')}catch(_){
      const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast('コピーしました');
    }
  }

  function wrapLines(ctx,text,maxWidth){
    const chars=[...String(text||'')]; const lines=[]; let line='';
    for(const ch of chars){
      if(ch==='\n'){lines.push(line);line='';continue}
      const test=line+ch; if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=ch}else line=test;
    }
    if(line||!lines.length)lines.push(line); return lines;
  }

  async function shareSelected(){
    const item=selectedMessage?.item; if(!item)return;
    const canvas=document.createElement('canvas'); canvas.width=1080;
    const ctx=canvas.getContext('2d'); ctx.font='34px -apple-system, BlinkMacSystemFont, sans-serif';
    const lines=wrapLines(ctx,item.text,860); canvas.height=Math.max(360,150+lines.length*54);
    ctx.fillStyle='#fbfaf7';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#111';ctx.font='700 32px -apple-system, BlinkMacSystemFont, sans-serif';ctx.fillText(item.kind==='user'?'美砂':'弟子チャッピー',90,78);
    ctx.font='34px -apple-system, BlinkMacSystemFont, sans-serif';ctx.fillStyle='#222';
    lines.forEach((line,i)=>ctx.fillText(line,90,145+i*54));
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob){showToast('画像を作れませんでした');return}
    const file=new File([blob],'deshi-chat.png',{type:'image/png'});
    if(navigator.canShare?.({files:[file]})&&navigator.share){
      try{await navigator.share({files:[file]})}catch(e){if(e?.name!=='AbortError')showToast('共有できませんでした')}
    }else showToast('この端末では共有シートを開けません');
  }

  function openDetail(){
    const item=selectedMessage?.item; if(!item)return;
    const d=item.details||{};
    detailMeta.innerHTML='';
    const pairs=[['応答時間',d.responseMs?`${d.responseMs} ms`:'—'],['Request ID',d.requestId||'—'],['モデル',d.model||model]];
    pairs.forEach(([k,v])=>{const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;detailMeta.append(dt,dd)});
    detailDiagnostic.textContent=d.testDiagnostic||'現行APIから構造化された検索・取得情報はまだ返っていません。';
    detailRequest.textContent=JSON.stringify(d.request||{},null,2);
    detailBackdrop.hidden=false;
  }

  function setModel(value){
    model=value==='terra'?'terra':'luna'; storageSet(MODEL_KEY,model);
    modelLuna.classList.toggle('active',model==='luna'); modelTerra.classList.toggle('active',model==='terra');
  }

  async function api(path,body,timeoutMs=60000){
    if(!base)throw new Error('API接続先が設定されていません。');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    let res;try{res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(body),signal:controller.signal})}finally{clearTimeout(timer)}
    let data={};try{data=await res.json()}catch(_){}
    if(!res.ok&&res.status!==202){const err=new Error(data.error||'通信に失敗しました');err.status=res.status;throw err}
    data.httpStatus=res.status;return data;
  }

  async function refreshProductionUsage(){
    if(!current)return;
    try{
      const data=await api('/api/test/admin/usage',{passphrase:current},12000);
      productionUsage={remaining:Number(data.remaining),limit:Number(data.limit)||20,used:Number(data.used)};
      productionRemaining.textContent=Number.isFinite(productionUsage.remaining)?productionUsage.remaining:'—';
      remainingInput.max=String(productionUsage.limit||20); remainingInput.value=Number.isFinite(productionUsage.remaining)?String(productionUsage.remaining):'';
    }catch(_){productionRemaining.textContent='—'}
  }

  async function saveProductionRemaining(){
    const value=clamp(Math.floor(Number(remainingInput.value)||0),0,productionUsage.limit||20);
    try{
      const data=await api('/api/test/admin/set-remaining',{passphrase:current,remaining:value},12000);
      productionUsage.remaining=Number(data.remaining);productionRemaining.textContent=String(productionUsage.remaining);remainingInput.value=String(productionUsage.remaining);showToast('本番残り回数を保存しました');
    }catch(e){showToast(e.message||'保存に失敗しました')}
  }

  function newRequestId(){return crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):`r${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`}
  function savePending(x){storageSet(PENDING_KEY,JSON.stringify(x))}
  function loadPending(){try{const x=JSON.parse(storageGet(PENDING_KEY)||'null');return x?.requestId?x:null}catch(_){return null}}
  function clearPending(){storageRemove(PENDING_KEY)}

  async function pollResult(pending,row,max=26){
    for(let i=0;i<max;i++){
      if(i)await sleep(1700);
      try{
        const data=await api('/api/test/result',{passphrase:current,requestId:pending.requestId},10000);
        if(data.state==='completed')return completeAnswer(row,pending,data);
        if(data.state==='unknown'&&i>3)return false;
        renderLoading(row,'返事を受け取り中');
      }catch(e){if(e.status===401){lock();return false}}
    }
    return false;
  }

  function completeAnswer(row,pending,data){
    const responseMs=Date.now()-pending.startedAt;
    const details={requestId:pending.requestId,responseMs,model:pending.model||model,testDiagnostic:data.testDiagnostic||pending.testDiagnostic||'',request:pending.request||{}};
    const answer=data.answer||'返事が空っぽでした'; updateMessage(row,answer,details); clearPending(); lastSync.textContent=new Date().toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); return true;
  }

  async function recoverPending(pending,row){
    if(recovering)return;recovering=true;
    try{
      let ok=await pollResult(pending,row,10); if(ok)return;
      const data=await api('/api/test/ask',{passphrase:current,question:pending.question,requestId:pending.requestId,conversation:pending.conversation,model:pending.model},60000);
      if(data.state==='completed'||data.answer)return completeAnswer(row,pending,data);
      if(data.testDiagnostic){pending.testDiagnostic=data.testDiagnostic;savePending(pending)}
      await pollResult(pending,row,18);
    }catch(_){renderLoading(row,'返事を受け取り中')}finally{recovering=false;sendButton.disabled=false}
  }

  async function submitQuestion(text){
    const requestId=newRequestId(); const conversation=buildConversationContext(); const startedAt=Date.now();
    const userIndex=addHistory('user',text,startedAt); drawMessage(history[userIndex],userIndex,chat,false);
    const aiIndex=addHistory('ai','',null,{requestId,model}); const row=drawMessage(history[aiIndex],aiIndex,chat,false); renderLoading(row,'考えちゅう');
    const pending={requestId,question:text,conversation,model,startedAt,aiIndex,request:{question:text,conversation,model}}; savePending(pending); sendButton.disabled=true;
    try{
      const data=await api('/api/test/ask',{passphrase:current,question:text,requestId,conversation,model},60000);
      if(data.state==='completed'||(data.answer&&data.httpStatus!==202)){completeAnswer(row,pending,data)}
      else{if(data.testDiagnostic){pending.testDiagnostic=data.testDiagnostic;savePending(pending)};await pollResult(pending,row,26)}
    }catch(e){
      if(e.status===401){row.remove();lock();return}
      await recoverPending(pending,row);
    }finally{sendButton.disabled=false;question.focus()}
  }

  async function resumePending(){
    const p=loadPending();if(!p||!current||recovering)return;
    const row=document.querySelector(`.message[data-message-index="${p.aiIndex}"]`); if(!row)return;
    renderLoading(row,'前の返事を取りにいってます'); sendButton.disabled=true; await recoverPending(p,row);
  }

  function lock(){current='';storageRemove(PASS_KEY);app.hidden=true;login.hidden=false;pass.value='';setTimeout(()=>pass.focus(),0)}
  async function unlock(){
    const candidate=pass.value.trim();if(!candidate)return;
    loginButton.disabled=true;loginError.textContent='';
    try{await api('/api/test/check',{passphrase:candidate},12000);current=candidate;storageSet(PASS_KEY,candidate);login.hidden=true;app.hidden=false;setModel(model);restoreChat();renderArchiveCards();refreshProductionUsage();resumePending()}
    catch(e){loginError.textContent=e.status===401?(e.message||'あいことばが違います'):'通信が不安定です。もう一度お試しください。'}
    finally{loginButton.disabled=false}
  }

  searchInput.addEventListener('input',()=>{const q=searchInput.value; if(q.trim()){showView('search');renderSearch(q)}else if(!searchView.hidden)showView('chat')});
  searchInput.addEventListener('focus',()=>{if(searchInput.value.trim()){showView('search');renderSearch(searchInput.value)}});
  titleButton.addEventListener('click',openCurrent);
  archiveButton.addEventListener('click',()=>{searchInput.value='';renderArchiveCards();showView('archives')});
  returnCurrentButton.addEventListener('click',openCurrent);
  returnCurrentFromListButton?.addEventListener('click',openCurrent);
  adminButton.addEventListener('click',()=>{refreshProductionUsage();adminBackdrop.hidden=false});
  adminClose.addEventListener('click',()=>adminBackdrop.hidden=true);
  adminBackdrop.addEventListener('click',e=>{if(e.target===adminBackdrop)adminBackdrop.hidden=true});
  modelLuna.addEventListener('click',()=>setModel('luna'));modelTerra.addEventListener('click',()=>setModel('terra'));
  remainingMinus.addEventListener('click',()=>remainingInput.value=String(clamp((Number(remainingInput.value)||0)-1,0,productionUsage.limit||20)));
  remainingPlus.addEventListener('click',()=>remainingInput.value=String(clamp((Number(remainingInput.value)||0)+1,0,productionUsage.limit||20)));
  remainingSave.addEventListener('click',saveProductionRemaining);
  clearButton.addEventListener('click',()=>{if(confirm('テスト版の会話履歴をすべて消しますか？')){history=[];saveHistory();clearPending();restoreChat();showToast('テスト会話をクリアしました')}});
  lockButton.addEventListener('click',()=>{adminBackdrop.hidden=true;lock()});

  copyAction.addEventListener('click',async()=>{closeMessageMenu();await copySelected()});
  shareAction.addEventListener('click',async()=>{closeMessageMenu();await shareSelected()});
  detailAction.addEventListener('click',()=>{closeMessageMenu();openDetail()});
  menuCancel.addEventListener('click',closeMessageMenu);
  messageMenuBackdrop.addEventListener('click',e=>{if(e.target===messageMenuBackdrop)closeMessageMenu()});
  detailClose.addEventListener('click',()=>detailBackdrop.hidden=true);
  detailBackdrop.addEventListener('click',e=>{if(e.target===detailBackdrop)detailBackdrop.hidden=true});

  form.addEventListener('submit',async e=>{e.preventDefault();const text=question.value.trim();if(!text||!current||sendButton.disabled)return;question.value='';autoGrow();await submitQuestion(text)});
  question.addEventListener('input',autoGrow);
  question.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&e.isComposing===false){e.preventDefault();form.requestSubmit()}});
  function autoGrow(){question.style.height='auto';question.style.height=Math.min(question.scrollHeight,120)+'px'}

  loginButton.addEventListener('click',unlock); pass.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();unlock()}});

  renderArchiveCards(); setModel(model);
  const saved=storageGet(PASS_KEY);
  if(saved){current=saved;pass.value=saved;login.hidden=true;app.hidden=false;restoreChat();refreshProductionUsage();resumePending()}else lock();
})();
