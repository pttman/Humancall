const fs = require('node:fs');
const path = require('node:path');
const core = require('./core.cjs');
function createStorageController({ initialDirectory, configPath, encoding = 'utf8' }) {
  let directory = path.resolve(initialDirectory);
  core.configureDataDirectory(directory);
  return {
    get: () => ({ directory }),
    set(value) {
      if (typeof value !== 'string' || !path.isAbsolute(value.trim())) throw new Error('请选择绝对路径的数据文件夹');
      const next = path.resolve(value.trim());
      if (next === directory) return { directory };
      fs.mkdirSync(next, { recursive: true });
      const target = path.join(next, 'human-dispatch-state.json');
      if (fs.existsSync(target)) throw new Error('目标文件夹已有应用数据，请选择空文件夹，以免覆盖已有数据');
      const probe = path.join(next, `.human-dispatch-write-${process.pid}`);
      fs.writeFileSync(probe, '', { flag: 'wx' }); fs.unlinkSync(probe);
      const source = path.join(directory, 'human-dispatch-state.json');
      let copied = false;
      try {
        if (fs.existsSync(source)) { fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL); copied = true; }
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        const temp = configPath + '.tmp'; fs.writeFileSync(temp, next, encoding); fs.renameSync(temp, configPath);
      } catch (error) { if (copied) fs.unlinkSync(target); throw error; }
      directory = next; core.configureDataDirectory(next);
      return { directory, migrated: true };
    }
  };
}
module.exports = { createStorageController };
