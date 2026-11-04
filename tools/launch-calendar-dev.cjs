const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'work','calendar-dev-profile');fs.mkdirSync(profile,{recursive:true});
const target=path.join(profile,'human-dispatch-state.json');
if(!fs.existsSync(target)){
  let sourceDirectory=path.join(process.env.APPDATA||path.join(os.homedir(),'Library','Application Support'),'human-dispatch');
  const config=path.join(sourceDirectory,'data-directory.txt');if(fs.existsSync(config))sourceDirectory=fs.readFileSync(config,'utf16le').replace(/^\uFEFF/,'').trim();
  const source=path.join(sourceDirectory,'human-dispatch-state.json');
  if(fs.existsSync(source)){
    const copy=JSON.parse(fs.readFileSync(source,'utf8'),(key,value)=>['apiKey','api_key','token','accessToken'].includes(key)?'':value);
    copy.settings={...require('../frontend/model-presets.js').redact(copy.settings),notifications:false,momentsEnabled:false};copy.settings.speech={...copy.settings.speech,enabled:false};
    fs.writeFileSync(target,JSON.stringify(copy,null,2));
  }
}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;for(const key of ['MODEL_API_KEY','MODEL_BASE_URL','MODEL_NAME'])delete env[key];
const child=spawn(require('electron'),[root,'--calendar-dev','--user-data-dir='+profile],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:true});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});child.once('spawn',()=>{console.log('已打开日历开发版，使用 work/calendar-dev-profile 中的独立数据副本；未修改正式数据。');child.unref();});
