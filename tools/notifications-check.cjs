const assert=require('node:assert/strict');
const {setTimeout:wait}=require('node:timers/promises');

module.exports=async function checkNotifications({evaluate,nativeEvaluate,mainWindow}) {
  const bubble='process.mainModule.require("electron").BrowserWindow.getAllWindows().find(w=>/bubble\\.html$/.test(w.webContents.getURL()))';
  await evaluate(`window.__noticeOriginal={state:structuredClone(state),askAI:window.humanDispatch.askAI,notify:window.humanDispatch.notify,checkIn:window.humanDispatch.checkIn};closeConfigReminder();state.settings.notifications=true;state.settings.apiKey='';state.messages=[];state.tasks=[];state.reminders=[];state.supervisionEvents=[];state.agentContext=null;state.settings.quietUntil='';`);
  try {
    const reminders=await evaluate('('+async function(){
      const deliveries=[];
      window.humanDispatch.notify=async payload=>{const saved=await window.humanDispatch.loadState();if(!saved.messages.some(m=>m.content===payload.body&&m.role==='assistant'))throw Error('Reminder was not saved before showing');deliveries.push(payload);return true;};
      const due=new Date(Date.now()-2000).toISOString();
      state.reminders=[{id:'once',title:'喝水测试',repeat:'none',enabled:true,nextAt:due}];
      await Promise.all([checkReminders(),checkReminders()]);await checkReminders();
      state.supervisionEvents=[{id:'rest-test',type:'rest_end',sent:false,scheduledAt:due,body:'休息结束测试'}];
      await Promise.all([checkSupervision(),checkSupervision()]);await checkSupervision();
      state.tasks=[{id:'current',title:'当前工作',status:'active'}];
      window.humanDispatch.checkIn=async()=>({suppressed:false,taskId:'current',body:'主动提醒测试',bubbleId:'check-test',generatedAt:new Date().toISOString(),source:'agent'});
      await requestCheckIn({taskId:'current'});
      const rows=state.messages.filter(m=>m.kind==='reminder');
      const result={count:rows.length,delivered:deliveries.length,unique:new Set(rows.map(m=>m.id)).size,persisted:(await window.humanDispatch.loadState()).messages.filter(m=>m.kind==='reminder').length};
      window.humanDispatch.notify=window.__noticeOriginal.notify;
      return result;
    }.toString()+')()');
    assert.deepEqual(reminders,{count:3,delivered:3,unique:3,persisted:3});
    await nativeEvaluate(mainWindow+'.show(); true');
    await evaluate('window.humanDispatch.clearBubbles()');
    await evaluate(`window.__noticePayloads=[];window.humanDispatch.askAI=async payload=>{window.__noticePayloads.push(payload);return new Promise(resolve=>{window.__finishNotice=()=>resolve({reply:'延迟回复完成测试',source:'model',actions:[],quickReplies:['继续看看']});});};window.__noticeRun=handleMessage('消息发送时间测试');true;`);
    for(let i=0;i<100;i++){if(await evaluate('Boolean(window.__finishNotice)'))break;await wait(30);}
    assert.equal(await evaluate('Boolean(window.__finishNotice)'),true,'Delayed response must be in progress');
    await nativeEvaluate(mainWindow+'.close(); true');
    assert.equal(await nativeEvaluate(mainWindow+'.isVisible()'),false,'Native close hides window');
    const hidden=await evaluate(`(async()=>{window.__finishNotice();await window.__noticeRun;const saved=await window.humanDispatch.loadState(),reply=[...state.messages].reverse().find(m=>m.content==='延迟回复完成测试');window.__noticeReplyId=reply.id;return{saved:saved.messages.some(m=>m.id===reply.id),timestamps:window.__noticePayloads[0].messages.every(m=>Boolean(m.id&&m.createdAt))};})()`);
    assert.deepEqual(hidden,{saved:true,timestamps:true});
    for(let i=0;i<100;i++){if(await nativeEvaluate(bubble+'.isVisible()'))break;await wait(30);}
    assert.equal(await nativeEvaluate(bubble+'.isVisible()'),true,'Unseen completed reply must show a bubble');
    for(let i=0;i<60;i++){if((await nativeEvaluate(bubble+'.webContents.executeJavaScript('+JSON.stringify('document.querySelector("#bubbleBody").textContent')+')')).includes('延迟回复完成测试'))break;await wait(50);}
    const content=await nativeEvaluate(bubble+'.webContents.executeJavaScript('+JSON.stringify('({body:document.querySelector("#bubbleBody").textContent,choices:document.querySelectorAll("#quickActions button").length})')+')');
    assert.deepEqual(content,{body:'延迟回复完成测试',choices:1});
    assert.equal(await evaluate(`window.humanDispatch.notifyReply({messageId:window.__noticeReplyId,friendId:state.activeFriendId||'zhixu'})`),false,'Same completion must not notify twice');
    await nativeEvaluate(mainWindow+'.show(); true');
    await evaluate(`window.humanDispatch.clearBubbles();window.humanDispatch.askAI=async()=>({reply:'窗口内回复测试',source:'model',actions:[]});true;`);
    await evaluate(`handleMessage('窗口内不用再弹一次')`);
    assert.equal(await nativeEvaluate(bubble+'.isVisible()'),false,'Visible window needs no extra bubble');
    await evaluate(`handleMessage('气泡回复测试',true)`);
    assert.equal(await nativeEvaluate(bubble+'.isVisible()'),true,'Replying through a bubble remains supported');
    const stack=await nativeEvaluate(bubble+'.webContents.executeJavaScript("bubbleItems.length")');
    assert.equal(stack,1,'Bubble reply has exactly one notification');
    return {proactiveHistory:true,noDuplicateReminders:true,hiddenReply:true,visibleReply:true,metadata:true};
  } finally {
    await nativeEvaluate(mainWindow+'.show(); true');
    await evaluate(`(async()=>{const original=window.__noticeOriginal;window.humanDispatch.askAI=original.askAI;window.humanDispatch.notify=original.notify;window.humanDispatch.checkIn=original.checkIn;Object.assign(state,original.state);await save();renderAll();await window.humanDispatch.clearBubbles();delete window.__noticeOriginal;})()`);
  }
};
