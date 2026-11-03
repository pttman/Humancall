const {test}=require('node:test');
const assert=require('node:assert/strict');
const temporal=require('../temporal-context.cjs');
const {runAgent}=require('../agent.cjs');
const call=(name,args)=>({role:'assistant',tool_calls:[{id:name,type:'function',function:{name,arguments:JSON.stringify(args)}}]});

test('历史明天绑定原消息日期，跨月跨年依然得到原来那一天',()=>{
  const old=new Date(2026,11,31,22),now=new Date(2027,0,1,11);
  const history=temporal.history([{role:'user',content:'明天做',createdAt:old.toISOString()},{role:'assistant',content:'好，明早9:30',createdAt:old.toISOString()}],'环境还没调通',now);
  assert.match(history[0].content,/"明天":"2027-01-01"/);
  assert.match(history[1].content,/明早9:30/);
  assert.equal(history.at(-1).content,'环境还没调通');
  assert.ok(history.every(m=>Object.keys(m).every(k=>['role','content'].includes(k))));
  assert.deepEqual(temporal.stamp(new Date(2028,1,28,23)).relativeDates,{昨天:'2028-02-27',今天:'2028-02-28',明天:'2028-02-29'});
});

test('相同文本隔天重发不会吃掉历史；本轮已在消息列表中时只传一次',()=>{
  const now=new Date(2026,10,3,10),old=new Date(2026,10,2,22);
  const history=temporal.history([{role:'user',content:'明天做',createdAt:old.toISOString()},{role:'user',content:'明天做',createdAt:now.toISOString()}],'明天做',now);
  assert.equal(history.length,2);assert.match(history[0].content,/2026-11-03/);assert.equal(history[1].content,'明天做');
  assert.match(temporal.history([{role:'user',content:'明天做'}],'继续',now)[0].content,/不得猜测/);
});

test('昨天延期今天9:30：模型收到逐条时间依据和今天已过点，普通进度不变更任务',async()=>{
  const now=new Date(2026,10,3,11),old=new Date(2026,10,2,20),scheduled=new Date(2026,10,3,9,30).toISOString();
  const state={settings:{stickersEnabled:false},tasks:[{id:'data',title:'数聚',status:'planned',dueAt:scheduled,deferredUntil:scheduled}],reminders:[],projects:[],supervisionEvents:[],messages:[{role:'user',content:'数聚没做完，明天做',createdAt:old.toISOString()},{role:'assistant',content:'明早9:30留着',createdAt:old.toISOString()}]};
  let step=0;
  const result=await runAgent({settings:state.settings,state,text:'环境还在调试',clock:()=>now,modelStep:async history=>{
    assert.match(history[0].content,/昨天说的/);assert.match(history[0].content,/不等于用户同意延期/);
    assert.match(history[0].content,/"day":"今天","elapsed":true/);
    assert.match(history[1].content,/"明天":"2026-11-03"/);
    return ++step===1?call('list_tasks',{}):call('finish',{reply:'数聚原定今天9:30，已经过点了。你先调环境，原安排还留在清单里。'});
  }});
  assert.equal(result.dirty,false);assert.deepEqual(result.draft.tasks,state.tasks);assert.match(result.reply,/今天9:30/);
});

test('仅明确的本轮延期短句触发本地快捷处理，历史引用、否定和指定任务交给 Agent 判断',()=>{
 const {explicitTomorrow}=require('../../frontend/task-schedule.js');
 for(const text of ['明天做','明天再做吧','推到明天','把这个任务推迟到明天','那就明天做'])assert.equal(explicitTomorrow(text),true,text);
 for(const text of ['昨天说了明天做','不要明天做','你不是说过明天再做吗','明天做什么','数聚明天做','环境没好，你昨天说的明天做是今天吧'])assert.equal(explicitTomorrow(text),false,text);
});
