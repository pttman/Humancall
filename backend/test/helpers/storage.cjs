const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {after}=require('node:test');
const core=require('../../core.cjs');

// Each test-file worker needs its own receipts, including mocked model calls.
module.exports=function isolateStorage(name){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-'+name+'-'));
  core.configureDataDirectory(directory);
  after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  return directory;
};
