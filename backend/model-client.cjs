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
  const hint={400:'请检查模型名称和请求参数',401:'API Key 无效或权限不足',402:'服务商余额不足',403:'服务商拒绝访问',404:'请检查 API 地址和模型名称',429:'请求过于频繁或额度受限'}[response.status];
  return new Error(`Agent 模型请求失败（${response.status}）${detail ? '：'+detail : hint ? '：'+hint : ''}`);
}
module.exports={requestOptions,modelError};
