"""Apply narrowly scoped TEST patches to dashboard-exported sources.
Usage: python3 scripts/build-test-backend.py WORKER_SOURCE GAS_SOURCE OUTPUT_DIR
Original prompts stay local; only reusable helpers and checked patches are committed.
"""
from pathlib import Path
import sys
root=Path(__file__).resolve().parent.parent
worker=Path(sys.argv[1]).read_text();gas=Path(sys.argv[2]).read_text();out=Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
def replace(text,old,new,count=1):
    if text.count(old)!=count:raise RuntimeError('Patch anchor mismatch: '+old[:80])
    return text.replace(old,new)
worker=replace(worker,'const topLevelRoute = classifyV2TopLevelRoute(q,conversation);','''const topLevelRoute = classifyV2TopLevelRoute(q,conversation);
  if(isTest && !explicitAiSourceFilter(q) && /(?:美砂|みちゃこ|私|わたし)(?:さん)?と(?:実際に)?(?:何|なに|どんな)(?:を)?話|WhatsApp|ワッツアップ/.test(q)) topLevelRoute.name='direct_conversation';
  const temporalPlan=isTest?buildTemporalSearchPlan(q,prep.currentDateJst):null;
  let temporalRetrieval=null;
  let directEvidence=null;
  if(isTest && topLevelRoute.name==='direct_conversation') {
    directEvidence=await gas(env,{action:'getTestWhatsappEvidence',range:temporalPlan.range,latest:temporalPlan.latest,topic:temporalPlan.topic});
  }
  if(isTest && topLevelRoute.name==='ai_person' && temporalPlan.searchPlan!=='semantic') {
    temporalRetrieval=await retrieveTemporalEvidence(env,temporalPlan,detectAiSourceFilter(q,conversation),q);
  }''')
worker=replace(worker,'if (topLevelRoute.name !== "ai_person") {','if (topLevelRoute.name !== "ai_person" && !directEvidence) {')
# Preserve semantic and production blocks exactly, conditionalize only their execution.
worker=replace(worker,'  let index = null;\n  let syncError = "";\n  {','  let index = null;\n  let syncError = "";\n  if(!temporalRetrieval && !directEvidence) {')
worker=replace(worker,'  let searchError = "";\n  {','  let searchError = "";\n  if(!temporalRetrieval && !directEvidence) {')
worker=replace(worker,'  const searchPlan = buildV2ClusteredEvidencePlan(searchData,2);','''  if(temporalRetrieval) {searchData=temporalRetrieval.searchData;searchError=temporalRetrieval.searchError;}
  const searchPlan = buildV2ClusteredEvidencePlan(searchData,2);''')
worker=replace(worker,'    if (locators.length) {','    if (locators.length && !temporalRetrieval && !directEvidence) {')
worker=replace(worker,'  const temporal = detectV2TemporalRequest(q,prep.currentDateJst || "");','  const temporal = isTest ? null : detectV2TemporalRequest(q,prep.currentDateJst || "");')
worker=replace(worker,'  const mergedEvidence = mergeV2Evidence(exactEvidence,temporalEvidence);\n  const evidenceSelection = selectV2EvidenceForAnswer(mergedEvidence,q,conversation,searchPlan,temporal);\n  const selectedEvidence = evidenceSelection.bundle;\n  const evidenceText = formatV2ExactEvidence(selectedEvidence);','''  const mergedEvidence = temporalRetrieval?temporalRetrieval.bundle:mergeV2Evidence(exactEvidence,temporalEvidence);
  const bounded=temporalRetrieval?formatBoundedTemporalEvidence(temporalRetrieval.selected):null;
  const evidenceSelection = bounded?{bundle:bounded.evidence,mode:'temporal_originals'}:selectV2EvidenceForAnswer(mergedEvidence,q,conversation,searchPlan,temporal);
  const selectedEvidence = evidenceSelection.bundle;
  const directText=directEvidence?directEvidence.messages.map(m=>`[${m.date} ${m.time}] ${m.speaker}: ${m.text}`).join('\\n'):'';
  const evidenceText = directEvidence?truncate(directText,28000):bounded?bounded.text:formatV2ExactEvidence(selectedEvidence);
  const retrievalDiagnostics=isTest?buildRetrievalDiagnostics(topLevelRoute.name,temporalPlan,{
    retrieval_mode:directEvidence?'whatsapp_text_scan':temporalRetrieval?(temporalRetrieval.vectorUsed?'conversation_date_then_vector':temporalPlan.topic?'conversation_date_then_message_scan':'conversation_date'):'vector',
    candidate_conversation_ids:temporalRetrieval?temporalRetrieval.ids:[],
    vector_result_count:searchData.data.length,retrieval_skipped:Boolean(directEvidence||temporalRetrieval&&!temporalRetrieval.vectorUsed),
    rewrite_query:directEvidence?null:temporalRetrieval?(temporalRetrieval.vectorUsed?temporalPlan.topic:null):(searchData.search_query|| (index?.vectorStoreId?retrievalQuery:null)),
    diagnostics_json:{search_plan:temporalPlan.searchPlan,base_temporal_mode:temporalPlan.baseMode,
      vector_skipped:Boolean(directEvidence||temporalRetrieval&&!temporalRetrieval.vectorUsed||!index?.vectorStoreId&&!temporalRetrieval),
      message_rows_read:directEvidence?directEvidence.messageRowsRead:mergedEvidence.messages.length,
      message_refs:directEvidence?directEvidence.messages.slice(0,50).map(m=>`${m.date} ${m.time} ${m.speaker} #${m.seq}`):selectedEvidence.messages.slice(0,50).map(m=>`${m.conversationId}#${m.seq}`),
      fallback_used:Boolean(directEvidence?.fallbackUsed||temporalRetrieval&&temporalPlan.topic&&!searchData.data.length),
      evidence_truncated:directEvidence?directText.length>28000:Boolean(bounded?.truncated),
      whatsapp_candidate_count:directEvidence?.candidateCount,filename:directEvidence?.filename,
      errors:[syncError,searchError,exactError,temporalError].filter(Boolean)
    }
  }):null;''')
# Keep personality intact; append factual source/absence rules only for changed TEST retrieval.
worker=replace(worker,'  const instructions = `\nこのWebアプリ','  let instructions = `\nこのWebアプリ')
worker=replace(worker,'  timing.prompt_build = Date.now()-promptBuildStartedAt;','''  if(directEvidence) instructions += '\\n【今回の一次資料の優先ルール】今回だけは二人のWhatsApp実会話原文を直接参照してよい。上記のAI会話のみという参照制約に優先する。資料は日時・発言者ごとに読み、貼り付けられたAI分析は本人の意思と混同しない。出どころを師匠やじぇみさんに帰属させない。前後文脈を確認し、実際の発言と要約を分ける。キャラクターと口調はそのまま。';
  if(temporalRetrieval||directEvidence) instructions += '\\n【今回の原文確認ルール】CONVERSATIONS.titleは事実根拠にしない。回答は上記の日時・conversation_id・seqつき原文だけで確認する。記録の不足から「相談していない」「話していない」と断定しない。対象会話が0件なら、表現の禁止ルールより優先して「記録上、その期間の会話は確認できません。」と伝える。候補が存在するならvector結果が0件でも会話不存在と扱わない。原文が短縮されている場合は確認できた内容だけを答え、全件に話題がないと断定しない。TESTや検索方法など内部事情を本文に出さない。';
  timing.prompt_build = Date.now()-promptBuildStartedAt;''')
worker=replace(worker,'    "v2 TEST: AI会話ログ優先",','    retrievalDiagnostics ? formatRetrievalDiagnostics(retrievalDiagnostics) : "v2 TEST: AI会話ログ優先",')
worker=replace(worker,'    `retrieval_mode=${isV2ContextDependentQuestion(q) ? "contextual" : "standalone"}`,','    `contextual_mode=${isV2ContextDependentQuestion(q) ? "contextual" : "standalone"}`,')
worker=replace(worker,'        sourceRefs:isTest ? "" : String(formatV2EvidenceRefs(selectedEvidence) || "").replace(/^evidence=/,"")','''        sourceRefs:String(formatV2EvidenceRefs(selectedEvidence) || '').replace(/^evidence=/,''),
        ...(isTest?{retrievalDiagnostics,testDiagnostic:diagnosticParts.join('\\n')}:{})''')
worker=replace(worker,'    testDiagnostic:isTest ? diagnostic : undefined','    retrievalDiagnostics:isTest ? retrievalDiagnostics : undefined,\n    testDiagnostic:isTest ? diagnostic : undefined')
# Fixed-route diagnostics, caching and recovery use the same schema.
worker=replace(worker,'  let logMs = 0;','''  const retrievalDiagnostics=isTest?buildRetrievalDiagnostics(route.name,{searchPlan:'semantic',temporalMode:'none',baseMode:'none',range:null},{question_pattern:route.name,answer_mode:'fixed_route',retrieval_mode:'none',retrieval_skipped:true,diagnostics_json:{search_plan:'not_applicable',vector_skipped:true,message_rows_read:0}}):null;
  if(isTest)diagnosticParts.unshift(formatRetrievalDiagnostics(retrievalDiagnostics));
  let logMs = 0;''')
worker=replace(worker,'      sourceRefs:""\n    });','      sourceRefs:"",\n      ...(isTest?{retrievalDiagnostics,testDiagnostic:diagnosticParts.join("\\n")}:{})\n    });')
worker=replace(worker,'    testDiagnostic:isTest ? diagnosticParts.join("\\n") : undefined','    retrievalDiagnostics:isTest ? retrievalDiagnostics : undefined,\n    testDiagnostic:isTest ? diagnosticParts.join("\\n") : undefined')
worker=replace(worker,'        ageMs:Number.isFinite(result.ageMs) ? result.ageMs : undefined','        retrievalDiagnostics:result.retrievalDiagnostics,\n        testDiagnostic:result.testDiagnostic||(result.retrievalDiagnostics?formatRetrievalDiagnostics(result.retrievalDiagnostics):undefined),\n        ageMs:Number.isFinite(result.ageMs) ? result.ageMs : undefined')
worker=replace(worker,'        answer:prep.answer || "",\n        remaining:prep.remaining,','        answer:prep.answer || "",\n        retrievalDiagnostics:isTest?prep.retrievalDiagnostics:undefined,\n        testDiagnostic:isTest?(prep.testDiagnostic||(prep.retrievalDiagnostics?formatRetrievalDiagnostics(prep.retrievalDiagnostics):undefined)):undefined,\n        remaining:prep.remaining,')
worker+='\n'+(root/'backend/temporal.js').read_text()
gas=replace(gas,'      case "getTestV2Recent": return json_(getTestV2Recent_(body));','''      case "getTestV2Recent": return json_(getTestV2Recent_(body));
      case "getTestTemporalCandidates": return json_(getTestTemporalCandidates_(body));
      case "getTestTemporalMessages": return json_(getTestTemporalMessages_(body));
      case "getTestWhatsappEvidence": return json_(getTestWhatsappEvidence_(body));''')
gas=replace(gas,'function logTestAnswer_(body) {','function logTestAnswer_(body) {\n  const qaReceipt=appendTestQaDiagnostics_(body);')
gas=replace(gas,'    model:String(body.model || "")\n  }));','    model:String(body.model || ""),\n    retrievalDiagnostics:body.retrievalDiagnostics||null,\n    testDiagnostic:String(body.testDiagnostic||"").slice(0,3000)\n  }));')
gas=replace(gas,'        model:String(result.model || "")','        model:String(result.model || ""),\n        retrievalDiagnostics:result.retrievalDiagnostics||null,\n        testDiagnostic:result.testDiagnostic||""')
gas=replace(gas,'        answer:completed.answer || "",\n        model:completed.model || ""','        answer:completed.answer || "",\n        model:completed.model || "",\n        retrievalDiagnostics:completed.retrievalDiagnostics,\n        testDiagnostic:completed.testDiagnostic')
gas=replace(gas,'  props.setProperty("TESTRES_"+requestId, JSON.stringify({','  let testResult = {')
gas=replace(gas,'    testDiagnostic:String(body.testDiagnostic||"").slice(0,3000)\n  }));','    testDiagnostic:String(body.testDiagnostic||"").slice(0,3000)\n  };\n  if(Utilities.newBlob(JSON.stringify(testResult)).getBytes().length>8000) testResult={state:"completed",createdAtMs:Date.now(),persistedInQa:true};\n  props.setProperty("TESTRES_"+requestId,JSON.stringify(testResult));')
gas=replace(gas,'      const result = JSON.parse(resultRaw);','      const result = JSON.parse(resultRaw);\n      if(result.persistedInQa)return readTestQaResult_(requestId)||{ok:true,state:"unknown",requestId:requestId};')
gas=replace(gas,'  return {ok:true,state:"unknown",requestId:requestId};','  return readTestQaResult_(requestId)||{ok:true,state:"unknown",requestId:requestId};')
gas=replace(gas,'  return {ok:true};\n}\n\nfunction getTestAnswer_', '  return {ok:true,...qaReceipt};\n}\n\nfunction getTestAnswer_')
gas+='\n'+(root/'backend/temporal.gs').read_text()
scope={}
exec((root/'scripts/fix-test-backend.py').read_text(),scope)
worker=scope['fix_worker'](worker)+'\n'+(root/'backend/test-diagnostics.js').read_text()
gas=scope['fix_gas'](gas)
dedup_scope={}
exec((root/'scripts/add-response-dedup.py').read_text(),dedup_scope)
worker=dedup_scope['add_response_dedup'](worker)+'\n'+(root/'backend/response-dedup.js').read_text()
safety_scope={}
exec((root/'scripts/add-test-query-safety.py').read_text(),safety_scope)
worker=safety_scope['add_test_query_safety'](worker)+'\n'+(root/'backend/test-query-safety.js').read_text()
(out/'worker.mjs').write_text(worker);(out/'Code.gs').write_text(gas)
print('Built TEST backend sources in '+str(out))
