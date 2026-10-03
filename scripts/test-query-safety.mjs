import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const c=vm.createContext({console,Response,URL,URLSearchParams,Date,Map,Set,Number,JSON,TextEncoder,setTimeout});
vm.runInContext(fs.readFileSync((process.argv[2]||'/private/tmp/motchi-fix2-extra')+'/worker.mjs','utf8').replace('export default','const worker='),c);
const run=(expr,args)=>{c.testArgs=args;return vm.runInContext(expr,c);};
for(const name of ['美砂','洋輔'])for(const pronoun of ['ワイ','私','僕','俺','うち']){
 const r=run('resolveTestQuery(testArgs.env,testArgs.prep,testArgs.q)',{env:{TEST_SESSION_USER_NAME:name},prep:{},q:`最近、${pronoun}について何か話してた？`});
 assert.equal(r.query,`最近、${name}について何か話してた？`);assert.equal(r.diagnostics.resolved_subject,name);
}
let r=run('resolveTestQuery(testArgs.env,testArgs.prep,testArgs.q)',{env:{TEST_SESSION_USER_NAME:'美砂'},prep:{authenticatedUser:{name:'洋輔'}},q:'僕について教えて'});assert.equal(r.diagnostics.resolved_subject,'洋輔');
r=run('resolveTestQuery({}, {}, testArgs)', '最近ワイについて何か話してた？');assert(r.unresolved);
r=run('resolveTestQuery(testArgs,{}, "洋輔さんが「俺は平気」と話した？")',{TEST_SESSION_USER_NAME:'美砂'});assert.equal(r.query,'洋輔さんが「俺は平気」と話した？');
let calls=[],logged,fail='',empty=false,ambiguous=false;
c.ensureV2TestSearchIndex=async()=>({vectorStoreId:'vs'});
c.gas=async(_e,b)=>{calls.push(b);if(b.action==='logTestAnswer'){logged=b;return {ok:true};}if(fail===b.action)throw Error('Original evidence HTML / 404');
 if(b.action==='getTestV2Evidence'||b.action==='getTestTemporalMessages')return {conversations:[{conversationId:'c',conversationDate:'2026-10-02',sourceAi:'gemini'}],messages:empty?[]:[{conversationId:'c',seq:1,role:'yosuke',text:'美砂の言葉が好きだ。'}]};
 if(b.action==='getTestTemporalCandidates')return {conversations:[{conversationId:'c',conversationDate:'2026-10-02',sourceAi:'gemini'}]};
 if(b.action==='getTestV2IndexState')return {vectorStoreId:'vs'};
 if(b.action==='getTestWhatsappEvidence')return {messages:[],messageRowsRead:0};throw Error(b.action);};
c.openaiJson=async(_e,path,{body})=>{calls.push({action:path,body});if(path.endsWith('/search'))return {data:[{attributes:{conversation_id:'c',start_seq:1,end_seq:1},content:[{type:'text',text:'conversation_id=c seq=1'}]}]};return {output_text:JSON.stringify(ambiguous?{clarification_needed:true,clarification_reason:'ambiguous_intent',clarification_question:'どの場面のこと？'}:{clarification_needed:false,answer:'美砂さんの言葉が好きと話してたよ。',evidence_quotes:['美砂の言葉が好きだ']}),usage:{input_tokens:2,output_tokens:3}};};
async function ask(q,history=[]){calls=[];c.args={env:{TEST_SESSION_USER_NAME:'美砂'},cors:{},body:{},q,conversation:history,prep:{requestId:'r',currentDateJst:'2026-10-03'},isTest:true};return JSON.parse(await(await vm.runInContext('handleV2TestAsk(args)',c)).text());}
r=await ask('最近、ワイについて何か話してた？');assert.equal(r.retrievalDiagnostics.diagnostics_json.original_query,'最近、ワイについて何か話してた？');assert.equal(r.retrievalDiagnostics.rewrite_query,'最近、美砂について何か話してた？');assert(calls.find(x=>x.action.endsWith('/search')).body.query.includes('美砂'));assert.equal(logged.question,'最近、ワイについて何か話してた？');assert.equal(r.retrievalDiagnostics.diagnostics_json.model_conversation_messages,0);
fail='getTestV2Evidence';r=await ask('洋輔さんは何を大切にしてる？');assert.equal(r.answer,'会話を取り直して、もう一度確認してもいい？');assert.equal(r.retrievalDiagnostics.answer_mode,'clarification');assert.equal(r.retrievalDiagnostics.diagnostics_json.clarification_reason,'evidence_unavailable');assert(!calls.some(x=>x.action==='/responses'));assert(r.retrievalDiagnostics.diagnostics_json.errors.length);fail='';
empty=true;r=await ask('最近何話してた？');assert.equal(r.retrievalDiagnostics.answer_mode,'clarification');assert(!calls.some(x=>x.action==='/responses'));empty=false;
fail='getTestTemporalMessages';r=await ask('最近何話してた？');assert.equal(r.retrievalDiagnostics.diagnostics_json.clarification_reason,'evidence_unavailable');fail='';
fail='getTestWhatsappEvidence';r=await ask('昨日、美砂と実際に何話してた？');assert.equal(r.retrievalDiagnostics.diagnostics_json.clarification_reason,'evidence_unavailable');assert.equal(r.retrievalDiagnostics.retrieval_mode,'whatsapp_text_scan');fail='';
r=await ask('美砂についてどう考えてる？');assert.equal(r.answer,'洋輔さんから見た美砂さんのこと？');assert.equal(r.retrievalDiagnostics.diagnostics_json.clarification_reason,'ambiguous_intent');assert(!calls.some(x=>x.action==='/responses'));
r=await ask('うん',[{role:'user',text:'美砂についてどう考えてる？'},{role:'assistant',text:'洋輔さんから見た美砂さんのこと？'}]);assert(r.retrievalDiagnostics.rewrite_query.includes('洋輔さんから見た'));assert.equal(r.retrievalDiagnostics.diagnostics_json.clarification_needed,false);
let d=run('acceptGroundedTestAnswer(testArgs, "美砂の言葉が好きだ。")',{output_text:'根拠のない長い人物解釈'});assert(d.diagnostics.clarification_needed);assert.equal(d.answer,'どの話や場面について知りたい？');
const history=[{role:'user',text:'今月の話は？'},{role:'assistant',text:'月の相談'}, {role:'user',text:'最近の美砂の話は？'},{role:'assistant',text:'人物について'}, {role:'user',text:'ものづくりは？'},{role:'assistant',text:'作る話'}];
const draft='現在の原文から確認した重複説明を長く書いた。';let edit;
c.openaiJson=async()=>({output_text:JSON.stringify(edit)});
async function compare(question){return await run('compareAndReduceTestAnswer({},testArgs)',{question,answer:draft,evidence:'今回の根拠原文',conversation:history,model:'test',route:'ai_person',plan:{}});}
edit={relation:'same_answer',pair_relations:['same_answer','new_topic','new_topic'],compared_pair_index:0,previous_answer_overlap:'yes',overlap_mode:'full',response_dedup_applied:true,removed_duplicate_spans:[draft],answer:'さっきと同じだよ。'};
d=await compare('今月の話は？');assert.equal(d.answer,draft);assert(d.diagnostics.response_dedup_error); // Old semantic match cannot suppress independent query.
edit={...edit,pair_relations:['same_answer','new_topic','subset']};d=await compare('その話は？');assert.equal(d.answer,draft);assert(d.diagnostics.response_dedup_error); // Must choose related immediate pair.
edit={...edit,pair_relations:['same_answer','new_topic','new_topic']};d=await compare('その話の続きは？');assert.equal(d.diagnostics.response_dedup_applied,true);assert.equal(d.diagnostics.comparison_anchor_offset,3);
edit={...edit,relation:'related_but_different',pair_relations:['new_topic','new_topic','related_but_different'],compared_pair_index:2,previous_answer_overlap:'no',overlap_mode:'none',answer:'新しい観点の回答。'};d=await compare('作るときの考え方は？');assert.equal(d.diagnostics.response_dedup_applied,false);assert.equal(d.diagnostics.response_rewrite_applied,true);
edit={...edit,previous_answer_overlap:'yes',overlap_mode:'partial',removed_duplicate_spans:['draftに存在しない箇所']};d=await compare('作るときの考え方は？');assert.equal(d.diagnostics.response_dedup_applied,false);
console.log('PASS: speaker identity priority, five pronouns, query before search, original QA question, unavailable evidence without generation, short clarification/confirmation, latest-first and explicit reference, deletion vs rewrite diagnostics');
