const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
for (const dir of ['src', 'frontend', 'backend', 'tools']) for (const name of fs.readdirSync(path.join(__dirname, '..', dir))) {
  if (!/\.(js|cjs)$/.test(name)) continue;
  const result = spawnSync(process.execPath, ['--check', path.join(__dirname, '..', dir, name)], { stdio: 'inherit' }); if (result.status) process.exit(result.status);
}
console.log('JavaScript 语法检查通过');
