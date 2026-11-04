const {spawn}=require('node:child_process'),path=require('node:path'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(__dirname,'test-responsive-agent.cjs')],{stdio:'inherit',env});child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code||0;});
