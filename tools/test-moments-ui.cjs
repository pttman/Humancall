const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'humancall-moments-ui-')));
require('../src/main.cjs');
app.whenReady().then(async()=>{
  try {
    let win;
    for(let i=0;i<100;i++){
      win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('index.html')&&!w.webContents.isLoading());
      if(win&&await win.webContents.executeJavaScript('Boolean(window.momentUI && window.friendsUI)'))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!win)throw Error('Main window missing');
    await win.webContents.executeJavaScript('closeConfigReminder()');
    const result=await win.webContents.executeJavaScript('('+require('./moments-ui-check.cjs').toString()+')()');
    console.log('Moments UI regression passed: '+JSON.stringify(result));
    app.isQuitting=true;app.quit();
  } catch(error){console.error(error);app.isQuitting=true;app.exit(1);}
});
