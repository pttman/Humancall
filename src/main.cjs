const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, screen, dialog, shell } = require('electron');
const path = require('path');
const { configureDataDirectory, readState } = require('../backend/core.cjs');
const { createServer } = require('../backend/server.cjs');
let apiServer;
let frontendUrl;
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow;
let tray;
let bubbleWindow;
let bubbleLoaded = false;
let queuedBubbles = [];
let lastPassiveNudgeAt = 0;
let passiveTimer;
const appIconPngPath = path.join(__dirname, '..', 'assets', 'app-icon.png');
const appIconIcoPath = path.join(__dirname, '..', 'assets', 'app-icon.ico');
const appIconPath = process.platform === 'win32' ? appIconIcoPath : appIconPngPath;
function dataDirectory() {
  const configPath = path.join(app.getPath('userData'), 'data-directory.txt');
  if (!fs.existsSync(configPath)) return app.getPath('userData');
  const directory = fs.readFileSync(configPath, 'utf16le').replace(/^\uFEFF/, '').trim();
  if (!directory || !path.isAbsolute(directory)) throw new Error('数据目录配置无效，请重新选择绝对路径。');
  return directory;
}

function statePath() {
  return path.join(dataDirectory(), 'human-dispatch-state.json');
}

function prepareDataDirectory() {
  const directory = dataDirectory();
  fs.mkdirSync(directory, { recursive: true });
  fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
  const original = path.join(app.getPath('userData'), 'human-dispatch-state.json');
  const target = statePath();
  if (path.resolve(original) !== path.resolve(target) && !fs.existsSync(target) && fs.existsSync(original)) {
    fs.copyFileSync(original, target, fs.constants.COPYFILE_EXCL);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#10151c',
    title: '人类调度',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);
  mainWindow.loadURL(frontendUrl + '/index.html');
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createBubbleWindow() {
  bubbleWindow = new BrowserWindow({
    width: 390,
    height: 270,
    minWidth: 340,
    minHeight: 210,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  bubbleWindow.loadURL(frontendUrl + '/bubble.html');
  bubbleWindow.once('ready-to-show', () => { bubbleLoaded = true; const pending = queuedBubbles; queuedBubbles = []; pending.forEach((payload) => showBubble(payload)); });
  bubbleWindow.on('closed', () => { bubbleWindow = null; bubbleLoaded = false; });
}

function findAlertSound() {
  const projectRoot = path.join(__dirname, '..');
  const candidates = [];
  const directories = [projectRoot, path.join(projectRoot, 'assets')];
  if (app.isPackaged) directories.push(path.join(process.resourcesPath, 'assets'));
  for (const directory of directories) {
    try {
      fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
        .forEach((entry) => candidates.push(path.join(directory, entry.name)));
    } catch {}
  }
  return candidates[0] || null;
}

function positionBubble() {
  if (!bubbleWindow) return;
  const area = screen.getPrimaryDisplay().workArea;
  const [width, height] = bubbleWindow.getSize();
  bubbleWindow.setPosition(area.x + area.width - width - 18, area.y + area.height - height - 18, false);
}

function showBubble(payload) {
  if (!bubbleWindow) return;
  if (!bubbleLoaded) { queuedBubbles.push(payload); return; }
  const currentState = readState();
  payload = { ...payload, bubbleId: payload.bubbleId || `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, theme: payload.theme || currentState.settings.theme || 'pastel-mix' };
  positionBubble();
  bubbleWindow.webContents.send('bubble:show', payload);
  bubbleWindow.showInactive();
  bubbleWindow.moveTop();
}

function hideBubble() {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.hide();
}

function createTray() {
  const appIcon = nativeImage.createFromPath(appIconPngPath);
  tray = new Tray(appIcon.isEmpty() ? nativeImage.createEmpty() : appIcon.resize({ width: 32, height: 32 }));
  tray.setToolTip('人类调度');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开调度窗', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: '立即弹出督促', click: () => passiveNudge(true) },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// 监管提醒统一使用自绘气泡，避免同时出现重复的系统黑色通知窗。
function notify() {}

function isWithinWorkHours(settings) {
  const current = new Date();
  const currentMinutes = current.getHours() * 60 + current.getMinutes();
  const parse = (value, fallback) => {
    const match = String(value || fallback).match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  };
  return currentMinutes >= parse(settings.workStart, '09:00') && currentMinutes <= parse(settings.workEnd, '18:00');
}

function chooseSupervisionTask(tasks) {
  const current = new Date();
  return tasks.find((task) => task.status === 'active' && !task.isContainer) ||
    tasks.filter((task) => !task.isContainer && ['planned', 'inbox', 'blocked'].includes(task.status) && (!task.dueAt || new Date(task.dueAt) <= current)).sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999'))[0];
}

function passiveNudge(force = false) {
  const state = readState();
  if (!state.settings.notifications || (!force && state.settings.passiveNudgesEnabled === false)) return;
  if (!force && state.settings.quietUntil && new Date(state.settings.quietUntil) > new Date()) return;
  if (!force && !isWithinWorkHours(state.settings)) return;
  const interval = Math.max(5, Number(state.settings.passiveNudgeMinutes) || 10) * 60 * 1000;
  if (!force && Date.now() - lastPassiveNudgeAt < interval) return;
  const task = chooseSupervisionTask(state.tasks || []);
  if (!task) return;
  const body = task.status === 'active'
    ? `“${task.title}”还在等你汇报。现在完成到哪一步？`
    : `下一项工作已下达：开始“${task.title}”。不要继续拖延。`;
  lastPassiveNudgeAt = Date.now();
  notify('人类调度 · 该干活了', body);
  showBubble({ title: '该干活了', body, taskId: task.id, taskTitle: task.title });
}

function startPassiveSupervisor() {
  clearInterval(passiveTimer);
  passiveTimer = setInterval(() => passiveNudge(false), 15000);
}

app.setAppUserModelId('com.human-dispatch.desktop');

app.whenReady().then(async () => {
  try {
    prepareDataDirectory();
  } catch (error) {
    dialog.showErrorBox('无法打开数据目录', `请检查所选目录是否存在且可写，或重新运行安装程序选择目录。\n${error.message}`);
    app.quit();
    return;
  }
  Menu.setApplicationMenu(null);
  configureDataDirectory(dataDirectory());
  apiServer = createServer();
  await new Promise((resolve, reject) => { apiServer.once('error', reject); apiServer.listen(0, '127.0.0.1', resolve); });
  frontendUrl = 'http://127.0.0.1:' + apiServer.address().port;
  ipcMain.handle('external:open', async (_, targetUrl) => {
    const url = new URL(String(targetUrl || ''));
    if (url.protocol !== 'https:') throw new Error('只允许打开 HTTPS 支持链接');
    await shell.openExternal(url.toString()); return true;
  });
  ipcMain.handle('notification:show', (_, payload) => { notify(payload.title, payload.body); showBubble(payload); return true; });
  ipcMain.handle('bubble:hide', () => { hideBubble(); return true; });
  ipcMain.handle('bubble:show', (_, payload) => { showBubble(payload); return true; });
  ipcMain.handle('bubble:resize', (_, requestedHeight) => {
    if (!bubbleWindow || bubbleWindow.isDestroyed()) return false;
    const area = screen.getPrimaryDisplay().workArea;
    const maxHeight = Math.min(520, Math.max(210, area.height - 30));
    const height = Math.max(210, Math.min(maxHeight, Number(requestedHeight) || 270));
    const [width] = bubbleWindow.getSize();
    bubbleWindow.setSize(width, height, false);
    positionBubble();
    return height;
  });
  ipcMain.handle('audio:alert-url', () => {
    const soundPath = findAlertSound();
    return soundPath ? frontendUrl + '/assets/notification.mp3' : null;
  });
  ipcMain.handle('bubble:open-main', () => { if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.webContents.send('bubble:clear'); mainWindow.show(); mainWindow.focus(); hideBubble(); return true; });
  ipcMain.handle('bubble:submit', (_, text) => { mainWindow.webContents.send('bubble:submit', text); hideBubble(); return true; });
  createWindow();
  createBubbleWindow();
  createTray();
  startPassiveSupervisor();
});

app.on('window-all-closed', (event) => event.preventDefault());

app.on('before-quit', () => { clearInterval(passiveTimer); apiServer?.close(); });
