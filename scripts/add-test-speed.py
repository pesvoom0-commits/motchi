"""TEST-only admission, original locators and presentation. Production statements retained."""
def add_test_speed(worker,gas,root):
    start=worker.index('async function handleV2TestAsk(');end=worker.index('\nfunction ',start)
    s=worker[start:end]
    def change(old,new):
        nonlocal s
        assert s.count(old)==1,old
        s=s.replace(old,new)
    change('  let temporalRetrieval=null;', '  let temporalRetrieval=null;\n  let anchorFirst=null;')
    change("  if(isTest && topLevelRoute.name==='ai_person' && temporalPlan.searchPlan!=='semantic') {", """  if(isTest && topLevelRoute.name==='ai_person' && contextAnchor.diagnostics.context_anchor_found){
    const started=Date.now();
    try{
      anchorFirst=await retrieveTestAnchorFirst(env,temporalPlan,detectAiSourceFilter(q,conversation),contextAnchor.diagnostics);
      if(anchorFirst.found){const bundle=anchorFirst.bundle;temporalRetrieval={bundle,selected:bundle,searchData:{data:[]},searchError:'',ids:bundle.conversations.map(c=>c.conversationId),vectorUsed:false};}
    }catch(e){testEvidenceFailure=String(e.message||e);const bundle={messages:[],conversations:[]};temporalRetrieval={bundle,selected:bundle,searchData:{data:[]},searchError:'',ids:[],vectorUsed:false};}
    timing.temporal_evidence=Date.now()-started;
  }
  if(isTest && !temporalRetrieval && topLevelRoute.name==='ai_person' && temporalPlan.searchPlan!=='semantic') {""")
    change('    timing.temporal_evidence=Date.now()-temporalStarted;', '    timing.temporal_evidence+=Date.now()-temporalStarted;')
    change('    let anchorBundle=temporalRetrieval?.bundle||exactEvidence;', '    let anchorBundle=temporalRetrieval?.bundle||exactEvidence;')
    change('  const promptBuildStartedAt = Date.now();', "  if(isTest && anchorFirst?.found)anchorEvidence={bundle:anchorFirst.bundle,hits:anchorFirst.hits,diagnostics:anchorFirst.diagnostics};\n  const promptBuildStartedAt = Date.now();")
    change("retrieval_mode:directEvidence?'whatsapp_text_scan':temporalRetrieval?", "retrieval_mode:anchorFirst?.found?'anchor_original_scan':directEvidence?'whatsapp_text_scan':temporalRetrieval?")
    change('message_rows_read:directEvidence?directEvidence.messageRowsRead:mergedEvidence.messages.length,', 'message_rows_read:anchorFirst?.found?anchorFirst.diagnostics.message_rows_read:directEvidence?directEvidence.messageRowsRead:mergedEvidence.messages.length,')
    change('testQueryInfo.diagnostics,contextAnchor.diagnostics,anchorEvidence?.diagnostics||{});', "testQueryInfo.diagnostics,contextAnchor.diagnostics,anchorEvidence?.diagnostics||{},anchorFirst&&!anchorFirst.found?{...anchorFirst.diagnostics,anchor_retrieval_strategy:'normal_fallback'}:{});")
    change("compareAndReduceTestAnswer(env,{question:preAnchorQuery,answer,evidence:evidenceText,conversation,model,route:topLevelRoute.name,plan:temporalPlan})", "compareAndReduceTestAnswer(env,{question:preAnchorQuery,answer,evidence:evidenceText,conversation,model,route:topLevelRoute.name,plan:temporalPlan,answerMode:retrievalDiagnostics.answer_mode,anchor:contextAnchor.diagnostics})")
    change('  const totalBeforeLog = requestStartedAt', """  if(isTest){
    const d=retrievalDiagnostics.diagnostics_json;
    if(d.dedup_comparison_skipped==null)Object.assign(d,{dedup_precheck:'skip',dedup_comparison_skipped:true,dedup_skip_reason:retrievalDiagnostics.answer_mode,response_dedup_ms:0});
    const presented=presentTestViewerAnswer(answer,testViewerIdentity(env,prep),originalTestQuery);
    answer=presented.answer;Object.assign(d,presented.diagnostics);
  }
  const totalBeforeLog = requestStartedAt""")
    change("    isTest?formatTestQuerySafety(retrievalDiagnostics.diagnostics_json):'',", "    isTest?formatTestQuerySafety(retrievalDiagnostics.diagnostics_json):'',\n    isTest?formatTestSpeed(retrievalDiagnostics.diagnostics_json):'',")
    change("evidenceError:[exactError,temporalError,testEvidenceFailure,!evidenceText.trim()?searchError:''].filter(Boolean)", "evidenceError:[exactError,temporalError,testEvidenceFailure,!evidenceText.trim()?[syncError,searchError].filter(Boolean).join('; '):''].filter(Boolean)")
    change('test_log:null,before_log:totalBeforeLog', 'test_log:null,before_log:totalBeforeLog,exact_messages:directEvidence?directEvidence.messages.length:evidenceCount,response_comparison:retrievalDiagnostics.diagnostics_json.response_dedup_ms||0')
    worker=worker[:start]+s+worker[end:]
    # Shared fixed route changes are all guarded; false returns the original answer/payload.
    worker=worker.replace('  const answer = normalizeV2ConversationalAnswer(isTest && route.currentDateTimeAnswer || buildV2FixedRouteAnswer(route,q,conversation));', "  let answer = normalizeV2ConversationalAnswer(isTest && route.currentDateTimeAnswer || buildV2FixedRouteAnswer(route,q,conversation));\n  const presented=isTest?presentTestViewerAnswer(answer,testViewerIdentity(env,prep),q):null;\n  if(isTest)answer=presented.answer;")
    worker=worker.replace('  if(isTest)diagnosticParts.unshift(formatRetrievalDiagnostics(retrievalDiagnostics));', "  if(isTest){Object.assign(retrievalDiagnostics.diagnostics_json,presented.diagnostics,{dedup_precheck:'skip',dedup_comparison_skipped:true,dedup_skip_reason:'fixed_route',response_dedup_ms:0});diagnosticParts.unshift(formatRetrievalDiagnostics(retrievalDiagnostics),formatTestSpeed(retrievalDiagnostics.diagnostics_json));}")
    # Both short clarification helpers are TEST-only.
    for name in ['unresolvedTestSubjectReply','ambiguousTestContextReply']:
        a=worker.index('async function '+name+'(');b=worker.find('\n}',a)+2
        part=worker[a:b]
        answer='clarification.clarification_question' if name=='unresolvedTestSubjectReply' else 'ask'
        part=part.replace("  const testDiagnostic=formatRetrievalDiagnostics(d)", "  const presented=presentTestViewerAnswer("+answer+",testViewerIdentity(env,prep),q);\n  Object.assign(d.diagnostics_json,presented.diagnostics,{dedup_precheck:'skip',dedup_comparison_skipped:true,dedup_skip_reason:'clarification',response_dedup_ms:0});\n  d.diagnostics_json.clarification_question=presented.answer;\n  const testDiagnostic=formatTestSpeed(d.diagnostics_json)+'\\n'+formatRetrievalDiagnostics(d)")
        part=part.replace('answer:'+answer, 'answer:presented.answer')
        worker=worker[:a]+part+worker[b:]
    # Display-only compatibility for confirmation of the pre-existing short question.
    worker=worker.replace("last.answer==='洋輔さんから見た美砂さんのこと？'", "['洋輔さんから見た美砂さんのこと？','洋輔さんから見たあなたのこと？'].includes(last.answer)")
    worker=worker.replace('result.query=`${scope}「${anchor}」について、${question}`;', 'result.query=normalizeTestAnchorQuery(question,anchor,scopes);')
    worker=worker.replace('conversation,model,route,plan}){', 'conversation,model,route,plan,answerMode,anchor}){')
    worker=worker.replace('  if(!pairs.length)return {answer,diagnostics,usage:null};', "  const precheck=testDedupPrecheck({question,answer,evidence,conversation,route,plan,answerMode,anchor});\n  Object.assign(diagnostics,precheck);\n  if(precheck.dedup_comparison_skipped)return {answer,diagnostics,usage:null};")
    worker+='\n'+(root/'backend/test-speed.js').read_text()
    anchor='      case "getTestTemporalCandidates": return json_(getTestTemporalCandidates_(body));'
    assert gas.count(anchor)==1
    gas=gas.replace(anchor,anchor+'\n      case "getTestAnchorEvidence": return json_(getTestAnchorEvidence_(body));')
    gas+='\n'+(root/'backend/test-anchor-fetch.gs').read_text()
    clip=(root/'backend/test-answer-scope.js').read_text().split('function selectTestAnchorEvidence(')[1]
    gas+='\nfunction scopeTestAnchorOriginals_('+clip
    return worker,gas
