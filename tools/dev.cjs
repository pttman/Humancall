const { spawn } = require('node:child_process');
const path = require('node:path');
const children = ['backend/server.cjs', 'frontend/dev-server.cjs'].map(file => spawn(process.execPath, [path.resolve(__dirname, '..', file)], { stdio: 'inherit' }));
function stop() { for (const child of children) child.kill(); }
for (const child of children) child.on('exit', code => { stop(); process.exitCode = code || 0; });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
