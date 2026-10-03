"""Add isolated TEST post-generation comparison without changing retrieval or GAS."""
def add_response_dedup(worker):
    anchor='  const totalBeforeLog = requestStartedAt'
    assert worker.count(anchor)==1
    worker=worker.replace(anchor,'''  if(isTest){
    const edited=await compareAndReduceTestAnswer(env,{question:q,answer,evidence:evidenceText,conversation,model,route:topLevelRoute.name,plan:temporalPlan});
    answer=edited.answer;
    Object.assign(retrievalDiagnostics.diagnostics_json,edited.diagnostics);
    if(edited.usage&&finalData?.usage){
      finalData.usage.input_tokens=(finalData.usage.input_tokens||0)+(edited.usage.input_tokens||0);
      finalData.usage.output_tokens=(finalData.usage.output_tokens||0)+(edited.usage.output_tokens||0);
    }
  }

'''+anchor)
    anchor='    `model=${finalData?.model || model}`,'
    assert worker.count(anchor)==1
    worker=worker.replace(anchor,"    isTest?formatResponseDedup(retrievalDiagnostics.diagnostics_json):'',\n"+anchor)
    return worker
