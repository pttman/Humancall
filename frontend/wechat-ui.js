(() => {
  const section = document.createElement('section');
  section.id = 'wechatSettings'; section.className = 'settings-section wechat-connect';
  section.innerHTML = `<div class="wechat-connect-heading"><div><div class="settings-section-title">微信接入</div><p class="settings-section-copy">在手机微信里记待办、查任务，接着和伙伴聊。</p></div><span id="wechatConnectionBadge" class="wechat-connection-badge">未绑定</span></div>
    <label>微信里的对话伙伴<select id="wechatFriendInput"><option value="zhixu">知序</option><option value="luye">枫言</option></select></label>
    <p class="settings-section-copy">微信与所选伙伴共用聊天记录、人物资料、任务和模型配置。切换桌面伙伴不会改变微信的选择；这里的连接操作立即生效。</p>
    <div class="wechat-connect-actions"><button type="button" id="wechatLoginButton" class="secondary">扫码绑定微信</button><button type="button" id="wechatCancelButton" class="secondary" hidden>取消绑定</button><button type="button" id="wechatToggleButton" class="secondary" hidden>暂停接收</button><button type="button" id="wechatDisconnectButton" class="text-button" hidden>解除绑定</button></div>
    <div id="wechatDisconnectConfirm" class="wechat-inline-confirm" hidden><p>解除后停止接收微信消息，并清除本机微信凭证与待发送回复。任务和聊天记录保留。手机 ClawBot 中的连接可再手动解除。</p><button type="button" id="wechatConfirmDisconnect" class="secondary">确认解除绑定</button><button type="button" id="wechatKeepConnection" class="text-button">保留连接</button></div>
    <div id="wechatQrPanel" class="wechat-qr-panel" hidden><img id="wechatQrImage" alt="用手机微信扫描此二维码绑定人类调度" width="240" height="240" /><p>用手机微信扫一扫，并按手机提示确认授权。二维码过期后可重新获取。</p></div>
    <div id="wechatCodePanel" class="wechat-code-panel" hidden><label>手机显示的验证码<input id="wechatVerifyCodeInput" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="输入手机显示的数字" /></label><button type="button" id="wechatVerifyButton" class="secondary">提交验证码</button></div>
    <p id="wechatConnectionStatus" class="form-status" role="status" aria-live="polite"></p>
    <details class="wechat-help" open><summary>接入说明与使用范围</summary><ol><li>在手机微信的「我 → 设置 → 插件」中开启 ClawBot；如没有入口，请更新微信并确认账号已开放此功能。</li><li>在上方选择伙伴，点击「扫码绑定微信」，用手机微信扫描本产品显示的二维码并确认授权。</li><li>显示「已连接」后，在手机 ClawBot 会话里发送文字，例如「帮我记下明天下午整理报告」。先发一句话验证回复，再查看桌面的任务和聊天记录。</li></ol>
    <p>电脑需要开机、联网，人类调度需要持续运行。无需公网 IP、域名或内网穿透；手机与电脑可以使用不同网络。退出或休眠期间无法实时处理消息，恢复运行后继续接收。</p>
    <p><strong>PC 微信支持情况：</strong>扫码在手机完成；PC 微信能否显示并使用 ClawBot 会话，取决于微信客户端支持，需实际验证。电脑上可继续使用人类调度自己的聊天窗口。</p>
    <p>本版接入支持文字对话和微信已转写的语音；图片、文件、视频、群聊暂不处理。删除和清空任务请在桌面窗口操作。本版不向微信主动推送定时提醒，提醒仍在桌面显示。</p>
    <p>只处理扫码绑定者发来的私聊消息。消息经微信服务传输，AI 回复使用本产品已保存的模型配置；微信登录凭证仅保存在本机，不随备份导出。请先保存模型设置，再开始聊天。</p>
    <p>连接中断时会自动重试；凭证失效时重新扫码。解除绑定后如仍提示已有连接，请先到手机 ClawBot 解除旧连接，再回来绑定。</p>
    <button type="button" id="wechatProtocolLink" class="text-button">查看腾讯通道说明 ↗</button></details>`;
  const container = $('#settingsForm .settings-scroll') || $('#settingsForm');
  const voice = container.querySelector('#speechSettings');
  if (voice) voice.after(section); else container.append(section);
  const phases = { disconnected: '未绑定', waiting: '等待扫码', scanned: '请在手机确认', verify_code: '需要验证码',
    connecting: '正在连接', connected: '已连接', reconnecting: '正在重连', paused: '已暂停', expired: '需要重新绑定', error: '连接异常' };
  let current = null, busy = false, refreshing = false, syncing = false, actionError = '';
  function show(value) {
    current = value;
    $('#wechatConnectionBadge').textContent = phases[value.phase] || '连接异常';
    $('#wechatConnectionBadge').classList.toggle('connected', value.phase === 'connected');
    const loggingIn = ['waiting', 'scanned', 'verify_code'].includes(value.phase);
    $('#wechatLoginButton').hidden = value.bound || loggingIn;
    $('#wechatLoginButton').textContent = ['expired', 'error'].includes(value.phase) ? '重新扫码绑定' : '扫码绑定微信';
    $('#wechatCancelButton').hidden = !loggingIn;
    $('#wechatToggleButton').hidden = !value.bound;
    $('#wechatToggleButton').textContent = value.enabled ? '暂停接收' : '启用接收';
    $('#wechatDisconnectButton').hidden = !value.bound;
    $('#wechatFriendInput').disabled = busy || loggingIn;
    for (const button of section.querySelectorAll('button:not(#wechatProtocolLink):not(#wechatKeepConnection)')) button.disabled = busy;
    if (value.bound && document.activeElement !== $('#wechatFriendInput')) $('#wechatFriendInput').value = value.friendId;
    if (!value.bound) $('#wechatDisconnectConfirm').hidden = true;
    const image = value.qrImage || '';
    $('#wechatQrPanel').hidden = !loggingIn || !/^data:image\/(gif|png);base64,/.test(image);
    if (!$('#wechatQrPanel').hidden) { if ($('#wechatQrImage').getAttribute('src') !== image) $('#wechatQrImage').src = image; }
    else $('#wechatQrImage').removeAttribute('src');
    $('#wechatCodePanel').hidden = !value.needsVerifyCode;
    const notes = [];
    if (actionError) notes.push(actionError);
    if (value.error) notes.push(value.error);
    if (value.interrupted) notes.push(value.interrupted + ' 条消息执行中断，未自动重复执行。请先查看桌面任务与聊天，再从微信重新发送。');
    if (value.pendingReplies) notes.push(value.pendingReplies + ' 条回复等待发送。');
    if (!notes.length) notes.push(value.phase === 'connected' ? '可以在手机微信的 ClawBot 会话里发消息了。' : loggingIn ? '请按手机提示完成绑定。' : value.bound ? '连接凭证已保存在本机，可启用接收。' : value.phase === 'expired' ? '二维码已过期，请重新扫码绑定。' : '首次使用请先阅读下方说明，再扫码绑定。');
    $('#wechatConnectionStatus').textContent = notes.join(' ');
    for (const option of $('#wechatFriendInput').options) option.textContent = window.friends.identity(state, option.value).assistantName;
  }
  async function action(operation) {
    if (busy) return;
    busy = true; actionError = ''; if (current) show(current);
    try { show(await operation()); }
    catch (error) { actionError = error.message; $('#wechatConnectionStatus').textContent = actionError; }
    finally { busy = false; if (current) show(current); }
  }
  async function refresh() {
    if (refreshing || busy) return;
    refreshing = true;
    try { show(await window.humanDispatch.wechatStatus()); }
    catch { $('#wechatConnectionStatus').textContent = '无法读取微信连接状态，请确认本地后端正在运行。'; }
    finally { refreshing = false; }
  }
  async function synchronize() {
    if (syncing || agentBusy || friendSwitching || chatClearing || !current?.bound) return;
    syncing = true;
    try {
      await stateSaveQueue;
      const revision = stateRevision, base = window.humanDispatch.stateBase();
      if (!base) return;
      const latest = await window.humanDispatch.loadState();
      if (revision !== stateRevision || agentBusy || friendSwitching || chatClearing) return;
      window.friends.normalize(state);
      const merged = window.stateMerge.shared(base, state, latest);
      if (JSON.stringify(window.stateMerge.baseOf(merged)) !== JSON.stringify(window.stateMerge.baseOf(state))) {
        Object.assign(state, merged); stateRevision++; renderAll();
      }
      window.humanDispatch.acceptState(latest);
    } catch { /* Keep the user's current view on transient backend failure. */ }
    finally { syncing = false; }
  }
  $('#wechatLoginButton').addEventListener('click', () => action(() => window.humanDispatch.wechatLogin($('#wechatFriendInput').value)));
  $('#wechatCancelButton').addEventListener('click', () => action(() => window.humanDispatch.wechatCancelLogin()));
  $('#wechatVerifyButton').addEventListener('click', () => action(async () => { const result = await window.humanDispatch.wechatVerifyCode($('#wechatVerifyCodeInput').value.trim()); $('#wechatVerifyCodeInput').value = ''; return result; }));
  $('#wechatVerifyCodeInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#wechatVerifyButton').click(); } });
  $('#wechatToggleButton').addEventListener('click', () => action(() => window.humanDispatch.wechatConfigure({ enabled: !current.enabled, friendId: current.friendId })));
  $('#wechatFriendInput').addEventListener('change', () => { if (current?.bound) action(() => window.humanDispatch.wechatConfigure({ enabled: current.enabled, friendId: $('#wechatFriendInput').value })); });
  $('#wechatDisconnectButton').addEventListener('click', () => { $('#wechatDisconnectConfirm').hidden = false; });
  $('#wechatKeepConnection').addEventListener('click', () => { $('#wechatDisconnectConfirm').hidden = true; });
  $('#wechatConfirmDisconnect').addEventListener('click', () => action(() => window.humanDispatch.wechatDisconnect()));
  $('#wechatProtocolLink').addEventListener('click', () => window.humanDispatch.openExternal('https://github.com/Tencent/openclaw-weixin'));
  window.wechatUI = { refresh, synchronize };
  void refresh();
  setInterval(async () => { await refresh(); await synchronize(); }, 2500);
})();
