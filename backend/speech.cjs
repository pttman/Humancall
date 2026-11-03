const {randomUUID}=require('node:crypto');
const config=require('../frontend/speech-config.js');
const MAX_AUDIO=12*1024*1024,MAX_WIRE=20*1024*1024;
function networkFetch(...args){if(process.versions.electron)return require('electron').net.fetch(...args);return fetch(...args);}
function endpoint(value){
  let url;try{url=new URL(value);}catch{throw Error('语音接口地址无效');}
  if(url.username||url.password||url.hash||url.search||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('语音接口需使用 HTTPS；本机开发服务可使用 HTTP');
  return url.href;
}
function safeError(message,key){let value=String(message||'语音合成失败');if(key)value=value.split(key).join('[密钥已隐藏]');return value.replace(/Bearer\s+[^\s"',;]+/gi,'Bearer [密钥已隐藏]').slice(0,400);}
async function synthesize({settings,text,friendId='zhixu',signal,fetchImpl=networkFetch}){
  const speech=config.normalize(settings);
  if(!speech.apiKey)throw Object.assign(Error('请先填写豆包语音 API Key'),{status:400});
  if(typeof text!=='string'||!text.trim()||Array.from(text).length>300)throw Object.assign(Error('语音文本为空或过长，请分段朗读'),{status:400});
  const url=endpoint(speech.endpoint),speaker=speech.speakers[friendId==='luye'?'luye':'zhixu'];
  const timeout=AbortSignal.timeout(45000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  try{
    const response=await fetchImpl(url,{method:'POST',redirect:'error',signal:combined,headers:{'Content-Type':'application/json','X-Api-Key':speech.apiKey,'X-Api-Resource-Id':speech.resourceId,'X-Api-Request-Id':randomUUID()},body:JSON.stringify({user:{uid:'humancall-desktop'},req_params:{text,speaker,...(speech.model?{model:speech.model}:{}),audio_params:{format:'mp3',sample_rate:24000,speech_rate:Math.round((speech.rate-1)*100)}}})});
    if(!response.ok){await response.body?.cancel();throw Error(response.status===401||response.status===403?'语音鉴权失败，请检查语音 API Key、已开通服务和音色权限':response.status===429?'语音请求过多或额度不足，请稍后重试':`语音接口请求失败（HTTP ${response.status}）`);}
    if(!response.body)throw Error('语音接口没有返回音频');
    let wire=0,audioBytes=0,pending='',finished=false;const chunks=[],decoder=new TextDecoder();
    const frame=line=>{
      const source=line.trim().replace(/^data:\s*/,'');
      if(!source||source==='[DONE]'||/^(event:|id:|retry:|:)/.test(source))return;
      let data;try{data=JSON.parse(source);}catch{throw Error('语音接口返回了无法解析的数据');}
      if(![0,20000000].includes(data.code))throw Error(safeError(data.message||`语音服务错误（${data.code}）`,speech.apiKey));
      if(data.data){if(typeof data.data!=='string'||!/^[-A-Za-z0-9+/=\r\n]+$/.test(data.data))throw Error('语音音频格式无效');const bytes=Buffer.from(data.data,'base64');audioBytes+=bytes.length;if(audioBytes>MAX_AUDIO)throw Error('语音音频超过本次播放上限');chunks.push(bytes);}
      if(data.code===20000000)finished=true;
    };
    const reader=response.body.getReader();
    try{
      while(true){const {done,value}=await reader.read();if(done)break;wire+=value.byteLength;if(wire>MAX_WIRE)throw Error('语音响应过大');pending+=decoder.decode(value,{stream:true});let split;while((split=pending.indexOf('\n'))>=0){frame(pending.slice(0,split));pending=pending.slice(split+1);}}
      pending+=decoder.decode();if(pending.trim())frame(pending);
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    if(!finished)throw Error('语音合成中途结束，请重试');
    if(!audioBytes)throw Error('语音服务返回了空音频，请检查音色和模型配置');
    return {audio:Buffer.concat(chunks),contentType:'audio/mpeg'};
  }catch(error){if(signal?.aborted)throw Object.assign(Error('语音播放已取消'),{status:499});throw Object.assign(Error(safeError(error.name==='TimeoutError'?'语音生成超时，请稍后重试':error.message,speech.apiKey)),{status:error.status||502});}
}
module.exports={synthesize,endpoint,safeError};
