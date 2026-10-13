const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, screen, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow;
let tray;
let bubbleWindow;
let bubbleLoaded = false;
let queuedBubbles = [];
let lastPassiveNudgeAt = 0;
let passiveTimer;
const appIconPngPath = path.join(__dirname, 'assets', 'app-icon.png');
const appIconIcoPath = path.join(__dirname, 'assets', 'app-icon.ico');
const appIconPath = process.platform === 'win32' ? appIconIcoPath : appIconPngPath;
const TONE_GUIDANCE = {
  '温柔陪跑': '温暖、鼓励、像可靠的陪跑伙伴；可以提醒，但不要制造压力。',
  '友好助理': '礼貌、清晰、自然；主动帮用户把事情变简单。',
  '耐心教练': '耐心解释、分小步推进；持续追踪但不责备。',
  '温和助理': '礼貌、清晰、自然；主动帮用户把事情变简单。',
  '严格教练': '直接、明确、有节奏地追踪结果；指出拖延但保持尊重。',
  '老板模式': '有权威感、命令式、少废话；始终给出明确的下一步。',
  '高压调度': '紧迫、强硬、连续追问；不得辱骂、威胁或鼓励危险过劳。',
  '角色扮演模式': '按用户自定义角色提示词表演；仍须遵守安全边界并保持可执行。'
};
const BASE_SYSTEM_PROMPT = `你是“人类调度”，负责帮助用户收集工作、拆解任务、安排下一步并持续追踪结果。
你的职责是收集工作、拆解任务、安排下一步、定时检查、追问结果，并在用户拖延或没有及时回复时把用户叫回来。
遇到“检查配置并提供部署包”这类包含多个交付结果的工作时，建立一个总任务，再建立有明确顺序的子任务；不要把它们当成互不相关的并列任务。总任务只用于展示整体进度，真正监督和提醒应指向当前可执行的子任务。
用户没有及时回复时，允许你重复督促；在合理范围内可以偶尔连续发出两条简短提醒，但必须遵守应用设置中的被动督促频率，不能无限轰炸。
每次尽量给出一个明确的下一步、完成标准和汇报时间。不要臆造用户已经完成工作。
不得进行人身攻击、身份歧视、现实伤害威胁，也不要鼓励危险过劳。`;
const DEFAULT_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}\n语气要求：${TONE_GUIDANCE['老板模式']}`;
const TONE_PROMPTS = Object.fromEntries(Object.entries(TONE_GUIDANCE).map(([tone, guidance]) => [tone, `${BASE_SYSTEM_PROMPT}\n当前角色：${tone}。\n语气要求：${guidance}`]));
const LEGACY_DEFAULT_PROMPT_MARKER = '一个强势、直接、像老板一样管理用户工作的 AI 调度者';
const defaultState = {
  settings: {
    provider: 'OpenAI Compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    tone: '老板模式',
    workStart: '09:00',
    workEnd: '18:00',
    notifications: true,
    reminderMinutes: 30,
    passiveNudgesEnabled: true,
    passiveNudgeMinutes: 10,
    quietUntil: '',
    supportUrl: '',
    systemPrompt: TONE_PROMPTS['老板模式'],
    tonePrompts: TONE_PROMPTS,
    theme: 'alert-red',
    themeConfigured: true
  },
  tasks: [],
  reminders: [],
  projects: [{ id: 'default', name: '默认项目', color: '#78e3b1' }],
  messages: [],
  supervisionEvents: []
};

function statePath() {
  return path.join(app.getPath('userData'), 'human-dispatch-state.json');
}

function readState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.settings && !Object.prototype.hasOwnProperty.call(parsed.settings, 'themeConfigured')) {
      parsed.settings.theme = 'alert-red';
      parsed.settings.themeConfigured = true;
    }
    const settings = { ...defaultState.settings, ...(parsed.settings || {}) };
    const savedTonePrompts = parsed.settings?.tonePrompts || {};
    if (!parsed.settings?.tonePrompts && parsed.settings?.systemPrompt && !String(parsed.settings.systemPrompt).includes(LEGACY_DEFAULT_PROMPT_MARKER)) savedTonePrompts[settings.tone] = parsed.settings.systemPrompt;
    settings.tonePrompts = { ...TONE_PROMPTS, ...savedTonePrompts };
    settings.systemPrompt = settings.tonePrompts[settings.tone] || settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    return { ...defaultState, ...parsed, settings };
  } catch {
    return structuredClone(defaultState);
  }
}

function writeState(state) {
  const target = statePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function normalizeImportedState(parsed, currentState) {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.reminders)) throw new Error('备份文件格式不正确');
  const imported = { ...defaultState, ...parsed, settings: { ...defaultState.settings, ...(parsed.settings || {}) } };
  imported.settings.apiKey = currentState?.settings?.apiKey || imported.settings.apiKey || '';
  imported.settings.tonePrompts = { ...TONE_PROMPTS, ...(parsed.settings?.tonePrompts || {}) };
  imported.settings.systemPrompt = imported.settings.tonePrompts[imported.settings.tone] || imported.settings.systemPrompt || TONE_PROMPTS[imported.settings.tone] || DEFAULT_SYSTEM_PROMPT;
  return imported;
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
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
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
  bubbleWindow.loadFile(path.join(__dirname, 'bubble.html'));
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
  payload = { ...payload, bubbleId: payload.bubbleId || `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, theme: payload.theme || currentState.settings.theme || 'alert-red' };
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
  tray = new Tray(appIcon.isEmpty() ? nativeImage.createEmpty() : appIcon);
  tray.setToolTip('人类调度');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开调度窗', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: '立即弹出督促', click: () => passiveNudge(true) },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

function normalizeBaseUrl(value) {
  let url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (url.endsWith('/chat/completions')) return url;
  return `${url}/chat/completions`;
}

function extractJson(text) {
  const source = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(source); } catch {}
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function callModel({ settings, messages, tasks, reminders }) {
  const endpoint = normalizeBaseUrl(settings.baseUrl);
  if (!endpoint || !settings.apiKey) throw new Error('未配置 API Base URL 或 API Key');
  const taskContext = tasks.slice(0, 50).map((task) => ({
    id: task.id, title: task.title, status: task.status, dueAt: task.dueAt,
    priority: task.priority, project: task.projectName, parentId: task.parentId, isContainer: Boolean(task.isContainer)
  }));
  const reminderContext = (reminders || []).slice(0, 50).map((reminder) => ({
    id: reminder.id, title: reminder.title, nextAt: reminder.nextAt, repeat: reminder.repeat, enabled: reminder.enabled
  }));
  const selectedPrompt = settings.tonePrompts?.[settings.tone] || settings.systemPrompt || TONE_PROMPTS[settings.tone] || DEFAULT_SYSTEM_PROMPT;
  const system = `${selectedPrompt}\n\n当前监督语气档位：${settings.tone}。${TONE_GUIDANCE[settings.tone] || ''}\n` +
    '你要把用户的自然语言变成可执行的工作管理动作。提醒和任务是两种不同对象：提醒用于某个时间点通知用户，任务用于持续督办。多个交付结果请使用总任务和子任务：先创建总任务，再让子任务用 parentTitle 指向总任务标题；总任务可设置 isContainer=true。\n' +
    '只返回严格 JSON，不要 Markdown。格式：' +
    '{"reply":"给用户的中文回复","actions":[{"type":"create_task|update_task|complete_task|block_task|postpone_task|snooze_task|delete_task|create_project|create_reminder|update_reminder|delete_reminder|clear_all_tasks|none","taskId":"可选","reminderId":"可选","title":"可选","description":"可选","parentId":"可选","parentTitle":"可选","isContainer":false,"dueAt":"ISO时间或空","nextAt":"ISO时间或空","repeat":"none|daily|weekly","weekday":0,"estimatedMinutes":30,"priority":"low|normal|high|urgent","status":"可选","projectName":"可选","enabled":true}],"followUpMinutes":数字或null}\n' +
    '完成任务时优先用 complete_task；用户说遇到问题用 block_task；用户说“推到明天做”“明天再做”或要求延期时，必须对现有任务使用 snooze_task 并提供 dueAt 和 followUpMinutes，不能创建新任务，客户端会在此期间静默。用户要求删除单个任务时返回 delete_task，并提供 taskId 或精确 title；客户端必须二次确认后才执行。用户明确要求清空全部任务时可以返回 clear_all_tasks，但客户端必须二次确认后才执行。不要臆造用户已经完成或要求删除。\n' +
    '创建提醒时必须提供 nextAt（ISO 时间）；一次性提醒 repeat 为 none，每天重复为 daily，每周重复为 weekly，并提供 weekday（周日为 0）。\n' +
    `当前任务：${JSON.stringify(taskContext)}\n当前提醒：${JSON.stringify(reminderContext)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.3,
      messages: [{ role: 'system', content: system }, ...messages.slice(-20)],
      response_format: { type: 'json_object' }
    })
  });
  if (!response.ok) throw new Error(`模型请求失败（${response.status}）`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content || '';
  const parsed = extractJson(content);
  if (!parsed) throw new Error('模型返回内容无法解析为结构化 JSON');
  return parsed;
}

function parseReminderRequest(input) {
  const source = String(input || '').trim();
  if (!/(提醒|叫我|通知我)/.test(source)) return null;
  const now = new Date();
  const relative = source.match(/(\d+)\s*(分钟|分|小时|时|天)后/);
  let nextAt;
  let repeat = 'none';
  let weekday;
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const milliseconds = unit.startsWith('天') ? amount * 86400000 : unit.startsWith('小') || unit === '时' ? amount * 3600000 : amount * 60000;
    nextAt = new Date(now.getTime() + milliseconds);
  } else {
    const time = source.match(/(\d{1,2})\s*(?:点|:)\s*(\d{0,2})?/);
    if (!time) return null;
    const hour = Math.min(23, Number(time[1]));
    const minute = Math.min(59, Number(time[2] || 0));
    nextAt = new Date(now);
    nextAt.setHours(hour, minute, 0, 0);
    if (/明天/.test(source)) nextAt.setDate(nextAt.getDate() + 1);
    else if (/后天/.test(source)) nextAt.setDate(nextAt.getDate() + 2);
    else if (nextAt <= now && !/每天|每周/.test(source)) nextAt.setDate(nextAt.getDate() + 1);
    if (/每天/.test(source)) {
      repeat = 'daily';
      if (nextAt <= now) nextAt.setDate(nextAt.getDate() + 1);
    }
    const weekly = source.match(/每周([一二三四五六日天])/);
    if (weekly) {
      repeat = 'weekly';
      weekday = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }[weekly[1]];
      nextAt.setDate(nextAt.getDate() + ((weekday - nextAt.getDay() + 7) % 7));
      if (nextAt <= now) nextAt.setDate(nextAt.getDate() + 7);
    }
  }
  const title = source
    .replace(/\d+\s*(分钟|分|小时|时|天)后/, '')
    .replace(/明天|后天|今天|每天|每周[一二三四五六日天]/g, '')
    .replace(/\d{1,2}\s*(?:点|:\d{1,2})\s*/, '')
    .trim()
    .replace(/^(请)?(提醒|叫|通知)(一下)?(我)?/, '')
    .replace(/^(在|到)\s*/, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!title) return null;
  return { title, nextAt: nextAt.toISOString(), repeat, ...(weekday === undefined ? {} : { weekday }) };
}

function localFallback(text, tasks) {
  const input = String(text || '').trim();
  const lower = input.toLowerCase();
  const active = tasks.find((task) => task.status === 'active' && !task.isContainer);
  const reminder = parseReminderRequest(input);
  if (reminder) {
    return { reply: `${reminder.repeat === 'none' ? '已安排提醒' : '已安排重复提醒'}：“${reminder.title}”，时间到了我会叫你。`, actions: [{ type: 'create_reminder', ...reminder }] };
  }
  if (/(删掉|删除|移除)/.test(input) && !/(不要|别|不删)/.test(input)) {
    const candidate = input.replace(/^(请|帮我)?\s*(删掉|删除|移除)\s*(这个|该|当前)?\s*(任务|工作)?[：:\s]*/i, '').trim();
    const target = tasks.find((task) => candidate && task.title === candidate)
      || tasks.find((task) => candidate && task.title.includes(candidate))
      || (/(这个|该|当前)(任务|工作)?/.test(input) ? active : null);
    if (target) return { reply: `收到删除请求：“${target.title}”。请确认后执行。`, actions: [{ type: 'delete_task', taskId: target.id, title: target.title }] };
  }
  if (/^(完成|做完|搞定|已完成|完成了)/.test(input)) {
    const candidate = input.replace(/^(完成|做完|搞定|已完成|完成了)[:：\s]*/, '').trim();
    const target = tasks.find((task) => candidate && task.title.includes(candidate)) || active;
    if (target) return { reply: `已记录完成：${target.title}。回来继续接受调度。`, actions: [{ type: 'complete_task', taskId: target.id }] };
  }
  if (/^(卡住|阻塞|做不了|遇到问题)/.test(input) && active) {
    return { reply: `已将“${active.title}”标记为阻塞。说清楚阻塞原因，或者接受替代任务。`, actions: [{ type: 'block_task', taskId: active.id, description: input }] };
  }
  if (/(再给我|延期|晚点|稍后)/.test(input) && active) {
    const match = input.match(/(\d+|[一二三四五六七八九十]+|半)\s*(分钟|分|小时|时)/);
    const number = match ? (match[1] === '半' ? 0.5 : /^\d+$/.test(match[1]) ? Number(match[1]) : [...match[1]].reduce((total, digit) => total * 10 + ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }[digit] || 0), 0)) : 1;
    const minutes = match ? (match[2].startsWith('小') || match[2] === '时' ? number * 60 : number) : 10;
    return { reply: `准你再拖 ${minutes} 分钟。静默期间不会打扰你，之后回来汇报“${active.title}”。`, actions: [{ type: 'snooze_task', taskId: active.id, dueAt: new Date(Date.now() + minutes * 60000).toISOString() }], followUpMinutes: minutes };
  }
  if (/(换一项|换个任务|换一份工作|换个工作)/.test(input)) {
    const next = tasks.find((task) => task.id !== active?.id && ['planned', 'inbox'].includes(task.status));
    if (next) {
      const actions = [{ type: 'update_task', taskId: next.id, status: 'active' }];
      if (active) actions.unshift({ type: 'update_task', taskId: active.id, status: 'planned' });
      return { reply: `准你换一项。现在执行“${next.title}”，完成后回来汇报。`, actions, followUpMinutes: 30 };
    }
    return { reply: '没有第二项可换。把新的工作交出来，或者继续完成当前任务。', actions: [] };
  }
  if (/我现在做什么|现在做什么|安排一下|下一项|继续下一项|安排新工作/.test(input)) {
    const next = tasks.find((task) => ['planned', 'inbox', 'active'].includes(task.status) && (!task.dueAt || new Date(task.dueAt) <= new Date()));
    if (next) return { reply: `现在执行“${next.title}”。先做第一步，${next.estimatedMinutes || 30} 分钟后回来汇报。`, actions: [{ type: 'update_task', taskId: next.id, status: 'active' }], followUpMinutes: 30 };
    return { reply: '当前没有可执行任务。把你要做的事情交出来。', actions: [] };
  }
  const pieces = input.split(/[，。；;！!\n]+/).map((part) => part.trim()).filter((part) => part.length >= 2);
  const candidates = pieces.length ? pieces : [input];
  if (candidates.length > 1) {
    const parentTitle = input;
    return {
      reply: `已建立总任务“${parentTitle}”，并拆成 ${candidates.length} 个子任务。先执行“${candidates[0]}”，完成后再进入下一项。`,
      actions: [
        { type: 'create_task', title: parentTitle, description: '由多个交付结果组成的总任务', isContainer: true, status: 'planned' },
        ...candidates.slice(0, 6).map((title, index) => ({ type: 'create_task', title, parentTitle, priority: index === 0 ? 'high' : 'normal', estimatedMinutes: 30, status: index === 0 ? 'active' : 'planned' }))
      ],
      followUpMinutes: 30
    };
  }
  return {
    reply: `收到。已把你的工作纳入调度。先执行“${candidates[0]}”，完成后回来报告。`,
    actions: candidates.slice(0, 6).map((title, index) => ({ type: 'create_task', title, priority: index === 0 ? 'high' : 'normal', estimatedMinutes: 30, status: index === 0 ? 'active' : 'planned' })),
    followUpMinutes: 30
  };
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle('state:load', () => readState());
  ipcMain.handle('state:save', (_, state) => writeState(state));
  ipcMain.handle('settings:default-prompt', () => DEFAULT_SYSTEM_PROMPT);
  ipcMain.handle('settings:tone-prompts', () => TONE_PROMPTS);
  ipcMain.handle('data:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const result = await dialog.showSaveDialog({ title: '导出人类调度备份', defaultPath: `人类调度-备份-${stamp}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    const snapshot = readState();
    snapshot.settings = { ...snapshot.settings, apiKey: '', apiKeyIncluded: false };
    fs.writeFileSync(result.filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle('data:import', async () => {
    const result = await dialog.showOpenDialog({ title: '导入人类调度备份', properties: ['openFile'], filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    const imported = normalizeImportedState(parsed, readState());
    writeState(imported);
    return { canceled: false, state: imported, filePath: result.filePaths[0] };
  });
  ipcMain.handle('external:open', async (_, targetUrl) => {
    const url = new URL(String(targetUrl || ''));
    if (url.protocol !== 'https:') throw new Error('只允许打开 HTTPS 支持链接');
    await shell.openExternal(url.toString());
    return true;
  });
  ipcMain.handle('ai:chat', async (_, payload) => {
    const state = readState();
    try {
      return { ...await callModel({ settings: payload.settings || state.settings, messages: payload.messages || [], tasks: state.tasks || [], reminders: state.reminders || [] }), source: 'model' };
    } catch (error) {
      return { ...localFallback(payload.text, state.tasks || []), source: 'local', warning: error.message };
    }
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
    return soundPath ? pathToFileURL(soundPath).toString() : null;
  });
  ipcMain.handle('bubble:open-main', () => { if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.webContents.send('bubble:clear'); mainWindow.show(); mainWindow.focus(); hideBubble(); return true; });
  ipcMain.handle('bubble:submit', (_, text) => { mainWindow.webContents.send('bubble:submit', text); hideBubble(); return true; });
  createWindow();
  createBubbleWindow();
  createTray();
  startPassiveSupervisor();
});

app.on('window-all-closed', (event) => event.preventDefault());
