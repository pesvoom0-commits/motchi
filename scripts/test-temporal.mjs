import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync((process.argv[2]||'/private/tmp/motchi-2.2.013')+'/worker.mjs','utf8').replace('export default','const worker =');
const context=vm.createContext({console,Response,URL,URLSearchParams,Date,Map,Set,Number,JSON,TextEncoder,setTimeout});
vm.runInContext(code,context);
const plan=q=>JSON.parse(vm.runInContext(`JSON.stringify(buildTemporalSearchPlan(${JSON.stringify(q)},'2026-10-03'))`,context));
const cases=[
 ['今月もっちは何話してた？','temporal_range','2026-10-01','2026-10-31'],
 ['今週何話してた？','temporal_range','2026-09-28','2026-10-03'],
 ['今年何話してた？','temporal_range','2026-01-01','2026-10-03'],
 ['最近何相談してた？','temporal_recent','2026-09-27','2026-10-03'],
 ['最近、美砂について何か話してた？','temporal_then_semantic','2026-09-27','2026-10-03'],
 ['10月2日は何相談してた？','temporal_exact','2026-10-02','2026-10-02'],
 ['2026/10/02の相談内容は？','temporal_exact','2026-10-02','2026-10-02'],
 ['先週の相談まとめて','temporal_range','2026-09-21','2026-09-27'],
 ['9月中旬から月末まで何話してた？','temporal_range','2026-09-11','2026-09-30'],
 ['9月20日から10月2日まで何話してた？','temporal_range','2026-09-20','2026-10-02'],
 ['ここ数日、美砂について何か話してた？','temporal_then_semantic','2026-10-01','2026-10-03'],
 ['先月、仕事のことで相談してた？','temporal_then_semantic','2026-09-01','2026-09-30'],
 ['最後に相談したの何？','temporal_latest',null,null],
 ['一番最近の相談は？','temporal_latest',null,null],
 ['美砂についてどう考えてる？','semantic',null,null],
 ['前にメンタルについて何て話してた？','semantic',null,null]
];
for(const [q,p,from,to]of cases){const got=plan(q);assert.equal(got.searchPlan,p,q);assert.equal(got.range?.from??null,from,q);assert.equal(got.range?.to??null,to,q);}
assert.throws(()=>plan('2026/02/30に何相談した？'));
const conv=[{conversationId:'c1',conversationDate:'2026-10-02',sourceAi:'chatgpt_master',title:'TITLE MUST NOT BE FACT'}, {conversationId:'c2',conversationDate:'2026-10-01',sourceAi:'gemini',title:'another'}];
const messages=conv.flatMap(c=>[1,2,3].map(seq=>({...c,seq,role:seq===2?'assistant':'yosuke',text:seq===1?'美砂の話を相談した':seq===2?'AIによる分析':'仕事も相談した'})));
let calls=[],logged,requestInstructions='';let empty=false;
context.gas=async(_env,b)=>{calls.push(b);switch(b.action){
 case 'getTestTemporalCandidates':return {conversations:empty?[]:b.latest?conv.slice(0,1):conv};
 case 'getTestTemporalMessages':return {conversations:conv.filter(c=>b.conversationIds.includes(c.conversationId)),messages:messages.filter(m=>b.conversationIds.includes(m.conversationId))};
 case 'getTestV2IndexState':return {vectorStoreId:'vs'};
 case 'getTestV2Evidence':return {conversations:conv,messages};
 case 'getTestV2Recent':return {conversations:conv,messages};
 case 'getTestWhatsappEvidence':return {messages:[{date:'2026-10-02',time:'12:00',speaker:'岡本洋輔',text:'本人発言',seq:1},{date:'2026-10-02',time:'12:01',speaker:'みちゃこ',text:'前後文脈',seq:2}],candidateCount:2,messageRowsRead:2,filename:'WhatsAppメッセージ（2026/05/23〜）.txt'};
 case 'logTestAnswer':case 'logAnswer':logged=b;return {ok:true};
 default:throw new Error('unexpected gas '+b.action);
}};
context.ensureV2TestSearchIndex=async()=>{calls.push({action:'index'});return {vectorStoreId:'vs'};};
context.openaiJson=async(_env,path,options)=>{calls.push({action:path,body:options?.body});if(path.endsWith('/search'))return {data:[]};requestInstructions=options.body.instructions;return {output_text:'テスト用回答',model:'test',usage:{input_tokens:1,output_tokens:1}};};
async function ask(q,isTest=true){calls=[];logged=null;context.args={env:{},cors:{},body:{model:'luna'},q,conversation:[],prep:{currentDateJst:'2026-10-03',requestId:'test1',character:'ORIGINAL_CHARACTER',aiRules:'RULES'},isTest};return JSON.parse(await(await vm.runInContext('handleV2TestAsk(args)',context)).text());}
let result=await ask('最近何相談してた？');
assert.deepEqual(calls.slice(0,2).map(x=>x.action),['getTestTemporalCandidates','getTestTemporalMessages']);assert(!calls.some(x=>x.action.endsWith('/search')));assert.equal(result.retrievalDiagnostics.diagnostics_json.message_rows_read,6);assert(requestInstructions.includes('ORIGINAL_CHARACTER'));assert(requestInstructions.includes('[seq=3'));
result=await ask('最近、美砂について何か話してた？');assert.equal(result.retrievalDiagnostics.vector_result_count,0);assert.equal(result.retrievalDiagnostics.diagnostics_json.message_rows_read,6);assert(result.retrievalDiagnostics.diagnostics_json.fallback_used);assert(calls[2].action==='getTestV2IndexState');const filters=calls.find(x=>x.action.endsWith('/search')).body.filters;assert.deepEqual(filters.filters.map(x=>x.value),['c1','c2']);assert.equal(logged.retrievalDiagnostics.temporal_mode,'then_semantic');
result=await ask('10月2日は何相談してた？');assert.equal(result.retrievalDiagnostics.question_pattern,'temporal_exact');assert(!calls.some(x=>x.action==='getTestV2Recent'));
result=await ask('最後に相談したの何？');assert.deepEqual(result.retrievalDiagnostics.candidate_conversation_ids,['c1']);assert.equal(result.retrievalDiagnostics.resolved_time_range.from,'2026-10-02');
empty=true;result=await ask('最近何相談してた？');assert.equal(result.retrievalDiagnostics.candidate_conversation_ids.length,0);assert(requestInstructions.includes('記録上、その期間の会話は確認できません。'));empty=false;
result=await ask('昨日、美砂と実際に何話してた？');assert.equal(result.retrievalDiagnostics.route,'direct_conversation');assert.equal(result.retrievalDiagnostics.retrieval_mode,'whatsapp_text_scan');assert(requestInstructions.includes('前後文脈'));assert(!calls.some(x=>x.action==='index'||x.action==='getTestTemporalCandidates'));
result=await ask('美砂についてどう考えてる？');assert.equal(result.retrievalDiagnostics.question_pattern,'semantic');assert.equal(calls[0].action,'index');assert(calls.some(x=>x.action.endsWith('/search')));assert(!calls.some(x=>x.action==='getTestTemporalCandidates'));
result=await ask('最近何相談してた？',false);assert.equal(calls[0].action,'index');assert(!result.retrievalDiagnostics);assert.equal(logged.action,'logAnswer');
result=await ask('あなたは誰？');assert.equal(result.retrievalDiagnostics.answer_mode,'fixed_route');assert.equal(logged.action,'logTestAnswer');
assert(!fs.readFileSync('test/index.html','utf8').includes('detailAnswerCopyButton'));assert(fs.readFileSync('test/app.js','utf8').includes("'### 検索・取得情報'"));assert(fs.readFileSync('test/app.js','utf8').includes("'### リクエスト'"));assert(!fs.readFileSync('styles.css','utf8').includes('#adminButton{background:#b6dc68'));
result=await ask('今月もっちは何話してた？');assert.equal(result.retrievalDiagnostics.resolved_time_range.to,'2026-10-03');
context.testPlan={range:{from:'2026-10-01',to:'2026-10-31'}};vm.runInContext("capPastConversationRange(testPlan,'今月の予定は？','2026-10-03')",context);assert.equal(context.testPlan.range.to,'2026-10-31');
context.args={...context.args,isTest:true,q:'10月2日は何話してた？',conversation:[{role:'user',text:'OLD QUESTION'},{role:'assistant',text:'OLD_CONTRADICTORY_ANSWER'}]};await vm.runInContext('handleV2TestAsk(args)',context);assert(!requestInstructions.includes('OLD_CONTRADICTORY_ANSWER'));assert.equal(logged.retrievalDiagnostics.diagnostics_json.model_conversation_messages,0);
context.args.q='それについてもっと教えて';await vm.runInContext('handleV2TestAsk(args)',context);assert(requestInstructions.includes('OLD_CONTRADICTORY_ANSWER'));
assert(fs.readFileSync('test/app.js','utf8').includes('copyAction.hidden=false'));
console.log('PASS: date/topic cases + 9 retrieval/routing/regression scenarios + UI invariants');
