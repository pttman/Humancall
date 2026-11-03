const {requestOptions,modelError,networkFetch,withDeadline}=require('./model-client.cjs');

// A settings probe must not run an Agent, read user conversations, or mutate data.
async function testModel(raw,{fetchImpl=networkFetch,signal,timeoutMs=20000}={}){
  const settings=Object.fromEntries(['baseUrl','apiKey','model'].map(key=>[key,typeof raw?.[key]==='string'?raw[key].trim():'']));
  if(!settings.baseUrl||!settings.apiKey||!settings.model)throw Object.assign(Error('请填写大模型的接口地址、API Key 和模型名称'),{status:400});
  const {endpoint,parameters}=requestOptions(settings),started=Date.now();let requestCount=0;
  const options={...(parameters.thinking?{thinking:parameters.thinking}:{}),...(parameters.enable_thinking!==undefined?{enable_thinking:parameters.enable_thinking}:{})};
  const tool={type:'function',function:{name:'connection_check',description:'仅测试连接，返回 ok=true，不执行任何操作',parameters:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}};
  try{return await withDeadline(async deadlineSignal=>{
  const send=withTools=>{deadlineSignal.throwIfAborted();requestCount++;return fetchImpl(endpoint,{method:'POST',signal:deadlineSignal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.apiKey},body:JSON.stringify({model:settings.model,stream:false,...options,messages:[{role:'system',content:'这是独立连接测试，不读取或修改任务。'},{role:'user',content:withTools?'请调用 connection_check，参数 ok 为 true。':'请只回复：连接成功。'}],...(withTools?{tools:[tool],tool_choice:'auto'}:{})})});};
    let response=await send(true),toolsAccepted=true;
    // Some compatible services accept chat but reject tools. Confirm chat
    // separately, without misreporting a valid key as an authentication error.
    if([400,422].includes(response.status)){await response.body?.cancel();response=await send(false);toolsAccepted=false;}
    if(!response.ok){const error=await modelError(response,settings);error.message=error.message.replace('Agent 模型请求失败','大模型连接测试失败');throw error;}
    const value=await response.json(),message=value.choices?.[0]?.message;
    if(!message)throw Error('接口已响应，但返回格式不兼容：缺少 choices.message');
    const called=toolsAccepted&&Array.isArray(message.tool_calls)&&message.tool_calls.some(call=>{if(call.function?.name!=='connection_check')return false;try{return JSON.parse(call.function.arguments||'{}').ok===true;}catch{return false;}});
    const hasText=[message.content,message.reasoning_content].some(value=>typeof value==='string'&&value.trim());
    if(!called&&!hasText&&!(Array.isArray(message.tool_calls)&&message.tool_calls.length))throw Error('接口已响应，但没有返回有效内容');
    return {connected:true,durationMs:Date.now()-started,requestCount,toolCalling:called?'confirmed':toolsAccepted?'unconfirmed':'unsupported',message:called?'大模型连接成功，工具调用可用。':toolsAccepted?'大模型连接成功；本次未返回测试工具调用，Agent 能力尚未确认。':'大模型接口可连接，但当前模型或接口不接受工具参数，请使用支持工具调用的模型。'};
  },{signal,timeoutMs});}catch(error){
    let message=error.name==='TimeoutError'?`大模型测试超过 ${timeoutMs/1000} 秒，服务可能排队或网络较慢；本次未自动重试`:error.message;
    if(signal?.aborted)throw Object.assign(Error('大模型测试已取消'),{status:499});
    if(/fetch failed|Failed to fetch/i.test(message))message='无法连接大模型服务，请检查网络、系统代理和接口地址';
    message=String(message).split(settings.apiKey).join('[密钥已隐藏]').slice(0,600);
    throw Object.assign(Error(message),{status:error.name==='TimeoutError'?504:error.status||502});
  }
}
module.exports={testModel};
