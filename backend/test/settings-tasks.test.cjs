const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const models=require('../../frontend/model-presets.js');const schedule=require('../../frontend/task-schedule.js');const core=require('../core.cjs');const {executeActions}=require('../actions.cjs');const {createServer}=require('../server.cjs');const {requestOptions}=require('../model-client.cjs');
test('预设保留旧模型、自定义地址和独立密钥，导出不包含任何服务密钥',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-presets-'));core.configureDataDirectory(directory);t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const state=core.readState();assert.equal(state.settings.providerId,'deepseek');assert.equal(state.settings.model,'deepseek-flash');
 state.settings={...state.settings,baseUrl:'https://api.openai.com/v1',model:'existing-model',apiKey:'openai-secret',providerConfigs:{deepseek:{baseUrl:'https://api.deepseek.com',model:'saved-model',apiKey:'deepseek-secret'}}};core.writeState(state);
 const loaded=core.readState();assert.equal(loaded.settings.providerId,'openai');assert.equal(loaded.settings.model,'existing-model');assert.equal(models.profiles(loaded.settings).deepseek.apiKey,'deepseek-secret');
 assert.equal(models.infer({baseUrl:'http://127.0.0.1:1234/v1'}),'custom');
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const backup=await(await fetch('http://127.0.0.1:'+server.address().port+'/api/backup')).json();assert.ok(!JSON.stringify(backup).includes('-secret'));
 const imported=core.normalizeImportedState(backup,loaded);assert.equal(imported.settings.apiKey,'openai-secret');assert.equal(imported.settings.providerConfigs.deepseek.apiKey,'deepseek-secret');
 backup.settings.baseUrl='https://api.deepseek.com';assert.equal(core.normalizeImportedState(backup,loaded).settings.apiKey,'deepseek-secret');
 backup.settings.baseUrl='https://another.example/v1';assert.equal(core.normalizeImportedState(backup,loaded).settings.apiKey,'');
});
test('截止时间可提前执行；未来开始时间、旧延期与新静默仍被尊重，延期保留截止时间',()=>{
 const future=new Date(Date.now()+86400000).toISOString();const task={id:'task',title:'工作',status:'planned',dueAt:future,dueAtIsDeadline:true};
 assert.equal(schedule.available(task),true);assert.equal(schedule.available({...task,startsAt:future}),false);assert.equal(schedule.available({...task,dueAtIsDeadline:false}),false);assert.equal(schedule.available({...task,deferredUntil:future}),false);
 const state={tasks:[task],projects:[],reminders:[],supervisionEvents:[]};const later=new Date(Date.now()+3600000).toISOString();executeActions(state,[{type:'snooze_task',taskId:'task',dueAt:later}]);assert.equal(task.dueAt,future);assert.equal(task.deferredUntil,later);assert.equal(schedule.available(task),false);
});
test('通义千问预设的工具请求兼容 auto 与非思考模式',()=>{
 for(const baseUrl of ['https://dashscope.aliyuncs.com/compatible-mode/v1','https://dashscope-intl.aliyuncs.com/compatible-mode/v1'])assert.deepEqual(requestOptions({baseUrl}).parameters,{tool_choice:'auto',enable_thinking:false});
});
