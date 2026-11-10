const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { createWechatClient, trustedBase, BASE_URL } = require('./wechat-client.cjs');
const { receiveWechatText } = require('./wechat-conversation.cjs');
const friends = require('../frontend/friends.js');

function createWechatService({ file, readState, saveState, client = createWechatClient(), receive = receiveWechatText,
  wait = (ms, signal) => delay(ms, undefined, { signal }), qrImage = content => {
    const qr = require('qrcode-generator')(0, 'M'); qr.addData(content, 'Byte'); qr.make(); return qr.createDataURL(5, 20);
  } }) {
  let account = null, login = null, loginController, workerController, workerPromise, workerState = 'disconnected';
  let lastError = '', lastMessageAt = '', loadError = false, loginPending = false;
  try {
    if (fs.existsSync(file)) {
      account = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!account || typeof account.token !== 'string' || !account.token || typeof account.userId !== 'string' || !account.userId ||
          typeof account.botId !== 'string' || !account.botId || !friends.ids.includes(account.friendId) || !Array.isArray(account.inbox)) throw Error('invalid connection');
      account.baseUrl = trustedBase(account.baseUrl);
      for (const item of account.inbox) if (item.stage === 'processing') item.stage = 'interrupted';
    }
  } catch { account = null; loadError = true; lastError = '本机微信连接文件无法读取，请重新扫码绑定。'; }
  if (account) workerState = account.enabled ? 'connecting' : 'paused';
  function persist() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    try { fs.writeFileSync(temporary, JSON.stringify(account), { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  function status() {
    return { bound: Boolean(account), enabled: Boolean(account?.enabled), friendId: account?.friendId || login?.friendId || 'zhixu',
      phase: login?.phase || (loadError ? 'error' : workerState), error: login?.error || lastError,
      qrImage: login?.qrImage || '', expiresAt: login?.expiresAt || '', lastMessageAt,
      interrupted: account?.inbox.filter(item => item.stage === 'interrupted').length || 0,
      pendingReplies: account?.inbox.filter(item => item.stage === 'replying').length || 0,
      needsVerifyCode: Boolean(login?.phase === 'verify_code') };
  }
  async function stopWorker() {
    workerController?.abort();
    if (workerPromise) await workerPromise;
    workerController = null; workerPromise = null;
    workerState = account ? 'paused' : 'disconnected';
  }
  function start() {
    if (!account?.enabled || workerPromise) return;
    const active = account;
    const controller = new AbortController(); workerController = controller;
    workerState = 'connecting';
    workerPromise = monitor(active, controller.signal).catch(() => {
      if (!controller.signal.aborted) { workerState = 'error'; lastError = '微信连接已停止，请暂停后重新启用，或重新扫码绑定。'; }
    });
  }
  async function deliver(active, item, signal) {
    while (item.part < item.parts.length) {
      signal.throwIfAborted();
      await client.send(active, { from_user_id: '', to_user_id: active.userId, client_id: item.replyId + '_' + item.part,
        message_type: 2, message_state: 2, context_token: item.contextToken,
        item_list: [{ type: 1, text_item: { text: item.parts[item.part] } }] }, signal);
      signal.throwIfAborted();
      // Keep a stable client_id if a send succeeds just before an interrupted write.
      item.part++; persist();
    }
    item.stage = 'done'; delete item.parts; delete item.text; delete item.contextToken;
    active.inbox = active.inbox.filter(row => row.stage !== 'done').concat(active.inbox.filter(row => row.stage === 'done').slice(-1000));
    persist();
  }
  async function processInbox(active, signal) {
    for (const item of [...active.inbox]) {
      signal.throwIfAborted();
      if (item.stage === 'queued') {
        item.stage = 'processing'; persist();
        try {
          const reply = item.unsupported ? '当前微信接入支持文字和微信已转写的语音。请发送文字；图片、文件和视频暂不处理。' :
            !item.text || item.text.length > 12000 ? '消息为空或超过 12000 字，请分段发送。' :
            await receive({ text: item.text, friendId: item.friendId, messageId: item.id, signal }, { readState, saveState });
          signal.throwIfAborted();
          item.parts = String(reply || '已处理。').match(/[\s\S]{1,1500}/gu) || ['已处理。'];
          item.part = 0; item.replyId = 'hc_' + randomUUID(); item.stage = 'replying'; persist();
        } catch (error) {
          item.stage = 'interrupted'; persist();
          if (signal.aborted) throw error;
          lastError = '有一条微信消息处理未完成。请在桌面查看执行结果后，再从微信重新发送。';
        }
      }
      if (item.stage === 'replying') await deliver(active, item, signal);
    }
  }
  async function monitor(active, signal) {
    let failures = 0;
    try { await client.notify(active, true, signal); } catch { /* lifecycle notice is best effort */ }
    while (!signal.aborted) {
      try {
        await processInbox(active, signal);
        const updates = await client.updates(active, signal);
        signal.throwIfAborted();
        if (!updates || !Array.isArray(updates.msgs || [])) throw Error('invalid updates');
        const known = new Set(active.inbox.map(item => item.id));
        for (const message of updates.msgs || []) {
          if (message.message_type !== 1 || message.from_user_id !== active.userId || message.group_id || !message.context_token) continue;
          const id = String(message.message_id || message.client_id || createHash('sha256').update(JSON.stringify(message)).digest('hex'));
          if (known.has(id)) continue;
          const items = Array.isArray(message.item_list) ? message.item_list : [];
          const text = items.map(item => item.type === 1 ? item.text_item?.text : item.type === 3 ? item.voice_item?.text : '').filter(Boolean).join('\n').trim();
          // Persist the whole batch before acknowledging its cursor, including not-yet-started messages.
          active.inbox.push({ id, text, contextToken: message.context_token, stage: 'queued', friendId: active.friendId,
            unsupported: items.some(item => ![1, 3].includes(item.type)) || !text });
          known.add(id); lastMessageAt = new Date().toISOString();
        }
        if (typeof updates.get_updates_buf === 'string' && updates.get_updates_buf) active.cursor = updates.get_updates_buf;
        persist(); failures = 0; lastError = ''; workerState = 'connected';
        await processInbox(active, signal);
        await wait(500, signal); // Also bound empty responses from a failing upstream.
      } catch (error) {
        if (signal.aborted) return;
        if (error.code === -14 || [401, 403].includes(error.code)) {
          active.enabled = false; persist(); workerState = 'expired'; lastError = '微信登录已失效，请先解除绑定，再重新扫码。'; return;
        }
        workerState = 'reconnecting'; lastError = '微信连接暂时中断，正在重试。待发送的回复会保留，不会重复执行任务。';
        try { await wait(Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)), signal); } catch { return; }
      }
    }
  }
  async function beginLogin(friendId) {
    if (!friends.ids.includes(friendId)) throw Object.assign(Error('请选择要在微信中对话的伙伴'), { status: 400 });
    if (loginPending || (login && !['expired', 'error'].includes(login.phase))) throw Object.assign(Error('正在等待扫码，请先取消当前绑定'), { status: 409 });
    if (account) throw Object.assign(Error('请先解除现有绑定，再绑定微信'), { status: 409 });
    loginPending = true;
    loginController?.abort(); const controller = new AbortController(); loginController = controller;
    try {
      const data = await client.qr(controller.signal);
      controller.signal.throwIfAborted();
      if (typeof data.qrcode !== 'string' || !data.qrcode || typeof data.qrcode_img_content !== 'string' || !data.qrcode_img_content || data.qrcode_img_content.length > 4096) throw Error('无法获取微信二维码，请重试');
      login = { qrcode: data.qrcode, qrImage: qrImage(data.qrcode_img_content), friendId, baseUrl: BASE_URL, phase: 'waiting',
        expiresAt: new Date(Date.now() + 5 * 60000).toISOString() };
      void pollLogin(login, controller.signal);
      return status();
    } finally { loginPending = false; }
  }
  async function pollLogin(session, signal) {
    try {
      while (!signal.aborted && login === session && Date.now() < Date.parse(session.expiresAt)) {
        if (session.phase === 'verify_code' && !session.verifyCode) { await wait(500, signal); continue; }
        let data;
        try { data = await client.qrStatus(session.qrcode, session.baseUrl, session.verifyCode, signal); }
        catch (error) { if (signal.aborted) return; session.error = '连接微信暂时失败，正在重试；也可以取消后重新扫码。'; await wait(2000, signal); continue; }
        signal.throwIfAborted(); if (login !== session) return;
        session.error = '';
        if (data.status === 'confirmed') {
          if (![data.bot_token, data.ilink_bot_id, data.ilink_user_id, data.baseurl].every(value => typeof value === 'string' && value)) throw Error('微信未返回完整的绑定信息，请重新扫码');
          account = { token: data.bot_token, botId: data.ilink_bot_id, userId: data.ilink_user_id, baseUrl: trustedBase(data.baseurl),
            friendId: session.friendId, enabled: true, cursor: '', inbox: [] };
          persist(); login = null; loadError = false; lastError = ''; start(); return;
        }
        if (data.status === 'expired') { session.phase = 'expired'; session.qrImage = ''; return; }
        if (data.status === 'verify_code_blocked') throw Error('验证码错误次数过多，请取消后重新扫码');
        if (data.status === 'binded_redirect') throw Error('微信已有绑定，但本机没有可用凭证。请在手机 ClawBot 中解除旧连接后重新扫码。');
        if (String(data.status).includes('need_verifycode')) { session.phase = 'verify_code'; session.verifyCode = ''; }
        else if (data.status === 'scaned') { session.phase = 'scanned'; session.verifyCode = ''; }
        else if (data.status === 'scaned_but_redirect') {
          session.baseUrl = trustedBase('https://' + data.redirect_host); session.phase = 'scanned';
        }
        await wait(500, signal);
      }
      if (!signal.aborted && login === session) { session.phase = 'expired'; session.qrImage = ''; }
    } catch (error) {
      if (!signal.aborted && login === session) { session.phase = 'error'; session.error = error.message; session.qrImage = ''; }
    }
  }
  async function cancelLogin() { loginController?.abort(); login = null; return status(); }
  async function configure({ enabled, friendId }) {
    if (!account) throw Object.assign(Error('请先扫码绑定微信'), { status: 400 });
    if (typeof enabled !== 'boolean' || !friends.ids.includes(friendId)) throw Object.assign(Error('微信连接配置无效'), { status: 400 });
    await stopWorker(); account.enabled = enabled; account.friendId = friendId; persist(); lastError = ''; start(); return status();
  }
  async function disconnect() {
    await cancelLogin(); await stopWorker();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    account = null; loadError = false; lastError = ''; workerState = 'disconnected'; return status();
  }
  function verifyCode(code) {
    if (!login || login.phase !== 'verify_code' || !/^\d{4,12}$/.test(String(code))) throw Object.assign(Error('请输入手机显示的 4–12 位数字验证码'), { status: 400 });
    login.verifyCode = String(code); login.phase = 'scanned'; return status();
  }
  async function stop() { await cancelLogin(); await stopWorker(); }
  return { status, start, stop, beginLogin, cancelLogin, verifyCode, configure, disconnect };
}
module.exports = { createWechatService };
