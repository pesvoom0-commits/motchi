// TEST-only locator-first originals. No log/usage mutations; existing actions unchanged.
function getTestAnchorEvidence_(body){
  const term=String(body.anchorTerm||'').trim();
  if(!term||term.length>240)throw new Error('Invalid TEST anchor term');
  const candidates=getTestTemporalCandidates_(body).conversations;
  const ids=new Set(candidates.map(c=>c.conversationId));
  const sh=SpreadsheetApp.openById(AI_LOG_SPREADSHEET_ID).getSheetByName(AI_LOG_MESSAGES_SHEET_NAME);
  if(!sh)throw new Error('MESSAGES missing');
  const header=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0],ix=headerIndexMap_(header);
  ['conversation_id','seq','text','role','source_ai'].forEach(k=>{if(ix[k]==null)throw new Error('MESSAGES header missing: '+k);});
  const n=Math.max(0,sh.getLastRow()-1),diagnostics={anchor_retrieval_strategy:'locator_first',anchor_candidate_conversations:candidates.length,anchor_metadata_rows_scanned:n,anchor_original_rows_fetched:0};
  if(!n||!ids.size)return {ok:true,found:false,diagnostics:diagnostics};
  // Read only id/seq columns to scope native literal search results before originals.
  const idRows=sh.getRange(2,ix.conversation_id+1,n,1).getDisplayValues(),seqRows=sh.getRange(2,ix.seq+1,n,1).getDisplayValues();
  const locators=sh.getRange(2,ix.text+1,n,1).createTextFinder(term).matchCase(true).useRegularExpression(false).findAll().map(cell=>cell.getRow()-2).filter(i=>ids.has(idRows[i][0]));
  diagnostics.anchor_literal_rows_matched=locators.length;
  if(!locators.length)return {ok:true,found:false,diagnostics:diagnostics};
  const wanted=[];
  for(let i=0;i<n;i++)if(locators.some(j=>idRows[j][0]===idRows[i][0]&&Math.abs(Number(seqRows[j][0])-Number(seqRows[i][0]))<=1))wanted.push(i+2);
  const ranges=[];
  wanted.forEach(row=>{const last=ranges[ranges.length-1];if(last&&last.end+1===row)last.end=row;else ranges.push({start:row,end:row});});
  const rows=[];ranges.forEach(r=>rows.push(...sh.getRange(r.start,1,r.end-r.start+1,header.length).getDisplayValues()));
  diagnostics.anchor_original_rows_fetched=rows.length;
  const messages=rows.map(row=>({conversationId:row[ix.conversation_id],seq:Number(row[ix.seq]),partIndex:ix.part_index==null?1:Number(row[ix.part_index])||1,partCount:ix.part_count==null?1:Number(row[ix.part_count])||1,role:row[ix.role],messageDate:ix.message_date==null?'':row[ix.message_date],text:row[ix.text],sourceAi:row[ix.source_ai]})).sort((a,b)=>a.conversationId.localeCompare(b.conversationId)||a.seq-b.seq||a.partIndex-b.partIndex);
  const merged=[];messages.forEach(m=>{const prev=merged[merged.length-1];if(prev&&prev.conversationId===m.conversationId&&prev.seq===m.seq){prev.text+=m.text;prev.partCount=Math.max(prev.partCount,m.partCount);}else merged.push({...m});});
  const matchIds=new Set(locators.map(i=>idRows[i][0]));
  const bundle={conversations:candidates.filter(c=>matchIds.has(c.conversationId)),messages:merged};
  const selected=scopeTestAnchorOriginals_(bundle,{diagnostics:{context_anchor_term:term}});
  return {ok:true,found:selected.bundle.messages.length>0,bundle:selected.bundle,hits:selected.hits,diagnostics:{...diagnostics,...selected.diagnostics,message_rows_read:rows.length}};
}
