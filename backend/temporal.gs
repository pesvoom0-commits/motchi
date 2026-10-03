// Additive TEST actions; no production usage mutation or historical backfill.
function getTestTemporalCandidates_(body) {
  const sh=SpreadsheetApp.openById(AI_LOG_SPREADSHEET_ID).getSheetByName(AI_LOG_CONVERSATIONS_SHEET_NAME);
  const rows=sh.getDataRange().getDisplayValues(),ix=headerIndexMap_(rows[0]||[]);
  ['conversation_id','conversation_date','source_ai','title'].forEach(function(k){if(ix[k]==null)throw new Error('CONVERSATIONS header missing: '+k);});
  const range=body.range,source=String(body.sourceAi||'');
  let conversations=rows.slice(1).map(function(row,i){
    const match=String(row[ix.conversation_date]||'').match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
    return {conversationId:String(row[ix.conversation_id]||''),conversationDate:match?match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0'):'',sourceAi:String(row[ix.source_ai]||''),title:String(row[ix.title]||''),rowIndex:i};
  }).filter(function(c){return c.conversationId&&c.conversationDate&&(!source||source===c.sourceAi)&&(!range||(c.conversationDate>=range.from&&c.conversationDate<=range.to));});
  conversations.sort(function(a,b){return b.conversationDate.localeCompare(a.conversationDate)||b.rowIndex-a.rowIndex;});
  if(body.latest)conversations=conversations.slice(0,1);
  return {ok:true,conversations:conversations};
}
function getTestTemporalMessages_(body) {
  const data=readAiLogTables_(),ids=Array.isArray(body.conversationIds)?body.conversationIds:[];
  const conversations=[],messages=[];
  ids.forEach(function(id){
    const c=data.conversationById[id];if(!c||(body.sourceAi&&c.sourceAi!==body.sourceAi))return;
    conversations.push(c);(data.messagesByConversation[id]||[]).forEach(function(m){messages.push(m);});
  });
  return {ok:true,conversations:conversations,messages:messages};
}
function getTestWhatsappEvidence_(body) {
  const file=DriveApp.getFileById(WHATSAPP_FILE_ID);
  const raw=file.getBlob().getDataAsString('UTF-8');
  const header=/[\u200e\u200f\u202a-\u202e]*\[(20\d{2})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s+([^:\n]+):\s*/g;
  const hits=[];let match;while((match=header.exec(raw))!==null)hits.push({start:match.index,end:header.lastIndex,date:match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0'),time:match[4].padStart(2,'0')+':'+match[5]+':'+(match[6]||'00'),speaker:match[7]});
  if(!hits.length&&raw.trim())throw new Error('WhatsApp日時・発言者の形式を認識できません');
  const rows=hits.map(function(h,i){return {seq:i+1,date:h.date,time:h.time,speaker:h.speaker,text:raw.slice(h.end,i+1<hits.length?hits[i+1].start:raw.length).trim()};});
  const range=body.range;
  let candidates=rows.filter(function(m){return !range||(m.date>=range.from&&m.date<=range.to);});
  if(body.latest&&candidates.length){const date=candidates[candidates.length-1].date;candidates=candidates.filter(function(m){return m.date===date;});}
  const topic=String(body.topic||'').replace(/美砂(?:さん)?|みちゃこ|洋輔(?:さん)?|岡本洋輔|私たち|二人|ふたり/g,'').trim();
  const terms=topic.split(/\s+/).filter(Boolean);
  const matched=terms.length?candidates.filter(function(m){return terms.some(function(t){return m.text.indexOf(t)>=0||m.speaker.indexOf(t)>=0;});}):candidates;
  const keep={};matched.forEach(function(m){for(let i=Math.max(0,m.seq-3);i<=Math.min(rows.length-1,m.seq+1);i++)keep[i]=true;});
  // When lexical matching misses a topic, inspect period originals instead of declaring absence.
  if(!matched.length&&candidates.length)candidates.forEach(function(m){keep[m.seq-1]=true;});
  const messages=Object.keys(keep).map(Number).sort(function(a,b){return a-b;}).map(function(i){return rows[i];});
  return {ok:true,messages:messages,messageRowsRead:candidates.length,candidateCount:candidates.length,fallbackUsed:terms.length>0&&!matched.length,filename:file.getName()};
}
function appendTestQaDiagnostics_(body) {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('QA_LOG');
    if(!sh)throw new Error('QA_LOG missing');
    const keys=['route','question_pattern','answer_mode','temporal_mode','resolved_time_range','retrieval_mode','candidate_conversation_ids','vector_result_count','retrieval_skipped','rewrite_query','similar_question_refs','diagnostics_json'];
    let header=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    keys.concat(['test_mode']).forEach(function(k){if(header.indexOf(k)<0)header.push(k);});
    if(header.length>sh.getMaxColumns())sh.insertColumnsAfter(sh.getMaxColumns(),header.length-sh.getMaxColumns());
    sh.getRange(1,1,1,header.length).setValues([header]);
    const id='TEST_'+normalizeRequestId_(body.requestId),index=headerIndexMap_(header);
    // Idempotent retries; existing production and historical TEST rows are left untouched.
    if(sh.getLastRow()>1&&sh.getRange(2,9,sh.getLastRow()-1,1).getDisplayValues().some(function(r){return r[0]===id;}))return;
    const row=new Array(header.length).fill('');
    [new Date(),todayJst_(),String(body.question||''),String(body.answer||''),String(body.model||''),nullable_(body.inputTokens),nullable_(body.outputTokens),body.status||'ok',id,body.sourceRefs||''].forEach(function(v,i){row[i]=v;});
    const d=body.retrievalDiagnostics||{};
    keys.forEach(function(k){const v=d[k];row[index[k]]=v==null?'':typeof v==='object'?JSON.stringify(v):v;});
    row[index.test_mode]=true;sh.appendRow(row);
  }finally{lock.releaseLock();}
}

function readTestQaResult_(requestId) {
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('QA_LOG');
  if(!sh||sh.getLastRow()<2)return null;
  const rows=sh.getDataRange().getDisplayValues(),ix=headerIndexMap_(rows[0]);
  for(let i=rows.length-1;i>0;i--){
    const row=rows[i];if(row[8]!=='TEST_'+requestId)continue;
    const d={};['route','question_pattern','answer_mode','temporal_mode','resolved_time_range','retrieval_mode','candidate_conversation_ids','vector_result_count','retrieval_skipped','rewrite_query','similar_question_refs','diagnostics_json'].forEach(function(k){
      const v=ix[k]==null?'':row[ix[k]];
      if(['resolved_time_range','candidate_conversation_ids','similar_question_refs','diagnostics_json'].indexOf(k)>=0){try{d[k]=v?JSON.parse(v):null;}catch(_){d[k]=null;}}
      else d[k]=k==='vector_result_count'?Number(v||0):k==='retrieval_skipped'?String(v).toLowerCase()==='true':v||null;
    });
    return {ok:true,state:'completed',requestId:requestId,answer:row[3],model:row[4],retrievalDiagnostics:d};
  }
  return null;
}
