const {test}=require('node:test'); const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {runAgent}=require('../agent.cjs'); const core=require('../core.cjs'); const {createServer}=require('../server.cjs');
const initial=()=>({settings:{apiKey:'test',baseUrl:'http://unused',model:'mock'},tasks:[{id:'one',title:'检查配置',status:'planned'}],reminders:[],projects:[],messages:[],supervisionEvents:[]});
const call=(name,args)=>({role:'assistant',tool_calls:[{id:Math.random().toString(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const sequence=items=>async(history)=>{const next=items.shift();assert.ok(next,'模型调用次数超出预期');if(typeof next==='function')return next(history);return next;};
test('工具循环观察错误后修正，执行结果可查询，原状态未被修改',async()=>{
 const state=initial();
 const result=await runAgent({settings:state.settings,text:'完成配置检查',state,modelStep:sequence([
 call('list_tasks',{}),call('set_plan',{steps:['检查当前任务','记录完成状态']}),call('execute_actions',{actions:[{type:'complete_task',taskId:'missing'}]}),
 h=>{assert.match(h.at(-1).content,/尚未查询/);return call('execute_actions',{actions:[{type:'complete_task',taskId:'one'}]});},
 call('list_tasks',{status:'completed'}),h=>{assert.match(h.at(-1).content,/检查配置/);return call('finish',{reply:'已记录完成'});}
 ])});
 assert.equal(result.draft.tasks[0].status,'completed');assert.equal(state.tasks[0].status,'planned');assert.equal(result.actions.length,1);assert.ok(result.agent.trace.some(s=>s.status==='error'));assert.ok(!JSON.stringify(result.agent).includes('apiKey'));
});
test('失败批次不会执行一半；未查询不能修改、未知工具与超预算被阻止',async()=>{
 const state=initial();
 const result=await runAgent({settings:state.settings,text:'测试',state,modelStep:sequence([
 call('set_plan',{steps:['测试校验']}),call('list_tasks',{}),call('execute_actions',{actions:[{type:'complete_task',taskId:'one'},{type:'create_reminder',title:'错误提醒'}]}),call('finish',{reply:'校验失败，没有执行'})])});
 assert.equal(result.draft.tasks[0].status,'planned');assert.equal(result.dirty,false);
 await assert.rejects(runAgent({settings:state.settings,text:'测试',state,maxSteps:2,modelStep:async()=>call('unknown',{})}),/步数上限/);
});
test('新建任务可通过真实 ID 继续操作，延期时间被验证',async()=>{
 const state=initial();
 const result=await runAgent({settings:state.settings,text:'添加工作',state,modelStep:sequence([
 call('set_plan',{steps:['添加并开始工作']}),call('execute_actions',{actions:[{type:'create_task',title:'新工作'}]}),
 h=>{const task=JSON.parse(h.at(-1).content).tasks.find(t=>t.title==='新工作');return call('execute_actions',{actions:[{type:'block_task',taskId:task.id}]});},call('finish',{reply:'新工作阻塞'})])});
 assert.equal(result.draft.tasks.find(t=>t.title==='新工作').status,'blocked');
});
test('删除只生成确认请求，不修改草稿',async()=>{
 const state=initial(); const result=await runAgent({settings:state.settings,text:'删除配置检查',state,modelStep:sequence([call('list_tasks',{}),call('request_deletion',{taskId:'one'}),call('finish',{reply:'请确认删除'})])});
 assert.deepEqual(result.actions,[{type:'delete_task',taskId:'one'}]);assert.equal(result.dirty,false);assert.equal(result.draft.tasks.length,1);
});
test('真实 HTTP 工具协议提交一次，模型失败与并发修改不覆盖数据',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-agent-'));core.configureDataDirectory(dir);
 let n=0,mode='success';
 const model=require('node:http').createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);assert.ok(body.tools.some(t=>t.function.name==='execute_actions'));
 if(mode==='failure'){res.writeHead(500);return res.end();}
 const replies=[call('list_tasks',{}),call('set_plan',{steps:['完成配置检查']}),call('execute_actions',{actions:[{type:'complete_task',taskId:'one'}]}),call('finish',{reply:'完成',followUpMinutes:10})];
 if(mode==='conflict'&&n===3){const updated=core.readState();updated.tasks[0].title='用户手动改名';core.writeState(updated);}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:replies[n++]}]}));});
 await new Promise(r=>model.listen(0,'127.0.0.1',r));
 const api=createServer();await new Promise(r=>api.listen(0,'127.0.0.1',r));
 t.after(async()=>{await Promise.all([new Promise(r=>model.close(r)),new Promise(r=>api.close(r))]);fs.rmSync(dir,{recursive:true,force:true});});
 const state=initial();state.settings.baseUrl=`http://127.0.0.1:${model.address().port}/v1`;core.writeState(state);
 const run=(extra={})=>fetch(`http://127.0.0.1:${api.address().port}/api/ai/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'完成检查配置',...extra})});
 let response=await run();assert.equal(response.status,200);const result=await response.json();assert.equal(result.applied,true);assert.equal(result.state.tasks[0].status,'completed');assert.equal(core.readState().tasks.length,1);
 n=0;core.writeState(state);response=await run({settings:state.settings,testAgent:true});assert.equal(response.status,200);assert.equal((await response.json()).dryRun,true);assert.equal(core.readState().tasks[0].status,'planned');
 mode='failure';core.writeState(state);response=await run();assert.equal(response.status,502);assert.equal(core.readState().tasks[0].status,'planned');
 mode='conflict';n=0;response=await run();assert.equal(response.status,409);assert.equal(core.readState().tasks[0].title,'用户手动改名');assert.equal(core.readState().tasks[0].status,'planned');
});

test('每轮刷新时钟，15:20 完成任务后以当前时间处理原定 15:00 的下一项',async()=>{
 const state=initial();state.settings.stickersEnabled=false;state.tasks.push({id:'next',title:'准备报告',status:'planned',startsAt:new Date(2026,10,2,15,0).toISOString()});
 let tick=new Date(2026,10,2,15,19);
 const result=await runAgent({settings:state.settings,state,text:'检查配置已完成',clock:()=>tick,modelStep:sequence([
 h=>{assert.ok(h[0].content.includes(tick.toISOString()));return call('list_tasks',{});},
 call('set_plan',{steps:['记录完成','核对当前时间并安排下一项']}),
 ()=>{tick=new Date(2026,10,2,15,20);return call('execute_actions',{actions:[{type:'complete_task',taskId:'one'}]});},
 h=>{assert.ok(h[0].content.includes(tick.toISOString()));assert.match(h[0].content,/不能把过去的时间说成接下来/);return call('get_current_time',{});},
 h=>{assert.equal(JSON.parse(h.at(-1).content).iso,tick.toISOString());return call('finish',{reply:'现在 15:20，报告原定 15:00 开始，已经过了。现在开始还是改个时间？'});}
 ])});assert.equal(result.draft.tasks.find(t=>t.id==='one').status,'completed');
});
test('未给时间的新工作先落清单并绑定追问，补时间更新同一条，不自动开工',async()=>{
 const state=initial();state.settings.stickersEnabled=false;
 const result=await runAgent({settings:state.settings,state,text:'我要整理季度资料',modelStep:sequence([
 call('ask_question',{requestQuote:'我要整理季度资料',field:'startsAt',question:'想什么时候开始整理？'}),call('finish',{reply:'请补充时间'})
 ])});const task=result.draft.tasks.find(t=>t.title==='我要整理季度资料');assert.ok(task);assert.equal(task.status,'inbox');assert.equal(result.question.taskId,task.id);assert.equal(result.dirty,true);
 const next=await runAgent({settings:state.settings,state:result.draft,text:'明天下午两点',modelStep:sequence([
 call('list_tasks',{}),call('set_plan',{steps:['补充开始时间']}),call('execute_actions',{actions:[{type:'update_task',taskId:task.id,status:'planned',startsAt:new Date(Date.now()+86400000).toISOString()}]}),call('finish',{reply:'已补充时间'})
 ])});assert.equal(next.draft.tasks.length,result.draft.tasks.length);assert.equal(next.draft.agentContext.pendingQuestion,null);
});
test('无效追问参数不会留下半条新任务',async()=>{
 const state=initial();state.settings.stickersEnabled=false;
 const result=await runAgent({settings:state.settings,state,text:'我要写报告',modelStep:sequence([call('ask_question',{requestQuote:'我要写报告',field:'startsAt',question:'什么时候？',quickReplies:'错误类型'}),call('finish',{reply:'请重试'})])});assert.equal(result.dirty,false);assert.equal(result.draft.tasks.length,1);
});

test('本地规则模式未给时间也先记录再问，重复原话不重复建任务',()=>{
 const result=core.localFallback('我要整理季度资料',[]);assert.equal(result.actions[0].status,'inbox');assert.match(result.reply,/已记入清单/);assert.match(result.reply,/什么时候/);
 assert.deepEqual(core.localFallback('我要整理季度资料',[{id:'one',title:'我要整理季度资料',status:'inbox'}]).actions,[]);
});

test('普通模型回复也返回按场景生成的选项，澄清优先使用问题自己的选项',async()=>{
 const state=initial();state.settings.stickersEnabled=false;
 let result=await runAgent({settings:state.settings,state,text:'先整理报告吧',modelStep:sequence([call('finish',{reply:'可以先核对数据，再写结论。',quickReplies:['先核对数据','我想先写结论','先核对数据']})])});assert.deepEqual(result.quickReplies,['先核对数据','我想先写结论']);
 result=await runAgent({settings:state.settings,state,text:'检查配置怎么办',modelStep:sequence([call('list_tasks',{}),call('ask_question',{taskId:'one',field:'details',question:'你想先查哪一块配置？',quickReplies:['连接配置','权限配置']}),call('finish',{reply:'请补充',quickReplies:['其他建议']})])});assert.deepEqual(result.quickReplies,['连接配置','权限配置']);
 result=await runAgent({settings:state.settings,state,text:'暂时不要打扰',modelStep:sequence([call('finish',{reply:'好',quickReplies:['先查配置'],silent:true})])});assert.deepEqual(result.quickReplies,[]);
});
test('选项过长时模型可修正，不使用固定回复兜底',async()=>{
 const state=initial();state.settings.stickersEnabled=false;
 const result=await runAgent({settings:state.settings,state,text:'继续',modelStep:sequence([call('finish',{reply:'继续',quickReplies:['长'.repeat(41)]}),h=>{assert.match(h.at(-1).content,/1–40/);return call('finish',{reply:'继续',quickReplies:[]});}])});assert.deepEqual(result.quickReplies,[]);
});

test('通知可以自然结束，不强制选项；聊天约束覆盖自定义角色的套话倾向',async()=>{
 const state=initial();state.settings.stickersEnabled=false;
 const result=await runAgent({settings:state.settings,state,text:'知道了',modelStep:async(history,tools)=>{assert.match(history[0].content,/不机械地总结和升华/);assert.match(history[0].content,/不用为了凑选项/);assert.ok(!tools.find(t=>t.function.name==='finish').function.parameters.required.includes('quickReplies'));return call('finish',{reply:'嗯。'});}});assert.deepEqual(result.quickReplies,[]);assert.equal(result.reply,'嗯。');
});
