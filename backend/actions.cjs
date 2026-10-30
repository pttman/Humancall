const conversationState=require('../frontend/conversation-state.js');
const taskSchedule=require('../frontend/task-schedule.js');
const { randomUUID } = require('node:crypto');
function executeActions(state, actions, input = '') {
const uid = prefix => prefix + '_' + randomUUID();
const now = () => new Date().toISOString();
function sortTasks(tasks) {
  const order = { active: 0, blocked: 1, planned: 2, inbox: 3, waiting: 4, completed: 5, cancelled: 6 };
  return [...tasks].sort((a, b) => (order[a.status] - order[b.status]) || ((a.dueAt || '9999') < (b.dueAt || '9999') ? -1 : 1));
}
function childrenOf(taskId) { return state.tasks.filter((task) => task.parentId === taskId); }
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
function isTaskAvailable(task) { return taskSchedule.available(task); }
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
      if (reminder) Object.assign(reminder, { title: action.title || reminder.title, nextAt: action.nextAt || reminder.nextAt, repeat: action.repeat || reminder.repeat, weekday: action.weekday ?? reminder.weekday, enabled: action.enabled ?? reminder.enabled, note: action.description ?? reminder.note, updatedAt: now() });
      return;
    }
    if (action.taskId) {
      const status = action.type === 'complete_task' ? 'completed'
        : action.type === 'block_task' ? 'blocked'
          : ['postpone_task', 'snooze_task'].includes(action.type) ? 'planned'
            : action.status;
      updateTask(action.taskId, { status, kind:action.kind, startsAt:action.startsAt, durationMinutes:action.durationMinutes, title: action.title, priority: action.priority, estimatedMinutes: action.estimatedMinutes, projectName: action.projectName, description: action.description, ...(['postpone_task','snooze_task'].includes(action.type)?taskSchedule.postponement(state.tasks.find(t=>t.id===action.taskId),action.dueAt):{dueAt:action.dueAt}) });
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
}
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
const normalized = normalizeTaskHierarchy(actions, input);
applyActions(normalized); refreshParentStatuses(); conversationState.reconcile(state);return normalized;
}
module.exports = { executeActions };
