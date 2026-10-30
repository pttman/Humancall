const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const core=require('../core.cjs'),friends=require('../../frontend/friends.js'),book=require('../../frontend/record-book.js'),media=require('../../frontend/moment-media.js');
const {executeActions}=require('../actions.cjs'),{createMoments}=require('../moments.cjs'),{chooseMomentImage}=require('../moment-images.cjs');
test('双人物迁移、切换、保存和重新读取保持会话隔离，共享任务不改创建者，不复制连接密钥',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-friends-'));core.configureDataDirectory(directory);t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const legacy={settings:{apiKey:'only-in-global-settings',assistantName:'小序'},tasks:[],reminders:[],messages:[{id:'old',role:'user',content:'旧会话',createdAt:new Date().toISOString()}],supervisionEvents:[]};fs.writeFileSync(path.join(directory,'human-dispatch-state.json'),JSON.stringify(legacy));
  let state=core.readState();assert.equal(state.activeFriendId,'zhixu');assert.equal(state.friends.zhixu.messages[0].content,'旧会话');assert.equal(JSON.stringify(state.friends).includes('only-in-global-settings'),false);
  friends.select(state,'luye');assert.equal(state.messages.length,0);assert.equal(state.settings.apiKey,legacy.settings.apiKey);assert.match(state.settings.systemPrompt,/松弛损友/);state.messages.push({id:'new',role:'user',content:'陆野的会话'});
  executeActions(state,[{type:'create_task',title:'共同清单'}]);const id=state.tasks[0].id;assert.equal(state.tasks[0].recordedBy,'luye');core.writeState(state);state=core.readState();assert.equal(state.activeFriendId,'luye');assert.equal(state.messages[0].content,'陆野的会话');
  friends.select(state,'zhixu');assert.equal(state.settings.assistantName,'小序');assert.equal(state.messages[0].content,'旧会话');executeActions(state,[{type:'update_task',taskId:id,description:'由知序补充'}]);assert.equal(state.tasks[0].recordedBy,'luye');assert.equal(state.tasks[0].lastEditedBy,'zhixu');
  state.messages=[];core.writeState(state);state=core.readState();friends.select(state,'luye');assert.equal(state.messages[0].content,'陆野的会话');assert.equal(state.tasks[0].id,id);
});
test('历史只收起旧结束事项，未完成任务和未知日期保留，旧数据读取不补写猜测来源',()=>{
  const now=new Date(2026,9,30,10),yesterday=new Date(2026,9,29,23,59).toISOString();
  assert.equal(book.past(yesterday,now),true);assert.equal(book.today(new Date(2026,9,30,0,0).toISOString(),now),true);
  assert.equal(book.hiddenTask({status:'completed',completedAt:yesterday},now),true);assert.equal(book.hiddenTask({status:'active',createdAt:yesterday},now),false);assert.equal(book.hiddenTask({status:'completed'},now),false);
  const old={tasks:[{id:'legacy',status:'planned'}],reminders:[]},original=structuredClone(old);book.normalize(old);assert.deepEqual(old,original);assert.equal(book.actor(old.tasks[0].recordedBy),'unknown');
});
test('朋友圈选图失败仍发布文字，生成期间切换人物则丢弃候选',async()=>{
  const now=new Date(2026,9,30,10);let state={activeFriendId:'luye',settings:{apiKey:'fake-key',workStart:'00:00',workEnd:'23:59'},tasks:[],moments:[],momentActivity:{},messages:Array.from({length:3},(_,i)=>({role:'user',content:'聊点日常'+i,createdAt:new Date(now.getTime()-(i+3)*60000).toISOString()}))};
  const run=createMoments({readState:()=>state,clock:()=>now,model:async()=>({content:'脑内小剧场今日连演三场。',imageQuery:'小剧场'}),imageSelect:async()=>{throw Error('图片服务离线');}});const result=await run();assert.equal(result.moment.friendId,'luye');assert.equal(result.moment.content,'脑内小剧场今日连演三场。');assert.equal(result.moment.image,undefined);assert.equal((await run()).suppressed,true);
  const changed=createMoments({readState:()=>state,clock:()=>now,model:async()=>{state={...state,activeFriendId:'zhixu'};return{content:'不会发给另一位朋友的动态'};}});assert.equal((await changed()).suppressed,true);
});
test('朋友圈只接受真实候选的中文库图片，重复配图、无关ID和任意URL不会发布',async()=>{
  const image={id:'chinesebqb:'+'a'.repeat(64)+'.png',label:'歇一会',animated:false};let searches=0;const search=async()=>{searches++;return[image];};const settings={apiKey:'fake-key',baseUrl:'https://api.deepseek.com',model:'test'};
  const fetchImpl=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({id:image.id})}}]}));const result=await chooseMomentImage({settings,content:'今天先歇一会',query:'休息',search,fetchImpl});assert.equal(result.id,image.id);assert.match(media.get(result).url,/^https:\/\/zhaoolee\.com\/ChineseBQB\/media\/[a-f0-9]{64}\.png$/);
  assert.equal(await chooseMomentImage({settings,content:'休息',query:'休息',previous:[{image}],search,fetchImpl}),null);assert.equal(searches,1);
  assert.equal(await chooseMomentImage({settings,content:'休息',query:'休息',search,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'{"id":"untrusted"}'}}]}))}),null);
  assert.equal(media.get({url:'https://untrusted.example/image.png'}),null);
});
