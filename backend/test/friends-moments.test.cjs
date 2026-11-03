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

test('旧的中文表情配图保持兼容，不接受任意外部 URL',()=>{
 const image={id:'chinesebqb:'+'a'.repeat(64)+'.png',label:'歇一会',animated:false};assert.match(media.get(image).url,/zhaoolee/);assert.equal(media.get({url:'https://untrusted.example/image.png'}),null);
});
test('片刻在线选图去重、下载到缓存，并保留来源，不使用内置摄影图',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'moment-photo-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const image={id:'commons:123',label:'Coffee cup',description:'A cup beside a window',remoteUrl:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Coffee.jpg/1280px-Coffee.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Coffee.jpg',artist:'Photographer',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'};
 const settings={apiKey:'fake-key',baseUrl:'https://chat.example/v1',model:'test',stickersEnabled:false,onlineStickersEnabled:false};let selected=image.id,downloads=0;
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const fetchImpl=async(url,options)=>{if(url===image.remoteUrl){downloads++;assert.equal(options.headers?.Authorization,undefined);return new Response(bytes);}assert.match(url,/chat\/completions$/);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({id:selected})}}]}));};
 const result=await chooseMomentImage({settings,content:'先喝杯咖啡。',query:'coffee cup',search:async()=>[image],fetchImpl,cacheDirectory:directory});assert.match(result.id,/^remote:[a-f0-9]{64}\.png$/);assert.equal(result.artist,'Photographer');assert.deepEqual(fs.readFileSync(path.join(directory,result.id.slice(7))),bytes);assert.match(media.get(result).url,/^\/api\/moment-media\//);
 assert.equal(await chooseMomentImage({settings,content:'休息',query:'coffee',previous:[{image:result}],search:async()=>[image],fetchImpl,cacheDirectory:directory}),null);assert.equal(downloads,1);
 selected='photo:coffee';assert.equal(await chooseMomentImage({settings,content:'休息',query:'coffee',search:async()=>[image],fetchImpl,cacheDirectory:directory}),null);assert.equal(downloads,1);
 selected=image.id;assert.equal(await chooseMomentImage({settings,content:'休息',query:'coffee',search:async()=>[image],fetchImpl:async()=>{throw Error('离线');},cacheDirectory:directory}),null);
 const state={settings:{},moments:[{id:'moment',content:'咖啡',createdAt:new Date().toISOString(),image:result}]};require('../../frontend/companion.js').normalize(state);assert.equal(state.moments[0].image.sourceId,'commons:123');
});
test('在线图库 API 返回候选时筛掉小图、非位图和无来源图片',async()=>{
 const {searchPhotos}=require('../moment-images.cjs');const info={mime:'image/jpeg',width:1600,height:1200,thumburl:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Coffee.jpg/1280px-Coffee.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Coffee.jpg',extmetadata:{Artist:{value:'<a>作者</a>'},LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}};
 const fetchImpl=async(url,options)=>{assert.equal(options.headers.Authorization,undefined);const params=new URL(url).searchParams;assert.equal(params.get('gsrnamespace'),'6');return new Response(JSON.stringify({query:{pages:[{pageid:1,title:'File:Coffee.jpg',imageinfo:[info]},{pageid:2,title:'File:Small.jpg',imageinfo:[{...info,width:30,height:30}]},{pageid:3,title:'File:Vector.svg',imageinfo:[{...info,mime:'image/svg+xml'}]}]}}));};
 const candidates=await searchPhotos({query:'coffee cup',fetchImpl});assert.equal(candidates.length,1);assert.equal(candidates[0].artist,'作者');assert.equal(candidates[0].id,'commons:1');
});
test('选图期间新增聊天不丢弃动态；发布日期使用选图结束时刻',async()=>{
 let now=new Date(2026,10,2,10);const state={activeFriendId:'zhixu',settings:{apiKey:'test',workStart:'00:00',workEnd:'23:59'},tasks:[],moments:[],messages:Array.from({length:3},(_,i)=>({role:'user',content:'日常'+i,createdAt:new Date(now-600000).toISOString()}))};
 const run=createMoments({readState:()=>state,clock:()=>now,model:async()=>({content:'今天咖啡续命。',imageQuery:'coffee cup'}),imageSelect:async()=>{state.messages.push({role:'user',content:'继续聊天',createdAt:now.toISOString()});now=new Date(now.getTime()+120000);return null;}});const result=await run();assert.equal(result.moment.content,'今天咖啡续命。');assert.equal(result.moment.createdAt,now.toISOString());
});

test('陆野旧默认名称与角色文案迁移到枫言，保留人物 ID、历史记录和自定义资料',()=>{
 const oldPrompt=friends.LUYE_PROMPT.replace('枫言','陆野');const state={activeFriendId:'luye',settings:{assistantName:'陆野',assistantBio:friends.presets.luye.assistantBio.replace('枫言','陆野'),systemPrompt:oldPrompt,tonePrompts:{'松弛损友':oldPrompt}},messages:[{id:'past',role:'assistant',content:'我是陆野。'}],tasks:[],reminders:[],moments:[]};
 friends.normalize(state);assert.equal(state.settings.assistantName,'枫言');assert.equal(state.activeFriendId,'luye');assert.equal(state.settings.systemPrompt,friends.LUYE_PROMPT);assert.equal(state.friends.luye.settings.tonePrompts['松弛损友'],friends.LUYE_PROMPT);assert.equal(state.messages[0].content,'我是陆野。');assert.equal(state.messages[0].id,'past');
 state.settings.assistantName='小枫';state.settings.assistantBio='我的自定义介绍';state.settings.systemPrompt='我的角色提示词';friends.normalize(state);assert.equal(state.settings.assistantName,'小枫');assert.equal(state.settings.assistantBio,'我的自定义介绍');assert.equal(state.settings.systemPrompt,'我的角色提示词');
});

function dailyState(now){return{activeFriendId:'zhixu',settings:{apiKey:'test',workStart:'00:00',workEnd:'23:59'},tasks:[],moments:[],momentActivity:{},messages:Array.from({length:3},(_,i)=>({id:'today-'+i,role:'user',content:'今天的话题'+i,createdAt:new Date(now-180000-i*1000).toISOString()}))};}

test('瞬笺素材只取本地当天至现在，排除昨天和未来的聊天与任务',()=>{
 const now=new Date(2026,10,3,10),state=dailyState(now),yesterday=new Date(2026,10,2,23,59).toISOString(),future=new Date(now.getTime()+60000).toISOString();
 state.messages.push({role:'user',content:'昨天的内容',createdAt:yesterday},{role:'assistant',content:'未来内容',createdAt:future});
 state.tasks=[{id:'old',title:'昨天完成',status:'completed',completedAt:yesterday},{id:'future',title:'未来更新',updatedAt:future},{id:'new',title:'今天完成',status:'completed',completedAt:new Date(now-120000).toISOString()}];
 const data=require('../moments.cjs').evidence(state,now);assert.equal(data.users.length,3);assert.equal(data.dialogue.length,3);assert.deepEqual(data.tasks.map(t=>t.id),['new']);
 state.messages=state.messages.filter(m=>m.createdAt===yesterday);state.tasks=state.tasks.slice(0,1);assert.equal(require('../moments.cjs').evidence(state,now).enough,false);
});

test('凌晨不补发昨天内容；昨天已发满不占今天的发布额度',async()=>{
 const now=new Date(2026,10,3,0,10),state=dailyState(now);state.moments=Array.from({length:8},(_,i)=>({id:'old-'+i,friendId:'zhixu',content:'昨天动态',createdAt:new Date(2026,10,2,23,59,i).toISOString()}));
 let calls=0;const run=createMoments({readState:()=>state,clock:()=>now,model:async(settings,data,previous,clock)=>{calls++;assert.equal(settings.assistantName,'知序');assert.equal(settings.assistantFriendId,'zhixu');assert.equal(previous.length,0);assert.equal(clock,now);assert.ok(data.users.every(m=>book.today(m.at,now)));return{content:'今天刚开始。'};}});
 const result=await run();assert.equal(result.moment.friendId,'zhixu');assert.equal(calls,1);
 const oldOnly=dailyState(now);oldOnly.messages.forEach(m=>m.createdAt=new Date(2026,10,2,23,59).toISOString());const noPost=createMoments({readState:()=>oldOnly,clock:()=>now,model:async()=>{throw Error('不应调用模型');}});assert.deepEqual(await noPost(),{suppressed:true});
});

test('生成或慢速选图跨过午夜时丢弃昨天候选，等待新一天素材',async()=>{
 let now=new Date(2026,10,3,23,59),state=dailyState(now);const run=createMoments({readState:()=>state,clock:()=>now,model:async()=>({content:'昨天的感受',imageQuery:'coffee'}),imageSelect:async()=>{now=new Date(2026,10,4,0,1);return null;}});
 assert.deepEqual(await run(),{suppressed:true});assert.equal(state.moments.length,0);
});

test('每位发布者使用各自资料，生成期间改人物不能串发',async()=>{
 const now=new Date(2026,10,3,10),state=dailyState(now);friends.normalize(state);state.settings.assistantName='小序';state.settings.assistantAvatar='/avatars/zhixu-group1.png';
 const run=createMoments({readState:()=>state,clock:()=>now,model:async settings=>{assert.equal(settings.assistantName,'小序');assert.equal(settings.assistantAvatar,'/avatars/zhixu-group1.png');return{content:'小序今天的感受'};}});assert.equal((await run()).moment.friendId,'zhixu');
 const switching=createMoments({readState:()=>state,clock:()=>now,model:async()=>{friends.select(state,'luye');return{content:'不能记在枫言名下'};}});assert.deepEqual(await switching(),{suppressed:true});
});
