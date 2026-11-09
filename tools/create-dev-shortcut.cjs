const {app,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
app.whenReady().then(()=>{
  try{
    const shortcut=path.join(process.argv.includes('--desktop')?app.getPath('desktop'):root,'人类调度开发版.lnk');
    const options={target:process.execPath,args:'"'+root+'"',cwd:root,icon:path.join(root,'assets','app-icon.ico'),iconIndex:0,appUserModelId:'com.human-dispatch.desktop.dev',description:'人类调度 '+require('../package.json').version+' 开发版'};
    if(!shell.writeShortcutLink(shortcut,fs.existsSync(shortcut)?'update':'create',options))throw Error('无法创建开发版快捷方式');
    const saved=shell.readShortcutLink(shortcut);
    if(saved.icon!==options.icon||saved.appUserModelId!==options.appUserModelId)throw Error('开发版快捷方式图标或标识不一致');
    console.log('开发版入口：'+shortcut);app.quit();
  }catch(error){console.error(error.message);app.exit(1);}
});
