"""Add TEST-only pre-retrieval context resolution after the existing safety patch."""
def add_context_anchor(worker):
    start=worker.index('async function handleV2TestAsk(')
    end=worker.index('\nfunction ',start)
    s=worker[start:end]
    def change(old,new):
        nonlocal s
        assert s.count(old)==1,old
        s=s.replace(old,new)
    change('  const topLevelRoute = classifyV2TopLevelRoute(q,conversation);', '''  const preAnchorQuery=q;
  const contextAnchor=isTest?resolveTestContextAnchor(q,conversation):null;
  if(isTest){
    if(contextAnchor.clarificationQuestion)return await ambiguousTestContextReply({env,cors,q:originalTestQuery,prep,model,queryInfo:testQueryInfo,anchor:contextAnchor});
    q=contextAnchor.query;
  }
  const topLevelRoute = classifyV2TopLevelRoute(q,conversation);''')
    change('  const contextSelection=selectV2ContextMessages(q,conversation);','  const contextSelection=selectV2ContextMessages(preAnchorQuery,conversation);')
    change('!isV2ContextDependentQuestion(q)||contextSelection.mode', '!isV2ContextDependentQuestion(preAnchorQuery)||contextSelection.mode')
    change('Object.assign(retrievalDiagnostics.diagnostics_json,testQueryInfo.diagnostics);','Object.assign(retrievalDiagnostics.diagnostics_json,testQueryInfo.diagnostics,contextAnchor.diagnostics);')
    change('retrievalDiagnostics.rewrite_query=testQueryInfo.query;','retrievalDiagnostics.rewrite_query=contextAnchor.query;')
    change('compareAndReduceTestAnswer(env,{question:q,','compareAndReduceTestAnswer(env,{question:preAnchorQuery,')
    change('    `contextual_mode=${isV2ContextDependentQuestion(q) ? "contextual" : "standalone"}`,\n    `context_strategy=${selectV2ContextMessages(q,conversation).mode}`,\n    `context_anchor_found=${selectV2ContextMessages(q,conversation).anchorFound ? "yes" : "no"}`,','    isTest?formatTestContextAnchor(contextAnchor.diagnostics):`contextual_mode=${isV2ContextDependentQuestion(q) ? "contextual" : "standalone"}`,')
    return worker[:start]+s+worker[end:]
