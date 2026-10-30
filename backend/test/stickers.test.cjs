const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {runAgent}=require('../agent.cjs');const {searchStickers,chooseSticker}=require('../stickers.cjs');
const call=(name,args)=>({role:'assistant',tool_calls:[{id:Math.random().toString(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const initial=()=>({settings:{apiKey:'test',onlineStickersEnabled:false},tasks:[],reminders:[],projects:[],messages:[],supervisionEvents:[]});
async function run(state,text='给我一个加油表情包',extra=[]) {const replies=[call('search_stickers',{mood:'encourage'}),call('send_sticker',{id:'cheer'}),...extra,call('finish',{reply:'先迈一小步，加油！'})];return runAgent({settings:state.settings,state,text,modelStep:async()=>replies.shift()});}
test('表情库提供静态、动画及静态备用素材，只允许内置 id',()=>{
 const all=searchStickers();assert.equal(all.length,8);assert.equal(all.filter(s=>s.animated).length,4);
 for(const item of all){for(const url of [item.url,item.stillUrl])assert.ok(fs.existsSync(path.join(__dirname,'../../frontend',url)));if(item.animated){assert.match(fs.readFileSync(path.join(__dirname,'../../frontend',item.url),'utf8'),/@keyframes/);assert.ok(!fs.readFileSync(path.join(__dirname,'../../frontend',item.stillUrl),'utf8').includes('@keyframes'));}}
 assert.equal(searchStickers('rest',true)[0].id,'rest');assert.throws(()=>chooseSticker('https://untrusted.example/a.gif'),/不存在/);
});
test('Agent 查找并选择图片，最多一张，不修改任务',async()=>{
 const state=initial();const result=await run(state,undefined,[call('send_sticker',{id:'cheer'})]);assert.equal(result.sticker.id,'cheer');assert.equal(result.dirty,false);assert.equal(result.actions.length,0);assert.ok(result.agent.trace.some(s=>s.status==='error'&&s.summary.includes('最多')));assert.deepEqual(state.tasks,[]);
});
test('关闭开关和相邻消息限频生效，显式要求表情时允许',async()=>{
 const disabled=initial();disabled.settings.stickersEnabled=false;assert.equal((await run(disabled)).sticker,null);
 const recent=initial();recent.messages.push({role:'assistant',content:'加油',sticker:{id:'cheer'}});assert.equal((await run(recent,'帮我安排工作')).sticker,null);assert.equal((await run(recent,'再发一次加油表情包')).sticker.id,'cheer');
});
test('未查询的外部 id 被拒绝；静默结束不会发图',async()=>{
 const state=initial();let list=[call('send_sticker',{id:'https://evil.example/a.svg'}),call('finish',{reply:'纯文字'})];const result=await runAgent({settings:state.settings,state,text:'测试',modelStep:async()=>list.shift()});assert.equal(result.sticker,null);assert.equal(result.agent.trace[0].status,'error');
 list=[call('search_stickers',{mood:'rest'}),call('send_sticker',{id:'rest'}),call('finish',{reply:'暂不打扰',silent:true})];assert.equal((await runAgent({settings:state.settings,state,text:'后台检查',mode:'check_in',modelStep:async()=>list.shift()})).sticker,null);
});
