const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const core = require('./core.cjs');
const { runAgent, fingerprint } = require('./agent.cjs');
const { createSupervisor } = require('./supervisor.cjs');
const {searchOnlineStickers}=require('./online-stickers.cjs');
const { createStorageController } = require('./storage.cjs');
function loadEnv(file = path.join(__dirname, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
function validateState(value) {
  if (!value || !Array.isArray(value.tasks) || !Array.isArray(value.reminders) || !value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) throw Object.assign(new Error('数据格式不正确'), { status: 400 });
  return value;
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) throw Object.assign(new Error('请求超过 2 MB'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw Object.assign(new Error('JSON 格式不正确'), { status: 400 }); }
}
function createServer({ serveFrontend = true, storage, onStateSaved } = {}) {
  const saveState=value=>{const saved=core.writeState(value);onStateSaved?.(saved);return saved;};
  const checkIn = createSupervisor({readState:core.readState});
  return http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const origin = req.headers.origin;
      const allowed = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
      const sameOrigin = origin === `http://${req.headers.host}`;
      if (origin && origin !== allowed && !sameOrigin) return send(403, { error: '不允许的来源' });
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const url = new URL(req.url, 'http://localhost');
      const route = `${req.method} ${url.pathname}`;
      if (route === 'POST /api/ai/check-in') { const payload=await body(req); return send(200, await checkIn({taskId:payload.taskId,reason:payload.reason,force:payload.force === true})); }
      if (route === 'POST /api/stickers/search') {
        const payload=await body(req);const settings=core.readState().settings;
        if(settings.stickersEnabled===false||settings.onlineStickersEnabled===false)return send(400,{error:'请先在设置中开启表情包和联网搜索'});
        try{return send(200,{source:'online',stickers:await searchOnlineStickers({query:payload.query,mood:payload.mood,animated:payload.animated})});}catch{return send(502,{error:'暂时无法连接外部动图服务，请检查网络后重试'});}
      }
      if (route === 'GET /api/health') return send(200, { ok: true });
      if (route === 'GET /api/storage') return send(200, storage ? storage.get() : { directory: '', configurable: false });
      if (route === 'PUT /api/storage') {
        if (!storage) return send(403, { error: '此服务未启用数据目录设置' });
        const value = await body(req);
        try { return send(200, storage.set(value.directory)); } catch (error) { return send(400, { error: error.message }); }
      }
      if (route === 'GET /api/state') return send(200, core.readState());
      if (route === 'PUT /api/state') { const value = validateState(await body(req)); return send(200, saveState(value)); }
      if (route === 'GET /api/settings/prompts') return send(200, { defaultPrompt: core.DEFAULT_SYSTEM_PROMPT, tonePrompts: core.TONE_PROMPTS });
      if (route === 'GET /api/backup') { const snapshot = core.readState(); snapshot.settings = require('../frontend/model-presets.js').redact(snapshot.settings); return send(200, snapshot); }
      if (route === 'POST /api/backup') { const value = validateState(await body(req)); const state = core.normalizeImportedState(value, core.readState()); saveState(state); return send(200, { canceled: false, state }); }
      if (route === 'POST /api/ai/chat') {
        const payload = await body(req); const state = core.readState();
        const settings = { ...state.settings, ...(payload.settings || {}) };
        settings.apiKey = settings.apiKey || process.env.MODEL_API_KEY || '';
        if (process.env.MODEL_BASE_URL && !payload.settings) settings.baseUrl = process.env.MODEL_BASE_URL;
        if (process.env.MODEL_NAME && !payload.settings) settings.model = process.env.MODEL_NAME;
        if (typeof payload.text !== 'string' || payload.text.length > 12000 || (payload.messages !== undefined && !Array.isArray(payload.messages))) return send(400, { error: '消息格式不正确或过长' });
        if (settings.apiKey && (!payload.settings || payload.testAgent === true)) {
          const before = fingerprint(state);
          try {
            const result = await runAgent({ settings, text: payload.text, messages: payload.messages || state.messages, state, context:payload.context, mode:payload.testAgent===true?'connection_test':'chat' });
            const latest = core.readState();
            if (fingerprint(latest) !== before) return send(409, { error: '执行期间任务或设置已更改，本轮未提交，请重新发送' });
            const { draft, dirty, ...response } = result;
            if (payload.testAgent === true) return send(200, { ...response, actions: [], dryRun: true });
            if (dirty || result.contextDirty) {
              const committed = { ...latest, tasks:draft.tasks, reminders:draft.reminders, projects:draft.projects, supervisionEvents:draft.supervisionEvents, agentContext:draft.agentContext };
              const changed = new Set(result.actions.map(a => a.taskId).filter(Boolean));
              const next = committed.tasks.find(t => changed.has(t.id) && t.status === 'active' && !t.isContainer) || committed.tasks.find(t => t.status === 'active' && !t.isContainer);
              if (!result.question && result.followUpMinutes && next) {
                committed.supervisionEvents = committed.supervisionEvents.filter(e => e.taskId !== next.id || e.sent);
                committed.supervisionEvents.push({ id: result.agent.id, taskId:next.id, type:'check_in', scheduledAt:new Date(Date.now()+result.followUpMinutes*60000).toISOString(), sent:false, createdAt:new Date().toISOString() });
              }
              saveState(committed); response.state = committed; response.applied = true;
            }
            if (!response.applied) { response.state = latest; response.applied = true; }
            return send(200, response);
          } catch (error) { return send(502, { error: error.message + '；本轮未保存任何修改。请根据上述错误检查 API 配置，或稍后重试。' }); }
        }
        try { return send(200, { ...await core.callModel({ settings, messages: payload.messages || [], tasks: state.tasks, reminders: state.reminders }), source: 'model' }); }
        catch (error) { return send(200, { ...core.localFallback(payload.text, state.tasks), source: 'local', warning: error.message }); }
      }
      if (url.pathname.startsWith('/api/')) return send(404, { error: 'API 不存在' });
      if (!serveFrontend || req.method !== 'GET') return send(404, { error: '页面不存在' });
      const asset = url.pathname.startsWith('/assets/');
      const base = path.resolve(__dirname, asset ? '../assets' : '../frontend');
      const relative = decodeURIComponent(asset ? url.pathname.slice(8) : url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      const target = path.resolve(base, relative);
      if (!target.startsWith(base + path.sep) || !/\.(html|css|js|png|ico|mp3|gif|svg|webp)$/i.test(target)) return send(404, { error: '文件不存在' });
      const data = await fs.promises.readFile(target).catch(error => {
        if (asset && relative === 'notification.mp3' && process.resourcesPath) return fs.promises.readFile(path.join(process.resourcesPath, 'assets', 'notification.mp3'));
        throw error;
      });
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
    } catch (error) { send(error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.message }); }
  });
}
if (require.main === module) {
  loadEnv();
  const configPath = path.join(__dirname, 'data-directory.txt');
  const saved = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8').trim() : '';
  const storage = createStorageController({ initialDirectory: saved || path.resolve(__dirname, process.env.DATA_DIR || 'data'), configPath });
  const server = createServer({ storage });
  server.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => console.log(`后端已启动：http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createServer, loadEnv };
