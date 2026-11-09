const {app,BrowserWindow,nativeImage,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-taskbar-'));
app.setPath('userData',directory);
const recorded=new Map(),setDetails=BrowserWindow.prototype.setAppDetails;
if(process.platform==='win32')BrowserWindow.prototype.setAppDetails=function(options){recorded.set(this.id,options);return setDetails.call(this,options);};
require('../src/main.cjs');
app.whenReady().then(async()=>{try{
  let win;for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows().find(w=>/index\.html$/.test(w.webContents.getURL())&&!w.webContents.isLoading());if(win)break;await new Promise(r=>setTimeout(r,50));}
  assert.ok(win,'主窗口正常启动');
  if(process.platform==='win32'){
    const details=recorded.get(win.id),icon=path.resolve(__dirname,'../assets/app-icon.ico');
    assert.equal(details.appId,'com.human-dispatch.desktop.dev');assert.equal(details.appIconPath,icon);
    assert.ok(!nativeImage.createFromPath(icon).isEmpty(),'应用 ICO 可正常读取');
    assert.ok(details.relaunchCommand.includes(app.getAppPath()));assert.match(details.relaunchDisplayName,/开发版/);
    const shortcut=path.join(directory,'开发版.lnk');
    assert.ok(shell.writeShortcutLink(shortcut,{target:process.execPath,args:'"'+app.getAppPath()+'"',icon,iconIndex:0,appUserModelId:details.appId}));
    const saved=shell.readShortcutLink(shortcut);assert.equal(saved.icon,icon);assert.equal(saved.appUserModelId,details.appId);
    win.minimize();await new Promise(r=>setTimeout(r,150));assert.ok(win.isMinimized());win.restore();
    assert.equal(recorded.get(win.id).appIconPath,icon);
    console.log('Windows taskbar icon passed: native ICO, distinct development AppID, relaunch metadata, shortcut and minimize/restore.');
  }
  app.isQuitting=true;app.quit();
}catch(error){console.error(error);app.isQuitting=true;app.exit(1);}});
