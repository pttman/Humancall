const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'humancall-wechat-ui-'));
app.setPath('userData', path.join(directory, 'electron'));
const core = require('../backend/core.cjs');
const { createServer } = require('../backend/server.cjs');
const { receiveWechatText } = require('../backend/wechat-conversation.cjs');
core.configureDataDirectory(path.join(directory, 'data'));
const pending = [], sent = [], errors = [];
let loginState = 'wait';
const client = {
  qr: async () => ({ qrcode: 'test-only-qr', qrcode_img_content: 'https://weixin.qq.com/test-only-no-real-login' }),
  qrStatus: async (qr, base, code, signal) => { await delay(60, undefined, { signal }); return { status: loginState,
    ...(loginState === 'confirmed' ? { bot_token: 'ui-test-private-token', ilink_bot_id: 'testbot', ilink_user_id: 'owner', baseurl: 'https://ilinkai.weixin.qq.com' } : {}) }; },
  updates: async (account, signal) => { await delay(80, undefined, { signal }); return { msgs: pending.splice(0), get_updates_buf: 'test-cursor' }; },
  send: async (account, message) => { sent.push(message); }, notify: async () => ({})
};
const server = createServer({ wechatOptions: { file: path.join(directory, 'wechat-connection.json'), client,
  wait: (ms, signal) => delay(Math.min(ms, 100), undefined, { signal }),
  receive: (input, options) => receiveWechatText(input, { ...options, chatImpl: async () => ({ reply: '已记下微信测试待办。', actions: [{ type: 'create_task', title: '微信测试待办', status: 'inbox' }] }) })
} });
app.whenReady().then(async () => {
  let window;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    window = new BrowserWindow({ width: 1180, height: 900, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    window.webContents.on('console-message', (event, level, message) => { if (level >= 3) errors.push(message); });
    await window.loadURL('http://127.0.0.1:' + server.address().port + '/index.html');
    window.showInactive();
    const evaluate = source => window.webContents.executeJavaScript(source);
    const until = async predicate => { for (let i = 0; i < 250; i++) { if (await predicate()) return; await delay(40); } throw Error('微信界面测试等待超时'); };
    await until(() => evaluate('Boolean(window.wechatUI && state.settings.workStart)'));
    await evaluate('(async()=>{closeConfigReminder();await openSettings();})()');
    assert.ok(await evaluate(`$('#wechatSettings').textContent.includes('PC 微信支持情况') && $('#wechatSettings').textContent.includes('应用新增的伙伴消息和定时提醒会自动推送')`));
    const out = path.join(__dirname, '../work/wechat-previews'); fs.mkdirSync(out, { recursive: true });
    await evaluate(`$('#settingsForm .settings-scroll').scrollTo({top:$('#wechatSettings').offsetTop-$('#settingsForm .settings-scroll').offsetTop,behavior:'instant'})`); await delay(350);
    fs.writeFileSync(path.join(out, 'wechat-settings.png'), (await window.webContents.capturePage()).toPNG());
    await evaluate(`$('#wechatFriendInput').value='luye';$('#wechatLoginButton').click()`);
    await until(() => evaluate(`!$('#wechatQrPanel').hidden && $('#wechatQrImage').naturalWidth>0`));
    await evaluate(`$('#settingsForm .settings-scroll').scrollTo({top:$('#wechatQrPanel').offsetTop-$('#settingsForm .settings-scroll').offsetTop-40,behavior:'instant'})`); await delay(350);
    fs.writeFileSync(path.join(out, 'wechat-qr.png'), (await window.webContents.capturePage()).toPNG());
    loginState = 'need_verifycode';
    await until(async () => { await evaluate('window.wechatUI.refresh()'); return evaluate(`!$('#wechatCodePanel').hidden`); });
    loginState = 'confirmed';
    await evaluate(`$('#wechatVerifyCodeInput').value='123456';$('#wechatVerifyButton').click()`);
    await until(async () => { await evaluate('window.wechatUI.refresh()'); return evaluate(`!$('#wechatToggleButton').hidden`); });
    assert.equal((await (await fetch('http://127.0.0.1:' + server.address().port + '/api/wechat')).json()).friendId, 'luye');
    await evaluate(`closeSettings();$('#chatInput').value='桌面尚未发送的草稿';$('#chatInput').focus();syncComposer()`);
    pending.push({ message_id: 'ui-message', from_user_id: 'owner', message_type: 1, context_token: 'private-context', item_list: [{ type: 1, text_item: { text: '添加测试待办' } }] });
    await until(() => sent.length === 1);
    await until(() => evaluate(`state.tasks.some(task=>task.title==='微信测试待办')`));
    assert.equal(await evaluate(`$('#chatInput').value`), '桌面尚未发送的草稿');
    assert.equal(await evaluate('state.activeFriendId'), 'zhixu');
    assert.equal(await evaluate(`state.friends.luye.messages.filter(message=>message.channel==='wechat').length`), 2);
    await evaluate(`(async()=>{appendMessage('assistant','桌面主动提醒测试','本地提醒',null,{id:'ui-proactive',kind:'reminder'});await save();})()`);
    await until(() => sent.some(message => message.item_list[0].text_item.text.includes('桌面主动提醒测试')));
    assert.equal(sent.filter(message => message.item_list[0].text_item.text.includes('已记下微信测试待办')).length, 1);
    await evaluate(`(async()=>{await window.friendsUI.select('luye');await openSettings();$('#wechatSettings').scrollIntoView({block:'start'});})()`);
    await evaluate(`$('#wechatToggleButton').click()`);
    await until(() => evaluate(`$('#wechatConnectionBadge').textContent==='已暂停'`));
    await evaluate(`$('#wechatToggleButton').click()`);
    await until(async () => { await evaluate('window.wechatUI.refresh()'); return evaluate(`$('#wechatConnectionBadge').textContent==='已连接'`); });
    window.setSize(520, 820);
    await evaluate(`$('#settingsForm .settings-scroll').scrollTo({top:$('#wechatSettings').offsetTop-$('#settingsForm .settings-scroll').offsetTop,behavior:'instant'})`); await delay(350);
    assert.ok(await evaluate(`$('#settingsForm .settings-scroll').scrollWidth <= $('#settingsForm .settings-scroll').clientWidth + 2`));
    fs.writeFileSync(path.join(out, 'wechat-settings-narrow.png'), (await window.webContents.capturePage()).toPNG());
    await evaluate(`$('#wechatDisconnectButton').click();$('#wechatConfirmDisconnect').click()`);
    await until(() => evaluate(`$('#wechatConnectionBadge').textContent==='未绑定'`));
    assert.equal(fs.existsSync(path.join(directory, 'wechat-connection.json')), false);
    assert.deepEqual(errors, []);
    console.log('WeChat settings, QR, PIN, partner routing, task/message sync, draft preservation, pause/resume, narrow layout and disconnect passed. Screenshots: ' + out);
    window.destroy(); await server.wechat.stop(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); app.quit();
  } catch (error) { console.error(error); await server.wechat.stop(); server.close(); window?.destroy(); app.exit(1); }
});
