const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPackage } = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const release = path.join(root, 'release');
const version = require('../package.json').version;
const portable = path.join(release, `人类调度-${version}-portable`);
const stamp = `${Date.now()}-${process.pid}`;
const staging = path.join(os.tmpdir(), `human-dispatch-stage-${stamp}`);

function copyTree(source, target, options = {}) {
  if (options.filter && !options.filter(source)) return;
  const info=fs.lstatSync(source);
  if (info.isSymbolicLink()) throw new Error('打包源文件中存在未支持的链接：'+source);
  if (!info.isDirectory()) { fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(source,target); return; }
  fs.mkdirSync(target,{recursive:true});
  for (const name of fs.readdirSync(source)) copyTree(path.join(source,name),path.join(target,name),options);
}
async function main() {
  if (!path.resolve(portable).startsWith(path.resolve(release) + path.sep) || !path.resolve(staging).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('打包临时路径不在预期目录内');
  fs.mkdirSync(release, { recursive: true });
  fs.rmSync(portable, { recursive: true, force: true });
  fs.mkdirSync(path.join(portable, 'resources', 'assets'), { recursive: true });
  fs.mkdirSync(staging, { recursive: true });
  copyTree(path.join(root, 'src'), path.join(staging, 'src'), { recursive: true });
  for (const name of ['frontend', 'backend']) copyTree(path.join(root, name), path.join(staging, name), { recursive: true, filter: (p) => !['data', 'test', '.env', 'data-directory.txt', 'data-directory.txt.tmp', 'wechat-connection.json', 'wechat-connection.json.tmp'].includes(path.basename(p)) && (!path.basename(p).startsWith('.env.') || path.basename(p) === '.env.example') });
  // This QR encoder has no runtime dependencies; include it in the offline asar too.
  copyTree(path.join(root, 'node_modules', 'qrcode-generator'), path.join(staging, 'node_modules', 'qrcode-generator'));
  copyTree(path.join(root, 'assets'), path.join(staging, 'assets'), { recursive: true });
  fs.rmSync(path.join(staging, 'assets', 'notification.mp3'), { force: true });
  fs.copyFileSync(path.join(root, 'package.json'), path.join(staging, 'package.json'));
  await createPackage(staging, path.join(portable, 'resources', 'app.asar'));
  fs.copyFileSync(path.join(root, 'assets', 'notification.mp3'), path.join(portable, 'resources', 'assets', 'notification.mp3'));
  copyTree(path.join(root, 'node_modules', 'electron', 'dist'), portable, { recursive: true });
  fs.renameSync(path.join(portable, 'electron.exe'), path.join(portable, '人类调度.exe'));
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`便携版已生成：${path.join(portable, '人类调度.exe')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
