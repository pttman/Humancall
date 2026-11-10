const { randomUUID } = require('node:crypto');
const friends = require('../frontend/friends.js');
const { chat } = require('./chat-service.cjs');
const { executeActions } = require('./actions.cjs');

function inConversation(state, friendId, operation) {
  const visible = state.activeFriendId || 'zhixu';
  friends.select(state, friendId);
  try { return operation(state); }
  finally { friends.select(state, visible); }
}
function messagesFor(state, friendId) {
  return (state.activeFriendId || 'zhixu') === friendId ? state.messages : state.friends?.[friendId]?.messages || [];
}
function append(state, role, content, extra = {}) {
  const message = { id: 'msg_' + randomUUID(), role, content, createdAt: new Date().toISOString(), meta: '来自微信', channel: 'wechat', ...extra };
  state.messages.push(message);
  return message;
}

async function receiveWechatText({ text, friendId, messageId, signal }, { readState, saveState, chatImpl = chat }) {
  signal?.throwIfAborted();
  const initial = readState();
  inConversation(initial, friendId, state => append(state, 'user', text, { externalMessageId: messageId }));
  saveState(initial);
  const before = JSON.stringify(messagesFor(initial, friendId));
  const guard = () => {
    signal?.throwIfAborted();
    if (JSON.stringify(messagesFor(readState(), friendId)) !== before) {
      throw Object.assign(Error('这段对话刚在桌面端更新，本轮未执行。请根据最新对话重新发送。'), { status: 409 });
    }
  };
  let reply;
  try {
    // Destructive actions keep their existing confirmation flow in the desktop UI.
    // They are deliberately not executed from a remote text acknowledgment.
    const pending = inConversation(readState(), friendId, state => state.pendingConfirmation);
    if (pending) reply = '有一项删除或清空操作等待确认，请到人类调度桌面窗口处理后继续。';
    else {
      const result = await chatImpl({ text, friendId, messages: messagesFor(initial, friendId) }, {
        readState, saveState: value => { guard(); return saveState(value); }, signal
      });
      guard();
      const latest = readState();
      inConversation(latest, friendId, state => {
        if ((result.actions || []).some(action => ['delete_task', 'clear_all_tasks'].includes(action.type))) {
          reply = '删除或清空需要在桌面窗口确认，请在那里重新提出这项操作。微信端本轮没有执行删除。';
        } else {
          if (!result.applied) executeActions(state, result.actions || [], text);
          reply = result.reply || '已处理。';
        }
        append(state, 'assistant', reply, result.agent ? { execution: result.agent } : {});
      });
      signal?.throwIfAborted();
      saveState(latest);
      return reply;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    reply = error.status === 409 ? '桌面端刚更新了任务或对话，本轮已停止。请查看最新内容后重新发送。' : '本轮处理未完成：' + error.message;
  }
  const latest = readState();
  inConversation(latest, friendId, state => append(state, 'assistant', reply));
  signal?.throwIfAborted();
  saveState(latest);
  return reply;
}
module.exports = { receiveWechatText, inConversation, messagesFor };
