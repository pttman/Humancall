const $ = (selector) => document.querySelector(selector);
const state = { settings: {}, tasks: [], reminders: [], projects: [], messages: [], supervisionEvents: [] };
let selectedTaskId = null;
let toastTimer;
let pendingDeleteKey = '';
let pendingDeleteTimer;
let defaultTonePrompts = {};
let promptDrafts = {};
let activePromptTone = '';
const taskView = { query: '', status: 'all', completedCollapsed: false, collapsedTaskIds: new Set() };

const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const formatDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const statusText = { inbox: '收件箱', planned: '待执行', active: '执行中', blocked: '阻塞', waiting: '等待中', completed: '已完成', cancelled: '已取消' };
const themeLabels = { 'green-command': '深海绿 · 调度默认', 'midnight-blue': '午夜蓝 · 科技冷静', 'alert-red': '警戒红 · 高压提醒', 'paper-focus': '纸张专注 · 浅色工作台', 'pastel-mix': '黄绿粉 · 混合浅色' };

async function save() { await window.humanDispatch.saveState(state); }

function showToast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function addMessage(role, content, meta = '') {
  state.messages.push({ id: uid('msg'), role, content, meta, createdAt: now() });
  renderMessages(); save();
}

function renderMessages() {
  const container = $('#chatMessages');
  if (!state.messages.length) {
    container.innerHTML = '<div class="empty">把工作交出来。AI 会负责拆解和监督。</div>';
    return;
  }
  container.innerHTML = state.messages.map((message) => `<div class="message ${message.role}"><div class="avatar">${message.role === 'user' ? '你' : 'H'}</div><div class="bubble">${escapeHtml(message.content)}${message.meta ? `<small>${escapeHtml(message.meta)}</small>` : ''}</div></div>`).join('');
  container.scrollTop = container.scrollHeight;
}

function sortTasks(tasks) {
  const order = { active: 0, blocked: 1, planned: 2, inbox: 3, waiting: 4, completed: 5, cancelled: 6 };
  return [...tasks].sort((a, b) => (order[a.status] - order[b.status]) || ((a.dueAt || '9999') < (b.dueAt || '9999') ? -1 : 1));
}

function childrenOf(taskId) { return state.tasks.filter((task) => task.parentId === taskId); }
function hierarchicalTasks(tasks) {
  const visibleIds = new Set(tasks.map((task) => task.id));
  const sorted = sortTasks(state.tasks);
  const result = [];
  sorted.filter((task) => !task.parentId).forEach((parent) => {
    const children = sorted.filter((task) => task.parentId === parent.id);
    if (visibleIds.has(parent.id) || children.some((child) => visibleIds.has(child.id))) result.push(parent);
    if (!taskView.collapsedTaskIds.has(parent.id)) children.filter((child) => visibleIds.has(child.id)).forEach((child) => result.push(child));
  });
  sorted.filter((task) => visibleIds.has(task.id) && task.parentId && !state.tasks.some((parent) => parent.id === task.parentId)).forEach((task) => result.push(task));
  return result;
}

function refreshParentStatuses() {
  state.tasks.filter((task) => task.isContainer).forEach((parent) => {
    const children = childrenOf(parent.id);
    if (!children.length || parent.status === 'cancelled') return;
    const nextStatus = children.every((task) => task.status === 'completed') ? 'completed'
      : children.some((task) => task.status === 'active') ? 'active'
        : children.some((task) => task.status === 'blocked') ? 'blocked'
          : children.some((task) => task.status === 'waiting') ? 'waiting' : 'planned';
    if (parent.status !== nextStatus) Object.assign(parent, { status: nextStatus, updatedAt: now(), ...(nextStatus === 'completed' ? { completedAt: now() } : {}) });
  });
}

function isTaskAvailable(task) {
  return task && !task.isContainer && !['completed', 'cancelled'].includes(task.status) && (!task.dueAt || new Date(task.dueAt) <= new Date());
}

function currentTask() {
  return state.tasks.find((task) => task.id === selectedTaskId && isTaskAvailable(task))
    || state.tasks.find((task) => !task.isContainer && task.status === 'active' && isTaskAvailable(task))
    || sortTasks(state.tasks).find((task) => !task.isContainer && ['planned', 'inbox'].includes(task.status) && isTaskAvailable(task));
}

function removeTaskById(id) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    state.tasks.filter((task) => task.parentId && ids.has(task.parentId)).forEach((task) => { if (!ids.has(task.id)) { ids.add(task.id); changed = true; } });
  }
  const removed = state.tasks.filter((task) => ids.has(task.id));
  state.tasks = state.tasks.filter((task) => !ids.has(task.id));
  state.supervisionEvents = state.supervisionEvents.filter((event) => !ids.has(event.taskId));
  if (ids.has(selectedTaskId)) selectedTaskId = null;
  return removed;
}

async function requestDelete(type, id) {
  const key = `${type}:${id}`;
  const item = type === 'task' ? state.tasks.find((task) => task.id === id) : state.reminders.find((reminder) => reminder.id === id);
  if (!item) return;
  if (pendingDeleteKey !== key) {
    pendingDeleteKey = key;
    clearTimeout(pendingDeleteTimer);
    pendingDeleteTimer = setTimeout(() => { pendingDeleteKey = ''; renderAll(); }, 5000);
    showToast(`再次点击“删”确认删除：${item.title}`);
    type === 'task' ? renderTasks() : renderReminders();
    return;
  }
  pendingDeleteKey = '';
  clearTimeout(pendingDeleteTimer);
  if (type === 'task') {
    removeTaskById(id);
  } else {
    state.reminders = state.reminders.filter((reminder) => reminder.id !== id);
  }
  await save();
  renderAll();
  showToast(`已删除${type === 'task' ? '任务' : '提醒'}：${item.title}`);
}

function renderTasks() {
  const tasks = sortTasks(state.tasks);
  const query = taskView.query.trim().toLowerCase();
  const visibleTasks = tasks.filter((task) => (taskView.status === 'all' || task.status === taskView.status) && (!taskView.completedCollapsed || task.status !== 'completed') && (!query || `${task.title} ${task.description || ''} ${task.projectName || ''}`.toLowerCase().includes(query)));
  $('#taskCount').textContent = tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled').length;
  const statusOptions = Object.entries(statusText).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const displayTasks = hierarchicalTasks(visibleTasks);
  $('#taskList').innerHTML = displayTasks.length ? displayTasks.map((task) => {
    const children = childrenOf(task.id);
    const progress = task.isContainer && children.length ? ` · ${children.filter((child) => child.status === 'completed').length}/${children.length} 子任务` : '';
    const subtaskClass = task.parentId ? ' subtask' : '';
    const parentClass = task.isContainer ? ' parent-task' : '';
    const collapseButton = children.length ? `<button class="task-collapse" data-collapse-task-id="${escapeHtml(task.id)}" title="${taskView.collapsedTaskIds.has(task.id) ? '展开子任务' : '收起子任务'}">${taskView.collapsedTaskIds.has(task.id) ? '▸' : '▾'}</button>` : '';
    const deletePending = pendingDeleteKey === `task:${task.id}`;
    return `<div class="task-item${subtaskClass}${parentClass}" data-task-id="${escapeHtml(task.id)}"><span class="task-dot ${task.status}"></span><div class="task-content"><div class="task-title-line">${collapseButton}<div class="task-title ${task.status === 'completed' ? 'completed' : ''}">${task.isContainer ? '总任务 · ' : ''}${escapeHtml(task.title)}</div></div><div class="task-sub">${escapeHtml(task.projectName || '默认项目')}${progress}${task.dueAt ? ` · ${formatDate(task.dueAt)}` : ''}${task.estimatedMinutes ? ` · ${task.estimatedMinutes} 分钟` : ''}</div></div><select class="task-status-select" data-task-status-id="${escapeHtml(task.id)}" aria-label="调整任务状态" ${task.isContainer ? 'disabled title="总任务状态由子任务汇总"' : ''}>${statusOptions.replace(`value="${task.status}"`, `value="${task.status}" selected`)}</select><button class="task-delete${deletePending ? ' is-pending' : ''}" data-delete-task-id="${escapeHtml(task.id)}" aria-label="${deletePending ? '确认删除任务' : '删除任务'}" title="${task.isContainer ? '删除总任务及其子任务' : '删除任务'}">${deletePending ? '确认' : '删'}</button></div>`;
  }).join('') : `<div class="empty">${tasks.length ? '没有符合筛选条件的任务' : '还没有任务'}</div>`;
  document.querySelectorAll('[data-task-id]').forEach((item) => item.addEventListener('click', () => { selectedTaskId = item.dataset.taskId; renderAll(); }));
  document.querySelectorAll('[data-collapse-task-id]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const taskId = button.dataset.collapseTaskId;
    if (taskView.collapsedTaskIds.has(taskId)) taskView.collapsedTaskIds.delete(taskId); else taskView.collapsedTaskIds.add(taskId);
    renderTasks();
  }));
  document.querySelectorAll('[data-task-status-id]').forEach((select) => {
    select.addEventListener('click', (event) => event.stopPropagation());
    select.addEventListener('change', async (event) => {
      event.stopPropagation();
      const task = state.tasks.find((item) => item.id === select.dataset.taskStatusId);
      if (!task) return;
      updateTask(task.id, { status: select.value });
      if (select.value === 'completed') state.supervisionEvents.filter((item) => item.taskId === task.id && !item.sent).forEach((item) => { item.sent = true; });
      await save(); renderAll(); showToast(`已将“${task.title}”调整为${statusText[select.value] || select.value}`);
    });
  });
  document.querySelectorAll('[data-delete-task-id]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    await requestDelete('task', button.dataset.deleteTaskId);
  }));
  $('#toggleCompletedButton').textContent = taskView.completedCollapsed ? '显示已完成' : '收起已完成';
  const done = state.tasks.filter((task) => task.status === 'completed').length;
  const pending = state.tasks.filter((task) => !['completed', 'cancelled'].includes(task.status)).length;
  const overdue = state.tasks.filter((task) => task.dueAt && new Date(task.dueAt) < new Date() && !['completed', 'cancelled'].includes(task.status)).length;
  $('#doneCount').textContent = done; $('#pendingCount').textContent = pending; $('#overdueCount').textContent = overdue;
}

function renderCurrent() {
  const task = currentTask();
  if (!task) {
    const deferred = sortTasks(state.tasks).find((item) => !item.isContainer && item.status === 'planned' && item.dueAt && new Date(item.dueAt) > new Date());
    if (deferred) {
      $('#currentTaskTitle').textContent = `已暂缓：${deferred.title}`;
      $('#currentTaskMeta').textContent = `静默至 ${formatDate(deferred.dueAt)}，到时会回来提醒你`;
    } else {
      $('#currentTaskTitle').textContent = '还没有任务。把工作交出来。';
      $('#currentTaskMeta').textContent = '等待你的第一条指令';
    }
    return;
  }
  selectedTaskId = task.id;
  $('#currentTaskTitle').textContent = task.title;
  $('#currentTaskMeta').textContent = `${statusText[task.status] || task.status}${task.dueAt ? ` · 截止 ${formatDate(task.dueAt)}` : ''}${task.estimatedMinutes ? ` · 预计 ${task.estimatedMinutes} 分钟` : ''}`;
}

function reminderRepeatText(reminder) {
  if (reminder.repeat === 'daily') return '每天';
  if (reminder.repeat === 'weekly') return `每周${['日', '一', '二', '三', '四', '五', '六'][Number(reminder.weekday) || 0]}`;
  return '一次性';
}

function renderReminders() {
  const reminders = (state.reminders || []).sort((a, b) => String(a.nextAt || '').localeCompare(String(b.nextAt || '')));
  $('#reminderCount').textContent = reminders.filter((reminder) => reminder.enabled !== false).length;
  $('#reminderList').innerHTML = reminders.length ? reminders.map((reminder) => { const deletePending = pendingDeleteKey === `reminder:${reminder.id}`; return `<div class="reminder-item ${reminder.enabled === false ? 'is-disabled' : ''}"><span class="reminder-dot"></span><div><div class="reminder-title">${escapeHtml(reminder.title)}</div><div class="task-sub">${escapeHtml(formatDate(reminder.nextAt))} · ${reminderRepeatText(reminder)}</div></div><div class="reminder-controls"><select class="reminder-control" data-reminder-status-id="${escapeHtml(reminder.id)}" aria-label="调整提醒状态"><option value="enabled" ${reminder.enabled !== false ? 'selected' : ''}>启用</option><option value="disabled" ${reminder.enabled === false ? 'selected' : ''}>停用</option></select><select class="reminder-control" data-reminder-repeat-id="${escapeHtml(reminder.id)}" aria-label="调整重复频率"><option value="none" ${reminder.repeat === 'none' ? 'selected' : ''}>一次性</option><option value="daily" ${reminder.repeat === 'daily' ? 'selected' : ''}>每天</option><option value="weekly" ${reminder.repeat === 'weekly' ? 'selected' : ''}>每周</option></select><button class="reminder-delete${deletePending ? ' is-pending' : ''}" data-delete-reminder-id="${escapeHtml(reminder.id)}" aria-label="${deletePending ? '确认删除提醒' : '删除提醒'}" title="删除提醒">${deletePending ? '确认' : '删'}</button></div></div>`; }).join('') : '<div class="empty">还没有提醒</div>';
  document.querySelectorAll('[data-reminder-status-id]').forEach((select) => select.addEventListener('change', async () => {
    const reminder = state.reminders.find((item) => item.id === select.dataset.reminderStatusId);
    if (!reminder) return;
    reminder.enabled = select.value === 'enabled'; reminder.updatedAt = now(); await save(); renderReminders(); showToast(`${reminder.enabled ? '已启用' : '已停用'}提醒：${reminder.title}`);
  }));
  document.querySelectorAll('[data-reminder-repeat-id]').forEach((select) => select.addEventListener('change', async () => {
    const reminder = state.reminders.find((item) => item.id === select.dataset.reminderRepeatId);
    if (!reminder) return;
    reminder.repeat = select.value; reminder.updatedAt = now(); await save(); renderReminders(); showToast(`已调整提醒频率：${reminderRepeatText(reminder)}`);
  }));
  document.querySelectorAll('[data-delete-reminder-id]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    await requestDelete('reminder', button.dataset.deleteReminderId);
  }));
}

function applyTheme(theme) { const selected = themeLabels[theme] ? theme : 'alert-red'; document.documentElement.dataset.theme = selected; }
function renderAll() { refreshParentStatuses(); applyTheme(state.settings.theme); renderMessages(); renderTasks(); renderCurrent(); renderReminders(); $('#toneLabel').textContent = state.settings.tone || '老板模式'; $('#connectionBadge').textContent = state.settings.apiKey ? `${state.settings.model || '已连接'}` : '本地模式'; $('#connectionBadge').classList.toggle('muted', !state.settings.apiKey); }

function updateTask(taskId, patch) { const task = state.tasks.find((item) => item.id === taskId); if (!task) return; const safePatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)); Object.assign(task, safePatch, { updatedAt: now() }); if (patch.status === 'completed') task.completedAt = now(); }

function applyActions(actions = []) {
  const deferredTaskIds = new Set(actions.filter((action) => action?.taskId && (action.type === 'postpone_task' || action.type === 'snooze_task' || (action.status === 'planned' && action.dueAt))).map((action) => action.taskId));
  actions.forEach((action) => {
    if (!action || action.type === 'none') return;
    if (action.type === 'create_project') {
      if (!state.projects.some((project) => project.name === action.projectName)) state.projects.push({ id: uid('project'), name: action.projectName || '新项目', color: '#78e3b1' });
      return;
    }
    if (action.type === 'create_task') {
      const projectName = action.projectName || '默认项目';
      if (!state.projects.some((project) => project.name === projectName)) state.projects.push({ id: uid('project'), name: projectName, color: '#78e3b1' });
      const parent = action.parentId ? state.tasks.find((task) => task.id === action.parentId) : state.tasks.find((task) => task.title === action.parentTitle && task.isContainer);
      state.tasks.push({ id: uid('task'), title: action.title || '未命名任务', description: action.description || '', projectName, parentId: parent?.id || '', parentTitle: action.parentTitle || '', isContainer: Boolean(action.isContainer), status: action.status || 'planned', priority: action.priority || 'normal', dueAt: action.dueAt || '', estimatedMinutes: Number(action.estimatedMinutes) || 30, createdAt: now(), updatedAt: now() });
      return;
    }
    if (action.type === 'create_reminder') {
      if (!action.nextAt && !action.dueAt) return;
      state.reminders.push({ id: uid('reminder'), title: action.title || '未命名提醒', note: action.description || '', nextAt: action.nextAt || action.dueAt, repeat: action.repeat || 'none', weekday: action.weekday, enabled: action.enabled !== false, createdAt: now(), updatedAt: now() });
      return;
    }
    if (action.type === 'delete_reminder') {
      const reminder = state.reminders.find((item) => item.id === action.reminderId);
      if (reminder) reminder.enabled = false;
      return;
    }
    if (action.type === 'update_reminder') {
      const reminder = state.reminders.find((item) => item.id === action.reminderId);
      if (reminder) Object.assign(reminder, { title: action.title || reminder.title, nextAt: action.nextAt || reminder.nextAt, repeat: action.repeat || reminder.repeat, weekday: action.weekday ?? reminder.weekday, enabled: action.enabled ?? reminder.enabled, updatedAt: now() });
      return;
    }
    if (action.taskId) {
      const status = action.type === 'complete_task' ? 'completed'
        : action.type === 'block_task' ? 'blocked'
          : ['postpone_task', 'snooze_task'].includes(action.type) ? 'planned'
            : action.status;
      updateTask(action.taskId, { status, description: action.description || undefined, dueAt: action.dueAt || undefined });
      if (status === 'completed') state.supervisionEvents.filter((event) => event.taskId === action.taskId && !event.sent).forEach((event) => { event.sent = true; });
    }
  });
  state.tasks.filter((task) => task.parentTitle && !task.parentId).forEach((task) => {
    const parent = state.tasks.find((candidate) => candidate.isContainer && candidate.title === task.parentTitle);
    if (parent) task.parentId = parent.id;
  });
  const active = state.tasks.find((task) => task.status === 'active');
  if (!active) {
    const next = sortTasks(state.tasks).find((task) => !deferredTaskIds.has(task.id) && ['planned', 'inbox'].includes(task.status) && isTaskAvailable(task));
    if (next && !actions.some((action) => action.taskId === next.id)) next.status = 'active';
  }
}

function isClearRequest(input) { return /(删除|清空|清除).*(所有|全部|任务列表|任务)/.test(input) || /(所有|全部).*(任务列表|任务).*(删除|清空|清除)/.test(input); }
function isClearConfirmation(input) { return /^(确认|确定|是的|好的|执行)[：:\s]*(清空|删除)?(所有|全部)?(任务列表|任务)?$/.test(input) || /确认(清空|删除)(所有|全部)?任务/.test(input); }
function isClearCancellation(input) { return /^(取消|不要了|算了|暂不清空|不清空)/.test(input); }
function isDeleteConfirmation(input) { return /^(确认|确定|是的|好的|执行)[：:\s]*(删除|删掉|移除)(这个|该|当前)?(任务|工作)?/.test(input); }
function isTomorrowSnoozeRequest(input) { return /(推到明天|明天再做|明天做|推迟到明天|延期到明天)/.test(input); }
function isSnoozeRequest(input) { return /(再给我|延期|晚点|稍后|推到明天|明天再做|明天做|推迟到明天|延期到明天)/.test(input) && /(分钟|分|小时|时|晚点|稍后|明天)/.test(input); }
function isRestRequest(input) { return /^(我先)?(休息|歇)(一会|一会儿|会|一下|(?:\d+|[一二三四五六七八九十]+|半)\s*(分钟|分|小时|时))?(吧|下)?$/.test(input.trim()); }
function minutesFromInput(input, fallback = 10) {
  const match = String(input || '').match(/(\d+|[一二三四五六七八九十]+|半)\s*(分钟|分|小时|时)/);
  if (!match) return fallback;
  const number = match[1] === '半' ? 0.5 : /^\d+$/.test(match[1]) ? Number(match[1]) : [...match[1]].reduce((total, digit) => total * 10 + ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }[digit] || 0), 0);
  return (match[2].startsWith('小') || match[2] === '时') ? number * 60 : number;
}

function completionBubble(completedTitle) {
  const next = sortTasks(state.tasks).find((task) => isTaskAvailable(task) && !['completed', 'cancelled'].includes(task.status));
  if (next) {
    return {
      title: '已完成。下一步？',
      body: `“${completedTitle || '这项工作'}”已记录完成。下一项是“${next.title}”。继续执行，还是休息一会？`,
      quickActions: [
        { label: '继续下一项', message: '继续下一项' },
        { label: '休息 10 分钟', message: '休息10分钟' },
        { label: '打开调度窗', action: 'open-main' }
      ]
    };
  }
  return {
    title: '已完成。暂无下一项',
    body: `“${completedTitle || '这项工作'}”已记录完成。当前没有待执行任务：安排新工作，还是休息一会？`,
    quickActions: [
      { label: '休息 10 分钟', message: '休息10分钟' },
      { label: '安排新工作', action: 'open-main' }
    ]
  };
}

function scheduleRest(minutes = 10) {
  const safeMinutes = Math.max(1, Number(minutes) || 10);
  const quietUntil = new Date(Date.now() + safeMinutes * 60000).toISOString();
  state.settings.quietUntil = quietUntil;
  state.supervisionEvents.push({ id: uid('event'), taskId: null, type: 'rest_end', scheduledAt: quietUntil, sent: false, body: `休息 ${safeMinutes} 分钟结束。回来决定下一项工作。`, createdAt: now() });
  $('#lastCheckin').textContent = `已安排：休息 ${safeMinutes} 分钟，结束后再决定下一步`;
}

function tomorrowWorkStart() {
  const target = new Date();
  target.setDate(target.getDate() + 1);
  const [hour, minute] = String(state.settings.workStart || '09:00').split(':').map(Number);
  target.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
  return target;
}

function showBubbleReply(payload) { return window.humanDispatch.showBubble(payload); }

function normalizeTaskHierarchy(actions = [], input = '') {
  const taskActions = actions.filter((action) => action?.type === 'create_task');
  const hasHierarchy = taskActions.some((action) => action.isContainer || action.parentId || action.parentTitle);
  if (taskActions.length < 2 || hasHierarchy || !/(，|,|并且|以及|然后|同时|之后|再)/.test(input)) return actions;
  const parentTitle = input.trim();
  const wrapped = [
    { type: 'create_task', title: parentTitle, description: '由多个交付结果组成的总任务', isContainer: true, status: 'planned' },
    ...taskActions.map((action, index) => ({ ...action, parentTitle, status: action.status || (index === 0 ? 'active' : 'planned') }))
  ];
  let inserted = false;
  return actions.flatMap((action) => {
    if (action?.type !== 'create_task') return [action];
    if (!inserted) { inserted = true; return wrapped; }
    return [];
  });
}

async function clearAllTasks(fromBubble = false) {
  const removed = state.tasks.length;
  state.tasks = [];
  state.supervisionEvents = [];
  state.pendingConfirmation = null;
  const reply = `已按确认清空 ${removed} 条任务和对应监督记录。聊天记录保留，方便追溯这次操作。`;
  addMessage('assistant', reply);
  if (fromBubble) await window.humanDispatch.showBubble({ title: '已执行', body: reply });
  await save();
  renderAll();
}

async function confirmDeleteTask(taskId, fromBubble = false) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) { state.pendingConfirmation = null; await save(); renderAll(); return; }
  const removed = removeTaskById(taskId);
  state.pendingConfirmation = null;
  const childCount = Math.max(0, removed.length - 1);
  const reply = `已删除“${task.title}”${childCount ? `及其 ${childCount} 个子任务` : ''}，相关监督记录也已移除。`;
  addMessage('assistant', reply);
  if (fromBubble) await window.humanDispatch.showBubble({ title: '已删除', body: reply });
  await save();
  renderAll();
}

async function handleMessage(text, fromBubble = false) {
  const input = text.trim(); if (!input) return;
  addMessage('user', input); $('#chatInput').value = ''; $('#chatInput').disabled = true;
  if (state.pendingConfirmation?.type === 'clear_all_tasks') {
    if (isClearConfirmation(input)) { await clearAllTasks(fromBubble); $('#chatInput').disabled = false; $('#chatInput').focus(); return; }
    if (isClearCancellation(input)) { const reply = '已取消清空，任务列表保持不变。'; state.pendingConfirmation = null; addMessage('assistant', reply); if (fromBubble) await window.humanDispatch.showBubble({ title: '已取消', body: reply }); await save(); renderAll(); $('#chatInput').disabled = false; $('#chatInput').focus(); return; }
    const reply = '我在等待确认。请输入“确认清空所有任务”，或输入“取消清空”。'; addMessage('assistant', reply); if (fromBubble) await window.humanDispatch.showBubble({ title: '需要确认', body: reply }); $('#chatInput').disabled = false; $('#chatInput').focus(); return;
  }
  if (state.pendingConfirmation?.type === 'delete_task') {
    const pendingTask = state.tasks.find((task) => task.id === state.pendingConfirmation.taskId);
    if (isDeleteConfirmation(input)) { await confirmDeleteTask(state.pendingConfirmation.taskId, fromBubble); $('#chatInput').disabled = false; $('#chatInput').focus(); return; }
    if (isClearCancellation(input) || /取消删除|不要删/.test(input)) { state.pendingConfirmation = null; const reply = '已取消删除，任务保持不变。'; addMessage('assistant', reply); if (fromBubble) await window.humanDispatch.showBubble({ title: '已取消', body: reply }); await save(); renderAll(); $('#chatInput').disabled = false; $('#chatInput').focus(); return; }
    const reply = pendingTask ? `我在等待确认删除“${pendingTask.title}”。请输入“确认删除这个任务”，或输入“取消删除”。` : '待删除任务已经不存在，删除请求已取消。';
    if (!pendingTask) state.pendingConfirmation = null;
    addMessage('assistant', reply); if (fromBubble) await window.humanDispatch.showBubble({ title: '需要确认', body: reply }); await save(); renderAll(); $('#chatInput').disabled = false; $('#chatInput').focus(); return;
  }
  if (isClearRequest(input)) {
    state.pendingConfirmation = { type: 'clear_all_tasks', requestedAt: now() };
    const reply = `清空会删除当前 ${state.tasks.length} 条任务及其监督记录，聊天记录会保留。此操作不可自动恢复。\n如果确定，请输入：确认清空所有任务`;
    addMessage('assistant', reply); if (fromBubble) await window.humanDispatch.showBubble({ title: '需要确认', body: reply });
    await save(); renderAll(); $('#chatInput').disabled = false; $('#chatInput').focus(); return;
  }
  if (isRestRequest(input)) {
    const minutes = minutesFromInput(input, 10);
    const reply = `准你休息 ${minutes} 分钟。时间到后回来决定下一项工作。`;
    scheduleRest(minutes);
    addMessage('assistant', reply, '已进入静默休息，不会立刻弹出回复');
    await save(); renderAll();
    $('#chatInput').disabled = false; $('#chatInput').focus();
    return;
  }
  if (isTomorrowSnoozeRequest(input)) {
    const task = currentTask();
    if (task) {
      const dueAt = tomorrowWorkStart();
      const minutes = Math.max(1, Math.ceil((dueAt.getTime() - Date.now()) / 60000));
      applyActions([{ type: 'snooze_task', taskId: task.id, dueAt: dueAt.toISOString() }]);
      scheduleSupervision(task, minutes);
      const reply = `已将“${task.title}”推迟到明天 ${String(dueAt.getHours()).padStart(2, '0')}:${String(dueAt.getMinutes()).padStart(2, '0')}。今天不再催这项工作。`;
      addMessage('assistant', reply, '已静默延期，不会创建新任务');
      await save(); renderAll();
      $('#chatInput').disabled = false; $('#chatInput').focus();
      return;
    }
  }
  const messages = state.messages.map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }));
  const result = await window.humanDispatch.askAI({ text: input, messages });
  const normalizedActions = normalizeTaskHierarchy(result.actions || [], input);
  const deleteAction = normalizedActions.find((action) => action?.type === 'delete_task');
  const clearRequested = normalizedActions.some((action) => action?.type === 'clear_all_tasks');
  if (deleteAction) {
    const target = (deleteAction.taskId && state.tasks.find((task) => task.id === deleteAction.taskId))
      || state.tasks.find((task) => deleteAction.title && (task.title === deleteAction.title || task.title.includes(deleteAction.title)))
      || currentTask();
    if (!target) {
      const reply = '找不到要删除的任务。请说出任务名称，或先选中一个当前任务。';
      addMessage('assistant', reply); if (fromBubble) await window.humanDispatch.showBubble({ title: '找不到任务', body: reply });
    } else {
      state.pendingConfirmation = { type: 'delete_task', taskId: target.id, requestedAt: now() };
      const childCount = childrenOf(target.id).length;
      const reply = `收到删除请求：${target.title}。${childCount ? `这会连同 ${childCount} 个子任务一起删除。` : ''}
这是不可逆操作，请输入“确认删除这个任务”，或输入“取消删除”。`;
      addMessage('assistant', reply); if (fromBubble) await window.humanDispatch.showBubble({ title: '需要确认删除', body: reply });
    }
  } else if (clearRequested) {
    state.pendingConfirmation = { type: 'clear_all_tasks', requestedAt: now() };
    const reply = `收到清空请求。当前有 ${state.tasks.length} 条任务及对应监督记录。\n这是不可逆操作；请输入“确认清空所有任务”后执行。`;
    addMessage('assistant', reply); if (fromBubble) await window.humanDispatch.showBubble({ title: '需要确认', body: reply });
  } else {
    const completionAction = normalizedActions.find((action) => action?.type === 'complete_task' || action?.status === 'completed');
    const completedTask = completionAction?.taskId ? state.tasks.find((task) => task.id === completionAction.taskId) : null;
    const completionRequested = Boolean(completionAction) || /^(已完成|完成|做完|搞定|完成了)/.test(input);
    applyActions(normalizedActions);
    const followUpTask = normalizedActions.map((action) => action?.taskId).filter(Boolean).map((id) => state.tasks.find((task) => task.id === id)).find(Boolean) || currentTask();
    if (result.followUpMinutes && followUpTask && !completionRequested) scheduleSupervision(followUpTask, result.followUpMinutes);
    const reply = result.reply || '已处理。';
    addMessage('assistant', reply, result.source === 'local' ? '本地规则模式：配置 API 后可获得更完整的拆解与调度' : '已由模型完成结构化调度');
    if (fromBubble && completionRequested) await showBubbleReply(completionBubble(completedTask?.title));
    else if (fromBubble && !isSnoozeRequest(input) && !result.silent) await showBubbleReply({ title: '主管回复', body: reply });
  }
  await save(); renderAll(); $('#chatInput').disabled = false; $('#chatInput').focus();
}

function scheduleSupervision(task, minutes) {
  if (!task) return;
  state.supervisionEvents = state.supervisionEvents.filter((event) => event.taskId !== task.id || event.sent);
  state.supervisionEvents.push({ id: uid('event'), taskId: task.id, type: 'check_in', scheduledAt: new Date(Date.now() + minutes * 60000).toISOString(), sent: false, createdAt: now() });
  $('#lastCheckin').textContent = `已安排：${minutes} 分钟后检查“${task.title}”`;
}

async function notifyTask(task, body) { if (!state.settings.notifications) return; await window.humanDispatch.notify({ title: '人类调度 · 该干活了', body }); }

async function checkSupervision() {
  const current = new Date(); let changed = false;
  for (const event of state.supervisionEvents) {
    if (!event.sent && new Date(event.scheduledAt) <= current) {
      event.sent = true;
      const task = event.taskId ? state.tasks.find((item) => item.id === event.taskId) : null;
      if (task) await notifyTask(task, `静默结束。回来汇报：${task.title}`);
      else if (event.type === 'rest_end' && state.settings.notifications) await window.humanDispatch.notify({ title: '人类调度 · 休息结束', body: event.body || '休息结束。回来决定下一项工作。' });
      changed = true;
    }
  }
  if (state.settings.quietUntil && new Date(state.settings.quietUntil) <= current) { state.settings.quietUntil = ''; changed = true; }
  if (changed) { await save(); renderAll(); }
}

function nextReminderAt(reminder, current) {
  const next = new Date(reminder.nextAt);
  if (reminder.repeat === 'daily') {
    do next.setDate(next.getDate() + 1); while (next <= current);
    return next.toISOString();
  }
  if (reminder.repeat === 'weekly') {
    do next.setDate(next.getDate() + 7); while (next <= current);
    return next.toISOString();
  }
  return '';
}

async function checkReminders() {
  const current = new Date();
  let changed = false;
  for (const reminder of state.reminders || []) {
    if (reminder.enabled === false || !reminder.nextAt || new Date(reminder.nextAt) > current) continue;
    const nextAt = nextReminderAt(reminder, current);
    reminder.lastTriggeredAt = current.toISOString();
    reminder.enabled = Boolean(nextAt);
    reminder.nextAt = nextAt || reminder.nextAt;
    changed = true;
    if (state.settings.notifications) await window.humanDispatch.notify({ title: '人类调度 · 提醒', body: `现在该做：${reminder.title}` });
  }
  if (changed) { await save(); renderAll(); }
}

function ensurePassiveSettings() { if ($('#passiveNudgesInput')) return; const holder = document.createElement('div'); holder.className = 'form-grid passive-settings'; holder.innerHTML = '<label>被动督促频率（分钟）<input id="passiveNudgesInput" type="number" min="5" max="120" /></label><label class="checkbox-label passive-toggle"><input id="passiveNudgesEnabledInput" type="checkbox" /> 后台持续督促</label>'; $('#notificationsInput').closest('label').after(holder); }
ensurePassiveSettings();
function ensurePromptSettings() {
  if ($('#systemPromptInput')) return;
  const holder = document.createElement('label');
  holder.className = 'prompt-setting';
  holder.innerHTML = '当前语气的主管提示词<textarea id="systemPromptInput" rows="8" placeholder="定义 AI 如何管理你……"></textarea><div class="prompt-actions"><button type="button" id="restorePromptButton" class="text-button">恢复当前默认</button><button type="button" id="restoreAllPromptsButton" class="text-button">全部恢复默认</button></div><span class="prompt-hint">切换上方监督语气会切换到对应提示词；你可以分别修改并保存。结构化动作和安全约束仍由系统强制保留。</span>';
  $('#notificationsInput').closest('label').after(holder);
  $('#restorePromptButton').addEventListener('click', () => {
    promptDrafts[activePromptTone] = defaultTonePrompts[activePromptTone] || '';
    $('#systemPromptInput').value = promptDrafts[activePromptTone];
    $('#settingsStatus').textContent = `已恢复“${activePromptTone}”的默认提示词，点击“保存设置”后生效。`;
  });
  $('#restoreAllPromptsButton').addEventListener('click', () => {
    promptDrafts = { ...defaultTonePrompts };
    $('#systemPromptInput').value = promptDrafts[activePromptTone] || '';
    $('#settingsStatus').textContent = '已恢复全部语气的默认提示词，点击“保存设置”后生效。';
  });
  $('#toneInput').addEventListener('change', () => {
    if (activePromptTone) promptDrafts[activePromptTone] = $('#systemPromptInput').value;
    activePromptTone = $('#toneInput').value;
    $('#systemPromptInput').value = promptDrafts[activePromptTone] || defaultTonePrompts[activePromptTone] || '';
    $('#settingsStatus').textContent = `已切换到“${activePromptTone}”提示词，可继续修改。`;
  });
}
ensurePromptSettings();
function ensureThemeSettings() { if ($('#themeInput')) return; const holder = document.createElement('label'); holder.className = 'theme-setting'; holder.innerHTML = `主题预设<select id="themeInput">${Object.entries(themeLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select><span class="theme-hint">主窗口和监管气泡会同步换肤。</span>`; $('#systemPromptInput').closest('label').after(holder); $('#themeInput').addEventListener('change', () => { applyTheme($('#themeInput').value); }); }
ensureThemeSettings();
async function openSettings() {
  const s = state.settings;
  defaultTonePrompts = await window.humanDispatch.getTonePrompts();
  const savedPrompts = s.tonePrompts || {};
  promptDrafts = { ...defaultTonePrompts, ...savedPrompts };
  if (!s.tonePrompts && s.systemPrompt) promptDrafts[s.tone || '老板模式'] = s.systemPrompt;
  activePromptTone = s.tone || '老板模式';
  $('#baseUrlInput').value = s.baseUrl || '';
  $('#apiKeyInput').value = s.apiKey || '';
  $('#modelInput').value = s.model || '';
  $('#toneInput').value = activePromptTone;
  $('#systemPromptInput').value = promptDrafts[activePromptTone] || defaultTonePrompts[activePromptTone] || '';
  $('#reminderInput').value = s.reminderMinutes || 30;
  $('#passiveNudgesInput').value = s.passiveNudgeMinutes || 10;
  $('#passiveNudgesEnabledInput').checked = s.passiveNudgesEnabled !== false;
  $('#workStartInput').value = s.workStart || '09:00';
  $('#workEndInput').value = s.workEnd || '18:00';
  $('#notificationsInput').checked = s.notifications !== false;
  $('#supportUrlInput').value = s.supportUrl || '';
  $('#themeInput').value = themeLabels[s.theme] ? s.theme : 'alert-red';
  applyTheme($('#themeInput').value);
  $('#settingsStatus').textContent = '';
  $('#settingsModal').classList.remove('hidden');
}
function closeSettings() { $('#settingsModal').classList.add('hidden'); }

$('#settingsButton').addEventListener('click', openSettings); $('#closeSettingsButton').addEventListener('click', closeSettings); $('.modal-backdrop').addEventListener('click', closeSettings);
function hasModelConfig() {
  return Boolean(String(state.settings.baseUrl || '').trim() && String(state.settings.apiKey || '').trim() && String(state.settings.model || '').trim());
}
function closeConfigReminder() { $('#configReminderModal').classList.add('hidden'); }
function showConfigReminder() { if (!hasModelConfig()) $('#configReminderModal').classList.remove('hidden'); }
$('#openConfigButton').addEventListener('click', async () => { closeConfigReminder(); await openSettings(); });
$('#laterConfigButton').addEventListener('click', closeConfigReminder);
$('#closeConfigReminderButton').addEventListener('click', closeConfigReminder);
$('#configReminderBackdrop').addEventListener('click', closeConfigReminder);
$('#taskSearchInput').addEventListener('input', () => { taskView.query = $('#taskSearchInput').value; renderTasks(); });
$('#taskFilterInput').addEventListener('change', () => { taskView.status = $('#taskFilterInput').value; renderTasks(); });
$('#toggleCompletedButton').addEventListener('click', () => { taskView.completedCollapsed = !taskView.completedCollapsed; renderTasks(); });
document.querySelectorAll('[data-quick-prompt]').forEach((button) => button.addEventListener('click', () => handleMessage(button.dataset.quickPrompt)));
$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activePromptTone) promptDrafts[activePromptTone] = $('#systemPromptInput').value.trim() || defaultTonePrompts[activePromptTone] || '';
  const selectedTone = $('#toneInput').value;
  Object.assign(state.settings, { baseUrl: $('#baseUrlInput').value.trim(), apiKey: $('#apiKeyInput').value.trim(), model: $('#modelInput').value.trim(), tone: selectedTone, tonePrompts: { ...defaultTonePrompts, ...promptDrafts }, reminderMinutes: Number($('#reminderInput').value) || 30, passiveNudgeMinutes: Math.max(5, Number($('#passiveNudgesInput').value) || 10), passiveNudgesEnabled: $('#passiveNudgesEnabledInput').checked, workStart: $('#workStartInput').value, workEnd: $('#workEndInput').value, notifications: $('#notificationsInput').checked, supportUrl: $('#supportUrlInput').value.trim(), systemPrompt: promptDrafts[selectedTone] || defaultTonePrompts[selectedTone], theme: $('#themeInput').value, themeConfigured: true });
  await save(); closeSettings(); renderAll(); showToast('调度设置已保存，各语气提示词已分别保存');
});
$('#exportDataButton').addEventListener('click', async () => {
  try {
    const result = await window.humanDispatch.exportData();
    if (!result.canceled) $('#settingsStatus').textContent = `备份已导出：${result.filePath}`;
  } catch (error) {
    $('#settingsStatus').textContent = `导出失败：${error.message}`;
  }
});
$('#importDataButton').addEventListener('click', async () => {
  if (!window.confirm('导入备份会替换当前任务、提醒和对话记录。API Key 会保留当前设置。确定继续吗？')) return;
  try {
    const result = await window.humanDispatch.importData();
    if (result.canceled) return;
    Object.assign(state, result.state);
    state.reminders = result.state.reminders || [];
    state.pendingConfirmation = null;
    taskView.query = ''; taskView.status = 'all'; taskView.completedCollapsed = false; taskView.collapsedTaskIds = new Set(); $('#taskSearchInput').value = ''; $('#taskFilterInput').value = 'all';
    await save(); renderAll(); closeSettings(); showToast('备份已导入');
  } catch (error) {
    $('#settingsStatus').textContent = `导入失败：${error.message}`;
  }
});
$('#supportAuthorButton').addEventListener('click', async () => {
  const url = $('#supportUrlInput').value.trim() || state.settings.supportUrl || '';
  if (!url) { $('#settingsStatus').textContent = '请先填写作者支持链接，再打开支持页面。'; return; }
  try { await window.humanDispatch.openExternal(url); } catch (error) { $('#settingsStatus').textContent = `支持链接不可用：${error.message}`; }
});
$('#testConnectionButton').addEventListener('click', async () => { $('#settingsStatus').textContent = '正在测试……'; const testSettings = { ...state.settings, baseUrl: $('#baseUrlInput').value.trim(), apiKey: $('#apiKeyInput').value.trim(), model: $('#modelInput').value.trim() }; const result = await window.humanDispatch.askAI({ settings: testSettings, text: '请回复连接测试成功', messages: [{ role: 'user', content: '请回复连接测试成功，并返回空 actions。' }] }); $('#settingsStatus').textContent = result.source === 'model' ? '连接成功，模型已返回结构化结果。' : `未连接到模型：${result.warning || '将使用本地模式'}`; });
$('#chatForm').addEventListener('submit', (event) => { event.preventDefault(); handleMessage($('#chatInput').value); }); $('#chatInput').addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); $('#chatForm').requestSubmit(); } });
$('#clearChatButton').addEventListener('click', async () => { state.messages = []; await save(); renderMessages(); });
$('#clearTasksButton').addEventListener('click', () => handleMessage('删除所有任务列表'));
window.humanDispatch.onBubbleSubmit((text) => handleMessage(text, true));
let entryMode = 'task';
function openEntryModal(mode) {
  entryMode = mode;
  const isTask = mode === 'task';
  $('#entryModalTitle').textContent = isTask ? '添加任务' : '新增提醒';
  $('#entryModalHint').textContent = isTask ? '先把要做的事情写清楚，主管会继续安排。' : '用自然语言写下时间，到了就提醒你。';
  $('#entryTitleField').classList.toggle('hidden', !isTask);
  $('#entryDescriptionField').classList.toggle('hidden', !isTask);
  $('#entryReminderField').classList.toggle('hidden', isTask);
  $('#entryParentField').classList.toggle('hidden', !isTask);
  $('#entryTaskFields').classList.toggle('hidden', !isTask);
  $('#entryStatusMessage').textContent = '';
  $('#entryTitleInput').value = '';
  $('#entryDescriptionInput').value = '';
  $('#entryReminderInput').value = '';
  $('#entryStatusInput').value = 'planned';
  $('#entryPriorityInput').value = 'normal';
  $('#entryEstimateInput').value = '30';
  $('#entryParentInput').innerHTML = `<option value="">独立任务</option>${state.tasks.filter((task) => task.isContainer && task.status !== 'completed' && task.status !== 'cancelled').map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`).join('')}`;
  $('#entryModal').classList.remove('hidden');
  requestAnimationFrame(() => (isTask ? $('#entryTitleInput') : $('#entryReminderInput')).focus());
}
function closeEntryModal() { $('#entryModal').classList.add('hidden'); }
async function submitEntry(event) {
  event.preventDefault();
  if (entryMode === 'reminder') {
    const text = $('#entryReminderInput').value.trim();
    if (!text) { $('#entryStatusMessage').textContent = '请先写下提醒内容。'; return; }
    closeEntryModal(); await handleMessage(text); return;
  }
  const title = $('#entryTitleInput').value.trim();
  if (!title) { $('#entryStatusMessage').textContent = '任务名称不能为空。'; return; }
  state.tasks.push({ id: uid('task'), title, description: $('#entryDescriptionInput').value.trim(), projectName: '默认项目', parentId: $('#entryParentInput').value || '', isContainer: false, status: $('#entryStatusInput').value, priority: $('#entryPriorityInput').value, estimatedMinutes: Math.max(1, Number($('#entryEstimateInput').value) || 30), createdAt: now(), updatedAt: now() });
  closeEntryModal(); await save(); renderAll(); showToast(`已添加任务：${title}`);
}
$('#addTaskButton').addEventListener('click', () => openEntryModal('task'));
$('#addReminderButton').addEventListener('click', () => openEntryModal('reminder'));
$('#entryForm').addEventListener('submit', submitEntry);
$('#closeEntryButton').addEventListener('click', closeEntryModal);
$('#cancelEntryButton').addEventListener('click', closeEntryModal);
$('#entryBackdrop').addEventListener('click', closeEntryModal);
function quickUpdate(status) { const task = currentTask(); if (!task) { showToast('当前没有任务'); return; } updateTask(task.id, { status }); if (status === 'completed') state.supervisionEvents.filter((event) => event.taskId === task.id && !event.sent).forEach((event) => { event.sent = true; }); save().then(() => { renderAll(); showToast(status === 'completed' ? '已记录完成。下一个任务在等你。' : status === 'blocked' ? '已标记阻塞，请汇报原因。' : '已延期，别把它藏起来。'); }); }
$('#completeButton').addEventListener('click', () => quickUpdate('completed')); $('#blockedButton').addEventListener('click', () => quickUpdate('blocked')); $('#postponeButton').addEventListener('click', () => { const task = currentTask(); if (!task) return; const hours = Number(window.prompt('延期多少小时？', '2')); if (!hours || hours < 0) return; updateTask(task.id, { status: 'planned', dueAt: new Date(Date.now() + hours * 3600000).toISOString() }); save().then(renderAll); }); $('#nextButton').addEventListener('click', () => handleMessage('我现在做什么？'));

window.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') { event.preventDefault(); $('#chatInput').focus(); } });

(async function init() { const loaded = await window.humanDispatch.loadState(); Object.assign(state, loaded); state.reminders = loaded.reminders || []; state.pendingConfirmation = loaded.pendingConfirmation || null; renderAll(); if (!state.messages.length) addMessage('assistant', '把你的工作交出来。告诉我今天要完成什么，我会拆解、安排并按时回来检查。'); requestAnimationFrame(() => { window.scrollTo(0, 0); $('#chatInput').focus(); showConfigReminder(); }); checkReminders(); setInterval(() => { checkSupervision(); checkReminders(); }, 15000); })();
