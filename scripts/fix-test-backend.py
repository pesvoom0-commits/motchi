"""Apply 2.2.013 TEST correction 1 after the initial checked patch."""
def fix_worker(worker):
    def sub(a,b,n=1):
        nonlocal worker
        if worker.count(a)!=n: raise RuntimeError('Correction anchor mismatch: '+a[:90])
        worker=worker.replace(a,b)
    # Catch preparation/result failures too, keeping CORS and a JSON body on TEST paths.
    sub('  async fetch(request, env) {','''  async fetch(request, env) {
    if(!new URL(request.url).pathname.startsWith('/api/test/')) return this.handle(request,env);
    const trace={startedAt:Date.now(),stage:'request_received',events:[{stage:'request_received',ms:0}]};
    const testEnv={...env,__testTrace:trace};
    try {return await this.handle(request,testEnv);} catch(e) {
      const origin=request.headers.get('Origin')||'';
      const allowed=env.ALLOWED_ORIGIN||'https://pesvoom0-commits.github.io';
      return J({error:'TEST処理に失敗しました',stage:e.testStage||trace.stage,detail:String(e.message||e),testDiagnostic:formatTestTrace(trace),transport:e.transport||null},502,{'Access-Control-Allow-Origin':origin===allowed?origin:allowed,'Vary':'Origin'});
    }
  },
  async handle(request, env) {''')
    sub('    const prep = await gas(env,{','    markTestStage(env,"prepare");\n    const prep = await gas(env,{')
    sub('  const temporalPlan=isTest?buildTemporalSearchPlan(q,prep.currentDateJst):null;','''  markTestStage(env,'date_resolution');
  const temporalPlan=isTest?buildTemporalSearchPlan(q,prep.currentDateJst):null;
  if(isTest && topLevelRoute.name==='ai_person') capPastConversationRange(temporalPlan,q,prep.currentDateJst);
  markTestStage(env,'date_resolved');
  const contextSelection=selectV2ContextMessages(q,conversation);
  const modelConversation=isTest && (!isV2ContextDependentQuestion(q)||contextSelection.mode==='standalone')?[]:conversation;''')
    sub('    directEvidence=await gas(env,','    markTestStage(env,"whatsapp_fetch");\n    directEvidence=await gas(env,')
    sub('    temporalRetrieval=await retrieveTemporalEvidence(env,temporalPlan,detectAiSourceFilter(q,conversation),q);','''    const temporalStarted=Date.now();
    temporalRetrieval=await retrieveTemporalEvidence(env,temporalPlan,detectAiSourceFilter(q,conversation),q);
    timing.temporal_evidence=Date.now()-temporalStarted;''')
    sub('    timing.temporal_evidence = Date.now()-startedAt;','    if(!temporalRetrieval)timing.temporal_evidence = Date.now()-startedAt;')
    # Only the TEST generation prompt is reduced; contextual retrieval stays unchanged.
    marker='【このチャットでの直近のやりとり】\n${formatConversation(conversation)}'
    sub(marker,'【このチャットでの直近のやりとり】\n${formatConversation(isTest?modelConversation:conversation)}')
    sub("      whatsapp_candidate_count:directEvidence?.candidateCount,filename:directEvidence?.filename,","      ui_conversation_messages:conversation.length,model_conversation_messages:modelConversation.length,\n      stages:env.__testTrace?.events||[],gas_responses:env.__testTrace?.gasResponses||[],\n      whatsapp_candidate_count:directEvidence?.candidateCount,filename:directEvidence?.filename,")
    sub('  timing.prompt_build = Date.now()-promptBuildStartedAt;','  timing.prompt_build = Date.now()-promptBuildStartedAt;\n  markTestStage(env,"prompt_built");')
    sub('      finalData = await openaiJson(env,"/responses",{','      markTestStage(env,"answer_generation");\n      finalData = await openaiJson(env,"/responses",{',2)
    sub('    answer = normalizeV2ConversationalAnswer(extractText(finalData));','    markTestStage(env,"model_response_received");\n    answer = normalizeV2ConversationalAnswer(extractText(finalData));')
    sub('  let logError = "";\n  {','''  if(isTest)retrievalDiagnostics.diagnostics_json.timings={...timing,test_log:null,before_log:totalBeforeLog};
  let logError = "";
  markTestStage(env,'qa_log_save');
  {''')
    sub('      // TEST may surface an answer even if diagnostic logging failed.','''      if(isTest){e.testStage='qa_log_save';throw e;}
      // TEST may surface an answer even if diagnostic logging failed.''')
    sub('  diagnosticParts.push(`timing_test_log_ms=${timing.test_log}`);','''  markTestStage(env,'qa_log_saved');
  markTestStage(env,'http_response_returned');
  if(isTest){
    retrievalDiagnostics.diagnostics_json.timings.test_log=timing.test_log;
    retrievalDiagnostics.diagnostics_json.timings.total_backend=Date.now()-requestStartedAt;
    diagnosticParts.push(formatTestTrace(env.__testTrace));
    diagnosticParts.push(`ui_conversation_messages=${conversation.length}`,`model_conversation_messages=${modelConversation.length}`,'qa_log_saved=yes');
  }
  diagnosticParts.push(`timing_test_log_ms=${timing.test_log}`);''')
    sub('        stage:String(e?.testStage||"v2_unknown")','''        stage:String(e?.testStage||env.__testTrace?.stage||"v2_unknown"),
        ...(isTest?{testDiagnostic:formatTestTrace(env.__testTrace),transport:e.transport||null}:{})''')
    sub('    diagnosticParts.push(`log_error=${truncate(String(e?.message || e),240)}`);',"    if(isTest){e.testStage='qa_log_save';throw e;}\n    diagnosticParts.push(`log_error=${truncate(String(e?.message || e),240)}`);")
    # TEST calls: bounded HTTP, explicit Apps Script content redirect and actionable error metadata.
    sub('  const r = await fetch(env.GAS_ENDPOINT,{','  if(env.__testTrace)return await testGasRequest(env,payload);\n  const r = await fetch(env.GAS_ENDPOINT,{')
    sub('  const candidates=await gas(env,','  markTestStage(env,"conversation_fetch");\n  const candidates=await gas(env,')
    sub('  const ids=candidates.conversations.map(c=>c.conversationId);','  markTestStage(env,"conversation_candidates_fetched");\n  const ids=candidates.conversations.map(c=>c.conversationId);')
    sub('  const bundle=ids.length?await gas(env,','  markTestStage(env,"message_fetch");\n  const bundle=ids.length?await gas(env,')
    sub("  let searchData={data:[]},vectorUsed=false,searchError='';","  markTestStage(env,'messages_fetched');\n  let searchData={data:[]},vectorUsed=false,searchError='';")
    return worker

def fix_gas(gas):
    start=gas.index('function prepareTestAsk_(')
    end=gas.index('\nfunction logTestAnswer_',start)
    part=gas[start:end]
    part=part.replace('  const lock = LockService.getScriptLock();\n  lock.waitLock(10000);\n\n  try {\n    cleanupOldTestRequests_();\n\n    const requestId = normalizeRequestId_(clientRequestId) || Utilities.getUuid();\n    const props = PropertiesService.getScriptProperties();', '  const requestId = normalizeRequestId_(clientRequestId) || Utilities.getUuid();\n  const props = PropertiesService.getScriptProperties();')
    anchor="    // If the same request is still running, don't start a duplicate immediately."
    part=part.replace(anchor,'  const lock = LockService.getScriptLock();\n  lock.waitLock(10000);\n  try {\n    cleanupOldTestRequests_();\n\n'+anchor)
    split=part.index('    const prompt = buildTestV2PromptBundle_();')
    part=part[:split]+'''  } finally {
    lock.releaseLock();
  }

  // Document reads must not hold the shared lock used by request and QA writes.
  const prompt = buildTestV2PromptBundle_();
  return {
    ok:true, allowed:true, testMode:true, requestId:requestId,
    currentDateJst:prompt.currentDateJst, context:prompt.context,
    aiRules:prompt.aiRules, character:prompt.character, misaProfile:prompt.misaProfile
  };
}
'''
    if part.count('lock.releaseLock()')!=1 or part.index('lock.releaseLock()')>part.index('buildTestV2PromptBundle_()'):
        raise RuntimeError('TEST lock scope correction failed')
    return gas[:start]+part+gas[end:]
