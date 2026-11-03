// Runs a packaged desktop app on its native CI host, using only temporary data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { setTimeout: wait } = require('node:timers/promises');

async function debuggerClient(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  async function evaluate(expression) {
    const reply = await new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + expression.slice(0,160))); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails));
    return reply.result.value;
  }
  return { evaluate, close: () => socket.close() };
}

async function main() {
  assert.ok(['darwin','win32'].includes(process.platform), 'This check needs Windows or macOS');
  const windows=process.platform==='win32';
  const bundle = path.resolve(process.argv[2] || (windows?'release/win-unpacked/人类调度.exe':'release/mac-universal/人类调度.app'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'humancall-mac-smoke-'));
  const binary = windows?bundle:path.join(bundle, 'Contents/MacOS/人类调度');
  const child = spawn(binary, [...(windows?['--disable-gpu','--use-angle=swiftshader','--disable-renderer-backgrounding']:[]),'--user-data-dir=' + profile, '--inspect=127.0.0.1:19223', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=19222'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', renderer, native;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-12000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-12000); });
  child.on('error', error => { output += error.message; });
  try {
    let page;
    for (let attempt = 0; attempt < 180; attempt++) {
      if (child.exitCode !== null) throw Error('App exited: ' + output);
      try {
        const pages = await (await fetch('http://127.0.0.1:19222/json/list')).json();
        page = pages.find(item => /\/index\.html$/.test(item.url));
        if (page) break;
      } catch {}
      await wait(500);
    }
    assert.ok(page, 'Packaged frontend did not load: ' + output);
    console.log('Packaged frontend found: ' + page.url);
    renderer = await debuggerClient(page.webSocketDebuggerUrl);
    const evaluate = renderer.evaluate;
    for (let i = 0; i < 120; i++) {
      if (await evaluate('Boolean(window.friendsUI && window.recordsUI && window.momentUI && typeof state !== "undefined" && state.settings.workStart)')) break;
      await wait(250);
    }
    console.log('Renderer initialized, checking local API and UI');
    const result = await evaluate('(' + async function () {
      const check = (condition, message) => { if (!condition) throw Error(message); };
      check(window.friendsUI && window.recordsUI && window.momentUI, 'UI initialization');
      check(!state.settings.apiKey, 'Smoke check must not use a model key');
      closeConfigReminder();
      const storage = await window.humanDispatch.loadState();
      check(storage.settings && Array.isArray(storage.tasks), 'Local backend state API');
      check(await window.friendsUI.select('luye'), 'Switch to Lu Ye');
      check(document.querySelector('#assistantDisplayName').textContent === '枫言', 'Friend identity');
      check(await window.friendsUI.select('zhixu'), 'Switch back');
      const input = document.querySelector('#chatInput');
      input.focus(); input.value = 'Mac 输入测试'; input.dispatchEvent(new Event('input', { bubbles: true }));
      check(!input.disabled && input.value === 'Mac 输入测试', 'Composer');
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
      await openSettings();
      check(document.querySelector('#settingsForm .settings-scroll'), 'Settings layout');
      check(window.voiceUI && window.speechAudio && window.speechConfig, 'Bundled speech modules');
      check(window.speechAudio.LEAD_MS === 1000 && window.speechAudio.PART_LEAD_MS === 1000, 'Speech startup buffer');
      check(!state.settings.speech.enabled, 'Speech must default to disabled');
      check(document.querySelector('#speechVoice-zhixu').value === 'ICL_uranus_zh_female_lingdongxinxin_tob', 'Zhi Xu default voice');
      check(document.querySelector('#speechVoice-luye').value === 'zh_male_taocheng_uranus_bigtts', 'Feng Yan default voice');
      check(document.querySelector('.provider-card #testChatModelButton') && document.querySelector('#speechSettings #testVoiceModelButton'), 'Independent model test controls');
      check(!document.querySelector('#testConnectionButton') && document.querySelector('#cancelModelTestButton').hidden, 'Old global test removed and cancel initially hidden');
      check(document.querySelector('.sender-name [data-speak-message]'), 'Read-aloud speaker icon');
      const beforeProbe=JSON.stringify(await window.humanDispatch.loadState());
      const probe=await fetch('/api/models/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings:{}})});
      check(probe.status === 400 && (await probe.json()).error.includes('请填写大模型'), 'Bundled model test endpoint without upstream access');
      check(JSON.stringify(await window.humanDispatch.loadState()) === beforeProbe, 'Connection test must not mutate data');
      document.querySelector('#peopleCardsToggle').click();
      check(document.querySelectorAll('.settings-person-card').length === 2, 'Two friend cards');
      closeSettings();
      return { backend: true, friends: true, composer: true, settings: true, speechSettings: true, independentModelTests: true };
    }.toString() + ')()');
    console.log('Local API and UI passed: ' + JSON.stringify(result));
    const moments=await evaluate('('+require('./moments-ui-check.cjs').toString()+')()');
    console.log('Packaged moments regression passed: '+JSON.stringify(moments));
    // Exercise a native close, as the title-bar button does. window.close() from
    // renderer JavaScript follows a different Chromium teardown path.
    const nativeTargets = await (await fetch('http://127.0.0.1:19223/json/list')).json();
    native = await debuggerClient(nativeTargets[0].webSocketDebuggerUrl);
    const mainWindow = 'process.mainModule.require("electron").BrowserWindow.getAllWindows().find(w => /index\\.html$/.test(w.webContents.getURL()))';
    assert.equal(await native.evaluate('process.mainModule.require("electron").app.getVersion()'), require('../package.json').version);
    const notifications=await require('./notifications-check.cjs')({evaluate,nativeEvaluate:native.evaluate,mainWindow});
    console.log('Packaged notifications regression passed: '+JSON.stringify(notifications));
    await native.evaluate(mainWindow + '.close(); true');
    await wait(500);
    assert.equal(await native.evaluate(mainWindow + '.isVisible()'), false, 'Native close should hide the main window');
    if(windows)await native.evaluate(mainWindow+'.show(); '+mainWindow+'.focus(); true');
    else execFileSync('open', ['-a', bundle]);
    let visible = false;
    for (let i = 0; i < 30; i++) {
      if (await native.evaluate(mainWindow + '.isVisible()')) { visible = true; break; }
      await wait(200);
    }
    assert.ok(visible, 'Dock activation did not restore the main window');
    assert.equal(await evaluate('document.querySelector("#chatInput").disabled'), false, 'Composer after native close and activation');
    console.log('Packaged desktop smoke check passed: ' + JSON.stringify({ ...result, dockActivation: true, nativeArch: process.arch }));
  } catch (error) {
    console.error('App diagnostics: ' + output);
    throw error;
  } finally {
    renderer?.close();
    native?.close();
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(3000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await wait(500); }
    assert.ok(profile.startsWith(path.join(os.tmpdir(), 'humancall-mac-smoke-')));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
