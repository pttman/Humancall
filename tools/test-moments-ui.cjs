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
    const previews=path.join(__dirname,'../work/moments-previews');fs.mkdirSync(previews,{recursive:true});
    await win.webContents.executeJavaScript(`state.moments=[{id:'preview',friendId:'zhixu',content:'今天的事，一件件来。',createdAt:new Date().toISOString()}];$('#momentsNavButton').click();`);
    await new Promise(resolve=>setTimeout(resolve,120));fs.writeFileSync(path.join(previews,'all.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('[data-moment-person="zhixu"]').click()`);
    await new Promise(resolve=>setTimeout(resolve,100));fs.writeFileSync(path.join(previews,'zhixu.png'),(await win.webContents.capturePage()).toPNG());
    app.isQuitting=true;app.quit();
  } catch(error){console.error(error);app.isQuitting=true;app.exit(1);}
});
