const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-startup-recovery-'));app.setPath('userData',directory);
const core=require('../backend/core.cjs');core.configureDataDirectory(directory);
const state=core.readState();Object.assign(state.settings,{apiKey:'',notifications:true,workStart:'00:00',workEnd:'23:59',passiveNudgesEnabled:false,momentsEnabled:false});
const startsAt=new Date(Date.now()-7*86400000).toISOString();state.tasks=[{id:'expired',title:'七天前的未完成工作',status:'planned',startsAt,estimatedMinutes:30},{id:'finished',title:'已经完成的工作',status:'completed',startsAt}];core.writeState(state);
require('../src/main.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(w=>/index\.html$/.test(w.webContents.getURL())&&!w.webContents.isLoading());if(win&&core.readState().startupRecovery?.notifiedAt)break;await wait(50);}
 assert.ok(win);const saved=core.readState();assert.ok(saved.startupRecovery.notifiedAt,'startup notice delivered without model');
 assert.deepEqual(saved.startupRecovery.taskIds,['expired']);assert.equal(saved.tasks[0].startsAt,startsAt);assert.equal(saved.tasks[1].status,'completed');
 const notices=saved.messages.filter(m=>m.id==='notice-'+saved.startupRecovery.id);assert.equal(notices.length,1);assert.match(notices[0].content,/七天前的未完成工作/);
 assert.equal(saved.supervisionEvents.filter(e=>!e.sent&&e.taskId==='expired').length,1);assert.ok(Date.parse(saved.supervisionEvents.find(e=>e.taskId==='expired').scheduledAt)>Date.now());
 const bubble=BrowserWindow.getAllWindows().find(w=>/bubble\.html$/.test(w.webContents.getURL()));assert.ok(bubble);for(let i=0;i<100;i++){if(await bubble.webContents.executeJavaScript('document.body.textContent.includes("过期任务")'))break;await wait(50);}
 assert.ok(await bubble.webContents.executeJavaScript('document.body.textContent.includes("过期任务")'),'startup bubble visible');
 await win.reload();await wait(500);assert.equal(core.readState().messages.filter(m=>m.id===notices[0].id).length,1);
  await win.webContents.executeJavaScript(`(async()=>{
    const notify=window.humanDispatch.notify;let deliveries=0;
    state.startupRecovery.notifiedAt=null;window.humanDispatch.notify=async()=>{deliveries++;throw Error('offline');};
    await checkSupervision();if(state.startupRecovery.notifiedAt)throw Error('failed delivery must stay pending');
    window.humanDispatch.notify=async()=>{deliveries++;return true;};await checkSupervision();
    if(deliveries!==2||!state.startupRecovery.notifiedAt)throw Error('notification must retry');
    state.startupRecovery.notifiedAt=null;state.tasks.find(t=>t.id==='expired').startsAt=new Date(Date.now()+86400000).toISOString();await save();
    await checkSupervision();if(deliveries!==2)throw Error('rescheduled task must not get a stale startup notice');
    window.humanDispatch.notify=notify;
  })()`);
 console.log('Startup recovery passed: expired task scan, persisted staggered checks, no-model notice and bubble, reload deduplication.');app.isQuitting=true;app.quit();
}catch(error){console.error(error);app.isQuitting=true;app.exit(1);}});
