// TEST-only current clock routing and literal anchor evidence boundaries.
function testCurrentDateTimeAnswer(question,now=new Date()) {
  const q=String(question||'').trim().replace(/[？?。!！\s]/g,'');
  let kind='';
  if(/^(?:今日|きょう)(?:は|って|の)?(?:何日|なんにち|日付)(?:は|ですか|なの|教えて)?$/.test(q))kind='date';
  else if(/^(?:今|いま)(?:は|の)?(?:何時|なんじ|時刻)(?:ですか|なの|教えて)?$/.test(q))kind='time';
  else if(/^(?:今日|きょう)(?:は|って|の)?(?:何曜日|なんようび|曜日)(?:は|ですか|なの|教えて)?$/.test(q))kind='weekday';
  else if(/^今月(?:は|って)?何月(?:ですか|なの)?$/.test(q))kind='month';
  if(!kind)return '';
  const parts=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',weekday:'long',hour:'numeric',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return kind==='time'?`今は${p.hour}時${p.minute}分だよ（日本時間）。`:kind==='month'?`今月は${p.month}月だよ。`:kind==='weekday'?`今日は${p.weekday}だよ。`:`今日は${p.year}年${p.month}月${p.day}日、${p.weekday}だよ。`;
}
function selectTestAnchorEvidence(bundle,anchor) {
  const term=anchor.diagnostics.context_anchor_term||anchor.diagnostics.context_anchor_text;
  const rows=Array.isArray(bundle?.messages)?bundle.messages:[];
  const hits=rows.filter(m=>String(m.text||'').includes(term));
  const candidates=rows.filter(m=>hits.some(h=>h.conversationId===m.conversationId&&Number.isFinite(Number(m.seq))&&Math.abs(Number(h.seq)-Number(m.seq))<=1));
  const messages=[],quoteHits=[];let unitsRead=0,unitsSelected=0,charsRead=0,charsSelected=0;
  for(const m of candidates){
    const text=String(m.text||'');charsRead+=text.length;
    // A single MESSAGES seq can embed an entire dated WhatsApp transcript.
    // Bound inside that original message as well as between seqs.
    const transcript=/\[20\d{2}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}/.test(text);
    const units=(transcript?text.split(/(?=\[20\d{2}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\])/):text.split(/\n|(?<=[。！？])/)).map(x=>x.trim()).filter(x=>x.replace(/[\u200e\u200f]/g,'').trim());
    unitsRead+=units.length;
    const matches=units.flatMap((u,i)=>u.includes(term)?[i]:[]);
    if(!matches.length){
      // Adjacent seq is supplementary only when explicitly referring back to the
      // utterance, never an entire unrelated analysis of the same conversation.
      if(text.length<=300&&/そのコメント|このコメント|その発言|この発言/.test(text)){messages.push(m);unitsSelected+=units.length;charsSelected+=text.length;}
      continue;
    }
    const wanted=new Set(matches.flatMap(i=>Array.from({length:4},(_,n)=>i-2+n).filter(j=>j>=0&&j<units.length)));
    const selected=units.filter((_,i)=>wanted.has(i));const excerpt=selected.join('\n');
    messages.push({...m,text:excerpt});quoteHits.push({...m,text:matches.map(i=>units[i]).join('\n')});unitsSelected+=selected.length;charsSelected+=excerpt.length;
  }
  return {bundle:{...bundle,messages},diagnostics:{anchor_evidence_term:term,anchor_match_refs:hits.map(m=>`${m.conversationId}#${m.seq}`),anchor_context_radius:1,anchor_evidence_messages:messages.length,anchor_excluded_messages:rows.length-messages.length,anchor_original_units_read:unitsRead,anchor_original_units_selected:unitsSelected,anchor_excerpt_before:2,anchor_excerpt_after:1,anchor_original_chars_read:charsRead,anchor_original_chars_selected:charsSelected},hits:quoteHits};
}
