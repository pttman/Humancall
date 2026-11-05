const {randomUUID}=require('node:crypto');

// Explicit context survives cloned Agent drafts and works in the mobile runtime too.
function settingsWithUsage(settings,{kind='chat',friendId='',taskId=''}={}){
  return {...settings,generationUsage:settings.generationUsage||{id:randomUUID(),kind,friendId,taskId}};
}
function counts(usage){
  const valid=n=>Number.isSafeInteger(n)&&n>=0;
  const input=usage?.prompt_tokens??usage?.input_tokens,output=usage?.completion_tokens??usage?.output_tokens;
  const total=valid(usage?.total_tokens)?usage.total_tokens:valid(input)&&valid(output)&&valid(input+output)?input+output:null;
  return {input:valid(input)?input:null,output:valid(output)?output:null,total};
}
async function generationFetch(url,options,{settings,purpose,fetchImpl}){
  const context=settings.generationUsage||{id:randomUUID(),kind:purpose};
  const record={id:randomUUID(),operationId:context.id,kind:context.kind,friendId:context.friendId||'',taskId:context.taskId||'',purpose,model:settings.model,createdAt:new Date().toISOString(),input:null,output:null,total:null,status:'pending'};
  const save=()=>require('./core.cjs').recordGenerationUsage(record);
  save();
  try{
    const response=await fetchImpl(url,options),json=response.json.bind(response);
    record.status=response.ok?'received':'error';save();
    response.json=async()=>{
      try{const body=await json();Object.assign(record,counts(body?.usage));record.status=response.ok?'ok':'error';save();return body;}
      catch(error){record.status='error';save();throw error;}
    };
    return response;
  }catch(error){record.status='error';save();throw error;}
}
function linkTask(settings,taskId){
  if(!taskId||!settings.generationUsage)return;
  const core=require('./core.cjs'),state=core.readState();
  if(!(state.generationUsage||[]).some(row=>row.operationId===settings.generationUsage.id))return;
  for(const row of state.generationUsage||[])if(row.operationId===settings.generationUsage.id)row.taskId=taskId;
  core.writeState(state,{usageWrite:true});
}
module.exports={settingsWithUsage,counts,generationFetch,linkTask};
