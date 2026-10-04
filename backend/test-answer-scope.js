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
  const messages=rows.filter(m=>hits.some(h=>h.conversationId===m.conversationId&&Number.isFinite(Number(m.seq))&&Math.abs(Number(h.seq)-Number(m.seq))<=1));
  return {bundle:{...bundle,messages},diagnostics:{anchor_evidence_term:term,anchor_match_refs:hits.map(m=>`${m.conversationId}#${m.seq}`),anchor_context_radius:1,anchor_evidence_messages:messages.length,anchor_excluded_messages:rows.length-messages.length},hits};
}
