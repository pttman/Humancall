const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'humancall-speech-ui-')));
app.on('web-contents-created',(_event,contents)=>contents.on('console-message',(_e,level,message)=>{if(level>=2)console.error('Renderer:',message.replaceAll('tts-test-key','[test-key]'));}));
require('../src/main.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  let upstream;
  try{
    let win;for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('index.html')&&!w.webContents.isLoading());if(win&&await win.webContents.executeJavaScript('Boolean(window.voiceUI&&window.friendsUI)'))break;await wait(100);}assert.ok(win);win.showInactive();
    const bubble=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('bubble.html'));bubble?.webContents.setAudioMuted(true);
    const audio=fs.readFileSync(path.join(__dirname,'../assets/notification.mp3')),requests=[];let mode='success',cancelled=0;
    upstream=http.createServer(async(req,res)=>{
      let raw='';for await(const chunk of req)raw+=chunk;requests.push({key:req.headers['x-api-key'],...JSON.parse(raw).req_params});
      const respond=()=>{if(res.destroyed)return;res.writeHead(200,{'Content-Type':'text/event-stream'});if(mode==='fail')return res.end('data: '+JSON.stringify({code:55000000,message:'bad tts-test-key'})+'\n\n');res.write('data: '+JSON.stringify({code:0,data:audio.toString('base64')})+'\n\n');res.end('data: '+JSON.stringify({code:20000000,data:null})+'\n\n');};
      if(mode==='slow'){res.once('close',()=>{if(!res.writableEnded)cancelled++;});setTimeout(respond,1500);}else respond();
    });await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));const endpoint=`http://127.0.0.1:${upstream.address().port}/tts`;
    const evaluate=source=>win.webContents.executeJavaScript(source).catch(error=>{console.error('Failed test expression:',source.slice(0,120));throw error;});
    const until=async check=>{for(let i=0;i<200;i++){if(await check())return;await wait(30);}throw Error('Speech UI timeout: '+check.toString());};
    await evaluate(`(async()=>{closeConfigReminder();state.settings.apiKey='';state.settings.quietUntil='';state.settings.notifications=true;state.tasks=[];state.supervisionEvents=[];await save();window.__audioPlayed=0;window.__audioEnded=0;const NativeAudio=window.Audio;window.Audio=function(){const audio=new NativeAudio();audio.addEventListener('playing',()=>window.__audioPlayed++);audio.addEventListener('ended',()=>window.__audioEnded++);return audio;};await openSettings();$('#speechApiKeyInput').value='tts-test-key';$('#speechEndpointInput').value=${JSON.stringify(endpoint)};$('#speechVolumeInput').value='0';$('#speechVolumeInput').dispatchEvent(new Event('input'));$('#speechVoice-luye').value='zh_male_taocheng_uranus_bigtts';})()`);
    assert.equal(await evaluate(`$('#speechApiKeyInput').type`),'password');
    const onset=await evaluate(`(async()=>{const blob=await(await fetch('/assets/notification.mp3')).blob();const decoder=new OfflineAudioContext(1,1,24000),original=await decoder.decodeAudioData(await blob.arrayBuffer()),prepared=await window.speechAudio.prepare(blob),view=new DataView(await prepared.arrayBuffer()),channels=original.numberOfChannels,padding=Math.round(original.sampleRate*1);let silent=true,preserved=true;for(let i=44;i<44+padding*channels*2;i++)if(view.getUint8(i)!==0)silent=false;for(let frame=0;frame<original.length;frame++)for(let channel=0;channel<channels;channel++){const sample=Math.max(-1,Math.min(1,original.getChannelData(channel)[frame]));if(view.getInt16(44+(padding+frame)*channels*2+channel*2,true)!==Math.round(sample*(sample<0?32768:32767)))preserved=false;}return{silent,preserved,frames:view.getUint32(40,true)/(channels*2),expected:original.length+padding};})()`);
    assert.equal(onset.silent,true);assert.equal(onset.preserved,true);assert.equal(onset.frames,onset.expected);

    const choices=await evaluate(`Object.fromEntries(['zhixu','luye'].map(id=>[id,[...$('#speechVoice-'+id).options].map(option=>option.value)]))`);
    assert.deepEqual(choices.zhixu,['ICL_uranus_zh_female_lingdongxinxin_tob','zh_female_qinqienv_uranus_bigtts','zh_female_jiaochuannv_uranus_bigtts','zh_female_shuangkuaisisi_uranus_bigtts','custom']);
    assert.deepEqual(choices.luye,['zh_male_taocheng_uranus_bigtts','zh_male_ruyayichen_uranus_bigtts','zh_male_kailangxuezhang_uranus_bigtts','custom']);
    assert.equal(await evaluate(`$('#speechVoice-zhixu').value`),'ICL_uranus_zh_female_lingdongxinxin_tob');

    await evaluate(`document.querySelector('[data-preview-voice="luye"]').click()`);
    await until(()=>evaluate('window.__audioEnded===1&&window.voiceUI.getState().phase==="idle"'));
    assert.equal(requests[0].key,'tts-test-key');assert.equal(requests[0].speaker,'zh_male_taocheng_uranus_bigtts');
    assert.equal(await evaluate('(async()=>(await window.humanDispatch.loadState()).settings.speech.apiKey)()'),'');
    console.log('Speech preview: real HTML Audio decoded and played the local protocol fixture; draft config stayed unsaved');
    const out=path.join(__dirname,'../work/voice-previews');fs.mkdirSync(out,{recursive:true});await evaluate(`$('#speechSettings').scrollIntoView({block:'center'})`);await wait(100);fs.writeFileSync(path.join(out,'voice-settings.png'),(await win.webContents.capturePage()).toPNG());
    await evaluate(`$('#speechVoice-zhixu').value='ICL_uranus_zh_female_lingdongxinxin_tob';$('#speechEnabledInput').checked=true;$('#speechAutoReadInput').checked=true;$('#settingsForm').requestSubmit()`);
    await until(()=>evaluate(`$('#settingsModal').classList.contains('hidden')`));
    assert.equal(await evaluate('(async()=>(await window.humanDispatch.loadState()).settings.speech.speakers.luye)()'),'zh_male_taocheng_uranus_bigtts');
    await evaluate(`window.__originalAsk=window.humanDispatch.askAI;window.humanDispatch.askAI=async()=>({reply:'记录好了，我们一件件来。',source:'model',actions:[]});true;`);
    await evaluate(`handleMessage('语音回复测试')`);await until(()=>evaluate('window.__audioEnded===2&&window.voiceUI.getState().phase==="idle"'));assert.equal(requests.length,2);assert.equal(requests[1].speaker,'ICL_uranus_zh_female_lingdongxinxin_tob');
    await evaluate(`[...document.querySelectorAll('#chatMessages [data-speak-message]')].at(-1).click()`);await until(()=>evaluate('window.__audioEnded===3&&window.voiceUI.getState().phase==="idle"'));
    await evaluate(`(async()=>{state.reminders=[{id:'voice-reminder',title:'语音提醒测试',enabled:true,repeat:'none',nextAt:new Date(Date.now()-1000).toISOString()}];await checkReminders();})()`);await until(()=>evaluate('window.voiceUI.getState().phase==="playing"'));assert.equal(await bubble.webContents.executeJavaScript('document.querySelector("#alertSound").paused'),true,'Voice notices must not overlap the alert tone');await until(()=>evaluate('window.__audioEnded===4&&window.voiceUI.getState().phase==="idle"'));assert.match(requests.at(-1).text,/语音提醒测试/);
    mode='slow';const previousEnds=await evaluate('window.__audioEnded');await evaluate(`window.voiceUI.speakMessage([...state.messages].reverse().find(m=>m.kind==='reminder'))`);await until(()=>Promise.resolve(requests.length>=5));await evaluate(`$('#stopSpeechButton').click()`);await wait(1700);assert.equal(await evaluate('window.__audioEnded'),previousEnds);assert.equal(await evaluate('window.voiceUI.getState().phase'),'idle');assert.ok(cancelled>=1,'Stopping aborts the upstream generation');
    mode='fail';await evaluate(`handleMessage('语音失败仍保留文字')`);await until(()=>evaluate('window.voiceUI.getState().phase==="error"'));assert.equal(await evaluate(`state.messages.at(-1).content`),'记录好了，我们一件件来。');assert.equal(await evaluate(`$('#speechPlaybackStatus').textContent.includes('tts-test-key')`),false);
    await evaluate(`(async()=>{window.voiceUI.stop();await openSettings();$('#speechAutoReadInput').checked=false;$('#settingsForm').requestSubmit();})()`);
    await until(()=>evaluate(`$('#settingsModal').classList.contains('hidden')`));
    assert.equal(await evaluate('(async()=>(await window.humanDispatch.loadState()).settings.speech.autoRead)()'),false);
    await evaluate(`(async()=>{await openSettings();})()`);assert.equal(await evaluate(`$('#speechAutoReadInput').checked`),false);await evaluate(`closeSettings();window.humanDispatch.askAI=window.__originalAsk;true;`);
    const count=requests.length;await evaluate(`handleMessage('你能说话吗?')`);await wait(100);assert.equal(requests.length,count);assert.match(await evaluate('state.messages.at(-1).content'),/关闭了自动语音输出/);assert.equal(await evaluate('state.tasks.length'),0);
    mode='success';const endsBeforeManual=await evaluate('window.__audioEnded');await evaluate(`[...document.querySelectorAll('#chatMessages [data-speak-message]')].at(-1).click()`);await until(()=>evaluate('window.__audioEnded==='+String(endsBeforeManual+1)+'&&window.voiceUI.getState().phase==="idle"'));assert.equal(requests.length,count+1,'Manual speech remains available with automatic output disabled');
    await evaluate(`(async()=>{await openSettings();$('#speechAutoReadInput').checked=true;$('#settingsForm').requestSubmit();})()`);await until(()=>evaluate(`$('#settingsModal').classList.contains('hidden')`));
    await evaluate(`(async()=>{window.voiceUI.speakMessage(state.messages.at(-1));await window.friendsUI.select('luye');})()`);assert.equal(await evaluate('window.voiceUI.getState().phase'),'idle');
    console.log('Speech UI: configuration, independent voices, auto replies, manual replay, reminders, cancellation, failure fallback, auto-off and friend switch passed');
    upstream.close();app.isQuitting=true;app.quit();
  }catch(error){console.error(error);upstream?.close();app.isQuitting=true;app.exit(1);}
});
