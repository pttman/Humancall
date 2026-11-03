function networkFetch(...args){if(process.versions.electron)return require('electron').net.fetch(...args);return fetch(...args);}
// Bound the whole operation, including response-body parsing. A transport that
// ignores cancellation must not leave the caller waiting indefinitely.
async function withDeadline(operation,{timeoutMs=20000,signal}={}){
  const controller=new AbortController();let timer,cancel;
  const stopped=new Promise((_,reject)=>{
    const stop=error=>{controller.abort(error);reject(error);};
    timer=setTimeout(()=>stop(new DOMException('Model response timed out','TimeoutError')),timeoutMs);
    cancel=()=>stop(signal.reason||new DOMException('Request cancelled','AbortError'));
    if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  });
  try{return await Promise.race([stopped,Promise.resolve().then(()=>{controller.signal.throwIfAborted();return operation(controller.signal);})]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
function requestOptions(settings) {
  const endpoint = String(settings.baseUrl || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions';
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('API Base URL 格式不正确，请填写完整的 https:// 地址'); }
  const deepseek = url.hostname.toLowerCase() === 'api.deepseek.com';
  const qwen = ['dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com'].includes(url.hostname.toLowerCase());
  return { endpoint, parameters: deepseek
    ? { tool_choice:'auto', thinking:{type:'disabled'} }
    : qwen ? {tool_choice:'auto',enable_thinking:false} : { tool_choice:'required', parallel_tool_calls:false } };
}
async function modelError(response, settings) {
  let detail = '';
  try { const body=await response.json(); detail=typeof body.error?.message==='string' ? body.error.message : typeof body.message==='string' ? body.message : ''; } catch {}
  // A provider can echo request values. Never include keys in UI errors or logs.
  if (settings.apiKey) detail=detail.split(settings.apiKey).join('[密钥已隐藏]');
  detail=detail.replace(/Bearer\s+[^\s"',;]+/gi,'Bearer [已隐藏]').replace(/\b(?:sk-[\w-]{8,}|gh[pousr]_[\w]+)\b/g,'[密钥已隐藏]').replace(/[\r\n\t]+/g,' ').slice(0,500);
  const hint={400:'请检查模型名称和请求参数',401:'API Key 无效或权限不足',402:'服务商余额不足',403:'服务商拒绝访问',404:'请检查 API 地址和模型名称',429:'服务商限流，请降低请求频率或并发后重试',500:'服务商内部故障，请稍后重试',502:'服务商网关暂不可用，请稍后重试',503:'服务商繁忙，请稍后重试',504:'服务商响应超时，请稍后重试'}[response.status];
  const retryAfter=response.headers?.get('retry-after');
  const retryAfterMs=retryAfter===null||retryAfter===undefined?0:/^\d+(?:\.\d+)?$/.test(retryAfter)?Number(retryAfter)*1000:Math.max(0,Date.parse(retryAfter)-Date.now())||0;
  return Object.assign(new Error(`Agent 模型请求失败（${response.status}）${hint?'：'+hint:''}${detail?(hint?'；':'：')+detail:''}`),{upstreamStatus:response.status,status:response.status,retryAfterMs,retryable:[408,425,429].includes(response.status)||response.status>=500});
}
module.exports={requestOptions,modelError,networkFetch,withDeadline};
