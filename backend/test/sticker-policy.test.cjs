const {test}=require('node:test');const assert=require('node:assert/strict');const {runAgent}=require('../agent.cjs');const {automaticSticker,stickerPolicy,family}=require('../sticker-policy.cjs');const {chooseSticker}=require('../stickers.cjs');
const initial=()=>({settings:{apiKey:'test',stickerFrequency:'lively'},tasks:[],reminders:[],messages:[],projects:[],supervisionEvents:[]});
const call=(name,args)=>({role:'assistant',tool_calls:[{id:Math.random().toString(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
test('连续对话可自动配不同动图，模型按双方上下文选择情绪，无需显式索要',async()=>{
 const state=initial();state.messages=[{role:'user',content:'报告终于交上去了'},{role:'assistant',content:'你刚才说今天很辛苦',sticker:{id:'cheer'}}];let requests=0;
 const result=await runAgent({settings:state.settings,state,text:'嗯，终于松了一口气',modelStep:async(history,tools)=>{assert.match(history[0].content,/lively/);assert.ok(history.some(m=>m.content.includes('报告终于')));assert.ok(tools.find(t=>t.function.name==='finish').function.parameters.required.includes('stickerMood'));return call('finish',{reply:'辛苦了，这一步很棒！',stickerMood:'celebrate',stickerQuery:'party'});},stickerSearch:async args=>{requests++;assert.equal(args.query,'party');assert.equal(args.mood,'celebrate');return {source:'local',stickers:[chooseSticker('party')]};}});
 assert.equal(requests,1);assert.equal(result.sticker.id,'party');assert.equal(result.dirty,false);assert.ok(result.agent.trace.some(t=>t.tool==='automatic_sticker'));
});
test('近期相同动图及换肤变体被排除，自动扩大同情绪检索找新图',async()=>{
 const state=initial();state.messages=[{role:'assistant',content:'做得好',sticker:{id:'noto:1f44f'}}];let calls=0;
 const result=await automaticSticker({settings:state.settings,state,text:'继续聊聊',finished:{stickerMood:'celebrate',stickerQuery:'clap'},search:async args=>{calls++;if(args.query)return {source:'online',stickers:[{id:'noto:1f44f_1f3fb',animated:true}]};return {source:'local',stickers:[chooseSticker('party')]};}});
 assert.equal(family('noto:1f44f_1f3fb'),'noto:1f44f');assert.equal(result.sticker.id,'party');assert.equal(calls,2);
});
test('适中、少用及关闭仍有效，none 和时限不足不会触发搜索',async()=>{
 const state=initial();state.messages=[{role:'assistant',content:'加油',sticker:{id:'cheer'}}];assert.equal(stickerPolicy({settings:state.settings,state,text:'嗯',id:'party'}),null);
 state.settings.stickerFrequency='balanced';assert.ok(stickerPolicy({settings:state.settings,state,text:'嗯',id:'party'}));state.settings.stickerFrequency='quiet';assert.ok(stickerPolicy({settings:state.settings,state,text:'嗯',id:'party'}));
 let calls=0;const search=async()=>{calls++;return {stickers:[]};};
 for(const finished of [{stickerMood:'none'},{stickerMood:'encourage'}])await automaticSticker({settings:{stickersEnabled:false},state,text:'给我动图',finished,search});
 await automaticSticker({settings:{},state,text:'你好',finished:{stickerMood:'none'},search});await automaticSticker({settings:{},state,text:'你好',finished:{stickerMood:'celebrate'},deadline:Date.now()+100,search});assert.equal(calls,0);
});
test('自动配图失败不回滚已执行任务，连接测试及静默不配图',async()=>{
 const state=initial();state.tasks=[{id:'one',title:'交报告',status:'planned'}];let steps=[call('list_tasks',{}),call('set_plan',{steps:['记录完成']}),call('execute_actions',{actions:[{type:'complete_task',taskId:'one'}]}),call('finish',{reply:'已记录完成',stickerMood:'celebrate'})];
 const result=await runAgent({settings:state.settings,state,text:'报告完成了',modelStep:async()=>steps.shift(),stickerSearch:async()=>{throw Error('offline');}});assert.equal(result.dirty,true);assert.equal(result.draft.tasks[0].status,'completed');assert.equal(result.sticker,null);
 let calls=0;for(const mode of ['connection_test','chat']){const r=await runAgent({settings:state.settings,state,text:'测试',mode,modelStep:async()=>call('finish',{reply:'完成',stickerMood:'encourage',silent:mode==='chat'}),stickerSearch:async()=>{calls++;return {stickers:[]};}});assert.equal(r.sticker,null);}assert.equal(calls,0);
});
