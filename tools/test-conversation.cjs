const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'humancall-conversation-ui-')));
require(process.env.TEST_APP_MAIN || '../src/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 let mock;
 try{
  let win;for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('index.html')&&!w.webContents.isLoading());if(win)break;await delay(100);}assert.ok(win);await delay(200);
  let meetingId,step=0;const startsAt=new Date(Date.now()+86400000).toISOString();let sawReplyContext=false;
  mock=require('node:http').createServer(async(req,res)=>{
   let raw='';for await(const c of req)raw+=c;const request=JSON.parse(raw);
   const executeResult=request.messages.filter(m=>m.role==='tool').map(m=>{try{return JSON.parse(m.content);}catch{return {};}}).find(m=>m.tasks?.some(t=>t.kind==='meeting'));
   if(executeResult)meetingId=executeResult.tasks.find(t=>t.kind==='meeting').id;
   for(const m of request.messages.filter(m=>m.role==='tool')){try{const q=JSON.parse(m.content).question;if(q?.taskId)meetingId=q.taskId;}catch{}}
   if(request.messages[0].content.includes('需要准备季度报告') || request.messages.some(m=>m.role==='user'&&m.content==='需要准备季度报告'))sawReplyContext=request.messages[0].content.includes('会议前还需要准备什么资料');
   const calls=[['ask_question',{field:'startsAt',requestQuote:'上午要开个会',question:'上午的会议几点开始？'}],['finish',{reply:'请补充时间',quickReplies:['九点开始，大概一小时','时间还没确定']}],['list_tasks',{}],['set_plan',{steps:['补全会议安排']}],['execute_actions',{actions:[{type:'update_task',taskId:meetingId,kind:'meeting',startsAt,durationMinutes:60,status:'planned'}]}],['finish',{reply:'会议时间和一小时时长已记录。'}],['list_tasks',{}],['ask_question',{taskId:meetingId,field:'details',question:'会议前还需要准备什么资料？',quickReplies:['还没确定']}],['finish',{reply:'等待补充'}],['list_tasks',{}],['set_plan',{steps:['补充会议准备事项']}],['execute_actions',{actions:[{type:'update_task',taskId:meetingId,description:'准备季度报告'}]}],['finish',{reply:'已把准备季度报告记录到会议中。'}]];
   const [name,args]=calls[step++]||['finish',{reply:'完成'}];res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',tool_calls:[{id:'step-'+step,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]}));
  });await new Promise(r=>mock.listen(0,'127.0.0.1',r));
  await win.webContents.executeJavaScript(`(async()=>{state.settings.apiKey='test';state.settings.baseUrl='http://127.0.0.1:${mock.address().port}/v1';await save();document.querySelector('#laterConfigButton').click();await handleMessage('上午要开个会',true);})()`);
  assert.equal(await win.webContents.executeJavaScript('state.tasks.length'),1,'追问前会议已记入清单');
  const bubble=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('bubble.html'));assert.ok(bubble);await delay(100);
  assert.match(await bubble.webContents.executeJavaScript("document.querySelector('#bubbleBody').textContent"),/几点开始/);
  assert.equal(await bubble.webContents.executeJavaScript("document.querySelectorAll('#quickActions button').length"),2);
  await bubble.webContents.executeJavaScript("document.querySelector('#quickActions button').click()");
  for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript("!agentBusy && state.tasks.length===1"))break;await delay(50);}
  const saved=await win.webContents.executeJavaScript("JSON.parse(JSON.stringify(state))");assert.equal(saved.tasks.length,1);assert.equal(saved.tasks[0].startsAt,startsAt);assert.equal(saved.tasks[0].durationMinutes,60);assert.equal(saved.agentContext.pendingQuestion,null);
  assert.match(await win.webContents.executeJavaScript("document.querySelector('#currentTaskMeta').textContent"),/开始/);
  await win.webContents.executeJavaScript("requestCheckIn({force:true})");await delay(100);
  assert.match(await bubble.webContents.executeJavaScript("document.querySelector('#bubbleBody').textContent"),/准备什么资料/);
  assert.equal(await bubble.webContents.executeJavaScript("document.querySelectorAll('#quickActions button').length"),1);
  await bubble.webContents.executeJavaScript("send('需要准备季度报告')");
  for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript("!agentBusy && state.tasks[0]?.description==='准备季度报告'"))break;await delay(50);}
  const completed=await win.webContents.executeJavaScript("JSON.parse(JSON.stringify(state))");assert.equal(completed.tasks.length,1);assert.equal(completed.tasks[0].description,'准备季度报告');assert.equal(completed.agentContext.pendingQuestion,null);assert.ok(sawReplyContext);
  console.log('会议澄清 → 实际气泡回答 → 时间/时长保存 → 模型主动追问 → 准备事项补全，全链路通过');
  mock.close();app.isQuitting=true;app.quit();
 }catch(error){console.error(error);mock?.close();app.isQuitting=true;app.exit(1);}
});
