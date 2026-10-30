const {test}=require('node:test');const assert=require('node:assert/strict');const {createOnlineSearch,termsFor}=require('../online-stickers.cjs');const {resolveSticker}=require('../../frontend/online-sticker.js');const {searchStickerCandidates}=require('../stickers.cjs');const {runAgent}=require('../agent.cjs');
const hash='a'.repeat(64),large='b'.repeat(64),still='c'.repeat(64);const id='chinesebqb:'+hash+'.gif';
const index=[{src:'media/'+hash+'.gif',label:'猫和老鼠00318-鼓掌',categoryTitle:'猫和老鼠',animated:true,bytes:1000},{src:'media/'+large+'.gif',label:'熊猫00001-鼓掌',categoryTitle:'熊猫头',animated:true,bytes:1000},{src:'../evil.gif',label:'鼓掌',categoryTitle:'猫',bytes:1000},{src:'media/'+still+'.png',label:'奥特曼00119-收到',categoryTitle:'奥特曼',animated:false,bytes:1000},{src:'media/'+'d'.repeat(64)+'.gif',label:'滑稽-鼓掌',categoryTitle:'滑稽大佬',animated:true,bytes:1000},{src:'media/'+'e'.repeat(64)+'.png',label:'负鼠-收到办不到',categoryTitle:'负鼠',animated:false,bytes:1000},{src:'media/'+'f'.repeat(64)+'.gif',label:'超级英雄00001-猫猫出击',categoryTitle:'超级英雄',animated:true,bytes:1000}];
const response=()=>new Response(JSON.stringify(index),{status:200,headers:{'content-type':'application/json'}});
test('中文库全部分类参与检索，仅过滤错误路径和过大媒体，缓存减少请求',async()=>{
 let requests=0;const search=createOnlineSearch({fetchImpl:async(url,opts)=>{requests++;assert.ok(url.startsWith('https://zhaoolee.com/ChineseBQB/'));if(opts.method!=='HEAD')return response();return new Response(null,{status:200,headers:{'content-type':url.endsWith('.png')?'image/png':'image/gif','content-length':url.includes(large)?'9000000':'1000'}});}});
 const results=await search({query:'鼓掌'});assert.equal(results.length,2);assert.equal(results[0].id,id);assert.equal(results[0].provider,'chinesebqb');assert.equal(requests,4);
 await search({query:'clap'});assert.equal(requests,4);assert.deepEqual(await search({query:'notfound'}),[]);await assert.rejects(search({query:'a'.repeat(81)}),/80/);
 const ack=await search({query:'收到',animated:true});assert.equal(ack.length,2);assert.equal(ack[0].animated,false);assert.deepEqual(termsFor('猫猫 加油'),['猫','加油']);const cats=await search({query:'猫猫'});assert.ok(cats.some(s=>s.label.includes('超级英雄')),'角色关键词不会排除其他分类');assert.ok(results.some(s=>s.label.includes('滑稽')),'不排除特定画风');assert.ok(ack.some(s=>s.label.includes('办不到')),'不因题材文字排除索引素材');
});
test('中文表情 URL 仅由哈希重建；静态预览、旧 Emoji 记录继续兼容，忽略不可信 URL',()=>{
 const result=resolveSticker({id,url:'https://evil.example/a.gif',stillUrl:'javascript:alert(1)',label:'鼓掌',animated:true});assert.equal(result.url,'https://zhaoolee.com/ChineseBQB/media/'+hash+'.gif');assert.equal(result.stillUrl,'https://zhaoolee.com/ChineseBQB/thumbs/'+hash+'.webp');assert.equal(resolveSticker({id:'chinesebqb:../../secret'}),null);assert.equal(resolveSticker({id:'https://evil.example/a.gif'}),null);assert.equal(resolveSticker({id:'cheer'}).id,'cheer');assert.equal(resolveSticker({id:'noto:1f44f'}).provider,'noto');
});
test('联网开关关闭不发请求，失败时明确标记内置回退',async t=>{
 const previous=global.fetch;t.after(()=>{global.fetch=previous;});let requests=0;global.fetch=async()=>{requests++;throw Error('offline');};
 let output=await searchStickerCandidates({mood:'encourage'},{onlineStickersEnabled:false});assert.equal(output.source,'local');assert.equal(requests,0);
 output=await searchStickerCandidates({query:'鼓掌',mood:'celebrate'},{});assert.equal(output.fallback,true);assert.equal(output.source,'local');assert.match(output.warning,/联网.*失败/);assert.ok(output.stickers.length>0);
});
test('Agent 自动在线查询后发送中文表情 GIF，持久化完整元数据，不生成任务',async t=>{
 const previous=global.fetch;t.after(()=>{global.fetch=previous;});global.fetch=async(url,opts)=>opts.method==='HEAD'?new Response(null,{status:200,headers:{'content-type':'image/gif','content-length':'1000'}}):response();
 const call=(name,args)=>({role:'assistant',tool_calls:[{id:Math.random().toString(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
 const steps=[call('search_stickers',{query:'鼓掌'}),call('send_sticker',{id}),call('finish',{reply:'做得好！'})];const state={settings:{apiKey:'test'},tasks:[],reminders:[],messages:[],projects:[],supervisionEvents:[]};
 const result=await runAgent({settings:state.settings,text:'给我一个中文鼓掌动图',state,modelStep:async()=>steps.shift()});assert.equal(result.sticker.provider,'chinesebqb');assert.equal(result.sticker.id,id);assert.equal(result.sticker.label,'猫和老鼠00318-鼓掌');assert.equal(result.dirty,false);assert.deepEqual(result.actions,[]);assert.ok(result.agent.trace.some(s=>s.summary.includes('联网搜索')));
});
