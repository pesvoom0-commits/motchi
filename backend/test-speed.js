// TEST-only cheap comparison admission and answer presentation. No extra LLM.
function testViewerIdentity(env,prep){
  for(const value of [prep?.authenticatedUser?.name,prep?.session?.user?.name,env.TEST_SESSION_USER_NAME])if(typeof value==='string'&&value.trim()&&value.length<=80)return value.trim();
  return '';
}
function presentTestViewerAnswer(answer,identity,question=''){
  const diagnostics={viewer_identity:identity||null,viewer_reference_mode:identity?'second_person':'unresolved',viewer_name_rewrite_applied:false};
  if(!identity)return {answer,diagnostics};
  const aliases=identity==='美砂'?['美砂さん','美砂','みちゃこ']:[identity+'さん',identity];
  // Same-name ambiguity is not resolved by display rules.
  if(/同名|同じ名前|別の美砂|もう一人の美砂/.test(question+'\n'+answer))return {answer,diagnostics};
  const escaped=aliases.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const names=new RegExp('(?:'+escaped+')(?=は|が|を|に|と|の|も|へ|自身|本人|について|って|[、。！？?\\s]|$)','g');
  const protectedParts=[];let start=0,stack=[];
  // Preserve nested quotes, code and links. Never operate on evidence/diagnostic objects.
  const quotePairs={'「':'」','『':'』','“':'”','"':'"'};
  for(let i=0;i<answer.length;i++){
    const ch=answer[i];
    if(stack.length&&ch===stack.at(-1)){stack.pop();if(!stack.length){protectedParts.push({start,end:i+1});}continue;}
    if(quotePairs[ch]){if(!stack.length)start=i;stack.push(quotePairs[ch]);}
  }
  if(stack.length)protectedParts.push({start,end:answer.length});
  for(const m of answer.matchAll(/```[\s\S]*?```|`[^`]*`|https?:\/\/\S+|\[[^\]]*\]\([^)]*\)/g))protectedParts.push({start:m.index,end:m.index+m[0].length});
  const displayed=answer.replace(names,(name,index)=>{
    if(protectedParts.some(p=>index>=p.start&&index<p.end))return name;
    const left=answer.slice(0,index).split(/[。！？?\n]/).at(-1),right=answer.slice(index).split(/[。！？?\n]/)[0];
    const clause=left+right;
    if(/発言者|話者名|記録上の名前|原文の名前|名前そのもの|という名前|という呼び名|名前の由来|名前は|名前について/.test(clause)||/^\s*(?:\[20\d{2}[^\]]*\]\s*)?$/.test(left)&&/^\S*[:：]/.test(right))return name;
    diagnostics.viewer_name_rewrite_applied=true;return 'あなた';
  });
  return {answer:displayed,diagnostics};
}
function formatTestSpeed(d){return [
  `viewer_identity=${d.viewer_identity||'unresolved'}`,`viewer_reference_mode=${d.viewer_reference_mode||'unresolved'}`,`viewer_name_rewrite_applied=${d.viewer_name_rewrite_applied?'yes':'no'}`,
  `dedup_precheck=${d.dedup_precheck||'not_required'}`,`dedup_comparison_skipped=${d.dedup_comparison_skipped===false?'no':'yes'}`,`dedup_skip_reason=${d.dedup_skip_reason||'none'}`,`response_dedup_ms=${d.response_dedup_ms||0}`,
  `anchor_retrieval_strategy=${d.anchor_retrieval_strategy||'normal'}`,`anchor_metadata_rows_scanned=${d.anchor_metadata_rows_scanned??0}`,`anchor_original_rows_fetched=${d.anchor_original_rows_fetched??0}`
].join('\n');}
function testDedupPrecheck({question,answer,evidence,conversation,route,plan,answerMode,anchor}){
  const pairs=recentComparisonPairs(conversation),last=pairs.at(-1);
  const skip=reason=>({dedup_precheck:'skip',dedup_comparison_skipped:true,dedup_skip_reason:reason,response_dedup_ms:0});
  if(['app_meta','external_info'].includes(route))return skip('fixed_route');
  if(['evidence_error','no_evidence','clarification','insufficient_evidence'].includes(answerMode))return skip(answerMode);
  if(!last)return skip('no_previous_question');
  if(!String(evidence||'').trim())return skip('no_evidence');
  const explicit=/(その話|それ|他には|ほかには|他に|それ以外|さっき|先ほど|前の|続き|もっと)/.test(question);
  const same=question.replace(/\s|[？?。]/g,'')===last.question.replace(/\s|[？?。]/g,'');
  if(same)return {dedup_precheck:'possible_repeat',dedup_comparison_skipped:false,dedup_skip_reason:''};
  if(anchor?.context_anchor_found&&/(具体|どんな|詳しく|どういう)/.test(question)&&!explicit)return skip('anchor_details_requested');
  if(testCurrentDateTimeAnswer(last.question)||isV2AppMetaQuestion(last.question))return skip('previous_fixed_route');
  // Summary ranges can refer to the same originals; retain the existing five relations.
  const summary=q=>/(?:何|なに|どんな).{0,6}(?:話|相談)/.test(q)&&/最近|今月|先月|今週|先週|昨日|今日|\d+月|一番最近/.test(q);
  if(summary(question)&&summary(last.question))return {dedup_precheck:'temporal_summary_candidate',dedup_comparison_skipped:false,dedup_skip_reason:''};
  const topical=q=>String(q).replace(/美砂(?:さん)?|みちゃこ|洋輔(?:さん)?|もっちー?|あなた|私|ワイ|ちゃっぺー師匠|じぇみさん|最近|今月|先月|今日|昨日|今週|先週|一番最近|\d+月\d*日?|その話|それ以外|それ|他には|ほかには|他に|さっき|先ほど|前の|の続き|続き|もっと|について|どんな|何|なに|どう|考えて|思って|具体的に|詳しく|話してた|話した|会話|教えて|って|です|さん|[\s、。？?「」『』・]/g,'');
  const terms=q=>new Set((topical(q).match(/[\p{L}\p{N}]+/gu)||[]).flatMap(t=>t.length<2?[]:Array.from({length:t.length-1},(_,i)=>t.slice(i,i+2))));
  const current=terms(question);
  const candidates=explicit?pairs.slice().reverse():[last];
  const overlap=candidates.some(p=>[...terms(p.question)].filter(x=>current.has(x)).length>=2||topical(question).length>=2&&topical(question)===topical(p.question));
  if(!explicit&&!overlap)return skip(route==='direct_conversation'?'direct_no_overlap':'no_overlap_candidate');
  if(explicit&&!anchor?.context_anchor_found&&current.size&&!overlap&&!topical(last.answer).includes(topical(question)))return skip('no_overlap_candidate');
  return {dedup_precheck:explicit?'explicit_followup':'topic_overlap',dedup_comparison_skipped:false,dedup_skip_reason:''};
}
async function retrieveTestAnchorFirst(env,plan,sourceAi,anchor){
  markTestStage(env,'anchor_lookup');
  const result=await gas(env,{action:'getTestAnchorEvidence',range:plan.range,latest:plan.latest,sourceAi:sourceAi||'',anchorTerm:anchor.context_anchor_term});
  markTestStage(env,'anchor_lookup_completed');
  return result;
}
function normalizeTestAnchorQuery(question,anchor,scopes){
  const term=anchor.match(/[「『]([^」』]{2,80})[」』]/)?.[1]||question.match(/^(.{2,40}?)(?:って|とは|について|の話)/)?.[1]||anchor;
  const pieces=[...new Set(scopes.filter(Boolean))].filter((x,i,a)=>!a.some((y,j)=>j!==i&&y.length>x.length&&y.includes(x)));
  const context=pieces.join('、');
  const tail=question.replace(/^.{2,40}?(?:って|とは|について|の話)[、,\s]*/, '');
  const target=context.includes(term)?context:[context,`「${term}」について`].filter(Boolean).join('、');
  return [target,tail].filter(Boolean).join('、');
}
