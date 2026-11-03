const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'work','voice-dev-profile');
fs.mkdirSync(profile,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[root,'--voice-dev','--user-data-dir='+profile],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:true});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('spawn',()=>{console.log('已打开本地语音开发版；使用 work/voice-dev-profile 中的独立数据。');child.unref();});
