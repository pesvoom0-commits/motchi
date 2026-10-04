"""Apply current-clock and anchor boundaries only to TEST answer handling."""
def add_test_answer_scope(worker):
    start=worker.index('async function handleV2TestAsk(')
    end=worker.index('\nfunction ',start)
    s=worker[start:end]
    def change(old,new):
        nonlocal s
        assert s.count(old)==1,old
        s=s.replace(old,new)
    change('  const originalTestQuery=q;', '''  const clockAnswer=isTest?testCurrentDateTimeAnswer(q):'';
  if(clockAnswer)return await completeV2FixedRoute({env,cors,q,conversation,prep,model,route:{name:'app_meta',reason:'current_date_time',currentDateTimeAnswer:clockAnswer},requestStartedAt,prepMs,isTest});
  const originalTestQuery=q;''')
    change('  const promptBuildStartedAt = Date.now();', '''  let anchorEvidence=null;
  if(isTest && contextAnchor.diagnostics.context_anchor_found){
    let anchorBundle=temporalRetrieval?.bundle||exactEvidence;
    if(!temporalRetrieval && !directEvidence && locators.length){
      try{anchorBundle=await gas(env,{action:'getTestTemporalMessages',conversationIds:[...new Set(locators.map(x=>x.conversationId))].slice(0,10),sourceAi:sourceAi||''});}
      catch(e){testEvidenceFailure=String(e.message||e);anchorBundle={messages:[],conversations:[]};}
    }
    if(directEvidence){
      const rows=directEvidence.messages.map(m=>({...m,conversationId:m.conversationId||m.date}));
      const selected=selectTestAnchorEvidence({messages:rows},contextAnchor);
      directEvidence={...directEvidence,messages:selected.bundle.messages};
      anchorEvidence=selected;
    }else anchorEvidence=selectTestAnchorEvidence(anchorBundle,contextAnchor);
  }
  const promptBuildStartedAt = Date.now();''')
    change("isTest && (!isV2ContextDependentQuestion(preAnchorQuery)||contextSelection.mode==='standalone')?[]:conversation", "isTest && (contextAnchor.diagnostics.context_anchor_found||!isV2ContextDependentQuestion(preAnchorQuery)||contextSelection.mode==='standalone')?[]:conversation")
    change('  const bounded=temporalRetrieval?formatBoundedTemporalEvidence(temporalRetrieval.selected):null;', '  const bounded=anchorEvidence&&!directEvidence?formatBoundedTemporalEvidence(anchorEvidence.bundle):temporalRetrieval?formatBoundedTemporalEvidence(temporalRetrieval.selected):null;')
    change('testQueryInfo.diagnostics,contextAnchor.diagnostics);','testQueryInfo.diagnostics,contextAnchor.diagnostics,anchorEvidence?.diagnostics||{});')
    change('formatTestContextAnchor(contextAnchor.diagnostics)', 'formatTestContextAnchor(retrievalDiagnostics.diagnostics_json)')
    change("evidenceError:[exactError,temporalError,testEvidenceFailure].filter(Boolean).join('\\n')", "evidenceError:[exactError,temporalError,testEvidenceFailure,!evidenceText.trim()?searchError:''].filter(Boolean).join('\\n')")
    change('  if(isTest && testClarificationState.clarification_needed){', '  if(isTest && testClarificationState.answer_override){')
    change("    answer=testClarificationState.clarification_question;\n    retrievalDiagnostics.answer_mode='clarification';", "    answer=testClarificationState.answer_override;\n    retrievalDiagnostics.answer_mode=testClarificationState.answer_mode;")
    change('  if(isTest && retrievalDiagnostics.diagnostics_json.clarification_needed){','  if(isTest && (retrievalDiagnostics.diagnostics_json.clarification_needed||retrievalDiagnostics.diagnostics_json.answer_override)){')
    change('  if(isTest && !retrievalDiagnostics.diagnostics_json.clarification_needed){','  if(isTest && !retrievalDiagnostics.diagnostics_json.clarification_needed && !retrievalDiagnostics.diagnostics_json.answer_override){')
    change('  timing.prompt_build = Date.now()-promptBuildStartedAt;', '''  if(isTest && anchorEvidence)instructions += '\\n【anchor範囲】回答対象は「'+anchorEvidence.diagnostics.anchor_evidence_term+'」そのもの。一致原文と同conversationの前後seqだけを提示した。前後の別話題を事実として混ぜない。意味が近い業務用語、後半の発表、別イベントを補足しない。今回の語句が実際に使われた箇所の意味・やり取りだけを説明し、必要な情報がないなら記録内で確認できないと短く答える。直前アシスタント回答は事実ソースにしない。';
  timing.prompt_build = Date.now()-promptBuildStartedAt;''')
    change("      if(grounded.diagnostics.clarification_needed)retrievalDiagnostics.answer_mode='clarification';", "      if(grounded.diagnostics.clarification_needed)retrievalDiagnostics.answer_mode='clarification';\n      else if(grounded.diagnostics.answer_mode)retrievalDiagnostics.answer_mode=grounded.diagnostics.answer_mode;")
    change('acceptGroundedTestAnswer(finalData,evidenceText)', 'acceptGroundedTestAnswer(finalData,evidenceText,anchorEvidence?.hits||[],q)')
    change('ambiguous_subject/ambiguous_intent/evidence_unavailable/insufficient_evidence', 'ambiguous_subject/ambiguous_intent/insufficient_evidence')
    change('  const testClarificationState=isTest?', '''  if(isTest)instructions += '\\n【確認の目的】原文取得失敗について、取得してよいかの許可や意味のない確認を聞かない。原文は取れたが答えがない場合、欠けている日時・人物・話題の1点が分かれば探せるときだけ不足条件を聞く。その場合はJSONにclarification_conditionをtime/person/topicのいずれかで追加する。既に指定済みの条件や「会話を取り直していい？」は聞かない。1点で探せない場合は、記録から分からないと短く答え、clarification_needed=falseにする。';
  const testClarificationState=isTest?''')
    worker=worker[:start]+s+worker[end:]
    old='const answer = normalizeV2ConversationalAnswer(buildV2FixedRouteAnswer(route,q,conversation));'
    assert worker.count(old)==1
    return worker.replace(old,"const answer = normalizeV2ConversationalAnswer(isTest && route.currentDateTimeAnswer || buildV2FixedRouteAnswer(route,q,conversation));")
