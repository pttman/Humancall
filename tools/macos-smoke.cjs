// Runs the built .app on the native macOS CI host, using only temporary data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { setTimeout: wait } = require('node:timers/promises');

async function main() {
  assert.equal(process.platform, 'darwin', 'This check needs a Mac');
  const bundle = path.resolve(process.argv[2] || 'release/mac-universal/人类调度.app');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'humancall-mac-smoke-'));
  const binary = path.join(bundle, 'Contents/MacOS/人类调度');
  const child = spawn(binary, ['--user-data-dir=' + profile, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=19222'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', socket;
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
    socket = new WebSocket(page.webSocketDebuggerUrl);
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
    function call(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method + ' ' + (params.expression || '').slice(0,160))); }, 20000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const reply = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails));
      return reply.result.value;
    }
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
      check(document.querySelector('#assistantDisplayName').textContent === '陆野', 'Friend identity');
      check(await window.friendsUI.select('zhixu'), 'Switch back');
      const input = document.querySelector('#chatInput');
      input.focus(); input.value = 'Mac 输入测试'; input.dispatchEvent(new Event('input', { bubbles: true }));
      check(!input.disabled && input.value === 'Mac 输入测试', 'Composer');
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
      await openSettings();
      check(document.querySelector('#settingsForm .settings-scroll'), 'Settings layout');
      document.querySelector('#peopleCardsToggle').click();
      check(document.querySelectorAll('.settings-person-card').length === 2, 'Two friend cards');
      closeSettings();
      return { backend: true, friends: true, composer: true, settings: true };
    }.toString() + ')()');
    console.log('Local API and UI passed: ' + JSON.stringify(result));
    // Defer close until the CDP evaluation has returned; close may suspend its caller.
    await evaluate('setTimeout(() => window.close(), 100); true');
    await wait(500);
    // A hidden macOS renderer can suspend CDP responses. Reactivate it before evaluating.
    execFileSync('open', ['-a', bundle]);
    let visible = false;
    for (let i = 0; i < 30; i++) {
      if (await evaluate('document.visibilityState') === 'visible') { visible = true; break; }
      await wait(200);
    }
    assert.ok(visible, 'Dock activation did not restore the main window');
    console.log('Packaged macOS smoke check passed: ' + JSON.stringify({ ...result, dockActivation: true, nativeArch: process.arch }));
  } catch (error) {
    console.error('App diagnostics: ' + output);
    throw error;
  } finally {
    socket?.close();
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(3000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await wait(500); }
    assert.ok(profile.startsWith(path.join(os.tmpdir(), 'humancall-mac-smoke-')));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
