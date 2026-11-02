const $ = (selector) => document.querySelector(selector);
const state = { settings: {}, tasks: [], reminders: [], projects: [], messages: [], supervisionEvents: [] };
let selectedTaskId = null;
let currentTaskPreviewId = null;
let chatSearchQuery = '';
let chatClearing=false;
let friendSwitching=false;
let stateSaveQueue=Promise.resolve();
const chatScroll=window.createChatScroll({container:$('#chatMessages'),button:$('#newRepliesButton'),onJump:()=>{chatSearchQuery='';$('#chatSearchInput').value='';renderMessages();}});

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
const themeLabels = { 'pastel-mix': '淡墨紫蓝 · 默认主题', 'midnight-blue': '夜色紫蓝 · 深色主题', 'paper-focus': '纸张专注 · 浅色工作台' };

async function save() { window.conversationState.reconcile(state);window.friends.normalize(state);const snapshot=structuredClone(state);const request=stateSaveQueue.catch(()=>{}).then(()=>window.humanDispatch.saveState(snapshot));stateSaveQueue=request;await request;window.companionUI?.schedule(); }

function showToast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function appendMessage(role,content,meta='',sticker=null,extra={}) {
  const message={id:uid('msg'),role,content,meta,createdAt:now(),...extra};state.messages.push(message);
  const chosen=window.resolveSticker(sticker);
  if(role==='assistant'&&chosen)state.messages.push({id:uid('msg'),role:'assistant',kind:'sticker',replyToId:message.id,content:'',createdAt:message.createdAt,sticker:['noto','chinesebqb'].includes(chosen.provider)?chosen:{id:chosen.id},...(message.context?{context:message.context}:{})});
  return message;
}
function addMessage(role,content,meta='',sticker=null) {
  const message=appendMessage(role,content,meta,sticker);renderMessages();save();return message;
}

function formatChatTimestamp(value) {
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return '';
  const time = new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? time : new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(date) + ' ' + time;
}
function highlightChat(text) {
  const value=String(text || ''); if (!chatSearchQuery) return escapeHtml(value);
  const lower=value.toLocaleLowerCase(), query=chatSearchQuery.toLocaleLowerCase(); let cursor=0,found,html='';
  while ((found=lower.indexOf(query,cursor))>=0) {html+=escapeHtml(value.slice(cursor,found))+'<mark>'+escapeHtml(value.slice(found,found+query.length))+'</mark>';cursor=found+query.length;}
  return html+escapeHtml(value.slice(cursor));
}
function syncComposer() { $('#chatInput').disabled=agentBusy||friendSwitching;$('#sendMessageButton').disabled=agentBusy||friendSwitching||chatClearing||!$('#chatInput').value.trim();$('#clearChatButton').disabled=agentBusy||friendSwitching||chatClearing; }
function renderMessages() {
  const container = $('#chatMessages');
  const identity=renderIdentity();
  chatScroll.beforeRender((state.activeFriendId||'zhixu')+'|'+chatSearchQuery,Boolean(chatSearchQuery));
  const latest=state.messages.at(-1);
  $('#sessionPreview').textContent=latest?.kind==='sticker'?'[表情包] '+(window.resolveSticker(latest.sticker)?.label||''):latest?.content || '今天有什么安排？';
  $('#sessionTime').textContent=latest?.createdAt ? formatChatTimestamp(latest.createdAt).split(' ').at(-1) : '';
  const matches=state.messages.map((message,index)=>({message,index})).filter(({message})=>chatSearchQuery?String(message.content || (message.kind==='sticker'?window.resolveSticker(message.sticker)?.label:'') || '').toLocaleLowerCase().includes(chatSearchQuery.toLocaleLowerCase()):!window.recordBook.past(message.createdAt));
  $('#chatContactStatus').textContent=chatSearchQuery ? '找到 '+matches.length+' 条相关消息' : '任务安排 · 日程提醒 · 进度跟进';
  if (!matches.length) {container.innerHTML='<div class="chat-search-empty">'+(chatSearchQuery?'没有找到相关消息，换个关键词试试。':'今天有什么安排？从一条消息开始吧。')+'</div>';chatScroll.afterRender(state.messages);syncComposer();window.friendsUI?.render();return;}
  let previousTime=0;
  container.innerHTML='<div class="chat-flow">'+matches.map(({message,index})=>{
    const user=message.role==='user',time=Date.parse(message.createdAt), showTime=Number.isFinite(time) && (!previousTime || time-previousTime>=300000 || chatSearchQuery);
    if (showTime) previousTime=time;
    const trace=message.execution ? '<details class="execution-trace"><summary>查看处理记录</summary><ol>'+(message.execution.plan || []).map(step=>'<li>'+escapeHtml(step)+'</li>').join('')+'</ol>'+(message.execution.trace || []).map(step=>'<small>'+(step.status==='error'?'需修正':'完成')+' · '+escapeHtml(step.summary)+'</small>').join('')+'</details>' : '';
    const stickerOnly=message.kind==='sticker'&&window.resolveSticker(message.sticker);
    const stickerHost=window.resolveSticker(message.sticker)?'<div class="message-sticker-host" data-sticker-index="'+index+'"></div>':'';
    const momentImage=message.kind==='moment'?window.momentMedia.get(state.moments?.find(m=>m.id===message.momentId)?.image):null;
    const body=message.kind==='moment'?'<button type="button" class="moment-message-card" data-open-moments="'+escapeHtml(message.momentId||'')+'"><span>◉ '+escapeHtml(identity.assistantName)+'发了一条瞬笺</span><p>'+highlightChat(message.content)+'</p>'+(momentImage?'<img class="moment-message-thumb" src="'+escapeHtml(momentImage.url)+'" alt="配图" referrerpolicy="no-referrer" />':'')+'<small>看看这条动态 ›</small></button>':stickerOnly?stickerHost:'<div class="bubble">'+highlightChat(message.content)+trace+'</div>'+stickerHost;
    const tools=stickerOnly?'':'<div class="message-tools">'+(message.meta?'<span class="message-meta">'+escapeHtml(message.meta)+'</span>':'')+'<button type="button" class="copy-message" data-copy-message="'+index+'" aria-label="复制这条消息">复制</button></div>';
    return (showTime?'<div class="message-time">'+escapeHtml(formatChatTimestamp(message.createdAt))+'</div>':'')+'<div class="message '+(user?'user':'assistant')+(stickerOnly?' sticker-message':'')+'" data-message-id="'+escapeHtml(message.id)+'">'+(user?'<button type="button" class="avatar companion-avatar-button" data-open-user aria-label="查看我的资料" title="':'<button type="button" class="avatar companion-avatar-button" data-open-companion aria-label="查看人物资料" title="')+escapeHtml(user?identity.userName:identity.assistantName)+'"><img class="avatar-image" data-avatar-role="'+(user?'user':'assistant')+'" src="'+escapeHtml(user?identity.userAvatar:identity.assistantAvatar)+'" alt="" />'+'</button>'+'<div class="message-content"><div class="sender-name">'+escapeHtml(user?identity.userName:identity.assistantName)+'<span class="sr-only">：</span></div>'+body+tools+'</div></div>';

  }).join('')+'</div>';
  window.stickerUI.mount(container,state.messages);
  chatScroll.afterRender(state.messages);
  syncComposer();
  window.friendsUI?.render();
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

function isTaskAvailable(task) { return window.taskSchedule.available(task); }

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
  if (ids.has(state.agentContext?.pendingQuestion?.taskId)) state.agentContext.pendingQuestion = null;
  if (ids.has(state.pendingConfirmation?.taskId)) state.pendingConfirmation = null;
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
    showToast(`再次点击“删除”确认删除：${item.title}`);
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
  const clearButton=$('#clearTasksButton');clearButton.disabled=!state.tasks.length||agentBusy;
  clearButton.textContent=pendingDeleteKey==='all-tasks'?'再点一次清空（'+state.tasks.length+'）':'清空任务';

  const tasks = sortTasks(state.tasks);
  const query = taskView.query.trim().toLowerCase();
  const visibleTasks = tasks.filter((task) => !window.recordBook.hiddenTask(task) && (taskView.status === 'all' || task.status === taskView.status) && (!taskView.completedCollapsed || task.status !== 'completed') && (!query || `${task.title} ${task.description || ''} ${task.projectName || ''}`.toLowerCase().includes(query)));
  $('#taskCount').textContent = tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled').length;
  const statusOptions = Object.entries(statusText).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const displayTasks = hierarchicalTasks(visibleTasks);
  $('#taskList').innerHTML = displayTasks.length ? displayTasks.map((task) => {
    const children = childrenOf(task.id);
    const subtaskClass = task.parentId ? ' subtask' : '';
    const parentClass = task.isContainer ? ' parent-task' : '';
    const collapseButton = children.length ? `<button type="button" class="task-collapse" data-collapse-task-id="${escapeHtml(task.id)}" aria-label="${taskView.collapsedTaskIds.has(task.id) ? '展开子任务' : '收起子任务'}">${taskView.collapsedTaskIds.has(task.id) ? '▸' : '▾'}</button>` : '';
    const deletePending = pendingDeleteKey === `task:${task.id}`;
    const details = [
      task.projectName && task.projectName !== '默认项目' ? task.projectName : '',
      task.kind === 'meeting' ? '会议' : task.kind === 'appointment' ? '预约 / 日程' : '',
      task.isContainer && children.length ? children.filter(child => child.status === 'completed').length + '/' + children.length + ' 子任务' : '',
      task.startsAt ? '开始 ' + formatDate(task.startsAt) : ['meeting','appointment'].includes(task.kind) ? '开始时间待确认' : '',
      task.durationMinutes ? '持续 ' + task.durationMinutes + ' 分钟' : '',
      task.dueAtIsDeadline && task.dueAt ? '截止 ' + formatDate(task.dueAt) : '',
      window.taskSchedule.deferredAt(task) ? '静默至 ' + formatDate(window.taskSchedule.deferredAt(task)) : '',
      !['meeting','appointment'].includes(task.kind) && task.estimatedMinutes ? '预计 ' + task.estimatedMinutes + ' 分钟' : ''
    ].filter(Boolean);
    return `<div class="task-item${subtaskClass}${parentClass}" data-task-id="${escapeHtml(task.id)}"><span class="task-dot ${task.status}"></span><div class="task-content"><div class="task-title-line">${collapseButton}<button type="button" class="task-title ${task.status === 'completed' ? 'completed' : ''}" data-edit-task-id="${escapeHtml(task.id)}" title="${escapeHtml(task.title)}" aria-label="编辑任务：${escapeHtml(task.title)}">${task.isContainer ? '<span class="task-kind-label">总任务</span>' : ''}${escapeHtml(task.title)}</button></div>${task.description ? `<div class="task-description" title="${escapeHtml(task.description)}">${escapeHtml(task.description)}</div>` : ''}${details.length ? `<div class="task-sub">${details.map(detail=>`<span class="task-detail">${escapeHtml(detail)}</span>`).join('')}</div>` : ''}<div class="task-provenance">${window.recordsUI?.credit(task)||''}</div></div><div class="task-row-actions"><select class="task-status-select" data-task-status-id="${escapeHtml(task.id)}" aria-label="调整任务状态：${escapeHtml(task.title)}" ${task.isContainer ? 'disabled title="总任务状态由子任务汇总"' : ''}>${statusOptions.replace(`value="${task.status}"`, `value="${task.status}" selected`)}</select><button type="button" class="task-edit" data-edit-task-id="${escapeHtml(task.id)}">编辑任务</button><button type="button" class="task-delete${deletePending ? ' is-pending' : ''}" data-delete-task-id="${escapeHtml(task.id)}" aria-label="${deletePending ? '确认删除任务' : '删除任务'}" title="${task.isContainer ? '删除总任务及其子任务' : '删除任务'}">${deletePending ? '确认删除' : '删除'}</button></div></div>`;

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
      if (select.value === 'completed') state.supervisionEvents = state.supervisionEvents.filter(item => item.taskId !== task.id || item.sent);
      await save(); renderAll(); showToast(`已将“${task.title}”调整为${statusText[select.value] || select.value}`);
    });
  });
  document.querySelectorAll('[data-edit-task-id]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();selectedTaskId=button.dataset.editTaskId;openEntryModal('task',button.dataset.editTaskId);}));
  document.querySelectorAll('[data-delete-task-id]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    await requestDelete('task', button.dataset.deleteTaskId);
  }));
  $('#toggleCompletedButton').textContent = taskView.completedCollapsed ? '显示已完成' : '收起已完成';
  const done = state.tasks.filter((task) => !task.isContainer && task.status === 'completed' && window.recordBook.today(task.completedAt||task.updatedAt)).length;
  const pending = state.tasks.filter((task) => !task.isContainer && !['completed', 'cancelled'].includes(task.status)).length;
  const overdue = state.tasks.filter((task) => !task.isContainer && task.dueAt && task.dueAtIsDeadline!==false && new Date(task.dueAt) < new Date() && !['completed', 'cancelled'].includes(task.status)).length;
  $('#doneCount').textContent = done; $('#pendingCount').textContent = pending; $('#overdueCount').textContent = overdue;
}

function setCurrentTaskEditor(task) { currentTaskPreviewId=task?.id || null;$('#editCurrentTaskButton').hidden=!task; }
function renderCurrent() {
  const task = currentTask();
  setCurrentTaskEditor(task);
  $('.command-actions').hidden=!task;
  $('.command-actions').querySelectorAll('button').forEach(button=>button.disabled=!task);
  if (!task) {
    const appointment=state.tasks.filter(t=>['meeting','appointment'].includes(t.kind) && !['completed','cancelled'].includes(t.status)).sort((a,b)=>(Date.parse(a.startsAt)||Infinity)-(Date.parse(b.startsAt)||Infinity))[0];
    if (appointment) { setCurrentTaskEditor(appointment);$('#currentTaskTitle').textContent=appointment.title; $('#currentTaskMeta').textContent=appointment.startsAt ? `开始 ${formatDate(appointment.startsAt)}${appointment.durationMinutes ? ' · 持续 '+appointment.durationMinutes+' 分钟' : ''}` : '等待确认开始时间，暂不催办'; return; }
    const deferred = sortTasks(state.tasks).find((item) => !item.isContainer && item.status === 'planned' && (window.taskSchedule.deferredAt(item) || item.startsAt) && new Date(window.taskSchedule.deferredAt(item) || item.startsAt) > new Date());
    if (deferred) {
      setCurrentTaskEditor(deferred);
      $('#currentTaskTitle').textContent = `已暂缓：${deferred.title}`;
      $('#currentTaskMeta').textContent = `静默至 ${formatDate(window.taskSchedule.deferredAt(deferred) || deferred.startsAt)}，到时会回来提醒你`;
    } else {
      $('#currentTaskTitle').textContent = state.tasks.some(t=>!t.isContainer&&!['completed','cancelled'].includes(t.status)) ? '暂无可执行任务' : state.tasks.length ? '待办已全部处理' : '清单空空，轻松一下';
      $('#currentTaskMeta').textContent = '有新的安排时，随时添加任务';
    }
    return;
  }
  selectedTaskId = task.id;
  $('#currentTaskTitle').textContent = task.title;
  $('#currentTaskMeta').textContent = `${statusText[task.status] || task.status}${task.startsAt ? ` · 开始 ${formatDate(task.startsAt)}` : ''}${task.durationMinutes ? ` · 持续 ${task.durationMinutes} 分钟` : ''}${task.dueAtIsDeadline && task.dueAt ? ` · 截止 ${formatDate(task.dueAt)}` : ''}${task.estimatedMinutes ? ` · 预计 ${task.estimatedMinutes} 分钟` : ''}`;
}

function reminderRepeatText(reminder) {
  if (reminder.repeat === 'daily') return '每天';
  if (reminder.repeat === 'weekly') return `每周${['日', '一', '二', '三', '四', '五', '六'][Number(reminder.weekday) || 0]}`;
  return '一次性';
}

function renderReminders() {
  const reminders = (state.reminders || []).filter(item=>!window.recordBook.hiddenReminder(item)).sort((a, b) => String(a.nextAt || '').localeCompare(String(b.nextAt || '')));
  $('#reminderCount').textContent = state.reminders.filter((reminder) => reminder.enabled !== false).length;
  $('#reminderList').innerHTML = reminders.length ? reminders.map((reminder) => { const deletePending = pendingDeleteKey === `reminder:${reminder.id}`; return `<div class="reminder-item ${reminder.enabled === false ? 'is-disabled' : ''}"><span class="reminder-dot"></span><div class="reminder-main"><div class="reminder-title">${escapeHtml(reminder.title)}</div><div class="reminder-time">${escapeHtml(formatDate(reminder.nextAt)) || '时间待设置'}</div><div class="task-provenance">${window.recordsUI?.credit(reminder)||''}</div></div><div class="reminder-controls"><label class="reminder-field"><span>状态</span><select class="reminder-control" data-reminder-status-id="${escapeHtml(reminder.id)}" aria-label="调整提醒状态：${escapeHtml(reminder.title)}"><option value="enabled" ${reminder.enabled !== false ? 'selected' : ''}>启用</option><option value="disabled" ${reminder.enabled === false ? 'selected' : ''}>停用</option></select></label><label class="reminder-field"><span>频率</span><select class="reminder-control" data-reminder-repeat-id="${escapeHtml(reminder.id)}" aria-label="调整重复频率：${escapeHtml(reminder.title)}"><option value="none" ${reminder.repeat === 'none' ? 'selected' : ''}>一次性</option><option value="daily" ${reminder.repeat === 'daily' ? 'selected' : ''}>每天</option><option value="weekly" ${reminder.repeat === 'weekly' ? 'selected' : ''}>每周</option></select></label><button type="button" class="reminder-delete${deletePending ? ' is-pending' : ''}" data-delete-reminder-id="${escapeHtml(reminder.id)}" aria-label="${deletePending ? '确认删除提醒' : '删除提醒'}" title="删除提醒">${deletePending ? '确认删除' : '删除'}</button></div></div>`; }).join('') : '<div class="empty">还没有提醒</div>';
  document.querySelectorAll('[data-reminder-status-id]').forEach((select) => select.addEventListener('change', async () => {
    const reminder = state.reminders.find((item) => item.id === select.dataset.reminderStatusId);
    if (!reminder) return;
    reminder.enabled = select.value === 'enabled'; reminder.lastEditedBy='user'; reminder.updatedAt = now(); await save(); renderReminders(); showToast(`${reminder.enabled ? '已启用' : '已停用'}提醒：${reminder.title}`);
  }));
  document.querySelectorAll('[data-reminder-repeat-id]').forEach((select) => select.addEventListener('change', async () => {
    const reminder = state.reminders.find((item) => item.id === select.dataset.reminderRepeatId);
    if (!reminder) return;
    reminder.repeat = select.value; reminder.lastEditedBy='user'; reminder.updatedAt = now(); await save(); renderReminders(); showToast(`已调整提醒频率：${reminderRepeatText(reminder)}`);
  }));
  document.querySelectorAll('[data-delete-reminder-id]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    await requestDelete('reminder', button.dataset.deleteReminderId);
  }));
}

function applyTheme(theme) { const selected = themeLabels[theme] ? theme : 'pastel-mix'; document.documentElement.dataset.theme = selected; }
function renderAll() { refreshParentStatuses(); applyTheme(state.settings.theme); renderMessages(); renderTasks(); renderCurrent(); renderReminders(); $('#toneLabel').textContent = state.settings.tone || '老板模式'; $('#connectionBadge').textContent = state.settings.apiKey ? `${state.settings.model || '已连接'}` : '本地模式'; $('#connectionBadge').classList.toggle('muted', !state.settings.apiKey); window.recordsUI?.render(); }

function updateTask(taskId, patch) { const task = state.tasks.find((item) => item.id === taskId); if (!task) return; const safePatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)); Object.assign(task, safePatch, { updatedAt: now(),lastEditedBy:'user' }); if (patch.status === 'completed' && !task.completedAt) task.completedAt = now();if(patch.status==='cancelled')task.cancelledAt=now(); }

function applyActions(actions = []) {
  const recordedBefore=window.recordBook.capture(state);
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
      state.tasks.push({ id: uid('task'), title: action.title || '未命名任务', description: action.description || '', projectName, parentId: parent?.id || '', parentTitle: action.parentTitle || '', isContainer: Boolean(action.isContainer), status: action.status || 'planned', priority: action.priority || 'normal', dueAt: action.dueAt || '', estimatedMinutes: Number(action.estimatedMinutes) || 30, kind:action.kind || 'work', startsAt:action.startsAt || '', durationMinutes:action.durationMinutes, createdAt: now(), updatedAt: now() });
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
      updateTask(action.taskId, { status, description: action.description || undefined, ...(['postpone_task','snooze_task'].includes(action.type) ? window.taskSchedule.postponement(state.tasks.find(t=>t.id===action.taskId),action.dueAt) : {dueAt:action.dueAt || undefined}) });
      if (status === 'completed') state.supervisionEvents = state.supervisionEvents.filter(event => event.taskId !== action.taskId || event.sent);
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
  window.recordBook.attribute(state,recordedBefore,state.activeFriendId||'zhixu');
}

function isClearRequest(input) { return /(?:删除|清空|清除).*(?:所有|全部).*(?:任务|工作)|(?:所有|全部).*(?:任务|工作).*(?:删除|清空|清除)|(?:清空|清除)(?:所有|全部)?(?:的)?(?:任务列表|任务)/.test(input); }
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
  if(state.agentContext)state.agentContext.pendingQuestion=null;
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

let agentBusy = false;
const bubbleReplyQueue = [];
async function handleMessage(text, fromBubble = false, context = null) {
  if(friendSwitching){showToast('正在切换朋友，请稍候');return;}
  if(chatClearing){showToast('正在清空聊天，请稍候');return;}
  if (agentBusy) { if (fromBubble) { bubbleReplyQueue.push({text,fromBubble,context}); showToast('气泡回复已接收，稍后处理'); } else showToast('正在处理上一条消息，请稍候'); return; }
  agentBusy = true; document.body.classList.add('agent-running'); syncComposer();
  try { await handleMessageInternal(text, fromBubble, context); }
  catch (error) {
    // A lost response or conflict may mean the server has newer state. Never save a stale snapshot.
    try {
      Object.assign(state, await window.humanDispatch.loadState());
      addMessage('assistant', '本轮处理未完成：' + error.message); renderAll();
    } catch {
      state.messages.push({ id:uid('msg'), role:'assistant', content:'连接中断，未覆盖本机数据。恢复连接后请重试。', createdAt:now() }); renderMessages();
    }
  }
  finally { agentBusy = false; document.body.classList.remove('agent-running'); $('#chatInput').disabled = false; $('#chatInput').focus(); syncComposer(); const next=bubbleReplyQueue.shift(); if (next) queueMicrotask(()=>handleMessage(next.text,next.fromBubble,next.context)); }
}
async function handleMessageInternal(text, fromBubble = false, context = null) {
  const input = text.trim(); if (!input) return;
  if (context?.taskId && state.tasks.some(t=>t.id===context.taskId)) selectedTaskId=context.taskId;
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
  const intentTask = state.tasks.find(t=>t.id===(context?.taskId || selectedTaskId)) || currentTask();
  if (isTomorrowSnoozeRequest(input) && !['meeting','appointment'].includes(intentTask?.kind)) {
    const task = intentTask;
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
  const messages = state.messages.filter(m=>!['moment','sticker'].includes(m.kind)).map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content, sticker:message.sticker }));
  await save();
  const result = await window.humanDispatch.askAI({ text: input, messages, context });
  if (result.applied && result.state) Object.assign(state, result.state);
  const executionMeta = result.agent ? { id:result.agent.id, plan:result.agent.plan, trace:result.agent.trace } : null;
  const normalizedActions = result.applied ? result.actions || [] : normalizeTaskHierarchy(result.actions || [], input);
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
    if (!result.applied) applyActions(normalizedActions);
    const followUpTask = normalizedActions.map((action) => action?.taskId).filter(Boolean).map((id) => state.tasks.find((task) => task.id === id)).find(Boolean) || currentTask();
    if (!result.applied && result.followUpMinutes && followUpTask && !completionRequested) scheduleSupervision(followUpTask, result.followUpMinutes);
    const reply = result.reply || '已处理。';
    addMessage('assistant', reply, result.source === 'agent' ? '已通过工具执行并校验结果' : result.source === 'local' ? '本地规则模式：配置支持工具调用的模型后可启用 Agent' : '已由模型完成结构化调度', result.sticker);
    if (fromBubble && !isSnoozeRequest(input) && !result.silent) await showBubbleReply({ title: result.question ? '想确认一下' : window.chatProfile.get(state.settings).assistantName+'回复', body: reply, sticker:result.sticker, taskId:result.question?.taskId || context?.taskId, questionId:result.question?.id, quickActions:(result.quickReplies || result.question?.quickReplies || []).map(message=>({label:message,message})) });
  }
  if(executionMeta){const replyMessage=[...state.messages].reverse().find(m=>m.role==='assistant'&&m.kind!=='sticker');if(replyMessage)replyMessage.execution=executionMeta;}
  await save(); renderAll(); $('#chatInput').disabled = false; $('#chatInput').focus();
}

function scheduleSupervision(task, minutes) {
  if (!window.conversationState.isOpenTask(task)) return;
  state.supervisionEvents = state.supervisionEvents.filter((event) => event.taskId !== task.id || event.sent);
  state.supervisionEvents.push({ id: uid('event'), taskId: task.id, type: 'check_in', scheduledAt: new Date(Date.now() + minutes * 60000).toISOString(), sent: false, createdAt: now() });
  $('#lastCheckin').textContent = `已安排：${minutes} 分钟后检查“${task.title}”`;
}

let supervisionBusy = false;
async function requestCheckIn(payload = {}) {
  if (agentBusy || supervisionBusy || chatClearing) return false;
  supervisionBusy = true;
  try {
    if(window.conversationState.reconcile(state))await save();
    if(!state.tasks.some(window.conversationState.isOpenTask))return true;
    const before = JSON.stringify([state.tasks,state.messages,state.settings,state.agentContext]);
    const result = await window.humanDispatch.checkIn(payload);
    if (result.suppressed) return !result.retry;
    if(!window.conversationState.isOpenTask(state.tasks.find(t=>t.id===result.taskId)))return true;
    if (agentBusy || JSON.stringify([state.tasks,state.messages,state.settings,state.agentContext]) !== before) return false;
    if (result.question) state.agentContext={...state.agentContext,pendingQuestion:result.question};
    appendMessage('assistant',result.body,result.source==='local'?'本地提醒':'主动确认安排',result.sticker,{id:result.bubbleId,createdAt:result.generatedAt,context:{taskId:result.taskId,questionId:result.questionId}});
    await save(); renderMessages();
    await window.humanDispatch.notify(result); return true;
  } catch { return false; /* Retry without generating a misleading fixed nudge. */ }
  finally { supervisionBusy=false; }
}
async function notifyTask(task) { return state.settings.notifications ? requestCheckIn({taskId:task.id,reason:'scheduled'}) : false; }

async function checkSupervision() {
  if (agentBusy) return;
  const current = new Date(); let changed = window.conversationState.reconcile(state);
  for (const event of state.supervisionEvents) {
    if (!event.sent && new Date(event.scheduledAt) <= current) {
      const task = event.taskId ? state.tasks.find((item) => item.id === event.taskId) : null;
      if (task && !await notifyTask(task)) continue;
      else if (event.type === 'rest_end' && state.settings.notifications) await window.humanDispatch.notify({ title: '人类调度 · 休息结束', body: event.body || '休息结束。回来决定下一项工作。' });
      event.sent = true; changed = true;
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
  if (agentBusy) return;
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
function ensureStickerSetting() { const label=document.createElement('label');label.className='checkbox-label';label.innerHTML='<input id="stickersEnabledInput" type="checkbox" /> 允许主管发送适合语境的表情包';$('#notificationsInput').closest('label').after(label);const online=document.createElement('label');online.className='checkbox-label';online.innerHTML='<input id="onlineStickersEnabledInput" type="checkbox" /> 自动联网搜索中文表情包（动图优先，无需额外密钥）';label.after(online);const test=document.createElement('button');test.type='button';test.className='text-button';test.textContent='测试动图联网搜索';test.id='testOnlineStickersButton';online.after(test);test.addEventListener('click',async()=>{test.disabled=true;try{state.settings.stickersEnabled=$('#stickersEnabledInput').checked;state.settings.onlineStickersEnabled=$('#onlineStickersEnabledInput').checked;await save();const result=await window.humanDispatch.searchOnlineStickers('鼓掌');$('#settingsStatus').textContent=result.stickers.length?'联网正常，找到 '+result.stickers.length+' 个中文表情包（ChineseBQB）':'联网正常，暂未找到匹配动图';}catch(error){$('#settingsStatus').textContent=error.message;}finally{test.disabled=false;}}); }
ensureStickerSetting();
const stickerFrequencyLabel=document.createElement('label');stickerFrequencyLabel.innerHTML='动图频率<select id="stickerFrequencyInput"><option value="lively">活跃 · 跟着对话多发动图</option><option value="balanced">适中 · 间隔发送</option><option value="quiet">少用 · 偶尔点缀</option></select>';$('#onlineStickersEnabledInput').closest('label').after(stickerFrequencyLabel);
let providerDrafts={};let activeProvider='';
function rememberProviderDraft(){if(activeProvider)providerDrafts[activeProvider]={baseUrl:$('#baseUrlInput').value.trim(),model:$('#modelInput').value.trim(),apiKey:$('#apiKeyInput').value.trim()};}
function selectProvider(id){
  const preset=window.modelPresets.presets.find(p=>p.id===id)||window.modelPresets.presets.at(-1);
  const config=providerDrafts[preset.id]||{baseUrl:preset.baseUrl,model:preset.models[0]||'',apiKey:''};activeProvider=preset.id;
  $('#providerInput').value=preset.id;$('#baseUrlInput').value=config.baseUrl;$('#modelInput').value=config.model;$('#apiKeyInput').value=config.apiKey;
  const models=[...new Set([...preset.models,...(config.model?[config.model]:[])])];
  $('#presetModelInput').innerHTML=models.map(m=>'<option value="'+escapeHtml(m)+'">'+escapeHtml(m)+'</option>').join('');$('#presetModelInput').value=config.model;
  $('#presetModelField').hidden=preset.id==='custom';$('#modelAdvanced').open=preset.id==='custom';
  $('#providerHint').textContent=preset.id==='custom'?'填写兼容接口的地址、模型名称和 Key；需要支持工具调用。':'已自动填写接口地址和模型，只需填写该服务商的 Key。高级配置可调整模型。';
}
function openModelSettings(settings){providerDrafts=window.modelPresets.profiles(settings);selectProvider(window.modelPresets.infer(settings));}
$('#providerInput').innerHTML=window.modelPresets.presets.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('');
$('#providerInput').addEventListener('change',()=>{rememberProviderDraft();selectProvider($('#providerInput').value);});
$('#presetModelInput').addEventListener('change',()=>{$('#modelInput').value=$('#presetModelInput').value;});
$('#modelInput').addEventListener('input',()=>{const value=$('#modelInput').value;const select=$('#presetModelInput');if(![...select.options].some(o=>o.value===value))select.add(new Option(value,value));select.value=value;});

let profileDraft={};let profileDraftEpoch=0;let avatarLoads=0;const avatarRequestIds={assistant:0,user:0};
function renderIdentity(){
  const identity=window.chatProfile.get(state.settings);$('#assistantDisplayName').textContent=identity.assistantName;$('#conversationDisplayName').textContent=identity.assistantName;$('#contactAvatarImage').src=identity.assistantAvatar;$('#activeConversation').setAttribute('aria-label','打开'+identity.assistantName+'会话');$('#chatMessages').setAttribute('aria-label','与'+identity.assistantName+'的聊天记录');$('#chatInputLabel').textContent='发送给'+identity.assistantName+'的消息';$('#typingText').textContent=identity.assistantName+'正在输入';window.companionUI?.render();return identity;
}
function refreshProfilePreview(){for(const role of ['assistant','user'])$('#'+role+'AvatarPreview').src=profileDraft[role+'Avatar'];for(const role of ['user','assistant'])document.querySelectorAll('[data-'+role+'-avatar]').forEach(button=>{const selected=button.dataset[role+'Avatar']===profileDraft[role+'Avatar'];button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));});}
function openProfileSettings(settings){profileDraftEpoch++;profileDraft=window.chatProfile.get(settings);$('#assistantNameInput').value=profileDraft.assistantName;$('#userNameInput').value=profileDraft.userName;$('#assistantAvatarPresets').innerHTML=window.chatProfile.assistantAvatarPresets(settings).map(preset=>'<button type="button" class="avatar-preset-option" data-assistant-avatar="'+escapeHtml(preset.src)+'" aria-pressed="false"><img src="'+escapeHtml(preset.src)+'" alt="" /><span>'+escapeHtml(preset.label)+'</span></button>').join('');refreshProfilePreview();}
async function avatarFromFile(file){
  if(!file||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('请选择 PNG、JPG、WebP 或 GIF 图片。');
  if(file.size>8*1024*1024)throw Error('图片需小于 8 MB。');
  const url=URL.createObjectURL(file);try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('无法读取图片，请换一张图片。'));image.src=url;});if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>24*1024*1024)throw Error('图片尺寸过大，请使用较小的图片。');const edge=Math.min(image.naturalWidth,image.naturalHeight);const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d').drawImage(image,(image.naturalWidth-edge)/2,(image.naturalHeight-edge)/2,edge,edge,0,0,256,256);const value=canvas.toDataURL('image/webp',.86);if(value.length>260000)throw Error('图片处理后仍过大，请换一张较小的图片。');return value;}finally{URL.revokeObjectURL(url);}
}
const identitySection=document.createElement('section');identitySection.className='identity-section settings-section';identitySection.innerHTML='<div class="settings-section-title">聊天身份</div><p class="settings-section-copy">知序，陪你把事情理清、做好。你和助手的名称、头像都可以自由修改。</p><div class="identity-grid">'+[['assistant','助手','知序'],['user','我的','我']].map(([role,label,name])=>'<div class="identity-card"><img id="'+role+'AvatarPreview" class="identity-preview" data-avatar-role="'+role+'" alt="'+label+'头像预览" src="'+window.chatProfile.defaults[role+'Avatar']+'" /><label>'+label+'名称<input id="'+role+'NameInput" maxlength="24" placeholder="'+name+'" /></label><div class="identity-actions"><button type="button" class="secondary" id="'+role+'AvatarChange">更换头像</button><button type="button" class="text-button" id="'+role+'AvatarReset">恢复默认头像</button></div><input id="'+role+'AvatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden /></div>').join('')+'</div><span class="settings-section-copy">图片自动居中裁剪，保存在本机，点击“保存设置”后生效。</span>';$('#settingsForm').prepend(identitySection);
const assistantAvatarPicker=document.createElement('div');assistantAvatarPicker.id='assistantAvatarPresets';assistantAvatarPicker.className='assistant-avatar-presets';assistantAvatarPicker.setAttribute('role','group');assistantAvatarPicker.setAttribute('aria-label','选择伙伴头像');$('#assistantNameInput').closest('.identity-card').append(assistantAvatarPicker);assistantAvatarPicker.addEventListener('click',event=>{const button=event.target.closest('[data-assistant-avatar]');if(!button)return;avatarRequestIds.assistant++;profileDraft.assistantAvatar=button.dataset.assistantAvatar;refreshProfilePreview();$('#settingsStatus').textContent='已选择头像，保存资料后生效。';});
const userAvatarPicker=document.createElement('div');userAvatarPicker.className='user-avatar-presets';userAvatarPicker.setAttribute('role','group');userAvatarPicker.setAttribute('aria-label','选择我的头像');userAvatarPicker.innerHTML=window.chatProfile.userAvatarPresets.map(preset=>'<button type="button" class="avatar-preset-option" data-user-avatar="'+escapeHtml(preset.src)+'" aria-pressed="false"><img src="'+escapeHtml(preset.src)+'" alt="" /><span>'+escapeHtml(preset.label)+'</span></button>').join('');$('#userNameInput').closest('.identity-card').append(userAvatarPicker);userAvatarPicker.addEventListener('click',event=>{const button=event.target.closest('[data-user-avatar]');if(!button)return;avatarRequestIds.user++;profileDraft.userAvatar=button.dataset.userAvatar;refreshProfilePreview();$('#settingsStatus').textContent='已选择头像，保存资料后生效。';});
for(const role of ['assistant','user']){
 if(role==='assistant'){const classic=document.createElement('button');classic.id='assistantAvatarClassic';classic.type='button';classic.className='text-button';classic.textContent='使用原版头像';$('#assistantAvatarReset').after(classic);classic.addEventListener('click',()=>{avatarRequestIds.assistant++;profileDraft.assistantAvatar=window.chatProfile.classicAvatar(state.settings);refreshProfilePreview();$('#settingsStatus').textContent='已选用原版头像，保存资料后生效。';});}
 $('#'+role+'AvatarChange').addEventListener('click',()=>$('#'+role+'AvatarFile').click());
 $('#'+role+'AvatarReset').addEventListener('click',()=>{avatarRequestIds[role]++;profileDraft[role+'Avatar']=window.chatProfile.defaultsFor(state.settings)[role+'Avatar'];refreshProfilePreview();$('#settingsStatus').textContent='已恢复默认头像，保存设置后生效。';});
 $('#'+role+'AvatarFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;const epoch=profileDraftEpoch,ticket=++avatarRequestIds[role];avatarLoads++;try{const value=await avatarFromFile(file);if(epoch!==profileDraftEpoch||ticket!==avatarRequestIds[role])return;profileDraft[role+'Avatar']=value;refreshProfilePreview();$('#settingsStatus').textContent='头像已预览，保存设置后生效。';}catch(error){if(epoch===profileDraftEpoch)$('#settingsStatus').textContent=error.message;}finally{avatarLoads--;event.target.value='';}});
}
document.addEventListener('error',event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.dataset.avatarRole){const fallback=image.dataset.avatarFallback||window.chatProfile.defaultsFor(state.settings)[image.dataset.avatarRole+'Avatar'];if(image.getAttribute('src')!==fallback)image.src=fallback;}},true);

async function openSettings() {
  try { const info = await window.humanDispatch.getDataDirectory(); $('#dataDirectoryInput').value = info.directory; $('#changeDataDirectoryButton').disabled = info.configurable === false; } catch (error) { $('#dataDirectoryInput').value = '读取失败'; }
  const s = state.settings;
  openProfileSettings(s);
  defaultTonePrompts = await window.humanDispatch.getTonePrompts();
  const savedPrompts = s.tonePrompts || {};
  promptDrafts = { ...defaultTonePrompts, ...savedPrompts };
  if (!s.tonePrompts && s.systemPrompt) promptDrafts[s.tone || '老板模式'] = s.systemPrompt;
  activePromptTone = s.tone || '老板模式';
  openModelSettings(s);
  $('#toneInput').value = activePromptTone;
  $('#systemPromptInput').value = promptDrafts[activePromptTone] || defaultTonePrompts[activePromptTone] || '';
  $('#reminderInput').value = s.reminderMinutes || 30;
  $('#passiveNudgesInput').value = s.passiveNudgeMinutes || 10;
  $('#passiveNudgesEnabledInput').checked = s.passiveNudgesEnabled !== false;
  $('#workStartInput').value = s.workStart || '09:00';
  $('#workEndInput').value = s.workEnd || '18:00';
  $('#notificationsInput').checked = s.notifications !== false;
  $('#stickersEnabledInput').checked = s.stickersEnabled !== false;
  $('#onlineStickersEnabledInput').checked=s.onlineStickersEnabled !== false;
  $('#stickerFrequencyInput').value=['lively','balanced','quiet'].includes(s.stickerFrequency)?s.stickerFrequency:'lively';
  $('#themeInput').value = themeLabels[s.theme] ? s.theme : 'pastel-mix';
  applyTheme($('#themeInput').value);
  $('#settingsStatus').textContent = '';
  $('#settingsModal').classList.remove('hidden');
}
function closeSettings() { $('#settingsModal').classList.add('hidden'); }

$('#settingsButton').addEventListener('click', openSettings); $('#closeSettingsButton').addEventListener('click', closeSettings); $('#settingsModal .modal-backdrop').addEventListener('click', closeSettings);
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
$('#taskFilterInput').addEventListener('change', () => { taskView.status = $('#taskFilterInput').value; if(taskView.status==='completed')taskView.completedCollapsed=false; renderTasks(); });
$('#toggleCompletedButton').addEventListener('click', () => { taskView.completedCollapsed = !taskView.completedCollapsed; renderTasks(); });
document.querySelectorAll('[data-quick-prompt]').forEach(button=>button.addEventListener('click',()=>{ insertComposerText(button.dataset.quickPrompt); toggleComposerPopup(null); }));
$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activePromptTone) promptDrafts[activePromptTone] = $('#systemPromptInput').value.trim() || defaultTonePrompts[activePromptTone] || '';
  if(avatarLoads){$('#settingsStatus').textContent='头像正在处理，请稍候再保存。';return;}
  const selectedTone = $('#toneInput').value;
  rememberProviderDraft();
  Object.assign(state.settings, { ...window.chatProfile.get({...profileDraft,assistantName:$('#assistantNameInput').value,userName:$('#userNameInput').value}), providerId: $('#providerInput').value, providerConfigs: structuredClone(providerDrafts), baseUrl: $('#baseUrlInput').value.trim(), apiKey: $('#apiKeyInput').value.trim(), model: $('#modelInput').value.trim(), tone: selectedTone, tonePrompts: { ...defaultTonePrompts, ...promptDrafts }, reminderMinutes: Number($('#reminderInput').value) || 30, passiveNudgeMinutes: Math.max(5, Number($('#passiveNudgesInput').value) || 10), passiveNudgesEnabled: $('#passiveNudgesEnabledInput').checked, workStart: $('#workStartInput').value, workEnd: $('#workEndInput').value, notifications: $('#notificationsInput').checked, stickersEnabled:$('#stickersEnabledInput').checked, onlineStickersEnabled:$('#onlineStickersEnabledInput').checked, stickerFrequency:$('#stickerFrequencyInput').value, systemPrompt: promptDrafts[selectedTone] || defaultTonePrompts[selectedTone], theme: $('#themeInput').value, themeConfigured: true });
  await save(); closeSettings(); renderAll(); showToast('调度设置已保存，各语气提示词已分别保存');
});
$('#changeDataDirectoryButton').addEventListener('click', async () => {
  const button = $('#changeDataDirectoryButton');
  try {
    const directory = await window.humanDispatch.chooseDataDirectory(); if (!directory) return;
    button.disabled = true; await save();
    const result = await window.humanDispatch.setDataDirectory(directory);
    $('#dataDirectoryInput').value = result.directory;
    $('#settingsStatus').textContent = result.message || '数据保存位置已更新，原有数据已保留。';
  } catch (error) { $('#settingsStatus').textContent = `更改失败：${error.message}`; } finally { button.disabled = false; }
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
  if (!window.confirm('导入备份会替换当前任务、提醒和对话记录。API Key 仅使用本机已有且服务地址匹配的配置。确定继续吗？')) return;
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
$('#testConnectionButton').addEventListener('click', async () => { $('#settingsStatus').textContent = '正在测试……'; const testSettings = { ...state.settings, baseUrl: $('#baseUrlInput').value.trim(), apiKey: $('#apiKeyInput').value.trim(), model: $('#modelInput').value.trim() }; try { const result = await window.humanDispatch.askAI({ settings: testSettings, testAgent: true, text: '仅测试工具调用：使用 list_tasks，然后用 finish 回复连接测试成功，不要修改数据。', messages: [] }); $('#settingsStatus').textContent = result.source === 'agent' ? '连接成功，模型支持 Agent 工具调用。' : result.source === 'model' ? '连接成功，模型已返回结构化结果。' : `未连接到模型：${result.warning || '将使用本地模式'}`; } catch (error) { $('#settingsStatus').textContent = `Agent 连接测试失败：${error.message}`; } });
$('#chatForm').addEventListener('submit', (event) => { event.preventDefault(); handleMessage($('#chatInput').value); }); $('#chatInput').addEventListener('keydown', event => { const phoneNewline = matchMedia('(max-width:760px)').matches && !event.ctrlKey && !event.metaKey; if (event.key === 'Enter' && !event.shiftKey && !phoneNewline && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!agentBusy && $('#chatInput').value.trim()) $('#chatForm').requestSubmit(); } });
function restoreComposerFocus(){syncComposer();$('#chatInput').readOnly=false;$('#chatInput').focus({preventScroll:true});requestAnimationFrame(()=>{if($('#clearChatModal').classList.contains('hidden'))$('#chatInput').focus({preventScroll:true});});}
function openClearChatDialog(){
 if(agentBusy||chatClearing){showToast('请等待当前消息处理完毕');return;}
 toggleComposerPopup(null);$('#clearChatStatus').textContent='';$('#clearChatModal').classList.remove('hidden');$('.app-shell').inert=true;$('#cancelClearChatButton').focus();
}
function closeClearChatDialog(){if(chatClearing)return;$('#clearChatModal').classList.add('hidden');$('.app-shell').inert=false;restoreComposerFocus();}
for(const id of ['cancelClearChatButton','closeClearChatButton','clearChatBackdrop'])$('#'+id).addEventListener('click',closeClearChatDialog);
$('#confirmClearChatButton').addEventListener('click',async()=>{
 if(chatClearing)return;chatClearing=true;syncComposer();$('#confirmClearChatButton').disabled=true;$('#cancelClearChatButton').disabled=true;
 const before={messages:state.messages,agentContext:structuredClone(state.agentContext),pendingConfirmation:state.pendingConfirmation};
 try{state.messages=[];if(state.agentContext)state.agentContext.pendingQuestion=null;state.pendingConfirmation=null;await save();bubbleReplyQueue.length=0;await window.humanDispatch.clearBubbles().catch(()=>{});chatSearchQuery='';$('#chatSearchInput').value='';renderAll();showToast('聊天记录已清空');}
 catch(error){Object.assign(state,before);try{Object.assign(state,await window.humanDispatch.loadState());}catch{}renderAll();showToast('清空未完成：'+error.message);}
 finally{chatClearing=false;$('#confirmClearChatButton').disabled=false;$('#cancelClearChatButton').disabled=false;closeClearChatDialog();}
});
$('#clearChatModal').addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeClearChatDialog();}
 if(event.key==='Tab'){const buttons=[...$('#clearChatModal').querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});

$('#clearChatButton').addEventListener('click',openClearChatDialog);
let clearTasksSignature='';
$('#clearTasksButton').addEventListener('click', async () => {
  if(agentBusy){showToast('请等待主管处理完当前消息');return;}
  if(!state.tasks.length)return;
  const signature=JSON.stringify(state.tasks.map(t=>t.id).sort());
  if(pendingDeleteKey!=='all-tasks'||signature!==clearTasksSignature){
    pendingDeleteKey='all-tasks';clearTasksSignature=signature;clearTimeout(pendingDeleteTimer);
    pendingDeleteTimer=setTimeout(()=>{pendingDeleteKey='';renderTasks();},5000);
    renderTasks();showToast('5 秒内再点一次“清空任务”，将删除全部任务及子任务');return;
  }
  clearTimeout(pendingDeleteTimer);pendingDeleteKey='';
  const ids=new Set(state.tasks.map(t=>t.id));state.tasks=[];selectedTaskId=null;
  state.supervisionEvents=state.supervisionEvents.filter(e=>!ids.has(e.taskId));
  if(state.agentContext?.pendingQuestion)state.agentContext.pendingQuestion=null;
  state.pendingConfirmation=null;
  await save();renderAll();showToast('任务已清空');
});
window.humanDispatch.onBubbleSubmit((reply) => handleMessage(typeof reply === 'string' ? reply : reply.text, true, typeof reply === 'object' ? reply.context : null));
window.humanDispatch.onSupervisionRequest((payload) => requestCheckIn(payload));
let entryMode = 'task';
let editingTaskId=null;
function localDate(value){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function openEntryModal(mode, taskId=null) {
  const editing=taskId?state.tasks.find(t=>t.id===taskId):null;editingTaskId=editing?.id||null;
  entryMode = mode;
  const isTask = mode === 'task';
  $('#entryModalTitle').textContent = isTask ? (editing?'编辑任务':'添加任务') : '新增提醒';
  $('#entryModalHint').textContent = isTask ? (editing?'调整内容和时间，保存后立即生效。时间按本机时区显示。':'先把要做的事情写清楚，主管会继续安排。') : '用自然语言写下时间，到了就提醒你。';
  $('#entryTitleField').classList.toggle('hidden', !isTask);
  $('#entryDescriptionField').classList.toggle('hidden', !isTask);
  $('#entryReminderField').classList.toggle('hidden', isTask);
  $('#entryParentField').classList.toggle('hidden', !isTask);
  $('#entryTaskFields').classList.toggle('hidden', !isTask);
  $('#entryStatusMessage').textContent = '';
  $('#entryTitleInput').required=isTask;
  $('#entryTitleInput').value = editing?.title || '';
  $('#entryDescriptionInput').value = editing?.description || '';
  $('#entryReminderInput').value = '';
  $('#entryStatusInput').value = editing?.status || 'planned';
  $('#entryStatusInput').disabled=Boolean(editing?.isContainer);
  $('#entryPriorityInput').value = editing?.priority || 'normal';
  $('#entryEstimateInput').value = editing?.estimatedMinutes || 30;
  $('#entryKindInput').value=editing?.kind || 'work';
  $('#entryStartInput').value=localDate(editing?.startsAt);
  $('#entryDueInput').value=localDate(editing?.dueAtIsDeadline?editing.dueAt:'');
  $('#entryDeferredInput').value=localDate(editing?window.taskSchedule.deferredAt(editing):'');
  $('#entryDurationInput').value=editing?.durationMinutes || '';
  $('#entryParentInput').disabled=Boolean(editing?.isContainer);
  $('#entryParentInput').innerHTML = `<option value="">独立任务</option>${state.tasks.filter((task) => task.isContainer && task.id!==editingTaskId && (task.id===editing?.parentId || (task.status !== 'completed' && task.status !== 'cancelled'))).map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`).join('')}`;
  $('#entryParentInput').value=editing?.parentId || '';
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
  if(agentBusy){$('#entryStatusMessage').textContent='请等待主管处理完当前消息，再保存编辑。';return;}
  const existing=editingTaskId?state.tasks.find(t=>t.id===editingTaskId):null;
  if(editingTaskId&&!existing){$('#entryStatusMessage').textContent='任务已被删除，请重新打开清单。';return;}
  const dateValue=(selector,old)=>{const value=$(selector).value;if(!value)return '';if(value===localDate(old))return old;const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('请填写有效的时间');return d.toISOString();};
  try{
    const startsAt=dateValue('#entryStartInput',existing?.startsAt),dueAt=dateValue('#entryDueInput',existing?.dueAtIsDeadline?existing.dueAt:''),deferredUntil=dateValue('#entryDeferredInput',existing?window.taskSchedule.deferredAt(existing):'');
    if(startsAt&&dueAt&&new Date(dueAt)<new Date(startsAt))throw new Error('截止时间不能早于开始时间');
    const status=$('#entryStatusInput').value;
    const patch={title,description:$('#entryDescriptionInput').value.trim(),parentId:$('#entryParentInput').value||'',parentTitle:'',status,priority:$('#entryPriorityInput').value,estimatedMinutes:Number($('#entryEstimateInput').value)||30,kind:$('#entryKindInput').value,startsAt,dueAt,deferredUntil,dueAtIsDeadline:true,durationMinutes:$('#entryDurationInput').value?Number($('#entryDurationInput').value):null,updatedAt:now()};
    if(existing){
      const timeChanged=['startsAt','dueAt','deferredUntil','durationMinutes'].some(key=>String(existing[key]||'')!==String(patch[key]||''));
      updateTask(existing.id,patch);
      if(status!=='completed')delete existing.completedAt;
      if(timeChanged||['completed','cancelled'].includes(status))state.supervisionEvents=state.supervisionEvents.filter(e=>e.taskId!==existing.id||e.sent);
      if(timeChanged&&!existing.isContainer&&!['completed','cancelled'].includes(status)){
        const when=deferredUntil||startsAt||dueAt;
        if(when&&new Date(when)>new Date())state.supervisionEvents.push({id:uid('event'),taskId:existing.id,type:'check_in',scheduledAt:when,sent:false,createdAt:now()});
      }
      const question=state.agentContext?.pendingQuestion;const field=question?.field==='details'?'description':question?.field;
      if(question?.taskId===existing.id && patch[field])state.agentContext.pendingQuestion=null;
     }else {
      const task={id:uid('task'),projectName:'默认项目',isContainer:false,createdAt:now(),recordedBy:'user',lastEditedBy:'user',...patch};
      if(status==='completed')task.completedAt=now();
      state.tasks.push(task);
      const when=deferredUntil||startsAt||dueAt;
      if(when&&!['completed','cancelled'].includes(status)&&new Date(when)>new Date())state.supervisionEvents.push({id:uid('event'),taskId:task.id,type:'check_in',scheduledAt:when,sent:false,createdAt:now()});
    }
    await save();closeEntryModal();renderAll();showToast((existing?'已保存修改：':'已添加任务：')+title);
  }catch(error){$('#entryStatusMessage').textContent=error.message;}

}
$('#editCurrentTaskButton').addEventListener('click',()=>{if(currentTaskPreviewId)openEntryModal('task',currentTaskPreviewId);});
$('#addTaskButton').addEventListener('click', () => openEntryModal('task'));
$('#addReminderButton').addEventListener('click', () => openEntryModal('reminder'));
$('#entryForm').addEventListener('submit', submitEntry);
$('#closeEntryButton').addEventListener('click', closeEntryModal);
$('#cancelEntryButton').addEventListener('click', closeEntryModal);
$('#entryBackdrop').addEventListener('click', closeEntryModal);
function quickUpdate(status) { const task = currentTask(); if (!task) { showToast('当前没有任务'); return; } updateTask(task.id, { status }); if (status === 'completed') state.supervisionEvents = state.supervisionEvents.filter(event => event.taskId !== task.id || event.sent); save().then(() => { renderAll(); showToast(status === 'completed' ? '已记录完成。下一个任务在等你。' : status === 'blocked' ? '已标记阻塞，请汇报原因。' : '已延期，别把它藏起来。'); }); }
$('#completeButton').addEventListener('click', () => quickUpdate('completed')); $('#blockedButton').addEventListener('click', () => quickUpdate('blocked')); $('#postponeButton').addEventListener('click', () => { const task = currentTask(); if (!task) return; const hours = Number(window.prompt('延期多少小时？', '2')); if (!hours || hours < 0) return; updateTask(task.id, { status: 'planned', ...window.taskSchedule.postponement(task,new Date(Date.now() + hours * 3600000).toISOString()) }); save().then(renderAll); }); $('#nextButton').addEventListener('click', () => handleMessage('我现在做什么？'));

window.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') { event.preventDefault(); $('#chatInput').focus(); } });

(async function init() { const loaded = await window.humanDispatch.loadState(); Object.assign(state, loaded); state.reminders = loaded.reminders || []; state.pendingConfirmation = loaded.pendingConfirmation || null; renderAll(); if (!state.messages.length) addMessage('assistant', '我是'+window.chatProfile.get(state.settings).assistantName+'，今天有什么想聊的，或需要我帮你安排的事？'); requestAnimationFrame(() => { window.scrollTo(0, 0); $('#chatInput').focus(); showConfigReminder(); }); checkReminders(); setInterval(() => { checkSupervision(); checkReminders(); if (!window.desktopDispatch) requestCheckIn(); }, 15000); })();

function toggleTaskPanel(open) {
  $('#taskPanel').hidden=!open; $('#taskPanel').inert=!open; $('#taskPanelBackdrop').hidden=!open;
  $('#taskPanelButton').setAttribute('aria-expanded',String(open)); $('#tasksNavButton').setAttribute('aria-expanded',String(open));
  if (open) $('#closeTaskPanel').focus(); else $('#chatInput').focus();
}
function toggleComposerPopup(id) {
  for (const [panel,button] of [['emojiPicker','emojiButton'],['quickPromptPanel','quickRepliesButton']]) {
    const show=panel===id && $('#'+panel).hidden; $('#'+panel).hidden=!show; $('#'+button).setAttribute('aria-expanded',String(show));
  }
}
function insertComposerText(text) {
  const input=$('#chatInput');input.setRangeText(text,input.selectionStart,input.selectionEnd,'end'); input.focus();syncComposer();
}
for (const id of ['taskPanelButton','tasksNavButton']) $('#'+id).addEventListener('click',()=>toggleTaskPanel($('#taskPanel').hidden));
for (const id of ['closeTaskPanel','taskPanelBackdrop']) $('#'+id).addEventListener('click',()=>toggleTaskPanel(false));
for (const id of ['activeConversation','chatNavButton']) $('#'+id).addEventListener('click',()=>{chatSearchQuery='';$('#chatSearchInput').value='';toggleTaskPanel(false);renderMessages();chatScroll.toLatest();});
$('#emojiButton').addEventListener('click',()=>toggleComposerPopup('emojiPicker'));
$('#quickRepliesButton').addEventListener('click',()=>toggleComposerPopup('quickPromptPanel'));
document.querySelectorAll('[data-emoji]').forEach(button=>button.addEventListener('click',()=>{insertComposerText(button.dataset.emoji);toggleComposerPopup(null);}));
$('#chatInput').addEventListener('input',syncComposer);
$('#chatSearchInput').addEventListener('input',()=>{chatSearchQuery=$('#chatSearchInput').value.trim();renderMessages();});
$('#chatMessages').addEventListener('click',async event=>{const button=event.target.closest('[data-copy-message]');if (!button) return;try {await navigator.clipboard.writeText(state.messages[Number(button.dataset.copyMessage)].content);showToast('消息已复制');}catch {showToast('无法复制，请选中文字后复制');}});
document.addEventListener('keydown',event=>{if(!$('#clearChatModal').classList.contains('hidden'))return;if(event.key==='Escape'){toggleComposerPopup(null);if(!$('#taskPanel').hidden)toggleTaskPanel(false);}});
document.addEventListener('click',event=>{if(!event.target.closest('.chat-form'))toggleComposerPopup(null);});
syncComposer();
