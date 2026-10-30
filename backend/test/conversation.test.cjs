const {test}=require('node:test');const assert=require('node:assert/strict');
const {runAgent}=require('../agent.cjs');const {createSupervisor}=require('../supervisor.cjs');
const state=()=>({settings:{apiKey:'test',baseUrl:'http://mock',model:'mock',notifications:true,passiveNudgesEnabled:true,workStart:'00:00',workEnd:'23:59',passiveNudgeMinutes:10},tasks:[{id:'meeting',title:'上午开会',kind:'meeting',status:'planned'}],reminders:[],messages:[],projects:[],supervisionEvents:[]});
const call=(name,args)=>({role:'assistant',tool_calls:[{id:Math.random().toString(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const steps=list=>async(history)=>{const next=list.shift();assert.ok(next);return typeof next==='function'?next(history):next;};
test('会议缺少开始时间：澄清问题被持久化候选状态承载，不擅自启动任务',async()=>{
 const initial=state();const result=await runAgent({settings:initial.settings,text:'我上午要开个会',state:initial,modelStep:steps([call('list_tasks',{}),call('ask_question',{taskId:'meeting',field:'startsAt',question:'上午的会议几点开始？'}),call('finish',{reply:'等你补充'})])});
 assert.equal(result.reply,'上午的会议几点开始？');assert.equal(result.contextDirty,true);assert.equal(result.draft.agentContext.pendingQuestion.taskId,'meeting');assert.equal(result.draft.tasks[0].status,'planned');assert.equal(result.dirty,false);
});
test('九点开始会更新同一会议并清除已解答问题；未来会议不会自动开工',async()=>{
 const initial=state();initial.agentContext={pendingQuestion:{id:'q',taskId:'meeting',field:'startsAt',question:'几点开始？'}};
 const start=new Date(Date.now()+86400000).toISOString();
 const result=await runAgent({settings:initial.settings,text:'九点开始，大概一个小时',state:initial,context:{taskId:'meeting',questionId:'q'},modelStep:steps([
 h=>{assert.match(h[0].content,/pendingQuestion|几点开始/);assert.match(h[0].content,/questionId/);return call('list_tasks',{});},call('set_plan',{steps:['补充已有会议时间']}),call('execute_actions',{actions:[{type:'update_task',taskId:'meeting',startsAt:start,durationMinutes:60,status:'planned'}]}),call('finish',{reply:'已记录开始时间'})])});
 assert.equal(result.draft.tasks.length,1);assert.equal(result.draft.tasks[0].startsAt,start);assert.equal(result.draft.tasks[0].durationMinutes,60);assert.equal(result.draft.tasks[0].status,'planned');assert.equal(result.draft.agentContext.pendingQuestion,null);
});
test('主动模式拒绝修改任务，允许提问和决定不打扰',async()=>{
 const initial=state();const result=await runAgent({settings:initial.settings,text:'检查会议安排',state:initial,mode:'check_in',modelStep:steps([call('execute_actions',{actions:[{type:'complete_task',taskId:'meeting'}]}),h=>{assert.match(h.at(-1).content,/不允许/);return call('finish',{reply:'此刻不用打扰',silent:true});}])});
 assert.equal(result.silent,true);assert.equal(result.dirty,false);assert.equal(result.draft.tasks[0].status,'planned');
});
test('主动气泡使用模型问题和快捷回复，重复检查限频且不落库',async()=>{
 const current=state();let count=0;
 const supervise=createSupervisor({readState:()=>current,clock:()=>new Date(2026,9,30,8),agent:async args=>{count++;assert.equal(args.mode,'check_in');assert.equal(args.context.taskId,'meeting');return {source:'agent',reply:'fallback',question:{id:'q',taskId:'meeting',field:'startsAt',question:'会议具体几点开始？',quickReplies:['还没确定']}};}});
 const result=await supervise();assert.equal(result.body,'会议具体几点开始？');assert.deepEqual(result.quickActions,[{label:'还没确定',message:'还没确定'}]);assert.equal(current.agentContext,undefined);assert.equal((await supervise()).suppressed,true);assert.equal(count,1);
});
test('进行中会议、静默、模型失败及生成时状态变更都不发固定催办',async()=>{
 const current=state(),now=new Date(2026,9,30,9,30);current.tasks[0].startsAt=new Date(2026,9,30,9).toISOString();current.tasks[0].durationMinutes=60;
 let count=0;const supervise=createSupervisor({readState:()=>current,clock:()=>now,agent:async()=>{count++;throw Error('offline');}});
 assert.equal((await supervise()).suppressed,true);assert.equal(count,0);
 delete current.tasks[0].startsAt;current.settings.quietUntil=new Date(now.getTime()+60000).toISOString();assert.equal((await supervise()).suppressed,true);assert.equal(count,0);
 current.settings.quietUntil='';const error=await supervise();assert.equal(error.unavailable,true);assert.equal(error.body,undefined);
 const changed=createSupervisor({readState:()=>current,clock:()=>now,agent:async()=>{current.messages.push({role:'user',content:'稍后再说'});return {reply:'旧问题'};}});assert.equal((await changed()).suppressed,true);
});
test('details 回答映射到 description；无绑定任务的时间追问在新建会议后解除',async()=>{
 for (const linked of [true,false]) {
  const initial=state();initial.agentContext={pendingQuestion:{id:'q',taskId:linked?'meeting':null,field:linked?'details':'startsAt'}};
  const action=linked?{type:'update_task',taskId:'meeting',description:'季度报告'}:{type:'create_task',kind:'meeting',title:'新会议',startsAt:new Date(Date.now()+86400000).toISOString(),status:'planned'};
  const result=await runAgent({settings:initial.settings,text:'补充信息',state:initial,modelStep:steps([call('list_tasks',{}),call('set_plan',{steps:['记录回答']}),call('execute_actions',{actions:[action]}),call('finish',{reply:'已记录'})])});
  assert.equal(result.draft.agentContext.pendingQuestion,null);
 }
});
test('临近会议优先于活跃工作；进行中会议不阻塞其他待确认事项',async()=>{
 const current=state(),now=new Date(2026,9,30,9);
 current.tasks.unshift({id:'work',title:'日常工作',status:'active'});current.tasks[1].startsAt=new Date(now.getTime()+5*60000).toISOString();let chosen;
 const supervise=createSupervisor({readState:()=>current,clock:()=>now,agent:async args=>{chosen=args.context.taskId;return {reply:'准备开始了吗？'};}});
 await supervise();assert.equal(chosen,'meeting');
 current.tasks[1].startsAt=new Date(now.getTime()-5*60000).toISOString();current.tasks[1].durationMinutes=60;
 const another=createSupervisor({readState:()=>current,clock:()=>now,agent:async args=>{chosen=args.context.taskId;return {reply:'工作安排有需要调整的吗？'};}});
 await another();assert.equal(chosen,'work');
});
