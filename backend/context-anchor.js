// TEST-only reference resolution. Previous replies identify a topic, never supply evidence.
function resolveTestContextAnchor(question,conversation=[]){
  const baseMode=classifyV2ContextNeed(question);
  const mode=baseMode==='standalone'&&/^(?:それ|その人|あの人)(?:どう|はどう|について)/.test(question.trim())?'local_followup':baseMode, contextual=mode!=='standalone';
  const d={contextual_mode:contextual?'contextual':'standalone',context_strategy:mode,context_anchor_found:false,context_anchor_source:'none',context_anchor_text:'',context_anchor_candidates:[],context_anchor_ambiguous:false,resolved_query:question};
  const result={query:question,diagnostics:d,clarificationQuestion:''};
  if(!contextual||mode!=='local_followup')return result;
  // Only the immediate complete Q&A, never a semantically similar older turn.
  const last=recentComparisonPairs(conversation).at(-1);
  if(!last||conversation.at(-1)?.role!=='assistant'||last.answer!==String(conversation.at(-1)?.text||'').trim())return result;
  const q=question.trim(), reply=last.answer;
  const explicit=/^(?:それ|そこ|その話|その部分|その点|その人|あの人|これ|今の話|今の回答)(?:って|は|を|が|の|について|どう|[、,\s]|$)/.test(q);
  const broad=/^(?:もう少し|もっと|もうちょい)?詳しく(?:教えて)?[？?。\s]*$/.test(q);
  const named=q.match(/^(.{2,40}?)(?:って|とは|について|の話)(?:[、,\s]*)(?:具体的に|もう少し|詳しく|どんな|どういう|何|なに)/);
  // A full new question with accidental shared words is not a reference.
  if(!explicit&&!broad&&!named)return result;
  const topicUnits=[...new Set(reply.split(/[。！？!?\n；;、,]/).map(s=>s.trim().replace(/^(?:[-・●]|\d+[.)])\s*/,'' )).filter(s=>s.length>=3&&s.length<=240))];
  let candidates=[];
  if(named){
    const term=named[1].replace(/^[「『]|[」』]$/g,'').trim();
    candidates=topicUnits.filter(s=>s.includes(term));
    // Multiple appearances, even with the same keyword, require a choice.
  }else if(/^(?:その人|あの人)/.test(q)){
    candidates=[...new Set(reply.match(/[一-龯ぁ-んァ-ヶA-Za-z]{1,24}?(?:さん|氏|先生)/g)||[])];
  }else {
    candidates=topicUnits;
    // A single sentence can still enumerate several topics. Do not resolve it as one.
    const quoted=[...reply.matchAll(/[「『]([^」』]{2,80})[」』]/g)].map(x=>x[1]);
    if(candidates.length===1&&quoted.length>1)candidates=[...new Set(quoted)];
    if(candidates.length===1&&/(?:と|や).{1,30}(?:について|の話|を話|の相談)/.test(candidates[0])){
      d.context_anchor_ambiguous=true;d.context_anchor_candidates=candidates;
      result.clarificationQuestion='どの話について詳しく知りたい？';return result;
    }
  }
  d.context_anchor_candidates=candidates;
  if(candidates.length>1){
    d.context_anchor_ambiguous=true;
    result.clarificationQuestion=/^(?:その人|あの人)/.test(q)?'どなたのこと？':'どの話について詳しく知りたい？';
    return result;
  }
  if(candidates.length!==1)return result;
  // Carry explicit topic/time/source scope only; these are search constraints, not facts.
  const anchor=candidates[0];
  const time=last.question.match(/(?:20\d{2}年)?\d{1,2}月(?:\d{1,2}日)?|先月|今月|今年|昨年|昨日|今日|最近|先週|今週/);
  const priorTopic=last.question.match(/^(.{2,40}?)(?:って|とは|について|の話)/);
  const sourceNames=[...new Set(reply.match(/じぇみさん|ちゃっぺー師匠|じぇみ|ちゃっぺー/g)||[])];
  const scopes=[time?.[0],priorTopic?.[1],sourceNames.length===1?sourceNames[0]:null].filter(Boolean);
  const scope=scopes.length?scopes.join('・')+'の会話で挙げられた':'';
  result.query=`${scope}「${anchor}」について、${question}`;
  const literalTerm=named?named[1].replace(/^[「『]|[」』]$/g,'').trim():anchor.match(/[「『]([^」』]{2,80})[」』]/)?.[1]||anchor;
  Object.assign(d,{context_anchor_found:true,context_anchor_source:'previous_assistant',context_anchor_text:anchor,context_anchor_term:literalTerm,resolved_query:result.query});
  return result;
}
function formatTestContextAnchor(d){return [
  `contextual_mode=${d.contextual_mode}`,`context_strategy=${d.context_strategy}`,
  `context_anchor_found=${d.context_anchor_found?'yes':'no'}`,`context_anchor_source=${d.context_anchor_source}`,
  `context_anchor_text=${d.context_anchor_text||'none'}`,`context_anchor_candidates=${JSON.stringify(d.context_anchor_candidates)}`,
  `anchor_evidence_term=${d.anchor_evidence_term||'none'}`,`anchor_match_refs=${JSON.stringify(d.anchor_match_refs||[])}`,`anchor_context_radius=${d.anchor_context_radius??'none'}`,`anchor_evidence_messages=${d.anchor_evidence_messages??0}`,`anchor_excluded_messages=${d.anchor_excluded_messages??0}`,
  `anchor_original_units_read=${d.anchor_original_units_read??0}`,`anchor_original_units_selected=${d.anchor_original_units_selected??0}`,`anchor_original_chars_selected=${d.anchor_original_chars_selected??0}`,
  `context_anchor_ambiguous=${d.context_anchor_ambiguous?'yes':'no'}`,`resolved_query=${d.resolved_query}`
].join('\n');}
async function ambiguousTestContextReply({env,cors,q,prep,model,queryInfo,anchor}){
  const ask=anchor.clarificationQuestion;
  const d=buildRetrievalDiagnostics('ai_person',{searchPlan:'semantic',temporalMode:'none',baseMode:'none',range:null},{answer_mode:'clarification',retrieval_mode:'none',retrieval_skipped:true,rewrite_query:queryInfo.query,diagnostics_json:{...queryInfo.diagnostics,...anchor.diagnostics,clarification_needed:true,clarification_reason:'ambiguous_intent',clarification_reasons:['ambiguous_intent'],clarification_question:ask,message_rows_read:0,model_conversation_messages:0,response_dedup_applied:false,response_rewrite_applied:false}});
  const testDiagnostic=formatRetrievalDiagnostics(d)+'\n'+formatTestQuerySafety(d.diagnostics_json)+'\n'+formatTestContextAnchor(d.diagnostics_json);
  await gas(env,{action:'logTestAnswer',requestId:prep.requestId,question:q,answer:ask,model,inputTokens:null,outputTokens:null,status:'ok',sourceRefs:'',retrievalDiagnostics:d,testDiagnostic});
  return J({state:'completed',answer:ask,model,requestId:prep.requestId,testMode:true,retrievalDiagnostics:d,testDiagnostic},200,cors);
}
