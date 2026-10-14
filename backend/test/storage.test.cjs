const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { createStorageController } = require('../storage.cjs'); const core = require('../core.cjs');
test('数据目录迁移保留旧数据、持久化选择、拒绝覆盖已有数据', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'humancall-storage-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const old = path.join(root, 'old'); const next = path.join(root, 'new'); const config = path.join(root, 'config.txt');
  const storage = createStorageController({ initialDirectory: old, configPath: config, encoding: 'utf16le' });
  const state = core.readState(); state.tasks.push({ id: 'test', title: '迁移任务' }); state.settings.apiKey = 'secret'; core.writeState(state);
  storage.set(next); assert.equal(core.readState().tasks[0].title, '迁移任务'); assert.equal(core.readState().settings.apiKey, 'secret');
  assert.equal(fs.readFileSync(config, 'utf16le'), next); assert.ok(fs.existsSync(path.join(old, 'human-dispatch-state.json')));
  assert.throws(() => storage.set(old), /已有应用数据/); assert.equal(storage.get().directory, next);
  assert.throws(() => storage.set('relative'), /绝对路径/);
  const restarted = createStorageController({ initialDirectory: fs.readFileSync(config, 'utf16le'), configPath: config }); assert.equal(restarted.get().directory, next);
});
