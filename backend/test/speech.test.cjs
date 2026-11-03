const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {synthesize}=require('../speech.cjs'),config=require('../../frontend/speech-config.js'),core=require('../core.cjs'),{createServer}=require('../server.cjs');
const settings=()=>config.normalize({enabled:true,apiKey:'voice-secret-key',rate:1.25});
const frames=(audio=Buffer.from('audio'))=>JSON.stringify({code:0,data:audio.toString('base64')})+'\n'+JSON.stringify({code:20000000,data:null})+'\n';

test('豆包 HTTP 分块与 SSE 均完整解析，按人物音色、独立 Key、资源和语速请求',async()=>{
  const a=Buffer.from('first'),b=Buffer.from('second');
  for(const sse of [false,true]){
    const body=[{code:0,message:'成功',data:a.toString('base64')},{code:0,data:b.toString('base64')},{code:20000000,data:null}].map(v=>(sse?'data: ':'')+JSON.stringify(v)+(sse?'\n\n':'\n')).join('');
    const bytes=Buffer.from(body),response=new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.subarray(i,i+7));controller.close();}}));
    const result=await synthesize({settings:settings(),friendId:'luye',text:'今天一件件来。',fetchImpl:async(url,options)=>{
      assert.equal(url,config.defaults.endpoint);assert.equal(options.redirect,'error');assert.equal(options.headers['X-Api-Key'],'voice-secret-key');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['X-Api-Resource-Id'],'seed-tts-2.0');assert.ok(options.headers['X-Api-Request-Id']);
      const body=JSON.parse(options.body);assert.equal(body.req_params.speaker,config.defaults.speakers.luye);assert.equal(body.req_params.audio_params.speech_rate,25);assert.equal(body.req_params.audio_params.format,'mp3');assert.equal(body.req_params.model,undefined);return response;
    }});
    assert.deepEqual(result.audio,Buffer.concat([a,b]));assert.equal(result.contentType,'audio/mpeg');
  }
});

test('鉴权、服务错误、截断、空音频和取消均清楚报错，错误不泄露语音 Key',async()=>{
  const run=response=>synthesize({settings:settings(),text:'测试',fetchImpl:async()=>response});
  await assert.rejects(run(new Response('voice-secret-key',{status:401})),/语音鉴权失败/);
  await assert.rejects(run(new Response(JSON.stringify({code:55000000,message:'bad voice-secret-key'}))),error=>!error.message.includes('voice-secret-key')&&error.message.includes('隐藏'));
  await assert.rejects(run(new Response(JSON.stringify({code:0,data:'YQ=='}))),/中途结束/);
  await assert.rejects(run(new Response(JSON.stringify({code:20000000}))),/空音频/);
  await assert.rejects(run(new Response('<html>bad</html>')),/无法解析/);
  let called=false;await assert.rejects(synthesize({settings:{...settings(),endpoint:'http://outside.example/tts'},text:'测试',fetchImpl:async()=>{called=true;}}),/HTTPS/);assert.equal(called,false);
  const controller=new AbortController();controller.abort();await assert.rejects(synthesize({settings:settings(),text:'测试',signal:controller.signal,fetchImpl:async(_url,options)=>{assert.equal(options.signal.aborted,true);throw Error('aborted');}}),/已取消/);
});

test('语音配置独立、清理文本并分段，备份不导出 Key，导入只复用地址匹配的本机 Key',()=>{
  const raw=settings(),redacted=require('../../frontend/model-presets.js').redact({apiKey:'chat-key',speech:raw});assert.equal(redacted.apiKey,'');assert.equal(redacted.speech.apiKey,'');assert.ok(!JSON.stringify(redacted).includes('voice-secret-key'));
  assert.equal(config.imported({...raw,apiKey:'backup-injected-key'},raw).apiKey,raw.apiKey);
  assert.equal(config.imported({...raw,endpoint:'https://other.example/tts'},raw).apiKey,'');
  const parts=config.segments('**你好**，看[这项安排](https://example.com)。\n```js\nsecret code\n```\n'+'今天会慢慢来。'.repeat(150));assert.ok(parts.length>1);assert.ok(parts.every(p=>Array.from(p).length<=300));assert.ok(!parts.join('').includes('https://'));assert.ok(!parts.join('').includes('secret code'));
  assert.equal(config.normalize().enabled,false);assert.equal(config.normalize({rate:100}).rate,2);
});

test('本地 HTTP 语音链路：按保存消息合成、草稿试听不保存、人物隔离、来源限制及备份脱敏',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-speech-'));core.configureDataDirectory(directory);const inputs=[];
  const upstream=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;inputs.push({key:req.headers['x-api-key'],body:JSON.parse(body)});res.writeHead(200,{'Content-Type':'application/json'});res.end(frames());});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const api=createServer();await new Promise(r=>api.listen(0,'127.0.0.1',r));t.after(async()=>{await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>upstream.close(r))]);fs.rmSync(directory,{recursive:true,force:true});});
  const endpoint=`http://127.0.0.1:${upstream.address().port}/tts`,base=`http://127.0.0.1:${api.address().port}`;
  const state=core.readState();state.settings.speech={...settings(),endpoint};state.messages=[{id:'reply',role:'assistant',content:'**先做这一项。**',createdAt:new Date().toISOString()},{id:'user',role:'user',content:'不要朗读用户消息'}];core.writeState(state);
  const send=(route,body,headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  let response=await send('/api/speech/synthesize',{messageId:'reply',friendId:'zhixu'});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from('audio'));assert.equal(inputs[0].body.req_params.text,'先做这一项。');assert.equal(inputs[0].key,'voice-secret-key');
  assert.equal((await send('/api/speech/synthesize',{messageId:'user'})).status,404);assert.equal((await send('/api/speech/synthesize',{messageId:'reply',friendId:'luye'})).status,404);assert.equal((await send('/api/speech/synthesize',{messageId:'reply',partIndex:99})).status,400);assert.equal((await send('/api/speech/synthesize',{messageId:'reply'},{Origin:'https://outside.example'})).status,403);
  const before=JSON.stringify(core.readState());response=await send('/api/speech/preview',{settings:{...settings(),endpoint,apiKey:'draft-only-key'},friendId:'luye'});assert.equal(response.status,200);await response.arrayBuffer();assert.equal(inputs.at(-1).key,'draft-only-key');assert.equal(inputs.at(-1).body.req_params.speaker,config.defaults.speakers.luye);assert.equal(JSON.stringify(core.readState()),before);
  assert.equal((await send('/api/speech/preview',{settings:{endpoint}})).status,400,'No saved key is silently attached to a draft endpoint');
  const backup=await(await fetch(base+'/api/backup')).json();assert.equal(backup.settings.speech.apiKey,'');backup.settings.speech.apiKey='backup-injected';assert.equal(core.normalizeImportedState(backup,core.readState()).settings.speech.apiKey,'voice-secret-key');
});

test('聊天模型不接收语音接口 Key、音色配置或头像',async()=>{
  const state={settings:{speech:settings(),stickersEnabled:false},tasks:[],reminders:[],projects:[],messages:[],supervisionEvents:[]};
  await require('../agent.cjs').runAgent({settings:state.settings,state,text:'你好',modelStep:async history=>{assert.ok(!JSON.stringify(history).includes('voice-secret-key'));assert.ok(!JSON.stringify(history).includes('uranus_bigtts'));return{role:'assistant',tool_calls:[{id:'finish',type:'function',function:{name:'finish',arguments:JSON.stringify({reply:'你好'})}}]};}});
});

test('两位伙伴仅使用指定的预设，旧内置音色迁移，自定义与有效备选保留',()=>{
  assert.deepEqual(config.voicesFor('zhixu').map(v=>v.id),['ICL_uranus_zh_female_lingdongxinxin_tob','zh_female_qinqienv_uranus_bigtts','zh_female_jiaochuannv_uranus_bigtts','zh_female_shuangkuaisisi_uranus_bigtts']);
  assert.deepEqual(config.voicesFor('luye').map(v=>v.id),['zh_male_taocheng_uranus_bigtts','zh_male_ruyayichen_uranus_bigtts','zh_male_kailangxuezhang_uranus_bigtts']);
  assert.deepEqual(config.normalize().speakers,{zhixu:'ICL_uranus_zh_female_lingdongxinxin_tob',luye:'zh_male_taocheng_uranus_bigtts'});
  const old=config.normalize({apiKey:'keep-key',autoRead:false,speakers:{zhixu:'zh_female_vv_uranus_bigtts',luye:'zh_male_m191_uranus_bigtts'}});
  const previousDefaults={zhixu:'zh_female_qinqienv_uranus_bigtts',luye:'zh_male_ruyayichen_uranus_bigtts'};assert.deepEqual(config.normalize({speakers:previousDefaults}).speakers,config.defaults.speakers);assert.deepEqual(config.normalize({defaultsVersion:config.DEFAULTS_VERSION,speakers:previousDefaults}).speakers,previousDefaults);
  assert.deepEqual(old.speakers,config.defaults.speakers);assert.equal(old.apiKey,'keep-key');assert.equal(old.autoRead,false);
  assert.deepEqual(config.normalize({speakers:{zhixu:'my-custom-voice',luye:'zh_male_taocheng_uranus_bigtts'}}).speakers,{zhixu:'my-custom-voice',luye:'zh_male_taocheng_uranus_bigtts'});
});

test('语音能力询问按真实配置回答，不调用聊天模型、不创建任务、不擅自打开自动输出',async()=>{
  const {chat}=require('../chat-service.cjs');
  for(const speech of [config.normalize(),settings(),{...settings(),autoRead:false}]){
    const state={settings:{apiKey:'configured-chat-key',speech},tasks:[],reminders:[],messages:[],supervisionEvents:[]};const before=structuredClone(state);
    const result=await chat({text:'你能说话吗?'},{readState:()=>state,agent:async()=>{throw Error('Direct capability question should not call model');},saveState:()=>{throw Error('No settings should be changed');}});
    assert.equal(result.source,'app');assert.match(result.reply,/可以/);assert.doesNotMatch(result.reply,/发不了|只能打字/);assert.deepEqual(result.actions,[]);assert.deepEqual(state,before);
    if(speech.enabled&&speech.apiKey&&!speech.autoRead)assert.match(result.reply,/关闭了自动语音输出/);
    if(!speech.enabled)assert.match(result.reply,/设置/);
  }
});

test('Agent 获得实时语音能力及手动模式事实，不暴露 Key 或承诺自动播放',async()=>{
  const state={settings:{speech:{...settings(),autoRead:false},stickersEnabled:false,systemPrompt:'旧角色描述：只能打字'},tasks:[],reminders:[],projects:[],messages:[{role:'assistant',content:'语音我发不了'}],supervisionEvents:[]};
  await require('../agent.cjs').runAgent({settings:state.settings,state,text:'想听你说句话',modelStep:async history=>{
    assert.match(history[0].content,/应用已支持语音输出/);assert.match(history[0].content,/"configured":true,"autoRead":false/);assert.match(history[0].content,/以这里的应用事实为准/);assert.match(history[0].content,/不承诺本轮自动播放/);assert.ok(!JSON.stringify(history).includes('voice-secret-key'));
    return{role:'assistant',tool_calls:[{id:'finish',type:'function',function:{name:'finish',arguments:JSON.stringify({reply:'可以，点这条消息旁的朗读就能听。'})}}]};
  }});
});
