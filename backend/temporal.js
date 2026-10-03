// 2.2.013: shared retrieval helpers, enabled by the TEST entry point only.
function buildTemporalSearchPlan(question,currentDate) {
  const s=toAsciiDigits(String(question||''));
  const base=parseJstDateKey(currentDate);
  if(!base) throw new Error('currentDateJst is required');
  const key=(y,m,d)=>{
    const dt=new Date(Date.UTC(y,m-1,d));
    if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d) throw new Error('Invalid date');
    return shiftDateKey(dt,0);
  };
  const y=base.getUTCFullYear(), month=base.getUTCMonth()+1;
  const dates=[...s.matchAll(/(?:(20\d{2})[年/\-])?(\d{1,2})[月/\-](\d{1,2})日?/g)].map(m=>key(Number(m[1]||y),Number(m[2]),Number(m[3])));
  let mode='none',from='',to='',latest=false;
  if(dates.length>=2 && /から|まで|〜|～|~/.test(s)){mode='range';[from,to]=dates;}
  else if(/先週|今週/.test(s)){
    mode='range'; const monday=-(base.getUTCDay()+6)%7;
    from=shiftDateKey(base,monday+(/先週/.test(s)?-7:0));
    to=/先週/.test(s)?shiftDateKey(parseJstDateKey(from),6):currentDate;
  } else if(/先月|今月|\d{1,2}月(?:上旬|中旬|下旬|月末|末|から|まで|[のは、？?\s])/.test(s)){
    mode='range';const explicit=s.match(/(?:(20\d{2})年)?(\d{1,2})月/);
    const dt=new Date(Date.UTC(explicit?Number(explicit[1]||y):y,explicit?Number(explicit[2])-1:month-1-(/先月/.test(s)?1:0),1));
    const yy=dt.getUTCFullYear(),mm=dt.getUTCMonth()+1;
    const end=new Date(Date.UTC(yy,mm,0)).getUTCDate();
    const start=/中旬/.test(s)?11:/下旬/.test(s)?21:1;
    const finish=/月末|月?末まで|下旬/.test(s)?end:/上旬/.test(s)?10:/中旬/.test(s)?20:end;
    from=key(yy,mm,start);to=key(yy,mm,finish);
  } else if(/今年/.test(s)){
    mode='range';from=key(y,1,1);to=currentDate;
  } else if(dates.length || /一昨日|昨日|今日/.test(s)){
    mode='exact';from=to=dates[0]||shiftDateKey(base,/一昨日/.test(s)?-2:/昨日/.test(s)?-1:0);
  } else if(/最後に|一番最近|最新|直近\s*1\s*件|最後の/.test(s)){
    mode='latest';latest=true;
  } else if(/最近|直近|近ごろ|ここ数日|この数日|ここ\s*\d+\s*日|過去\s*\d+\s*日/.test(s)){
    mode='recent';const n=s.match(/(?:ここ|過去|直近)\s*(\d+)\s*日/);
    const days=n?Number(n[1]):/数日/.test(s)?3:7;
    if(days<1||days>3660) throw new Error('Invalid recent day count');
    from=shiftDateKey(base,1-days);to=currentDate;
  }
  if(from&&to&&from>to) throw new Error('Time range is reversed');
  const topic=s
    .replace(/(?:(20\d{2})[年/\-])?\d{1,2}[月/\-]\d{1,2}日?/g,' ')
    .replace(/(?:(20\d{2})年)?\d{1,2}月/g,' ')
    .replace(/(?:ここ|過去|直近)\s*\d+\s*(?:日|件)/g,' ')
    .replace(/最近|直近|近ごろ|ここ数日|この数日|一番最近|最後に|最後の|最新|先週|今週|先月|今月|今年|一昨日|昨日|今日|上旬|中旬|下旬|月末|月?末まで|から|まで/g,' ')
    .replace(/ちゃっぺー師匠|ちゃっぺー|じぇみさん|じぇみ|ChatGPT|Gemini|AI|洋輔さん|洋輔|もっちー|もっち/g,' ')
    .replace(/について|のことで|のこと|何を|何か|何|なに|一番|相談(?:内容)?|話(?:してた|した|してる|していた|して|す|し|た)?|考えて(?:た|る)|どう|まとめて|教えて|振り返って|実際に|内容|会話|やりとり|してた|していた|してる|した|あった|ある|どんな|だった|ですか/g,' ')
    .replace(/[\s、。？?！!はをにとでがのもへ]+/g,' ').trim();
  const searchPlan=mode==='none'?'semantic':topic?'temporal_then_semantic':'temporal_'+mode;
  return {searchPlan,temporalMode:topic&&mode!=='none'?'then_semantic':mode,baseMode:mode,range:from?{from,to}:null,latest,topic:mode==='none'?'':topic};
}

function buildRetrievalDiagnostics(route,plan,extra={}) {
  return {route,question_pattern:plan.searchPlan,answer_mode:'generated',temporal_mode:plan.temporalMode,
    resolved_time_range:plan.range,retrieval_mode:'vector',candidate_conversation_ids:[],vector_result_count:0,
    retrieval_skipped:false,rewrite_query:null,similar_question_refs:null,diagnostics_json:{search_plan:plan.searchPlan,base_temporal_mode:plan.baseMode},...extra};
}
function formatRetrievalDiagnostics(d) {
  return [
    `route=${d.route}`,`検索プラン=${d.question_pattern}`,`answer_mode=${d.answer_mode}`,
    `temporal_mode=${d.temporal_mode}`,`解決された期間=${d.resolved_time_range?d.resolved_time_range.from+' ～ '+d.resolved_time_range.to:'なし'}`,
    `retrieval_mode=${d.retrieval_mode}`,`candidate_conversation_ids=${d.candidate_conversation_ids.join(', ')||'なし'}`,
    `vector_result_count=${d.vector_result_count}`,`vector検索をスキップ=${d.diagnostics_json.vector_skipped?'yes':'no'}`,
    `retrieval_skipped=${d.retrieval_skipped}`,`rewrite_query=${d.rewrite_query||'未使用'}`,
    `similar_question_refs=${d.similar_question_refs?JSON.stringify(d.similar_question_refs):'未使用'}`,
    `原文確認=${d.diagnostics_json.message_rows_read||0}件`,
    `参照メッセージ=${(d.diagnostics_json.message_refs||[]).join(', ')||'なし'}`,
    `fallback_used=${Boolean(d.diagnostics_json.fallback_used)}`,
    `原文表示を短縮=${Boolean(d.diagnostics_json.evidence_truncated)}`
  ].join('\n');
}

// Read every candidate's originals before relevance selection; scoped vector is optional.
async function retrieveTemporalEvidence(env,plan,sourceAi,query) {
  const candidates=await gas(env,{action:'getTestTemporalCandidates',sourceAi,range:plan.range,latest:plan.latest});
  const ids=candidates.conversations.map(c=>c.conversationId);
  if(plan.latest&&candidates.conversations.length){const date=candidates.conversations[0].conversationDate;plan.range={from:date,to:date};}
  const bundle=ids.length?await gas(env,{action:'getTestTemporalMessages',conversationIds:ids,sourceAi}):{messages:[],conversations:[]};
  let searchData={data:[]},vectorUsed=false,searchError='';
  if(plan.topic&&ids.length){
    try {
      const state=await gas(env,{action:'getTestV2IndexState'});
      if(state.vectorStoreId){
        for(let offset=0;offset<ids.length;offset+=25){
          const filters={type:'or',filters:ids.slice(offset,offset+25).map(id=>({type:'eq',key:'conversation_id',value:id}))};
          vectorUsed=true;
          const page=await openaiJson(env,'/vector_stores/'+encodeURIComponent(state.vectorStoreId)+'/search',{method:'POST',body:{query:plan.topic,max_num_results:8,rewrite_query:false,filters}});
          searchData.data.push(...(page.data||[]).filter(x=>ids.includes(String(x.attributes?.conversation_id||''))));
        }
      }
    }catch(e){searchError=String(e.message||e);}
  }
  const clusters=buildV2ClusteredEvidencePlan(searchData,2);
  let selected=bundle;
  const hits=extractV2EvidenceLocators(searchData);
  if(hits.length){
    const messages=bundle.messages.filter(m=>hits.some(h=>h.conversationId===m.conversationId&&Math.abs(h.seq-m.seq)<=1));
    if(messages.length)selected={...bundle,messages};
  }
  // With zero vector hits, keep originals; never convert a low score into absence.
  return {bundle,selected,searchData,clusters,vectorUsed,searchError,ids};
}

function formatBoundedTemporalEvidence(bundle,maxChars=28000) {
  const groups=bundle.conversations.map(c=>({c,rows:bundle.messages.filter(m=>m.conversationId===c.conversationId),index:0}));
  const selected=[];let used=0,truncated=false;
  // Round-robin coverage prevents a long first conversation hiding every later one.
  while(groups.some(g=>g.index<g.rows.length)&&used<maxChars){
    for(const g of groups){
      if(g.index>=g.rows.length)continue;
      const m=g.rows[g.index++];
      const limit=Math.min(3000,maxChars-used);
      if(limit<=200){truncated=true;continue;}
      const text=String(m.text||'').slice(0,limit-150);
      selected.push({...m,text});used+=text.length+150;
      if(text.length<String(m.text||'').length)truncated=true;
    }
  }
  truncated=truncated||selected.length<bundle.messages.length;
  const evidence={...bundle,messages:selected};
  return {evidence,text:formatV2ExactEvidence(evidence),truncated};
}
