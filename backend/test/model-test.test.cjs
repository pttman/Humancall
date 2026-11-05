const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {testModel}=require('../model-test.cjs'),core=require('../core.cjs'),{createServer}=require('../server.cjs');
const settings=()=>({baseUrl:'https://api.deepseek.com',apiKey:'chat-secret',model:'deepseek-flash',speech:{apiKey:'voice-secret'},systemPrompt:'private persona'});
const reply=message=>Response.json({choices:[{message}]});
const toolReply=()=>({role:'assistant',tool_calls:[{function:{name:'connection_check',arguments:'{"ok":true}'}}]});

test('连接测试只发送最小探测，不包含人物、语音 Key、任务或完整 Agent 工具',async()=>{
  let calls=0;const result=await testModel(settings(),{fetchImpl:async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer chat-secret');assert.equal(body.thinking.type,'disabled');assert.equal(body.tool_choice,'auto');assert.equal(body.tools.length,1);assert.equal(body.tools[0].function.name,'connection_check');assert.ok(!options.body.includes('voice-secret'));assert.ok(!options.body.includes('private persona'));assert.ok(!options.body.includes('execute_actions'));return reply(toolReply());}});
  assert.equal(calls,1);assert.equal(result.connected,true);assert.equal(result.toolCalling,'confirmed');
});

test('纯文本响应或工具不兼容不会误报 Key 失效，区分连通与 Agent 工具能力',async()=>{
  const plain=await testModel(settings(),{fetchImpl:async()=>reply({role:'assistant',content:'连接成功'})});assert.equal(plain.connected,true);assert.equal(plain.toolCalling,'unconfirmed');
  let calls=0;const basic=await testModel(settings(),{fetchImpl:async(_url,options)=>{if(++calls===1)return Response.json({error:{message:'tools unsupported'}},{status:400});assert.equal(JSON.parse(options.body).tools,undefined);return reply({content:'连接成功'});}});assert.equal(calls,2);assert.equal(basic.connected,true);assert.equal(basic.toolCalling,'unsupported');
});

test('真实鉴权错误仍失败并脱敏，缺配置、取消、网络失败给出各自原因',async()=>{
  await assert.rejects(testModel(settings(),{fetchImpl:async()=>Response.json({error:{message:'invalid chat-secret'}},{status:401})}),error=>error.message.includes('401')&&!error.message.includes('chat-secret'));
  await assert.rejects(testModel({}),/请填写大模型/);
  const controller=new AbortController();controller.abort();await assert.rejects(testModel(settings(),{signal:controller.signal,fetchImpl:async()=>{throw Error('abort');}}),/已取消/);
  await assert.rejects(testModel(settings(),{fetchImpl:async()=>{throw Error('fetch failed');}}),/网络、系统代理和接口地址/);
});

test('连接测试遇到 503 只请求一次，不把服务繁忙误报成 Key 配置错误',async()=>{
 let calls=0;
 await assert.rejects(testModel(settings(),{fetchImpl:async()=>{calls++;return Response.json({error:{message:'Service is too busy. request_id: synthetic'}},{status:503});}}),error=>error.status===503&&/服务商繁忙/.test(error.message)&&!/Key 无效/.test(error.message));
 assert.equal(calls,1);
 const result=await testModel(settings(),{fetchImpl:async()=>reply(toolReply())});assert.equal(result.requestCount,1);assert.ok(Number.isFinite(result.durationMs));
});

test('测试硬超时包含响应正文，传输忽略取消时仍及时结束且不重发',async()=>{
 for(const stalledBody of [false,true]){
  let calls=0,requestSignal;const start=Date.now();
  await assert.rejects(testModel(settings(),{timeoutMs:25,fetchImpl:async(_url,options)=>{calls++;requestSignal=options.signal;return stalledBody?{ok:true,json:()=>new Promise(()=>{})}:new Promise(()=>{});}}),error=>error.status===504&&/未自动重试/.test(error.message));
  assert.ok(Date.now()-start<1500);assert.equal(calls,1);assert.equal(requestSignal.aborted,true);
 }
});

test('取消测试会结束不响应取消的传输，工具兼容回退计数为两次',async()=>{
 const controller=new AbortController();let started;
 const request=testModel(settings(),{signal:controller.signal,fetchImpl:()=>{started=true;return new Promise(()=>{});}});
 await new Promise(resolve=>setImmediate(resolve));assert.ok(started);controller.abort();await assert.rejects(request,error=>error.status===499);
 let count=0;const result=await testModel(settings(),{fetchImpl:async()=>++count===1?Response.json({error:{message:'no tools'}},{status:400}):reply({content:'connected'})});assert.equal(result.requestCount,2);assert.equal(count,2);
});

test('独立 HTTP 测试不会写入设置或任务，只使用提交的大模型草稿配置',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-model-test-'));core.configureDataDirectory(directory);const state=core.readState();state.tasks=[{id:'private',title:'Private task'}];state.settings.speech.apiKey='saved-voice-key';core.writeState(state);const before=fs.readFileSync(path.join(directory,'human-dispatch-state.json'),'utf8');
  const upstream=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;assert.equal(req.headers.authorization,'Bearer draft-chat-key');assert.ok(!raw.includes('Private task'));assert.ok(!raw.includes('saved-voice-key'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:toolReply()}]}));});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const api=createServer();await new Promise(r=>api.listen(0,'127.0.0.1',r));t.after(async()=>{await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>upstream.close(r))]);fs.rmSync(directory,{recursive:true,force:true});});
  const response=await fetch(`http://127.0.0.1:${api.address().port}/api/models/test`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings:{baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`,apiKey:'draft-chat-key',model:'mock'}})});assert.equal(response.status,200);assert.equal((await response.json()).toolCalling,'confirmed');const after=JSON.parse(fs.readFileSync(path.join(directory,'human-dispatch-state.json'),'utf8'));assert.equal(after.generationUsage.length,1);assert.equal(after.generationUsage[0].kind,'model_test');assert.equal(after.generationUsage[0].total,null);const previous=JSON.parse(before);delete after.generationUsage;delete previous.generationUsage;assert.deepEqual(after,previous);
});
