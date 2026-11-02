const core = require('./core.cjs');
const { runAgent, fingerprint } = require('./agent.cjs');

// Shared by the HTTP desktop server and the on-device Android runtime.
async function chat(payload, { readState = core.readState, saveState = core.writeState, agent = runAgent } = {}) {
  const state = readState();
  const settings = { ...state.settings, ...(payload.settings || {}) };
  settings.apiKey = settings.apiKey || process.env.MODEL_API_KEY || '';
  if (process.env.MODEL_BASE_URL && !payload.settings) settings.baseUrl = process.env.MODEL_BASE_URL;
  if (process.env.MODEL_NAME && !payload.settings) settings.model = process.env.MODEL_NAME;
  if (typeof payload.text !== 'string' || payload.text.length > 12000 || (payload.messages !== undefined && !Array.isArray(payload.messages))) throw Object.assign(Error('消息格式不正确或过长'), { status: 400 });
  if (settings.apiKey && (!payload.settings || payload.testAgent === true)) {
    const before = fingerprint(state);
    let attempts = 0;
    try {
      let result;
      for (attempts = 1; attempts <= 3; attempts++) {
        if (fingerprint(readState()) !== before) throw Object.assign(Error('执行期间任务或设置已更改，本轮未提交，请重新发送'), { status: 409 });
        try {
          // Each attempt gets a clean draft. Only the successful result reaches the commit below.
          result = await agent({ settings: structuredClone(settings), text: payload.text, messages: structuredClone(payload.messages || state.messages), state: structuredClone(state), context: structuredClone(payload.context), mode: payload.testAgent === true ? 'connection_test' : 'chat' });
          break;
        } catch (error) {
          if (error.status === 409 || fingerprint(readState()) !== before) throw Object.assign(Error('执行期间任务或设置已更改，本轮未提交，请重新发送'), { status: 409 });
          if (attempts === 3) throw error;
        }
      }
      if (result.agent) result.agent = { ...result.agent, attempts, trace: [...Array.from({ length: attempts - 1 }, (_, index) => ({ tool: 'retry', status: 'ok', summary: `第 ${index + 1} 次执行未完成，已从原始状态重新尝试` })), ...(result.agent.trace || [])] };
      const latest = readState();
      if (fingerprint(latest) !== before) throw Object.assign(Error('执行期间任务或设置已更改，本轮未提交，请重新发送'), { status: 409 });
      const { draft, dirty, ...response } = result;
      if (payload.testAgent === true) return { ...response, actions: [], dryRun: true };
      if (dirty || result.contextDirty) {
        const committed = { ...latest, tasks: draft.tasks, reminders: draft.reminders, projects: draft.projects, supervisionEvents: draft.supervisionEvents, agentContext: draft.agentContext };
        const changed = new Set(result.actions.map(a => a.taskId).filter(Boolean));
        const next = committed.tasks.find(t => changed.has(t.id) && t.status === 'active' && !t.isContainer) || committed.tasks.find(t => t.status === 'active' && !t.isContainer);
        if (!result.question && result.followUpMinutes && next) {
          committed.supervisionEvents = committed.supervisionEvents.filter(e => e.taskId !== next.id || e.sent);
          committed.supervisionEvents.push({ id: result.agent.id, taskId: next.id, type: 'check_in', scheduledAt: new Date(Date.now() + result.followUpMinutes * 60000).toISOString(), sent: false, createdAt: new Date().toISOString() });
        }
        await saveState(committed); response.state = committed; response.applied = true;
      }
      if (!response.applied) { response.state = latest; response.applied = true; }
      return response;
    } catch (error) {
      if (error.status === 409) throw error;
      throw Object.assign(Error(error.message + (attempts === 3 ? '（已自动重试 2 次）' : '') + '；本轮未保存任何修改。请根据上述错误检查 API 配置，或稍后重试。'), { status: 502 });
    }
  }
  try { return { ...await core.callModel({ settings, messages: payload.messages || [], tasks: state.tasks, reminders: state.reminders }), source: 'model' }; }
  catch (error) { return { ...core.localFallback(payload.text, state.tasks), source: 'local', warning: error.message }; }
}

module.exports = { chat };
