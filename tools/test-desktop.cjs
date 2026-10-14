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
    const migration = await win.webContents.executeJavaScript(`(async () => { await openSettings(); const original = document.querySelector('#dataDirectoryInput').value; const next = original + '-moved'; await window.humanDispatch.setDataDirectory(next); await openSettings(); return { original, next, shown: document.querySelector('#dataDirectoryInput').value, tasks: (await window.humanDispatch.loadState()).tasks.length }; })()`);
    if (migration.shown !== migration.next || migration.tasks !== 1) throw new Error(JSON.stringify(migration));
    console.log('设置中数据位置显示与迁移验证通过');
    const web = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await web.loadURL(win.webContents.getURL());
    await new Promise(r => setTimeout(r, 300));
    const browser = await web.webContents.executeJavaScript(`(async () => { const loaded = await window.humanDispatch.loadState(); return { desktop: !!window.desktopDispatch, title: document.title, tasks: loaded.tasks.length, rendered: document.querySelector('#taskList').textContent.includes('界面测试任务') }; })()`);
    if (browser.desktop || browser.tasks !== 1 || !browser.rendered) throw new Error(JSON.stringify(browser));
    console.log('独立网页渲染与 API 适配验证通过');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('桌面窗口、前端渲染、HTTP 保存和对话调度验证通过', JSON.stringify(result));
    app.isQuitting = true; app.quit();
  } catch (error) { console.error(error); app.isQuitting = true; app.exit(1); }
});
