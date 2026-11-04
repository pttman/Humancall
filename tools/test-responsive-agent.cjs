const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'humancall-responsive-')));require('../src/main.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{let upstream;try{
 let win;for(let i=0;i<120;i++){win=BrowserWindow.getAllWindows().find(w=>/index\.html$/.test(w.webContents.getURL())&&!w.webContents.isLoading());if(win&&await win.webContents.executeJavaScript('Boolean(window.calendarUI&&state.settings.workStart)'))break;await wait(100);}assert.ok(win);win.showInactive();win.setSize(1440,940);
 win.webContents.on('console-message',(_,level,message)=>{if(level>=2)console.error('Renderer: '+message);});const js=async source=>{try{return await win.webContents.executeJavaScript(source);}catch(error){console.error('Failed script: '+source);throw error;}},until=async check=>{for(let i=0;i<240;i++){if(await check())return;await wait(25);}throw Error('Responsive test timeout: '+check);};
 const pending=[];upstream=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;JSON.parse(raw);pending.push(reply=>{if(res.destroyed)return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',tool_calls:[{id:'done',type:'function',function:{name:'finish',arguments:JSON.stringify({reply,stickerMood:'none'})}}]}}]}));});});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 await js(`(async()=>{closeConfigReminder();state.settings.apiKey='test';state.settings.baseUrl='http://127.0.0.1:${upstream.address().port}/v1';state.settings.stickersEnabled=false;state.settings.momentsEnabled=false;state.settings.notifications=false;state.settings.speech.enabled=false;window.__notices=[];window.humanDispatch.notifyReply=async p=>window.__notices.push(p);await save();})()`);
 await js(`void handleMessage('聊聊今天');`);await until(()=>pending.length===1);
 assert.deepEqual(await js(`({input:$('#chatInput').disabled,send:$('#sendMessageButton').disabled,clear:$('#clearChatButton').disabled,calendar:getComputedStyle($('#calendarNavButton')).pointerEvents})`),{input:false,send:true,clear:false,calendar:'auto'});
 await js(`$('#chatInput').value='留在知序的草稿';$('#chatInput').dispatchEvent(new Event('input'));$('#calendarNavButton').click();`);assert.equal(await js('window.calendarUI.visible'),true);
 await js(`window.calendarUI.openDay(window.calendarUI.selectedDay);`);
 await js(`(async()=>{await openSettings();})()`);assert.equal(await js(`$('#passiveNudgesInput').value`),'30');assert.equal(await js(`Boolean($('#reminderInput'))`),false);await js('closeSettings()');
 await js(`window.companionUI.showChat();$('.companion-user-rail').click()`);assert.equal(await js(`$('#selfProfileModal').classList.contains('hidden')`),false);
 await js(`$('#userNameInput').value='本地昵称';$('#selfProfileForm').requestSubmit();`);await until(()=>js(`!$('#saveSelfProfileButton').disabled`));assert.equal(await js('state.settings.userName'),'本地昵称');await js('window.companionUI.closeSelf()');
 assert.equal(await js(`window.friendsUI.select('luye')`),true);await js(`$('#chatInput').value='枫言的草稿';$('#chatInput').dispatchEvent(new Event('input'));$('.companion-user-rail').click();$('#userNameInput').focus();`);
 pending.shift()('知序的延迟回复');await until(()=>js('!agentBusy'));
 assert.deepEqual(await js(`({active:state.activeFriendId,origin:state.friends.zhixu.messages.at(-1).content,wrong:state.messages.some(m=>m.content==='知序的延迟回复'),draft:$('#chatInput').value,focus:document.activeElement.id,notice:window.__notices.at(-1).friendId})`),{active:'luye',origin:'知序的延迟回复',wrong:false,draft:'枫言的草稿',focus:'userNameInput',notice:'zhixu'});
 await js(`window.companionUI.closeSelf();`);assert.equal(await js(`window.friendsUI.select('zhixu')`),true);assert.equal(await js(`$('#chatInput').value`),'留在知序的草稿');
 await js(`void handleMessage('再聊一件事');`);await until(()=>pending.length===1);
 await js(`(async()=>{state.tasks.push({id:'manual-during-agent',title:'回复期间手动记录',status:'inbox'});await save();renderAll();})()`);pending.shift()('过期的回复');await until(()=>js('!agentBusy'));
 assert.equal(await js(`state.tasks.find(t=>t.id==='manual-during-agent').title`),'回复期间手动记录');assert.match(await js(`state.messages.at(-1).content`),/新的内容已保留/);
 await js(`void handleMessage('稍后回复这条');`);await until(()=>pending.length===1);const stale=pending.shift();
 await js(`$('#clearChatButton').click();$('#confirmClearChatButton').click();`);await until(()=>js('!chatClearing&&!agentBusy'));
 await js(`void handleMessage('清空后新对话');`);await until(()=>pending.length===1);stale('已取消的旧回复');await wait(120);assert.equal(await js('agentBusy'),true);pending.shift()('清空后的新回复');await until(()=>js('!agentBusy'));
 assert.equal(await js(`state.messages.some(m=>m.content==='已取消的旧回复')`),false);assert.equal(await js('state.messages.at(-1).content'),'清空后的新回复');
 const loaded=await js(`window.humanDispatch.loadState()`);assert.equal(loaded.messages.at(-1).content,'清空后的新回复');assert.ok(loaded.tasks.some(t=>t.id==='manual-during-agent'));
 if(process.platform==='win32'){
  assert.equal(await js(`document.querySelectorAll('.window-controls button').length`),3);assert.equal(await js(`getComputedStyle($('.chat-heading')).webkitAppRegion`),'drag');assert.equal(await js(`getComputedStyle($('#sendMessageButton')).webkitAppRegion`),'no-drag');
  await js(`$('[data-window-action="toggle-maximize"]').click()`);await until(()=>win.isMaximized());await until(()=>js(`$('.window-controls').classList.contains('is-maximized')`));await js(`$('[data-window-action="toggle-maximize"]').click()`);await until(()=>!win.isMaximized());
  await js(`$('[data-window-action="minimize"]').click()`);await until(()=>win.isMinimized());win.restore();win.showInactive();
  const out=path.join(__dirname,'../work/responsive-previews');fs.mkdirSync(out,{recursive:true});await wait(150);fs.writeFileSync(path.join(out,'frameless-chat.png'),(await win.webContents.capturePage()).toPNG());
  await js(`$('[data-window-action="close"]').click()`);await until(()=>!win.isVisible());win.showInactive();
 }
 console.log('Responsive Agent passed: navigation, settings, profile save, drafts, source routing, focus, concurrent task edits, cancellation, new requests and native window controls');upstream.closeAllConnections();upstream.close();app.isQuitting=true;app.quit();
}catch(error){console.error(error);upstream?.closeAllConnections();upstream?.close();app.isQuitting=true;app.exit(1);}});
