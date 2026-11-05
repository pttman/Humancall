const {test}=require('node:test');const assert=require('node:assert/strict');
const {requestOptions,modelError}=require('../model-client.cjs');const {runAgent}=require('../agent.cjs');
require('./helpers/storage.cjs')('model-client');
test('DeepSeek 官方接口采用 auto、关闭思考且不发送 parallel_tool_calls',()=>{
 for(const baseUrl of ['https://api.deepseek.com','https://api.deepseek.com/v1/','https://api.deepseek.com/chat/completions']){
  const {endpoint,parameters}=requestOptions({baseUrl});assert.ok(endpoint.endsWith('/chat/completions'));assert.equal(parameters.tool_choice,'auto');assert.equal(parameters.thinking.type,'disabled');assert.ok(!Object.hasOwn(parameters,'parallel_tool_calls'));
 }
 assert.equal(requestOptions({baseUrl:'https://api.deepseek.com.other.example/v1'}).parameters.tool_choice,'required');
 assert.equal(requestOptions({baseUrl:'https://other.example/v1'}).parameters.parallel_tool_calls,false);
});
test('服务商 400 原因显示到错误，密钥与授权值被过滤',async()=>{
 const secret='custom-private-api-key';const response=new Response(JSON.stringify({error:{message:`tool_choice required is unsupported; key=${secret}; Bearer abc123`}}),{status:400,headers:{'Content-Type':'application/json'}});
 const error=await modelError(response,{apiKey:secret});assert.match(error.message,/tool_choice/);assert.match(error.message,/400/);assert.ok(!error.message.includes(secret));assert.ok(!error.message.includes('abc123'));
 assert.match((await modelError(new Response('not json',{status:401}),{})).message,/API Key/);
});

test('模型错误保留繁忙、限流和重试等待信息，认证等永久错误不应重试',async()=>{
 for(const status of [429,503]){const error=await modelError(Response.json({error:{message:'synthetic provider message'}},{status,headers:{'Retry-After':'5'}}),{});assert.equal(error.upstreamStatus,status);assert.equal(error.retryable,true);assert.equal(error.retryAfterMs,5000);assert.match(error.message,status===429?/限流/:/繁忙/);}
 for(const status of [400,401,402,403,404,422])assert.equal((await modelError(Response.json({},{status}),{})).retryable,false);
});
test('官方形状请求、工具返回后的下一轮与文本结束兼容，不泄露推理内容',async t=>{
 const original=global.fetch;t.after(()=>{global.fetch=original;});let n=0;
 global.fetch=async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/v1/chat/completions');const body=JSON.parse(options.body);assert.equal(body.thinking.type,'disabled');assert.equal(body.tool_choice,'auto');assert.ok(!Object.hasOwn(body,'parallel_tool_calls'));
  if(n>0)assert.equal(body.messages.find(m=>m.tool_calls)?.reasoning_content,'transient-test-reasoning');
  const choices=[{role:'assistant',reasoning_content:'transient-test-reasoning',tool_calls:[{id:'read',type:'function',function:{name:'list_tasks',arguments:'{}'}}]},{role:'assistant',content:'连接测试成功'},{role:'assistant',tool_calls:[{id:'done',type:'function',function:{name:'finish',arguments:'{"reply":"连接测试成功"}'}}]}];
  return new Response(JSON.stringify({choices:[{message:choices[n++]}]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const settings={apiKey:'test',model:'deepseek-flash',baseUrl:'https://api.deepseek.com/v1'};
 const state={settings,tasks:[],reminders:[],projects:[],messages:[],supervisionEvents:[]};
 const result=await runAgent({settings,text:'测试连接',state});assert.equal(n,2);assert.equal(result.reply,'连接测试成功');assert.equal(result.dirty,false);assert.ok(!JSON.stringify(result).includes('transient-test-reasoning'));
});
