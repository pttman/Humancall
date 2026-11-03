const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chat}=require('../chat-service.cjs');
const {runAgent}=require('../agent.cjs');
const {modelError}=require('../model-client.cjs');
const initial=()=>({settings:{apiKey:'test',baseUrl:'http://unused',model:'mock',stickersEnabled:false},tasks:[],reminders:[],projects:[],messages:[],supervisionEvents:[]});
const call=(name,args)=>({role:'assistant',tool_calls:[{id:name,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
function executeAttempt(args,finish){
  const steps=[call('list_tasks',{}),call('set_plan',{steps:['记录报告任务']}),call('execute_actions',{actions:[{type:'create_task',title:'整理报告',status:'inbox'}]}),call('finish',{reply:'已记下。'})];
  return runAgent({...args,maxSteps:finish?4:3,modelStep:async()=>steps.shift()});
}
test('步数耗尽后重试两次，失败草稿丢弃，第三次成功只创建一条任务并保存一次',async()=>{
  let state=initial(),attempts=0,saves=0;
  const result=await chat({text:'我要整理报告'},{readState:()=>state,saveState:value=>{saves++;state=value;},agent:async args=>{
    attempts++;assert.equal(args.state.tasks.length,0);assert.equal(state.tasks.length,0);assert.equal(saves,0);
    return executeAttempt(args,attempts===3);
  }});
  assert.equal(attempts,3);assert.equal(saves,1);assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].title,'整理报告');assert.equal(result.agent.attempts,3);assert.equal(result.agent.trace.filter(s=>s.tool==='retry').length,2);
});
test('连续三次失败后停止，不提交任务，错误注明已经重试两次',async()=>{
  const state=initial();let attempts=0,saves=0;
  await assert.rejects(chat({text:'我要整理报告'},{readState:()=>state,saveState:()=>saves++,agent:args=>{attempts++;return executeAttempt(args,false);}}),error=>error.status===502&&/已自动重试 2 次/.test(error.message));
  assert.equal(attempts,3);assert.equal(saves,0);assert.equal(state.tasks.length,0);
});
test('第一次成功不重试；保存失败也不重新运行已经完成的 Agent',async()=>{
  const state=initial();let attempts=0,saves=0;
  const dependencies={readState:()=>state,saveState:()=>saves++,agent:args=>{attempts++;return executeAttempt(args,true);}};
  const result=await chat({text:'我要整理报告'},dependencies);assert.equal(attempts,1);assert.equal(saves,1);assert.equal(result.agent.attempts,1);
  attempts=0;saves=0;dependencies.saveState=()=>{saves++;throw Error('写入失败');};
  await assert.rejects(chat({text:'我要整理报告'},dependencies),/写入失败/);assert.equal(attempts,1);assert.equal(saves,1);
});
test('失败期间用户修改任务时停止重试，保留新状态',async()=>{
  const state=initial();let attempts=0;
  await assert.rejects(chat({text:'我要整理报告'},{readState:()=>state,saveState:()=>assert.fail('不应提交'),agent:async()=>{attempts++;state.tasks.push({id:'manual',title:'用户添加的任务',status:'inbox'});throw Error('Agent 达到执行步数上限');}}),error=>error.status===409);
  assert.equal(attempts,1);assert.equal(state.tasks[0].id,'manual');
});
test('模型请求临时失败也会重试，连接测试仍不写入数据',async()=>{
  const state=initial();let attempts=0;
  const result=await chat({text:'测试',testAgent:true},{readState:()=>state,saveState:()=>assert.fail('连接测试不应保存'),agent:async args=>{attempts++;if(attempts<3)throw Error('临时网络错误');return executeAttempt(args,true);}});
  assert.equal(attempts,3);assert.equal(result.dryRun,true);assert.deepEqual(result.actions,[]);assert.equal(state.tasks.length,0);
});

test('503 重试两次前分别退避 2、4 秒，不保存失败草稿，不提示改 Key',async()=>{
 const state=initial(),delays=[];let calls=0;
 await assert.rejects(chat({text:'你好'},{readState:()=>state,saveState:()=>assert.fail('不应提交'),random:()=>0,wait:async ms=>delays.push(ms),agent:async()=>{calls++;throw await modelError(Response.json({error:{message:'Service is too busy'}},{status:503}),state.settings);}}),error=>/已自动重试 2 次/.test(error.message)&&/服务商繁忙/.test(error.message)&&!/检查 API 配置/.test(error.message));
 assert.equal(calls,3);assert.deepEqual(delays,[2000,4000]);assert.equal(state.tasks.length,0);
});

test('429 遵守 Retry-After，等待期间状态变化会停止重试，长冷却不提前重发',async()=>{
 for(const changeDuringWait of [false,true]){
  const state=initial(),delays=[];let calls=0;
  const request=chat({text:'测试'},{readState:()=>state,saveState:()=>assert.fail('不应提交'),random:()=>0,wait:async ms=>{delays.push(ms);if(changeDuringWait)state.tasks.push({id:'manual',title:'新任务',status:'inbox'});},agent:async()=>{calls++;throw await modelError(Response.json({},{status:429,headers:{'Retry-After':'5'}}),state.settings);}});
  await assert.rejects(request,error=>changeDuringWait?error.status===409:/限流/.test(error.message));assert.equal(calls,changeDuringWait?1:3);assert.deepEqual(delays,changeDuringWait?[5000]:[5000,5000]);
 }
 const state=initial();let calls=0;
 await assert.rejects(chat({text:'测试'},{readState:()=>state,wait:()=>assert.fail('长冷却应结束本轮'),agent:async()=>{calls++;throw await modelError(Response.json({},{status:429,headers:{'Retry-After':'60'}}),state.settings);}}),/限流/);assert.equal(calls,1);
});

test('401 不再重复发请求，真实原因保留且不声称已重试两次',async()=>{
 const state=initial();let calls=0;
 await assert.rejects(chat({text:'测试'},{readState:()=>state,wait:()=>assert.fail('认证错误无需等待重试'),agent:async()=>{calls++;throw await modelError(Response.json({},{status:401}),state.settings);}}),error=>/API Key/.test(error.message)&&!/已自动重试/.test(error.message));assert.equal(calls,1);
});
