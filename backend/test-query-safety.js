// TEST input/answer boundary only. Identity comes from authenticated server data.
function resolveTestQuery(env,prep,question,conversation=[]){
  let name='',source='unavailable';
  for(const [candidate,origin] of [[prep?.authenticatedUser?.name,'authenticated_user'],[prep?.session?.user?.name,'session'],[env.TEST_SESSION_USER_NAME,'test_session_profile']]){
    if(typeof candidate==='string'&&candidate.trim()&&candidate.length<=80){name=candidate.trim();source=origin;break;}
  }
  let query=question,clarificationContextResolved=false;
  const last=recentComparisonPairs(conversation).at(-1);
  if(last&&/^(うん|はい|そう|そうです|そうだよ|お願い|よろしく|それで)[。！!\s]*$/.test(query)){
    if(last.answer==='洋輔さんから見た美砂さんのこと？'){query='洋輔さん本人は、美砂さんのことをどう思っていると話していた？';clarificationContextResolved=true;}
    else if(last.answer==='会話を取り直して、もう一度確認してもいい？')query=last.question;
  }
  let selfReference=false;
  // Quoted source speech and plural pronouns are not the current speaker's self-reference.
  query=query.split(/([「『][^」』]*[」』]|"[^"]*")/g).map((part,i)=>i%2?part:part.replace(/(?:ワイ|わい|わたし|わたくし|私|僕|ぼく|俺|おれ|うち)(?=について|のこと|は|が|を|に|と|も|の|って|[、,?？。\s]|$)/g,word=>{selfReference=true;return name||word;})).join('');
  return {query,unresolved:selfReference&&!name,diagnostics:{original_query:question,resolved_subject:selfReference?(name||null):null,rewrite_query:query,subject_identity_source:selfReference?source:'not_required',clarification_context_resolved:clarificationContextResolved}};
}
function testClarification(question,{unresolved=false,evidence='',messageCount=0,evidenceError='',checkEvidence=true}={}){
  const reasons=[];
  if(unresolved)reasons.push('ambiguous_subject');
  if(checkEvidence&&(evidenceError||!evidence.trim()||messageCount===0))reasons.push('evidence_unavailable');
  const ambiguousView=/^(?:最近[、,\s]*)?(?:美砂|みちゃこ)(?:さん)?(?:について|のこと)(?:は|を)?(?:どう|どんなふうに)(?:考えて|思って)(?:る|いる|いるの)?[？?。\s]*$/.test(question.trim());
  if(ambiguousView)reasons.push('ambiguous_intent');
  const reason=reasons.includes('ambiguous_subject')?'ambiguous_subject':reasons.includes('evidence_unavailable')?'evidence_unavailable':reasons[0]||'';
  const ask=reason==='ambiguous_subject'?'今の一人称は、どなたのこと？':reason==='evidence_unavailable'?'会話を取り直して、もう一度確認してもいい？':reason==='ambiguous_intent'?'洋輔さんから見た美砂さんのこと？':'';
  return {clarification_needed:Boolean(reason),clarification_reason:reason,clarification_reasons:reasons,clarification_question:ask,evidence_unavailable:reasons.includes('evidence_unavailable'),intent_ambiguity:ambiguousView?'ambiguous_intent':''};
}
function acceptGroundedTestAnswer(data,evidence){
  try{
    const value=JSON.parse(extractText(data).trim().replace(/^```(?:json)?\s*|\s*```$/g,''));
    if(typeof value.clarification_needed!=='boolean')throw Error('Missing grounding decision');
    if(value.clarification_needed){
      const reasons=['ambiguous_subject','ambiguous_intent','evidence_unavailable','insufficient_evidence'];
      const ask=String(value.clarification_question||'').trim();
      if(!reasons.includes(value.clarification_reason)||!ask||ask.length>80||/[\n\r]|今の一言|材料が|分かったよう|距離を置いて/.test(ask)||!/[？?]$/.test(ask))throw Error('Invalid clarification');
      return {answer:ask,diagnostics:{clarification_needed:true,clarification_reason:value.clarification_reason,clarification_reasons:[value.clarification_reason],clarification_question:ask}};
    }
    const quotes=Array.isArray(value.evidence_quotes)?value.evidence_quotes:[];
    if(typeof value.answer!=='string'||!value.answer.trim()||!quotes.some(x=>typeof x==='string'&&x.length>=4&&evidence.includes(x)))throw Error('No verified original quote');
    return {answer:normalizeV2ConversationalAnswer(value.answer),diagnostics:{clarification_needed:false,clarification_reason:'',clarification_reasons:[],clarification_question:''}};
  }catch(e){return {answer:'どの話や場面について知りたい？',diagnostics:{clarification_needed:true,clarification_reason:'insufficient_evidence',clarification_reasons:['insufficient_evidence'],clarification_question:'どの話や場面について知りたい？',grounding_validation_error:String(e.message)}};}
}
function formatTestQuerySafety(d){return [
  `original_query=${d.original_query}`,`resolved_subject=${d.resolved_subject||'未指定'}`,`rewrite_query=${d.rewrite_query}`,`subject_identity_source=${d.subject_identity_source}`,
  `clarification_needed=${d.clarification_needed?'yes':'no'}`,`clarification_reason=${d.clarification_reason||'none'}`,`clarification_question=${d.clarification_question||'none'}`,
  d.intent_ambiguity?`intent_ambiguity=${d.intent_ambiguity}`:'',d.evidence_unavailable?'evidence_unavailable=yes':''
].filter(Boolean).join('\n');}
async function unresolvedTestSubjectReply({env,cors,q,prep,model,queryInfo}){
  const clarification=testClarification(q,{unresolved:true,checkEvidence:false});
  const d=buildRetrievalDiagnostics('ai_person',{searchPlan:'semantic',temporalMode:'none',baseMode:'none',range:null},{answer_mode:'clarification',retrieval_mode:'none',retrieval_skipped:true,rewrite_query:queryInfo.query,diagnostics_json:{...queryInfo.diagnostics,...clarification,message_rows_read:0,model_conversation_messages:0,response_dedup_applied:false,response_rewrite_applied:false}});
  const testDiagnostic=formatRetrievalDiagnostics(d)+'\n'+formatTestQuerySafety(d.diagnostics_json);
  await gas(env,{action:'logTestAnswer',requestId:prep.requestId,question:q,answer:clarification.clarification_question,model,inputTokens:null,outputTokens:null,status:'ok',sourceRefs:'',retrievalDiagnostics:d,testDiagnostic});
  return J({state:'completed',answer:clarification.clarification_question,model,requestId:prep.requestId,testMode:true,retrievalDiagnostics:d,testDiagnostic},200,cors);
}
