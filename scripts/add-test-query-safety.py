"""TEST input resolution and answer guards; retrieval implementation stays intact."""
def add_test_query_safety(worker):
    start=worker.index('async function handleV2TestAsk(')
    end=worker.index('\nfunction ',start)
    section=worker[start:end]
    def change(old,new):
        nonlocal section
        assert section.count(old)==1,old
        section=section.replace(old,new)
    change('  const topLevelRoute = classifyV2TopLevelRoute(q,conversation);', '''  const originalTestQuery=q;
  const testQueryInfo=isTest?resolveTestQuery(env,prep,q,conversation):null;
  if(isTest){
    if(testQueryInfo.unresolved)return await unresolvedTestSubjectReply({env,cors,q,prep,model,queryInfo:testQueryInfo});
    q=testQueryInfo.query;
  }
  const topLevelRoute = classifyV2TopLevelRoute(q,conversation);''')
    change('  let directEvidence=null;', '  let directEvidence=null;\n  let testEvidenceFailure="";')
    change("    directEvidence=await gas(env,{action:'getTestWhatsappEvidence',range:temporalPlan.range,latest:temporalPlan.latest,topic:temporalPlan.topic});", """    try{directEvidence=await gas(env,{action:'getTestWhatsappEvidence',range:temporalPlan.range,latest:temporalPlan.latest,topic:temporalPlan.topic});}
    catch(e){testEvidenceFailure=String(e.message||e);directEvidence={messages:[],messageRowsRead:0,candidateCount:0};}""")
    change('    temporalRetrieval=await retrieveTemporalEvidence(env,temporalPlan,detectAiSourceFilter(q,conversation),q);', '''    try{temporalRetrieval=await retrieveTemporalEvidence(env,temporalPlan,detectAiSourceFilter(q,conversation),q);}
    catch(e){testEvidenceFailure=String(e.message||e);const bundle={messages:[],conversations:[]};temporalRetrieval={bundle,selected:bundle,searchData:{data:[]},searchError:'',ids:[],vectorUsed:false};}''')
    change('  const evidenceCountRaw =', '''  if(isTest){
    Object.assign(retrievalDiagnostics.diagnostics_json,testQueryInfo.diagnostics);
    retrievalDiagnostics.diagnostics_json.vector_rewrite_query=retrievalDiagnostics.rewrite_query;
    retrievalDiagnostics.rewrite_query=testQueryInfo.query;
    if(testEvidenceFailure)retrievalDiagnostics.diagnostics_json.errors.push(testEvidenceFailure);
  }
  const evidenceCountRaw =''')
    change('  timing.prompt_build = Date.now()-promptBuildStartedAt;', '''  if(isTest) instructions += '\\n【TEST回答の根拠確認】今回の原文だけを根拠に答える。質問の主語・対象・意図が複数解釈できる、必要な発言がない、1点確認すれば答えられる場合は、必要な1点の確認質問だけを返す。推測・一般論・人物像の補完・心理解釈・長い免責説明はしない。「どう思う」「何を大切に」等、質問が広いだけでは意図の曖昧さと扱わない。誰の考えかと対象が確定し、原文に対応する本人発言があるなら、その範囲で答える。確認への同意から主体と対象を解決した質問に、同じ確認を繰り返さない。必ずJSONだけ: {"clarification_needed":boolean,"clarification_reason":"ambiguous_subject/ambiguous_intent/evidence_unavailable/insufficient_evidenceまたは空文字","clarification_question":"確認時だけ80文字以内の質問1文","answer":"確認不要時だけ今回の答え","evidence_quotes":["確認不要時は原文から4文字以上をそのまま抜いた短い根拠"]}。確認時のanswerは空文字。確認不要時も必要な事実が今回の原文にないなら答えを作らない。';
  timing.prompt_build = Date.now()-promptBuildStartedAt;''')
    change('  let finalData;', '''  const testClarificationState=isTest?testClarification(q,{evidence:evidenceText,messageCount:directEvidence?directEvidence.messages.length:selectedEvidence.messages.length,evidenceError:[exactError,temporalError,testEvidenceFailure].filter(Boolean).join('\\n')}):null;
  if(isTest)Object.assign(retrievalDiagnostics.diagnostics_json,testClarificationState);
  let finalData;''')
    change('  {\n    const generationStartedAt = Date.now();', '''  if(isTest && testClarificationState.clarification_needed){
    answer=testClarificationState.clarification_question;
    retrievalDiagnostics.answer_mode='clarification';
    markTestStage(env,'clarification_ready');
  }else{
    const generationStartedAt = Date.now();''')
    change('    answer = normalizeV2ConversationalAnswer(extractText(finalData));', '''    if(isTest){
      const grounded=acceptGroundedTestAnswer(finalData,evidenceText);
      answer=grounded.answer;
      Object.assign(retrievalDiagnostics.diagnostics_json,grounded.diagnostics);
      if(grounded.diagnostics.clarification_needed)retrievalDiagnostics.answer_mode='clarification';
    }else answer = normalizeV2ConversationalAnswer(extractText(finalData));''')
    change('  if(isTest){\n    const edited=await compareAndReduceTestAnswer', '''  if(isTest && retrievalDiagnostics.diagnostics_json.clarification_needed){
    Object.assign(retrievalDiagnostics.diagnostics_json,{conversation_relation:'new_topic',compared_history_pairs:0,previous_question:null,previous_answer_overlap:'no',overlap_mode:'none',response_dedup_applied:false,response_rewrite_applied:false,response_dedup_ms:0});
  }
  if(isTest && !retrievalDiagnostics.diagnostics_json.clarification_needed){
    const edited=await compareAndReduceTestAnswer''')
    change("    isTest?formatResponseDedup(retrievalDiagnostics.diagnostics_json):'',", "    isTest?formatTestQuerySafety(retrievalDiagnostics.diagnostics_json):'',\n    isTest?formatResponseDedup(retrievalDiagnostics.diagnostics_json):'',")
    change('        question:q,\n        answer,', '        question:isTest?originalTestQuery:q,\n        answer,')
    return worker[:start]+section+worker[end:]
