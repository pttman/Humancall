const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'human-dispatch-ui-'));
app.setPath('userData', temp);
const errors = [];
app.on('web-contents-created', (_, contents) => { contents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); }); });
require(process.env.TEST_APP_MAIN || '../src/main.cjs');
app.whenReady().then(async () => {
  try {
    const deadline = Date.now() + 15000;
    let win;
    while (Date.now() < deadline) { win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('index.html')); if (win && !win.webContents.isLoading()) break; await new Promise(r => setTimeout(r, 100)); }
    if (!win) throw new Error('主窗口未启动');
    await new Promise(r => setTimeout(r, 500));
    const result = await win.webContents.executeJavaScript(`(async () => { const api = window.humanDispatch; const loaded = await api.loadState(); Object.assign(state, loaded); state.tasks.push({id:'smoke', title:'界面测试任务', status:'planned'}); await api.saveState(state); document.querySelector('#laterConfigButton').click(); await handleMessage('我现在做什么？'); return { title: document.title, task: document.querySelector('#taskList').textContent, desktop: !!window.desktopDispatch, active: (await api.loadState()).tasks[0].status }; })()`);
    if (!result.desktop || result.active !== 'active' || !result.task.includes('界面测试任务')) throw new Error(JSON.stringify(result));
    let modelStep = 0;
    const mock = require('node:http').createServer(async (req,res) => {
      for await (const chunk of req) {};
      const steps = [['list_tasks',{}],['set_plan',{steps:['读取当前任务','添加新工作']}],['execute_actions',{actions:[{type:'create_task',title:'Agent验证任务'}]}],['finish',{reply:'已添加 Agent 验证任务'}],['list_tasks',{}],['finish',{reply:'以下是当前任务'}],['list_tasks',{}],['request_deletion',{taskId:'smoke'}],['finish',{reply:'请确认删除当前任务'}]];
      const [name,args] = steps[modelStep++];
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({choices:[{message:{role:'assistant',tool_calls:[{id:'tool-'+modelStep,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]}));
    });
    await new Promise(r=>mock.listen(0,'127.0.0.1',r));
    const agentResult = await win.webContents.executeJavaScript(`(async () => { const api=window.humanDispatch; state.settings.apiKey='test'; state.settings.baseUrl='http://127.0.0.1:${mock.address().port}/v1'; await save(); await handleMessage('添加Agent验证任务'); const loaded=await window.humanDispatch.loadState(); const result={count:loaded.tasks.filter(t=>t.title==='Agent验证任务').length, trace:document.querySelectorAll('.execution-trace').length}; state.tasks.forEach(t=>t.status='planned'); await save(); await handleMessage('只查询任务'); result.readOnly=(await api.loadState()).tasks.every(t=>t.status==='planned'); await handleMessage('删除这个任务'); result.deletionSafe=state.pendingConfirmation?.type==='delete_task' && state.tasks.length===2; await handleMessage('取消删除'); const ask=window.humanDispatch.askAI; window.humanDispatch.askAI=async()=>{const fresh=await api.loadState();fresh.tasks[0].title='其他窗口的新标题';await api.saveState(fresh);throw new Error('模拟并发冲突');}; await handleMessage('测试失败恢复'); window.humanDispatch.askAI=ask; result.disabled=document.querySelector('#chatInput').disabled; result.conflictPreserved=(await api.loadState()).tasks[0].title==='其他窗口的新标题'; state.tasks[0].title='界面测试任务'; state.settings.apiKey=''; await save(); return result; })()`);
    mock.close();
    if (agentResult.count !== 1 || agentResult.trace !== 1 || agentResult.disabled || !agentResult.readOnly || !agentResult.conflictPreserved || !agentResult.deletionSafe) throw new Error(JSON.stringify(agentResult));
    console.log('Agent 多步执行、执行过程展示、无重复创建及失败后恢复输入验证通过');
    const migration = await win.webContents.executeJavaScript(`(async () => { await openSettings(); const original = document.querySelector('#dataDirectoryInput').value; const next = original + '-moved'; await window.humanDispatch.setDataDirectory(next); await openSettings(); return { original, next, shown: document.querySelector('#dataDirectoryInput').value, tasks: (await window.humanDispatch.loadState()).tasks.length }; })()`);
    if (migration.shown !== migration.next || migration.tasks !== 2) throw new Error(JSON.stringify(migration));
    console.log('设置中数据位置显示与迁移验证通过');
    const web = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await web.loadURL(win.webContents.getURL());
    await new Promise(r => setTimeout(r, 300));
    const browser = await web.webContents.executeJavaScript(`(async () => { const loaded = await window.humanDispatch.loadState(); return { desktop: !!window.desktopDispatch, title: document.title, tasks: loaded.tasks.length, rendered: document.querySelector('#taskList').textContent.includes('界面测试任务') }; })()`);
    if (browser.desktop || browser.tasks !== 2 || !browser.rendered) throw new Error(JSON.stringify(browser));
    console.log('独立网页渲染与 API 适配验证通过');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('桌面窗口、前端渲染、HTTP 保存和对话调度验证通过', JSON.stringify(result));
    app.isQuitting = true; app.quit();
  } catch (error) { console.error(error); app.isQuitting = true; app.exit(1); }
});
