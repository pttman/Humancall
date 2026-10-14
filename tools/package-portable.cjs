const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPackage } = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const release = path.join(root, 'release');
const portable = path.join(release, '人类调度-portable');
const stamp = `${Date.now()}-${process.pid}`;
const staging = path.join(os.tmpdir(), `human-dispatch-stage-${stamp}`);

async function main() {
  fs.mkdirSync(release, { recursive: true });
  fs.rmSync(portable, { recursive: true, force: true });
  fs.mkdirSync(path.join(portable, 'resources', 'assets'), { recursive: true });
  fs.mkdirSync(staging, { recursive: true });
  fs.cpSync(path.join(root, 'src'), path.join(staging, 'src'), { recursive: true });
  for (const name of ['frontend', 'backend']) fs.cpSync(path.join(root, name), path.join(staging, name), { recursive: true, filter: (p) => !['data', 'test', '.env'].includes(path.basename(p)) });
  fs.cpSync(path.join(root, 'assets'), path.join(staging, 'assets'), { recursive: true });
  fs.rmSync(path.join(staging, 'assets', 'notification.mp3'), { force: true });
  fs.copyFileSync(path.join(root, 'package.json'), path.join(staging, 'package.json'));
  await createPackage(staging, path.join(portable, 'resources', 'app.asar'));
  fs.copyFileSync(path.join(root, 'assets', 'notification.mp3'), path.join(portable, 'resources', 'assets', 'notification.mp3'));
  fs.cpSync(path.join(root, 'node_modules', 'electron', 'dist'), portable, { recursive: true });
  fs.renameSync(path.join(portable, 'electron.exe'), path.join(portable, '人类调度.exe'));
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`便携版已生成：${path.join(portable, '人类调度.exe')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
