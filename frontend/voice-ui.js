(() => {
  const config=window.speechConfig;
  const section=document.createElement('section');section.id='speechSettings';section.className='settings-section speech-settings';
  section.innerHTML=`<div class="speech-heading"><div><div class="settings-section-title">语音输出</div><p class="settings-section-copy">让回复变成声音，忙的时候也能听见。</p></div><span class="speech-provider">豆包语音</span></div>
    <label class="checkbox-label"><input id="speechEnabledInput" type="checkbox" /> 开启语音输出</label>
    <label class="checkbox-label"><input id="speechAutoReadInput" type="checkbox" /> 自动语音输出（新回复与提醒）</label>
    <p class="settings-section-copy">关闭自动输出后仍可点击名字旁的声音图标手动播放，保存设置后生效。</p>
    <label>语音 API Key<div class="speech-key-row"><input id="speechApiKeyInput" type="password" autocomplete="off" placeholder="填写火山引擎语音服务的 API Key" /><button type="button" id="speechKeyToggle" class="text-button" aria-label="显示语音 API Key">显示</button></div></label>
    <p class="settings-section-copy">独立于聊天模型。开启后，需朗读的文字会发送至你配置的语音服务；密钥仅保存在本机，不随备份导出。</p>
    <div class="speech-test-actions"><button type="button" id="testVoiceModelButton" class="secondary">测试语音并试听</button><span class="settings-section-copy">仅使用本区域的语音 Key 和音色。</span></div>
    <div class="form-grid">${['zhixu','luye'].map(id=>`<div class="speech-voice-field"><label><span id="speechName-${id}"></span><select id="speechVoice-${id}">${config.voicesFor(id).map(v=>'<option value="'+v.id+'">'+v.name+'</option>').join('')}<option value="custom">自定义音色 ID</option></select></label><input id="speechCustom-${id}" class="speech-custom" aria-label="自定义音色 ID" maxlength="160" placeholder="粘贴控制台中的音色 ID" hidden /><button type="button" class="secondary speech-preview" data-preview-voice="${id}">试听</button></div>`).join('')}</div>
    <div class="form-grid"><label>语速<input id="speechRateInput" type="number" min="0.5" max="2" step="0.05" /></label><label>音量 <output id="speechVolumeLabel">80%</output><input id="speechVolumeInput" type="range" min="0" max="1" step="0.05" /></label></div>
    <details class="speech-advanced"><summary>高级配置</summary><label>接口地址<input id="speechEndpointInput" type="url" /></label><label>模型资源 ID<input id="speechResourceInput" placeholder="seed-tts-2.0" maxlength="100" /></label><label>模型版本（可选，复刻音色时填写）<input id="speechModelInput" placeholder="例如 seed-tts-2.0-standard" maxlength="100" /></label><p class="settings-section-copy">默认接入豆包语音合成 2.0，音色需与模型资源匹配。使用网关时填写支持豆包语音协议的接口地址。</p></details>
    <div class="speech-test-row"><div id="speechTestStatus" class="form-status" role="status"></div><button type="button" id="speechStopPreview" class="secondary" hidden>停止播放</button></div>`;
  const container=$('#settingsForm .settings-scroll')||$('#settingsForm');
  const provider=container.querySelector('.provider-card');if(provider)provider.after(section);else container.append(section);
  const bar=document.createElement('div');bar.id='speechPlaybackBar';bar.className='speech-playback';bar.hidden=true;bar.innerHTML='<span class="speech-pulse" aria-hidden="true">◖))</span><span id="speechPlaybackStatus" role="status" aria-live="polite"></span><button type="button" id="stopSpeechButton" class="text-button">停止</button>';
  $('.chat-form').before(bar);
  let loadedConfig='',lastStatus={phase:'idle'};
  function name(id){return window.friends.identity(state,id).assistantName;}
  function renderStatus(value){
    const wasPreview=lastStatus.preview;lastStatus=value;bar.hidden=value.phase==='idle';
    const message=value.phase==='error'?value.error:value.phase==='loading'?'正在生成'+name(value.friendId)+'的语音…':'正在朗读 · '+name(value.friendId)+(value.queued?' · 还有 '+value.queued+' 条':'');
    $('#speechPlaybackStatus').textContent=message;$('#stopSpeechButton').textContent=value.phase==='error'?'关闭':'停止';
    $('#speechStopPreview').hidden=value.phase==='idle';$('#speechStopPreview').textContent=value.phase==='error'?'关闭提示':'停止播放';
    if(value.preview||wasPreview)$('#speechTestStatus').textContent=value.phase==='error'?value.error:value.phase==='loading'?'正在生成试听…':value.phase==='playing'?'正在播放试听，可直接调整音色后再试。':'试听结束。';
    document.querySelectorAll('[data-speak-message]').forEach(button=>{const playing=button.dataset.speakMessage===value.messageId&&['loading','playing'].includes(value.phase);button.setAttribute('aria-pressed',String(playing));button.setAttribute('aria-label',playing?'停止朗读':'朗读这条回复');button.title=playing?'停止朗读':'朗读这条回复';});
  }
  const player=window.createSpeechPlayer({prepareAudio:window.speechAudio.prepare,request:(job,partIndex,signal)=>window.humanDispatch.synthesizeSpeech(job.preview?{preview:true,friendId:job.friendId,settings:job.config}:{messageId:job.messageId,friendId:job.friendId,partIndex},signal),onState:renderStatus});
  function readDraft(){return config.normalize({defaultsVersion:config.DEFAULTS_VERSION,enabled:$('#speechEnabledInput').checked,autoRead:$('#speechAutoReadInput').checked,apiKey:$('#speechApiKeyInput').value,endpoint:$('#speechEndpointInput').value,resourceId:$('#speechResourceInput').value,model:$('#speechModelInput').value,speakers:Object.fromEntries(['zhixu','luye'].map(id=>[id,$('#speechVoice-'+id).value==='custom'?$('#speechCustom-'+id).value:$('#speechVoice-'+id).value])),rate:Number($('#speechRateInput').value),volume:Number($('#speechVolumeInput').value)});}
  function load(settings=state.settings){
    const value=config.normalize(settings.speech);loadedConfig=JSON.stringify(value);
    $('#speechEnabledInput').checked=value.enabled;$('#speechAutoReadInput').checked=value.autoRead;$('#speechApiKeyInput').value=value.apiKey;$('#speechApiKeyInput').type='password';$('#speechKeyToggle').textContent='显示';$('#speechKeyToggle').setAttribute('aria-label','显示语音 API Key');
    $('#speechEndpointInput').value=value.endpoint;$('#speechResourceInput').value=value.resourceId;$('#speechModelInput').value=value.model;$('#speechRateInput').value=value.rate;$('#speechVolumeInput').value=value.volume;$('#speechVolumeLabel').textContent=Math.round(value.volume*100)+'%';$('#speechTestStatus').textContent='';
    for(const id of ['zhixu','luye']){$('#speechName-'+id).textContent=name(id)+'的音色';const custom=!config.voicesFor(id).some(v=>v.id===value.speakers[id]);$('#speechVoice-'+id).value=custom?'custom':value.speakers[id];$('#speechCustom-'+id).value=custom?value.speakers[id]:'';$('#speechCustom-'+id).hidden=!custom;}
  }
  function prepareSave(){const draft=readDraft();if(draft.enabled&&!draft.apiKey)throw Error('开启语音输出前，请填写语音 API Key');if(JSON.stringify(draft)!==loadedConfig)player.stop();return draft;}
  function willAutoRead(){const value=config.normalize(state.settings.speech);return value.enabled&&Boolean(value.apiKey)&&value.autoRead&&!(new Date(state.settings.quietUntil||0)>new Date());}
  function speakMessage(message,{automatic=false,friendId=message?.friendId||state.activeFriendId||'zhixu'}={}){
    const value=config.normalize(state.settings.speech);
    if(!message||message.role!=='assistant'||['sticker','moment'].includes(message.kind))return false;
    if(!value.enabled||!value.apiKey){if(!automatic){showToast('先在设置中开启语音输出并填写语音 API Key');openSettings().then(()=>section.scrollIntoView({block:'center'})).catch(error=>showToast(error.message));}return false;}
    if(automatic&&!willAutoRead())return false;
    return player.enqueue({messageId:message.id,friendId,parts:config.segments(message.content),config:value,automatic});
  }
  function speakNotice(notice){const friendId=notice.friendId||state.activeFriendId||'zhixu',messages=friendId===(state.activeFriendId||'zhixu')?state.messages:state.friends?.[friendId]?.messages;return speakMessage(messages?.find(m=>m.id===(notice.messageId||notice.bubbleId)),{automatic:true,friendId});}
  function sync(){renderStatus(lastStatus);if(!config.normalize(state.settings.speech).enabled&&lastStatus.phase!=='idle')player.stop();}
  section.addEventListener('change',event=>{for(const id of ['zhixu','luye'])if(event.target.id==='speechVoice-'+id)$('#speechCustom-'+id).hidden=event.target.value!=='custom';});
  $('#speechVolumeInput').addEventListener('input',()=>{$('#speechVolumeLabel').textContent=Math.round(Number($('#speechVolumeInput').value)*100)+'%';});
  $('#speechKeyToggle').addEventListener('click',()=>{const input=$('#speechApiKeyInput'),visible=input.type==='password';input.type=visible?'text':'password';$('#speechKeyToggle').textContent=visible?'隐藏':'显示';$('#speechKeyToggle').setAttribute('aria-label',(visible?'隐藏':'显示')+'语音 API Key');});
  section.addEventListener('click',event=>{const target=event.target.closest('[data-preview-voice],#testVoiceModelButton');if(!target)return;const value=readDraft();if(!value.apiKey){$('#speechTestStatus').textContent='先填写语音 API Key，再试听音色。';$('#speechApiKeyInput').focus();return;}player.enqueue({preview:true,messageId:'speech-preview',friendId:target.dataset.previewVoice||state.activeFriendId||'zhixu',parts:['试听'],config:value});});
  $('#stopSpeechButton').addEventListener('click',()=>player.stop());$('#speechStopPreview').addEventListener('click',()=>player.stop());
  document.addEventListener('click',event=>{const button=event.target.closest('[data-speak-message]');if(!button)return;if(button.dataset.speakMessage===lastStatus.messageId&&['loading','playing'].includes(lastStatus.phase)){player.stop();return;}const message=state.messages.find(m=>m.id===button.dataset.speakMessage);speakMessage(message);});
  window.addEventListener('beforeunload',()=>player.stop());
  window.voiceUI={load,prepareSave,speakMessage,speakNotice,willAutoRead,stop:()=>player.stop(),sync,getState:player.getState};load();
})();
