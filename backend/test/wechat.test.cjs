const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const root = require('./helpers/storage.cjs')('wechat');
const core = require('../core.cjs');
const friends = require('../../frontend/friends.js');
const merge = require('../../frontend/state-merge.js');
const { createWechatClient, trustedBase } = require('../wechat-client.cjs');
const { createWechatService } = require('../wechat-service.cjs');
const { receiveWechatText } = require('../wechat-conversation.cjs');
const { createServer } = require('../server.cjs');
let sequence = 0;
const fixture = () => core.readState();
const makeFile = () => path.join(root, String(++sequence), 'wechat-connection.json');
const connection = () => ({ token: 'private-bot-token', botId: 'bot', userId: 'owner', baseUrl: 'https://ilinkai.weixin.qq.com', friendId: 'zhixu', enabled: true, cursor: '', inbox: [] });
const store = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); };
const wait = (ms, signal) => delay(Math.min(ms, 10), undefined, { signal });
const parked = signal => new Promise((resolve, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
const until = async predicate => { for (let i = 0; i < 200; i++) { if (await predicate()) return; await delay(10); } throw Error('微信测试等待超时'); };
function clientFor(overrides = {}) { return { qr: async () => ({ qrcode: 'qr-private', qrcode_img_content: 'https://weixin.qq.com/test-qr' }), qrStatus: async (qr, base, code, signal) => parked(signal), updates: async (account, signal) => parked(signal), send: async () => ({}), notify: async () => ({}), ...overrides }; }

test('微信协议：HTTPS 服务地址、扫码、版本头、鉴权与业务错误，不泄露上游内容', async () => {
  for (const url of ['http://ilinkai.weixin.qq.com', 'https://weixin.qq.com.evil.test', 'https://user:password@ilinkai.weixin.qq.com', 'https://127.0.0.1']) assert.throws(() => trustedBase(url));
  assert.equal(trustedBase('https://ilinkai.weixin.qq.com/ignored'), 'https://ilinkai.weixin.qq.com');
  const requests = [];
  const client = createWechatClient({ fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ ret: 0, msgs: [] }) }; } });
  await client.qr(); await client.qrStatus('qr-secret', 'https://ilinkai.weixin.qq.com', '123456'); await client.updates(connection());
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(requests[0].options.body), { local_token_list: [] });
  assert.match(requests[1].url, /verify_code=123456/);
  assert.equal(requests[1].options.headers.AuthorizationType, undefined);
  assert.equal(requests[2].options.headers.Authorization, 'Bearer private-bot-token');
  assert.equal(requests[2].options.headers['iLink-App-ClientVersion'], '132106');
  assert.equal(JSON.parse(requests[2].options.body).base_info.channel_version, '2.4.10');
  const failed = createWechatClient({ fetchImpl: async () => ({ ok: true, json: async () => ({ errcode: -14, errmsg: 'private-bot-token' }) }) });
  await assert.rejects(failed.updates(connection()), error => error.code === -14 && !error.message.includes('private-bot-token'));
});

test('扫码验证码与持久绑定，状态和备份不返回凭证；取消、暂停与解绑可恢复', async t => {
  const file = makeFile(); let step = 0;
  const client = clientFor({ qrStatus: async (qr, base, code) => {
    if (!step++) return { status: 'need_verifycode' };
    assert.equal(code, '123456'); return { status: 'confirmed', bot_token: 'private-bot-token', ilink_bot_id: 'bot', ilink_user_id: 'owner', baseurl: 'https://ilinkai.weixin.qq.com' };
  } });
  const service = createWechatService({ file, readState: fixture, saveState: () => {}, client, wait });
  t.after(() => service.stop());
  const qr = await service.beginLogin('luye'); assert.match(qr.qrImage, /^data:image\/gif;base64,/);
  await until(() => service.status().needsVerifyCode);
  assert.throws(() => service.verifyCode('x'), /数字验证码/);
  service.verifyCode('123456'); await until(() => service.status().bound);
  assert.equal(service.status().friendId, 'luye');
  assert.ok(!JSON.stringify(service.status()).includes('private-bot-token'));
  await service.configure({ enabled: false, friendId: 'zhixu' }); assert.equal(service.status().phase, 'paused');
  const restored = createWechatService({ file, readState: fixture, saveState: () => {}, client, wait });
  assert.equal(restored.status().bound, true); assert.equal(restored.status().enabled, false); assert.equal(restored.status().phase, 'paused');
  await restored.stop(); await service.disconnect(); assert.equal(fs.existsSync(file), false);
  await service.beginLogin('zhixu'); await service.cancelLogin(); assert.equal(service.status().bound, false);
});

test('收件箱先落盘，过滤其他用户/群聊，去重；发送失败不重复执行，重启保留中断记录', async t => {
  const file = makeFile(); store(file, connection()); let executed = 0, polls = 0, sends = 0; const sendIds = [];
  const message = { message_id: 'one', from_user_id: 'owner', message_type: 1, context_token: 'context-private', item_list: [{ type: 1, text_item: { text: '记一条任务' } }] };
  const client = clientFor({ updates: async (account, signal) => {
    if (++polls <= 2) return { msgs: [message, { ...message, message_id: 'outsider', from_user_id: 'other' }, { ...message, message_id: 'group', group_id: 'group' }], get_updates_buf: 'cursor-' + polls };
    return parked(signal);
  }, send: async (account, message) => { sends++; sendIds.push(message.client_id); if (sends === 1) throw Error('offline'); } });
  const service = createWechatService({ file, readState: fixture, saveState: () => {}, client, wait, receive: async () => {
    executed++; const disk = JSON.parse(fs.readFileSync(file)); assert.equal(disk.inbox[0].stage, 'processing'); assert.equal(disk.cursor, 'cursor-1'); return '已记下';
  } });
  t.after(() => service.stop()); service.start();
  await until(() => polls >= 3); assert.equal(executed, 1); assert.equal(sends, 2); assert.equal(sendIds[0], sendIds[1]);
  await service.stop(); const saved = JSON.parse(fs.readFileSync(file)); assert.equal(saved.inbox.length, 1); assert.equal(saved.inbox[0].stage, 'done'); assert.equal(saved.inbox[0].text, undefined);
  saved.inbox.push({ id: 'interrupted', stage: 'processing' }); store(file, saved);
  const resumed = createWechatService({ file, readState: fixture, saveState: () => {}, client: clientFor(), receive: () => assert.fail('不得重复执行中断任务') });
  assert.equal(resumed.status().interrupted, 1); resumed.start(); await delay(20); await resumed.stop();
});

test('过期凭证停止重试；取消绑定丢弃迟到授权；恶意重定向不绑定', async t => {
  const file = makeFile(); store(file, connection());
  const expired = createWechatService({ file, readState: fixture, saveState: () => {}, client: clientFor({ updates: async () => { throw Object.assign(Error('expired'), { code: -14 }); } }), wait });
  t.after(() => expired.stop()); expired.start(); await until(() => expired.status().phase === 'expired'); assert.equal(expired.status().enabled, false); await expired.disconnect();
  let finish;
  const service = createWechatService({ file, readState: fixture, saveState: () => {}, client: clientFor({ qrStatus: () => new Promise(resolve => { finish = resolve; }) }), wait });
  t.after(() => service.stop()); await service.beginLogin('zhixu'); await service.cancelLogin();
  finish({ status: 'confirmed', bot_token: 'token', ilink_bot_id: 'bot', ilink_user_id: 'owner', baseurl: 'https://ilinkai.weixin.qq.com' });
  await delay(10); assert.equal(service.status().bound, false); assert.equal(fs.existsSync(file), false);
  const evil = createWechatService({ file, readState: fixture, saveState: () => {}, client: clientFor({ qrStatus: async () => ({ status: 'scaned_but_redirect', redirect_host: 'evil.test' }) }), wait });
  t.after(() => evil.stop()); await evil.beginLogin('zhixu'); await until(() => evil.status().phase === 'error'); assert.equal(evil.status().bound, false);
});

test('微信对话沿用指定伙伴，提交真实任务并保存双向消息，不切换桌面；冲突不覆盖', async () => {
  let state = fixture(); friends.select(state, 'luye');
  const readState = () => structuredClone(state), saveState = value => { state = structuredClone(value); friends.normalize(state); return state; };
  const reply = await receiveWechatText({ text: '新增待办', friendId: 'zhixu', messageId: 'remote-1' }, { readState, saveState,
    chatImpl: async payload => { assert.ok(payload.messages.some(m => m.externalMessageId === 'remote-1')); return { reply: '已创建', actions: [{ type: 'create_task', title: '微信任务', status: 'inbox' }] }; } });
  assert.equal(reply, '已创建'); assert.equal(state.activeFriendId, 'luye'); assert.equal(state.tasks.at(-1).title, '微信任务');
  assert.equal(state.messages.some(m => m.channel === 'wechat'), false); assert.equal(state.friends.zhixu.messages.length, 2);
  const before = state.tasks.length;
  await receiveWechatText({ text: '继续', friendId: 'zhixu', messageId: 'remote-2' }, { readState, saveState, chatImpl: async () => {
    state.friends.zhixu.messages.push({ id: 'desktop-during', role: 'user', content: '新安排' });
    return { reply: '不能提交', actions: [{ type: 'create_task', title: '过期任务' }] };
  } });
  assert.equal(state.tasks.length, before); assert.ok(state.friends.zhixu.messages.some(m => m.id === 'desktop-during')); assert.match(state.friends.zhixu.messages.at(-1).content, /重新发送/);
});

test('桌面保存合并微信消息，切换伙伴不串对话；聊天清空不复活旧消息', () => {
  const base = fixture(); friends.normalize(base);
  base.messages = [{ id: 'old', role: 'user', content: '旧消息' }]; friends.normalize(base);
  const remote = structuredClone(base); remote.messages.push({ id: 'wechat-new', role: 'assistant', content: '微信回复' }); friends.normalize(remote);
  const incoming = structuredClone(base); incoming.messages.push({ id: 'desktop-new', role: 'user', content: '桌面消息' }); friends.select(incoming, 'luye');
  const result = merge.shared(merge.baseOf(base), incoming, remote);
  assert.equal(result.activeFriendId, 'luye'); assert.deepEqual(new Set(result.friends.zhixu.messages.map(m => m.id)), new Set(['old', 'wechat-new', 'desktop-new']));
  const cleared = structuredClone(base); cleared.messages = []; friends.normalize(cleared);
  const afterClear = merge.shared(merge.baseOf(base), cleared, remote); assert.deepEqual(afterClear.messages.map(m => m.id), ['wechat-new']);
});

test('微信通过真实聊天服务提交 Agent 任务一次，保留对话并拒绝执行删除请求', async () => {
  let state = fixture(); state.settings.apiKey = 'mock-only'; state.settings.stickersEnabled = false;
  const readState = () => structuredClone(state), saveState = value => { state = structuredClone(value); friends.normalize(state); return state; };
  const { chat } = require('../chat-service.cjs'), { runAgent } = require('../agent.cjs');
  const tool = (name, args) => ({ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  let step = 0;
  const chatImpl = (payload, options) => chat(payload, { ...options, agent: args => runAgent({ ...args, modelStep: async () => ({ role: 'assistant', tool_calls: [
    step++ === 0 ? tool('execute_actions', { steps: ['记录微信待办'], actions: [{ type: 'create_task', title: '工具创建的微信任务', status: 'inbox' }] }) : tool('finish', { reply: '已经记入清单。', stickerMood: 'none' })
  ] }) }) });
  const reply = await receiveWechatText({ text: '请记录任务', friendId: 'zhixu', messageId: 'agent-message' }, { readState, saveState, chatImpl });
  assert.equal(reply, '已经记入清单。'); assert.equal(state.tasks.filter(task => task.title === '工具创建的微信任务').length, 1, JSON.stringify(state.messages.at(-1).execution));
  assert.equal(state.messages.filter(message => message.externalMessageId === 'agent-message').length, 1);
  assert.ok(state.messages.at(-1).execution);
  const count = state.tasks.length;
  await receiveWechatText({ text: '清空所有任务', friendId: 'zhixu', messageId: 'delete-message' }, { readState, saveState,
    chatImpl: async () => ({ actions: [{ type: 'clear_all_tasks' }], reply: '不能执行' }) });
  assert.equal(state.tasks.length, count); assert.match(state.messages.at(-1).content, /桌面窗口确认/);
});

test('本机 HTTP 接入入口、来源限制、状态/备份凭证隔离和解绑', async t => {
  const file = makeFile(); store(file, { ...connection(), enabled: false });
  const server = createServer({ wechatOptions: { file, client: clientFor(), wait } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await server.wechat.stop(); await new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const snapshot = await (await fetch(base + '/api/wechat')).json(); assert.equal(snapshot.bound, true); assert.ok(!JSON.stringify(snapshot).includes('private-bot-token'));
  assert.ok(!(await (await fetch(base + '/api/backup')).text()).includes('private-bot-token'));
  assert.equal((await fetch(base + '/api/wechat', { headers: { Origin: 'https://evil.test' } })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => { require('node:http').get(base + '/api/wechat', { headers: { Host: 'evil.test' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject); });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(base + '/api/wechat/disconnect', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await fetch(base + '/api/wechat/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
  assert.equal(fs.existsSync(file), false);
});
