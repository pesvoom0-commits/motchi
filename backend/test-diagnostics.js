// TEST transport diagnostics; no source body, secret or personal content in console logs.
function markTestStage(env,stage){const t=env.__testTrace;if(!t)return;t.stage=stage;t.events.push({stage,ms:Date.now()-t.startedAt});console.log(JSON.stringify({test:true,stage,elapsed_ms:Date.now()-t.startedAt}));}
function formatTestTrace(t){return t?t.events.map(e=>`stage=${e.stage} elapsed_ms=${e.ms}`).join('\n'):'';}
function capPastConversationRange(plan,question,currentDate){
  if(!plan.range||/予定|未来|明日|来週|来月|来年|これから/.test(question))return;
  if(plan.range.to>currentDate)plan.range.to=currentDate;
}
async function testGasRequest(env,payload){
  const action=String(payload.action||'');
  const canRetry=action==='logTestAnswer'; // idempotent QA row and cached result
  for(let attempt=0;attempt<(canRetry?2:1);attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    const endpoint=new URL(env.GAS_ENDPOINT);
    let r,redirects=0;
    try{
      r=await fetch(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,secret:env.GAS_SHARED_SECRET}),redirect:'manual',signal:controller.signal});
      while([301,302,303,307,308].includes(r.status)&&redirects<3){
        const location=r.headers.get('Location');if(!location)break;
        const next=new URL(location,r.url||endpoint.href);
        if(next.protocol!=='https:'||next.hostname!=='script.googleusercontent.com')break;
        redirects++;r=await fetch(next.href,{method:'GET',redirect:'manual',signal:controller.signal});
      }
      const type=r.headers.get('Content-Type')||'',raw=await r.text();
      // Drop HTML tokens/query strings from the diagnostic excerpt.
      const prefix=raw.slice(0,240).replace(/https?:\/\/[^\s"'<>]+/g,'[url]').replace(/[\r\n]+/g,' ');
      const info={action,endpoint_host:endpoint.hostname,endpoint_kind:/\/exec$/.test(endpoint.pathname)?'exec':'unexpected',status:r.status,content_type:type,redirects,response_prefix:/^\s*</.test(raw)?prefix:'[non-HTML response]'};
      if(!r.ok||!/(?:application\/json|text\/json)/i.test(type)||!/^\s*[{[]/.test(raw)){
        const e=new Error('Apps Script response: '+JSON.stringify(info));e.transport=info;e.testStage=env.__testTrace.stage;throw e;
      }
      let d;try{d=JSON.parse(raw);}catch(_){const e=new Error('Apps Script invalid JSON: '+JSON.stringify(info));e.transport=info;throw e;}
      if(d.ok===false){const e=new Error(d.error||'Apps Script error');e.transport={...info,response_prefix:'[JSON error]'};throw e;}
      if(action==='logTestAnswer'&&(!d.qaLogSaved||!d.qaRow||!d.qaRequestId)){throw new Error('QA_LOG persistence acknowledgement missing');}
      if(env.__testTrace){env.__testTrace.gasResponses ||= [];env.__testTrace.gasResponses.push({...info,response_prefix:'[JSON]',qa_row:d.qaRow});}
      return d;
    }catch(e){
      if(e.name==='AbortError'){e=new Error('Apps Script timeout (30000 ms): '+action);e.testStage=env.__testTrace.stage;}
      console.error(JSON.stringify({test:true,stage:env.__testTrace.stage,action,error:String(e.message||e),transport:e.transport||null}));
      if(attempt+1===(canRetry?2:1))throw e;
    }finally{clearTimeout(timer);}
  }
}
