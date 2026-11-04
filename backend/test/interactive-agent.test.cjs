const {test}=require('node:test'),assert=require('node:assert/strict');
const merge=require('../../frontend/state-merge.js'),nudge=require('../../frontend/nudge-settings.js'),friends=require('../../frontend/friends.js');
const {chat}=require('../chat-service.cjs'),{runAgent}=require('../agent.cjs');
const initial=()=>friends.normalize({settings:{apiKey:'test',baseUrl:'http://unused',model:'mock',stickersEnabled:false},tasks:[],reminders:[],projects:[],messages:[],supervisionEvents:[],agentContext:null});
const finish=args=>runAgent({...args,modelStep:async()=>({role:'assistant',tool_calls:[{id:'done',type:'function',function:{name:'finish',arguments:JSON.stringify({reply:'记下了。',stickerMood:'none'})}}]})});
test('主动督促默认30分钟，旧默认10迁移，自定义间隔与新版选择保持',()=>{
 assert.equal(nudge.normalize().passiveNudgeMinutes,30);assert.equal(nudge.normalize({passiveNudgeMinutes:10}).passiveNudgeMinutes,30);
 assert.equal(nudge.normalize({passiveNudgeMinutes:20}).passiveNudgeMinutes,20);assert.equal(nudge.normalize({passiveNudgeMinutes:10,nudgeSettingsVersion:1}).passiveNudgeMinutes,10);
 assert.equal(nudge.normalize({passiveNudgesEnabled:false}).passiveNudgesEnabled,false);
 const fs=require('node:fs');assert.ok(!fs.readFileSync(require.resolve('../../frontend/index.html'),'utf8').includes('id="reminderInput"'));
});
test('等待模型时切换伙伴，原请求继续完成并写回原伙伴上下文，不切回页面',async()=>{
 let state=initial(),saved=0;
 const response=await chat({text:'聊聊今天',friendId:'zhixu'},{readState:()=>structuredClone(state),saveState:value=>{saved++;state=value;},agent:async args=>{
  friends.select(state,'luye');state.messages.push({id:'luye-note',role:'assistant',content:'在这里。'});friends.normalize(state);
  const result=await finish(args);result.contextDirty=true;result.draft.agentContext={pendingQuestion:null,marker:'zhixu-only'};return result;
 }});
 assert.equal(response.reply,'记下了。');assert.equal(saved,1);assert.equal(state.activeFriendId,'luye');assert.equal(state.messages.at(-1).id,'luye-note');assert.equal(state.friends.zhixu.agentContext.marker,'zhixu-only');assert.notEqual(state.agentContext?.marker,'zhixu-only');
});
test('回复期间手动改清单时不提交过期操作；取消请求不重试且不提交',async()=>{
 let state=initial(),attempts=0;
 await assert.rejects(chat({text:'聊聊今天',friendId:'zhixu'},{readState:()=>state,saveState:()=>assert.fail('不能覆盖手动修改'),agent:async args=>{state.tasks.push({id:'manual',title:'刚刚添加',status:'inbox'});return finish(args);}}),error=>error.status===409);
 assert.equal(state.tasks[0].title,'刚刚添加');state=initial();const controller=new AbortController();
 await assert.rejects(chat({text:'聊聊今天',friendId:'zhixu'},{signal:controller.signal,readState:()=>state,saveState:()=>assert.fail('取消不得提交'),agent:async args=>{attempts++;controller.abort();return finish({...args,signal:undefined});}}),error=>error.status===499);
 assert.equal(attempts,1);
});
test('Agent刚提交时手动保存，合并新任务及双方不同字段，不复活已删除记录',()=>{
 const base=initial();base.tasks=[{id:'a',title:'旧标题',status:'inbox',description:'原说明'},{id:'deleted',title:'稍后删除'}];
 const server=structuredClone(base);server.tasks[0].status='active';server.tasks.push({id:'agent-new',title:'模型创建'});server.tasks=server.tasks.filter(t=>t.id!=='deleted');server.agentContext={marker:'new-context'};
 const incoming=structuredClone(base);incoming.tasks[0].title='手动改名';const result=merge.shared(merge.baseOf(base),incoming,server);
 assert.equal(result.tasks.find(t=>t.id==='a').title,'手动改名');assert.equal(result.tasks.find(t=>t.id==='a').status,'active');assert.equal(result.tasks.find(t=>t.id==='agent-new').title,'模型创建');assert.ok(!result.tasks.some(t=>t.id==='deleted'));assert.equal(result.agentContext.marker,'new-context');
 incoming.tasks=[];assert.deepEqual(merge.shared(merge.baseOf(base),incoming,server).tasks.map(t=>t.id),['agent-new']);
 const baseline=merge.baseOf(base);assert.ok(!JSON.stringify(baseline).includes('apiKey'));
});
