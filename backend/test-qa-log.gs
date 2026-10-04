// TEST actions use only this sheet; production logAnswer_/findLoggedAnswer_ stay on QA_LOG.
const TEST_QA_LOG_SHEET_NAME = 'TESTQA_LOG';
function testQaHeaders_(sh) {
  let header=sh.getLastColumn()?sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]:[];
  const base=['timestamp','date_jst','question','answer','model','input_tokens','output_tokens','status','session_id','source_refs'];
  const diagnostics=['route','question_pattern','answer_mode','temporal_mode','resolved_time_range','retrieval_mode','candidate_conversation_ids','vector_result_count','retrieval_skipped','rewrite_query','similar_question_refs','diagnostics_json','test_mode','request_id'];
  if(!header.some(function(k){return k;}))header=[];
  base.concat(diagnostics).forEach(function(k){if(header.indexOf(k)<0)header.push(k);});
  if(header.length>sh.getMaxColumns())sh.insertColumnsAfter(sh.getMaxColumns(),header.length-sh.getMaxColumns());
  sh.getRange(1,1,1,header.length).setValues([header]);
  return header;
}
function appendTestQaDiagnostics_(body) {
  const requestId=normalizeRequestId_(body.requestId||'');
  if(!requestId)throw new Error('TEST requestId required');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TEST_QA_LOG_SHEET_NAME);
    if(!sh)throw new Error('TESTQA_LOG missing'); // Never fall back to production.
    const header=testQaHeaders_(sh),index=headerIndexMap_(header),id='TEST_'+requestId;
    if(sh.getLastRow()>1){
      const rows=sh.getRange(2,1,sh.getLastRow()-1,header.length).getDisplayValues();
      const found=rows.findIndex(function(r){return r[index.request_id]===requestId||r[index.session_id]===id;});
      if(found>=0)return {qaLogSaved:true,qaRow:found+2,qaRequestId:id,qaLogSheet:TEST_QA_LOG_SHEET_NAME,duplicate:true};
    }
    const row=new Array(header.length).fill('');
    const fields={timestamp:new Date(),date_jst:todayJst_(),question:String(body.question||''),answer:String(body.answer||''),model:String(body.model||''),input_tokens:nullable_(body.inputTokens),output_tokens:nullable_(body.outputTokens),status:body.status||'ok',session_id:id,source_refs:body.sourceRefs||'',test_mode:true,request_id:requestId};
    Object.keys(fields).forEach(function(k){row[index[k]]=fields[k];});
    const d=body.retrievalDiagnostics||{};
    ['route','question_pattern','answer_mode','temporal_mode','resolved_time_range','retrieval_mode','candidate_conversation_ids','vector_result_count','retrieval_skipped','rewrite_query','similar_question_refs','diagnostics_json'].forEach(function(k){const v=d[k];row[index[k]]=v==null?'':typeof v==='object'?JSON.stringify(v):v;});
    sh.appendRow(row);SpreadsheetApp.flush();
    const savedRow=sh.getLastRow();
    if(String(sh.getRange(savedRow,index.request_id+1).getValue())!==requestId)throw new Error('TESTQA_LOG write verification failed');
    return {qaLogSaved:true,qaRow:savedRow,qaRequestId:id,qaLogSheet:TEST_QA_LOG_SHEET_NAME};
  }finally{lock.releaseLock();}
}
function readTestQaResult_(requestId) {
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TEST_QA_LOG_SHEET_NAME);
  if(!sh||sh.getLastRow()<2)return null;
  const rows=sh.getDataRange().getDisplayValues(),ix=headerIndexMap_(rows[0]);
  for(let i=rows.length-1;i>0;i--){
    const row=rows[i];if(row[ix.request_id]!==requestId&&row[ix.session_id]!=='TEST_'+requestId)continue;
    const d={};['route','question_pattern','answer_mode','temporal_mode','resolved_time_range','retrieval_mode','candidate_conversation_ids','vector_result_count','retrieval_skipped','rewrite_query','similar_question_refs','diagnostics_json'].forEach(function(k){
      const v=ix[k]==null?'':row[ix[k]];
      if(['resolved_time_range','candidate_conversation_ids','similar_question_refs','diagnostics_json'].indexOf(k)>=0){try{d[k]=v?JSON.parse(v):null;}catch(_){d[k]=null;}}
      else d[k]=k==='vector_result_count'?Number(v||0):k==='retrieval_skipped'?String(v).toLowerCase()==='true':v||null;
    });
    return {ok:true,state:'completed',requestId:requestId,answer:row[ix.answer],model:row[ix.model],retrievalDiagnostics:d};
  }
  return null;
}
