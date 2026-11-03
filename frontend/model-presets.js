(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.modelPresets=api;})(globalThis,function(){
 const presets=[
 {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-flash','deepseek-v4-pro']},
 {id:'qwen',name:'通义千问 · 阿里云中国内地',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',models:['qwen-plus','qwen-flash','qwen-max']},
 {id:'openai',name:'OpenAI',baseUrl:'https://api.openai.com/v1',models:['gpt-4.1-mini','gpt-4.1','gpt-4o-mini']},
 {id:'custom',name:'自定义 OpenAI 兼容服务',baseUrl:'',models:[]}
 ];
 const normalized=url=>String(url||'').trim().replace(/\/+$/,'').replace(/\/chat\/completions$/,'').replace(/\/v1$/,'');
 const infer=settings=>presets.find(p=>p.id!=='custom'&&normalized(p.baseUrl)===normalized(settings?.baseUrl))?.id||'custom';
 function profiles(settings={}){const all=structuredClone(settings.providerConfigs||{});all[infer(settings)]={baseUrl:settings.baseUrl||'',model:settings.model||'',apiKey:settings.apiKey||''};return all;}
 function redact(settings){const speech=typeof module==='object'&&module.exports?require('./speech-config.js'):globalThis.speechConfig;return {...settings,speech:speech.redact(settings.speech),apiKey:'',apiKeyIncluded:false,providerConfigs:Object.fromEntries(Object.entries(settings.providerConfigs||{}).map(([id,p])=>[id,{...p,apiKey:''}]))};}
 return {presets,infer,profiles,redact,normalized};
});
