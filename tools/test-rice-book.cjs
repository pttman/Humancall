const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const core=require('../backend/core.cjs'),{createServer}=require('../backend/server.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-rice-ui-'));
app.setPath('userData',path.join(directory,'electron'));
core.configureDataDirectory(directory);
let server;
const watchdog=setTimeout(()=>{console.error('Rice UI test timed out');app.exit(1);},30000);
app.whenReady().then(async()=>{
  try{
    const state=core.readState();state.settings.notifications=false;
    state.generationUsage=[
      {id:'a',operationId:'chat-a',kind:'chat',friendId:'zhixu',purpose:'agent',model:'deepseek-flash',createdAt:new Date().toISOString(),input:100,output:20,total:120,status:'ok'},
      {id:'b',operationId:'chat-a',kind:'chat',friendId:'zhixu',purpose:'sticker',model:'deepseek-flash',createdAt:new Date().toISOString(),input:30,output:10,total:40,status:'ok'},
      {id:'c',operationId:'moment-a',kind:'moment',friendId:'luye',purpose:'moment',model:'test',createdAt:new Date().toISOString(),input:null,output:null,total:null,status:'ok'}
    ];core.writeState(state);
    server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{contextIsolation:true}}),errors=[];
    win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message);});
    await win.loadURL('http://127.0.0.1:'+server.address().port);
    const js=code=>win.webContents.executeJavaScript(code);
    await js(`(async()=>{for(let i=0;i<100&&!state.generationUsage;i++)await new Promise(r=>setTimeout(r,30));closeConfigReminder();window.recordsUI.open('rice');})()`);
    assert.equal(await js(`document.querySelectorAll('#recordDetails .record-detail').length`),2);
    assert.match(await js(`$('#recordsSummary').textContent`),/已知使用 160 token/);
    assert.match(await js(`$('#recordDetails').textContent`),/2 次调用/);
    await js(`$('#recordsSearch').value='瞬笺';$('#recordsSearch').dispatchEvent(new Event('input'));`);
    assert.equal(await js(`document.querySelectorAll('#recordDetails .record-detail').length`),1);
    assert.match(await js(`$('#recordDetails').textContent`),/用量未返回/);
    await js(`$('#resetRecordFilters').click();$('#recordsPerson').value='zhixu';$('#recordsPerson').dispatchEvent(new Event('change'));`);
    assert.equal(await js(`document.querySelectorAll('#recordDetails .record-detail').length`),1);
    assert.match(await js(`$('#recordsSummary').textContent`),/已使用 160 token/);
    await js(`$('#resetRecordFilters').click();$('#recordDetails details').open=true;`);
    const out=path.join(__dirname,'../work/rice-book');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'desktop.png'),(await win.webContents.capturePage()).toPNG());
    win.setSize(420,850);await new Promise(r=>setTimeout(r,200));
    assert.ok(await js(`$('#recordsModal .modal-card').getBoundingClientRect().right<=innerWidth`));
    fs.writeFileSync(path.join(out,'mobile.png'),(await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors,[]);console.log('Rice book UI passed: grouped totals, missing usage, search, friend filter, desktop and mobile layout.');
    clearTimeout(watchdog);win.destroy();server.close();app.quit();
  }catch(error){console.error(error);server?.close();app.exit(1);}
});
