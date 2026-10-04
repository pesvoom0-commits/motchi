import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const dir=process.argv[2]||'/private/tmp/motchi-test-speed';
const c=vm.createContext({console,Response,URL,Date,Intl,Map,Set,Number,JSON,TextEncoder,setTimeout});vm.runInContext(fs.readFileSync(dir+'/worker.mjs','utf8').replace('export default','const worker='),c);
function run(expr,arg){c.arg=arg;return vm.runInContext(expr,c);}
for(const [input,expected] of [
 ['9月は美砂さんと話していた。','9月はあなたと話していた。'],
 ['洋輔さんは美砂さんを大切に思っていて、みちゃこに伝えた。','洋輔さんはあなたを大切に思っていて、あなたに伝えた。'],
 ['美砂さんは「みちゃこ、好きよ」と言われた。','あなたは「みちゃこ、好きよ」と言われた。'],
 ['原文の発言者名は美砂さん。','原文の発言者名は美砂さん。'],
 ['「美砂」という名前について話した。','「美砂」という名前について話した。'],
 ['あきさんは洋輔さんを応援している。','あきさんは洋輔さんを応援している。'],
 ['引用は「美砂さんが『みちゃこ』と呼ばれた」。美砂さんに話した。','引用は「美砂さんが『みちゃこ』と呼ばれた」。あなたに話した。'],
 ['美砂さんは `美砂` と記録された。','あなたは `美砂` と記録された。']
])assert.equal(run('presentTestViewerAnswer(arg,"美砂").answer',input),expected);
assert.equal(run('presentTestViewerAnswer(arg,"洋輔").answer','美砂さんが答えた。'),'美砂さんが答えた。');
assert.equal(run('presentTestViewerAnswer(arg,"美砂","別の同名の美砂さんは？").answer','美砂さんは回答した。'),'美砂さんは回答した。');
assert.equal(run('testViewerIdentity({TEST_SESSION_USER_NAME:"美砂"},{authenticatedUser:{name:"洋輔"}})'), '洋輔');
const hist=(q,a='原文の話。')=>[{role:'user',text:q},{role:'assistant',text:a}];
function pre(q,h,extra={}){return run('testDedupPrecheck(arg)',{question:q,answer:'今回の回答',evidence:'原文',conversation:h,route:'ai_person',plan:{},...extra});}
assert(pre('美砂の好きな食べ物は？',hist('洋輔はどんな仕事をしてる？')).dedup_comparison_skipped);
assert(pre('美砂についてどんな人？',hist('美砂の仕事について教えて')).dedup_comparison_skipped);
assert.equal(pre('英語が多いって具体的にどんな会話？',hist('9月はどんな話？'),{anchor:{context_anchor_found:true}}).dedup_skip_reason,'anchor_details_requested');
for(const answerMode of ['evidence_error','no_evidence','clarification','insufficient_evidence'])assert(pre('同じ？',hist('同じ？'),{answerMode}).dedup_comparison_skipped);
assert(pre('今日は何日？',hist('今日は何日？'),{route:'app_meta'}).dedup_comparison_skipped);
assert(pre('昨日何話した？',[]).dedup_comparison_skipped);
assert.equal(pre('英語の発表について教えて',hist('英語の発表について教えて')).dedup_comparison_skipped,false);
assert.equal(pre('一番最近、何話してた？',hist('今月もっちは何話してた？')).dedup_comparison_skipped,false);
assert.equal(pre('その話の続きは？',hist('仕事について教えて')).dedup_comparison_skipped,false);
const qa=[{role:'user',text:'9月、洋輔さんが登壇したオンラインイベントで「英語が多い」というコメントについて何と話してた？'},{role:'assistant',text:'「英語が多い」という指摘が人気の次点だった。'}];
const normalized=run('resolveTestContextAnchor("英語が多いって具体的にどんな会話してた？",arg)',qa);assert(normalized.diagnostics.context_anchor_found);assert.equal((normalized.query.match(/9月/g)||[]).length,1);assert.equal((normalized.query.match(/英語が多い/g)||[]).length,1);assert(normalized.query.includes('オンラインイベント'));assert(normalized.query.includes('洋輔さん'));
let calls=[],logs,compareCalls=0,fast=true;
c.gas=async(_e,b)=>{calls.push(b.action);if(b.action==='logTestAnswer'){logs=b;return {ok:true};}if(b.action==='getTestAnchorEvidence')return fast?{found:true,bundle:{conversations:[{conversationId:'c',conversationDate:'2026-09-25',sourceAi:'gemini'}],messages:[{conversationId:'c',seq:1,role:'yosuke',text:'みちゃこに「英語が多い」が人気と話した。'}]},hits:[{conversationId:'c',seq:1,text:'「英語が多い」が人気'}],diagnostics:{anchor_retrieval_strategy:'locator_first',message_rows_read:2,anchor_original_rows_fetched:2,anchor_metadata_rows_scanned:200}}:{found:false,diagnostics:{anchor_retrieval_strategy:'locator_first'}};if(b.action==='getTestTemporalCandidates')return {conversations:[]};throw Error('Unexpected '+b.action);};
c.openaiJson=async(_e,path,{body})=>{calls.push(path);if(body.instructions.includes('回答編集担当'))compareCalls++;assert(body.instructions.includes('みちゃこに「英語が多い」が人気と話した。'));return {output_text:JSON.stringify({clarification_needed:false,answer:'あなたに「英語が多い」が人気と話してたよ。',evidence_quotes:['「英語が多い」が人気']})};};
c.args={env:{TEST_SESSION_USER_NAME:'美砂'},cors:{},body:{},q:'英語が多いって具体的にどんな会話してた？',conversation:qa,prep:{requestId:'speed',currentDateJst:'2026-10-04'},isTest:true};
let r=JSON.parse(await(await vm.runInContext('handleV2TestAsk(args)',c)).text());assert.deepEqual(calls,['getTestAnchorEvidence','/responses','logTestAnswer']);assert.equal(compareCalls,0);assert.equal(r.retrievalDiagnostics.retrieval_mode,'anchor_original_scan');assert.equal(r.retrievalDiagnostics.diagnostics_json.message_rows_read,2);assert.equal(r.retrievalDiagnostics.vector_result_count,0);assert(r.retrievalDiagnostics.diagnostics_json.dedup_comparison_skipped);assert.equal(logs.question,c.args.q);
fast=false;calls=[];r=JSON.parse(await(await vm.runInContext('handleV2TestAsk(args)',c)).text());assert(calls.includes('getTestTemporalCandidates'));assert.equal(r.retrievalDiagnostics.diagnostics_json.anchor_retrieval_strategy,'normal_fallback');
// Native literal search locates originals; only adjacent source rows are fetched.
const headers=['conversation_id','seq','part_index','part_count','role','message_date','text','source_ai'];
const source=[headers,['other',1,1,1,'yosuke','2026-09-25','英語が多い outside eligible period','gemini'],['c',1,1,1,'yosuke','2026-09-25','[2026/09/25 16:03:05] 洋輔: コメントを収集\n[2026/09/25 16:03:25] 美砂: リアルタイムいいね\n[2026/09/25 16:05:49] 洋輔: 英語が多い（匿名だと辛辣\n[2026/09/25 16:09:22] 美砂: www','gemini'],['c',2,1,1,'assistant','2026-09-25','OTHER_UNRELATED_ANALYSIS'.repeat(50),'gemini'],['c',40,1,1,'yosuke','2026-09-25','OTHER_EVENT','gemini']];let fullRows=[];
const sheet={getLastColumn:()=>headers.length,getLastRow:()=>source.length,getRange:(row,col,h=1,w=1)=>({getDisplayValues:()=>{if(row>1&&w===headers.length)fullRows.push([row,h]);return source.slice(row-1,row-1+h).map(r=>r.slice(col-1,col-1+w).map(String));},createTextFinder:term=>({matchCase(){return this},useRegularExpression(){return this},findAll:()=>source.flatMap((r,i)=>i&&String(r[col-1]).includes(term)?[{getRow:()=>i+1}]:[])})})};
const g=vm.createContext({console,Date,Map,Set,SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet})}});vm.runInContext(fs.readFileSync(dir+'/Code.gs','utf8'),g);g.getTestTemporalCandidates_=()=>({conversations:[{conversationId:'c',conversationDate:'2026-09-25',sourceAi:'gemini'}]});g.headerIndexMap_=h=>Object.fromEntries(h.map((s,i)=>[s,i]));
const fetched=vm.runInContext('getTestAnchorEvidence_({anchorTerm:"英語が多い"})',g);assert(fetched.found);assert.deepEqual(fullRows,[[3,2]]);assert.equal(fetched.bundle.messages.length,1);assert(!JSON.stringify(fetched.bundle).includes('OTHER_UNRELATED_ANALYSIS'));assert.equal(fetched.diagnostics.message_rows_read,2);assert.equal(fetched.diagnostics.anchor_metadata_rows_scanned,4);assert.equal(fetched.diagnostics.anchor_original_units_selected,4);
console.log('PASS: viewer names vs quotes/provenance/third parties; dedup skip and retained repeat/summary/followup; unique query fields; locator-first originals + no vector/comparison; no-match fallback; scoped GAS originals and truthful metadata scan');
