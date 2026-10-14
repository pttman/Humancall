const http = require('node:http');
const { createServer } = require('../backend/server.cjs');
const { loadEnv } = require('../backend/server.cjs');
loadEnv(require('node:path').join(__dirname, '.env'));
const staticServer = createServer();
const target = new URL(process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001');
const server = http.createServer((req, res) => {
  if (!req.url.startsWith('/api/')) return staticServer.emit('request', req, res);
  const proxy = http.request(new URL(req.url, target), { method: req.method, headers: { ...req.headers, host: target.host } }, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
  proxy.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '后端未启动，请启动后端服务' })); }); req.pipe(proxy);
});
server.listen(Number(process.env.FRONTEND_PORT || 5173), '127.0.0.1', () => console.log(`前端已启动：http://127.0.0.1:${server.address().port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
