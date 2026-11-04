// Render the actual app with isolated demo data, then compose lossless screenshots.
const {spawn}=require('node:child_process'),path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;for(const key of ['MODEL_API_KEY','MODEL_BASE_URL','MODEL_NAME'])delete env[key];
const child=spawn(require('electron'),[path.join(__dirname,'render-feature-overview.cjs'),...process.argv.slice(2)],{env,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code||0;});
