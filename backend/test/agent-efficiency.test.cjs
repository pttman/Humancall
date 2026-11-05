const {test}=require('node:test'),assert=require('node:assert/strict');
const {runAgent}=require('../agent.cjs');
const context=require('../agent-context.cjs');
const call=(name,args)=>({tool_calls:[{id:name,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const initial=()=>({settings:{stickersEnabled:false},tasks:[{id:'one',title:'核对资料',description:'需要保留的完整要求',status:'planned',recordedBy:'zhixu',internalMetadata:'x'.repeat(5000)},{id:'next',title:'下一项',status:'planned'}],reminders:[{id:'private',title:'无关提醒',note:'不应在任务修改结果重复发送',enabled:true}],projects:[],messages:[],supervisionEvents:[]});

test('combined planning and execution complete in three rounds; only changed records reach the model',async()=>{
  const state=initial();let rounds=0;
  const result=await runAgent({settings:state.settings,state,text:'完成资料核对',modelStep:async history=>{
    rounds++;
    if(rounds===1)return call('list_tasks',{});
    const output=JSON.parse(history.at(-1).content);
    if(rounds===2){
      assert.equal(output.tasks[0].description,'需要保留的完整要求');assert.equal(output.tasks[0].internalMetadata,undefined);
      return call('execute_actions',{steps:['记录资料核对完成'],actions:[{type:'complete_task',taskId:'one'}]});
    }
    assert.equal(rounds,3);assert.deepEqual(output.reminders,[]);
    assert.equal(output.tasks.find(t=>t.id==='one').status,'completed');
    assert.equal(output.tasks.find(t=>t.id==='next').status,'active'); // Include indirect changes too.
    assert.ok(history.at(-1).content.length<1000);
    return {content:'资料核对已完成。'};
  }});
  assert.equal(result.agent.steps,3);assert.equal(result.actions.length,1);assert.equal(result.dirty,true);
  assert.equal(result.draft.tasks[0].status,'completed');assert.equal(state.tasks[0].status,'planned');
  assert.deepEqual(result.agent.plan,['记录资料核对完成']);
});

test('combined steps cannot bypass querying or validation, and invalid plans never modify the draft',async()=>{
  for(const args of [
    {steps:['完成'],actions:[{type:'complete_task',taskId:'one'}]},
    {steps:[],actions:[{type:'create_task',title:'不应创建'}]},
    {steps:['x'.repeat(301)],actions:[{type:'create_task',title:'不应创建'}]}
  ]){
    const state=initial();let round=0;
    const result=await runAgent({settings:state.settings,state,text:'完成',modelStep:async history=>{
      if(!round++)return call('execute_actions',args);
      assert.ok(JSON.parse(history.at(-1).content).error);return {content:'未执行修改。'};
    }});
    assert.equal(result.dirty,false);assert.deepEqual(result.draft.tasks,state.tasks);
  }
});

test('plain text finalization retains pending clarification, deletion confirmation and disabled sticker tools',async()=>{
  const state=initial();let step=0;
  const result=await runAgent({settings:state.settings,state,text:'删除核对资料',modelStep:async(history,tools)=>{
    assert.ok(!tools.some(t=>['search_stickers','send_sticker'].includes(t.function.name)));
    return [call('list_tasks',{}),call('request_deletion',{taskId:'one'}),{content:'请确认删除。'}][step++];
  }});
  assert.deepEqual(result.actions,[{type:'delete_task',taskId:'one'}]);assert.equal(result.dirty,false);assert.deepEqual(result.draft.tasks,state.tasks);
  let n=0;
  const question=await runAgent({settings:state.settings,state,text:'核对资料怎么做',modelStep:async()=>[
    call('list_tasks',{}),call('ask_question',{taskId:'one',field:'details',question:'需要核对哪份资料？',quickReplies:['第一份','第二份']}),{content:'请补充。'}
  ][n++]});
  assert.equal(question.reply,'需要核对哪份资料？');assert.deepEqual(question.quickReplies,['第一份','第二份']);assert.equal(question.draft.agentContext.pendingQuestion.taskId,'one');
});

test('large history has a total budget while preserving current request and relative-date anchors',()=>{
  const now=new Date('2026-11-05T04:00:00.000Z'),text='当前请求'.repeat(2000);
  const messages=Array.from({length:16},(_,i)=>({role:i%2?'assistant':'user',content:'明天安排'+String(i)+'x'.repeat(12000),createdAt:'2026-11-04T10:00:00.000Z'}));
  const history=context.history(messages,text,now);
  assert.equal(history.at(-1).content,text);assert.ok(history.slice(0,-1).reduce((n,m)=>n+m.content.length,0)<=16000);
  assert.match(history[0].content,/"明天":"2026-11-05"/);assert.match(history[0].content,/历史内容已截短/);
  assert.match(history.at(-2).content,/明天安排15/);
});

test('new task IDs and refreshed parent status remain available in compact tool results',async()=>{
  const state=initial();state.tasks=[{id:'parent',title:'项目',isContainer:true,status:'planned'},{id:'child',parentId:'parent',title:'子任务',status:'planned'}];
  let round=0;
  const result=await runAgent({settings:state.settings,state,text:'完成子任务并新建工作',modelStep:async history=>{
    if(round++===0)return call('list_tasks',{});
    if(round===2)return call('execute_actions',{steps:['完成子任务','添加工作'],actions:[{type:'complete_task',taskId:'child'},{type:'create_task',title:'新工作'}]});
    const tasks=JSON.parse(history.at(-1).content).tasks;
    assert.equal(tasks.find(t=>t.id==='parent').status,'completed');assert.ok(tasks.find(t=>t.title==='新工作')?.id);
    return {content:'已记录。'};
  }});
  assert.equal(result.draft.tasks.find(t=>t.id==='parent').status,'completed');
});
