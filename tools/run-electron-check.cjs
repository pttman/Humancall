const {spawn}=require('node:child_process'),path=require('node:path');
const script=process.argv[2];
if(!['test-startup-recovery.cjs','test-taskbar-icon.cjs'].includes(script))throw Error('Unknown Electron check');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(__dirname,script)],{stdio:'inherit',env});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
