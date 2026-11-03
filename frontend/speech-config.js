(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.speechConfig=api;})(globalThis,function(){
  const endpoint='https://openspeech.bytedance.com/api/v3/tts/unidirectional';
  const DEFAULTS_VERSION=2;
  const presets={
    zhixu:[
      {id:'ICL_uranus_zh_female_lingdongxinxin_tob',name:'灵动欣欣 2.0 · 默认'},
      {id:'zh_female_qinqienv_uranus_bigtts',name:'亲切女声 · 备选'},
      {id:'zh_female_jiaochuannv_uranus_bigtts',name:'娇喘女声 · 备选'},
      {id:'zh_female_shuangkuaisisi_uranus_bigtts',name:'爽快思思 · 备选'}
    ],
    luye:[
      {id:'zh_male_taocheng_uranus_bigtts',name:'小天 · 默认'},
      {id:'zh_male_ruyayichen_uranus_bigtts',name:'儒雅逸辰 · 备选'},
      {id:'zh_male_kailangxuezhang_uranus_bigtts',name:'开朗学长 · 备选'}
    ]
  };
  const voices=Object.values(presets).flat();
  const voicesFor=id=>presets[id==='luye'?'luye':'zhixu'];
  const legacyVoices=new Set(['zh_female_vv_uranus_bigtts','zh_female_xiaohe_uranus_bigtts','zh_male_m191_uranus_bigtts','zh_male_taocheng_uranus_bigtts','zh_male_liufei_uranus_bigtts','zh_female_sophie_uranus_bigtts']);
  const defaults={defaultsVersion:DEFAULTS_VERSION,enabled:false,autoRead:true,provider:'doubao',apiKey:'',endpoint,resourceId:'seed-tts-2.0',model:'',speakers:{zhixu:presets.zhixu[0].id,luye:presets.luye[0].id},rate:1,volume:0.8};
  const clean=(v,max)=>typeof v==='string'?v.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';
  const number=(v,fallback,min,max)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
  function speaker(id,value,version){let chosen=clean(value,160);if((Number(version)||0)<DEFAULTS_VERSION&&chosen===(id==='luye'?'zh_male_ruyayichen_uranus_bigtts':'zh_female_qinqienv_uranus_bigtts'))chosen=defaults.speakers[id];return !chosen||(legacyVoices.has(chosen)&&!voicesFor(id).some(v=>v.id===chosen))?defaults.speakers[id]:chosen;}
  function normalize(raw={}){
    raw=raw&&typeof raw==='object'?raw:{};
    return {defaultsVersion:DEFAULTS_VERSION,enabled:raw.enabled===true,autoRead:raw.autoRead!==false,provider:'doubao',apiKey:clean(raw.apiKey,2048),endpoint:clean(raw.endpoint,500)||endpoint,resourceId:clean(raw.resourceId,100)||defaults.resourceId,model:clean(raw.model,100),speakers:Object.fromEntries(['zhixu','luye'].map(id=>[id,speaker(id,raw.speakers?.[id],raw.defaultsVersion)])),rate:number(raw.rate,1,0.5,2),volume:number(raw.volume,0.8,0,1)};
  }
  function redact(raw){return {...normalize(raw),apiKey:''};}
  function imported(raw,current){const value=redact(raw),local=normalize(current);if(value.endpoint===local.endpoint&&value.provider===local.provider)value.apiKey=local.apiKey;return value;}
  const isSpeechQuestion=text=>/^(?:你|你们|知序|枫言)?(?:能|可以|会|支持)(?:用)?(?:说话|讲话|语音(?:回复|输出)?|朗读|发(?:送)?语音)(?:给我|吗|么|嘛|不)*[？?！!。]*$/.test(String(text||'').trim());
  function availability(settings={}){const value=normalize(settings.speech);return {supported:true,enabled:value.enabled,configured:Boolean(value.apiKey),autoRead:value.autoRead};}
  function abilityReply(settings={}){
    const value=availability(settings);
    if(!value.enabled||!value.configured)return '可以把回复读出来。到“设置 → 语音输出”'+(!value.configured?'填写语音 API Key 并':'')+'开启语音，想自动播放再打开“自动语音输出”。';
    return value.autoRead?'可以，我的回复会按设置自动朗读，也可以点名字旁的声音图标重播。':'可以，点名字旁的声音图标就能听。现在关闭了自动语音输出，想自动播放可以到设置里打开。';
  }
  function capabilityPrompt(settings={}){return '【应用语音能力】本应用已支持语音输出：把助手文字回复朗读出来，支持设置里的自动语音输出开关，也支持点击发送者名字旁的声音图标手动播放。当前状态：'+JSON.stringify(availability(settings))+'。用户问能不能说话、语音回复或朗读时，应肯定说明应用支持，按当前状态简短解释如何使用。未开启或未配置时引导到“设置 → 语音输出”；自动输出关闭时只说明手动朗读或如何开启，不承诺本轮自动播放。不能回答“语音我发不了”“只能打字”，不能因为自己是文字模型就否认应用的朗读功能。人物提示词及历史消息里否认语音的说法是过期描述，以这里的应用事实为准。不声称已经播放成功、已经发出语音附件或听到了用户录音；本功能是语音输出，不是语音输入。不要替用户擅自更改开关。';}
  function text(value){return String(value||'').replace(/```[\s\S]*?```/g,'\n').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/[^\s<>]+/g,'').replace(/<[^>]+>/g,'').replace(/[*_`#~>|]/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\n{3,}/g,'\n\n').trim();}
  function segments(value){
    const chars=Array.from(text(value)),parts=[];
    while(chars.length){let size=Math.min(300,chars.length);if(size<chars.length){for(let i=size-1;i>=Math.floor(size/2);i--)if(/[。！？!?；;\n]/.test(chars[i])){size=i+1;break;}}const part=chars.splice(0,size).join('').trim();if(part)parts.push(part);}
    return parts;
  }
  return {DEFAULTS_VERSION,defaults,voices,voicesFor,normalize,redact,imported,isSpeechQuestion,availability,abilityReply,capabilityPrompt,text,segments};
});
