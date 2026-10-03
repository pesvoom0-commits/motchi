import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx=vm.createContext({URL,Response,AbortController,setTimeout,clearTimeout,console:{log(){},error(){}},Date,JSON});
vm.runInContext(fs.readFileSync('backend/test-diagnostics.js','utf8'),ctx);
ctx.env={GAS_ENDPOINT:'https://script.google.com/macros/s/test/exec',GAS_SHARED_SECRET:'test-secret',__testTrace:{stage:'qa_log_save',startedAt:Date.now(),events:[]}};
ctx.payload={action:'logTestAnswer',requestId:'r1'};let calls=[];
ctx.fetch=async(url,opts)=>{calls.push({url,opts});return calls.length%2?new Response('',{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?token=private'}}):new Response(JSON.stringify({ok:true,qaLogSaved:true,qaRow:3,qaRequestId:'TEST_r1'}),{headers:{'Content-Type':'application/json'}});};
await vm.runInContext('testGasRequest(env,payload)',ctx);assert.equal(calls[1].opts.method,'GET');assert(!calls[1].opts.body);assert.equal(ctx.env.__testTrace.gasResponses[0].status,200);
ctx.fetch=async()=>new Response('<!DOCTYPE html><title>Access denied</title>',{status:403,headers:{'Content-Type':'text/html'}});
await assert.rejects(vm.runInContext('testGasRequest(env,payload)',ctx),e=>e.transport.status===403&&e.transport.content_type==='text/html'&&e.transport.response_prefix.includes('Access denied'));
ctx.fetch=async()=>new Response('not-json',{headers:{'Content-Type':'application/json'}});await assert.rejects(vm.runInContext('testGasRequest(env,payload)',ctx),/Apps Script response/);
let retries=0;ctx.fetch=async()=>{retries++;return retries===1?new Response('<!DOCTYPE html>',{status:500,headers:{'Content-Type':'text/html'}}):new Response('{"ok":true,"qaLogSaved":true,"qaRow":3,"qaRequestId":"TEST_r1"}',{headers:{'Content-Type':'application/json'}});};await vm.runInContext('testGasRequest(env,payload)',ctx);assert.equal(retries,2);
ctx.payload.action='getTestTemporalCandidates';retries=0;ctx.fetch=async()=>{retries++;return new Response('<!DOCTYPE html>',{status:404,headers:{'Content-Type':'text/html'}});};await assert.rejects(vm.runInContext('testGasRequest(env,payload)',ctx));assert.equal(retries,2);
console.log('PASS: redirect GET without secret, HTML/status diagnostics, malformed JSON, idempotent log retry, read errors');

ctx.fetch=async()=>new Response('<!DOCTYPE html>',{status:403,headers:{'Content-Type':'text/html'}});
await assert.rejects(vm.runInContext('testGasRequest(env,payload)',ctx),e=>e.transport.status===403);
