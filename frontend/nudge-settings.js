(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.nudgeSettings=api;})(globalThis,function(){
  const VERSION=1,DEFAULT_MINUTES=30;
  function normalize(raw={}){let minutes=Number(raw.passiveNudgeMinutes);if(!Number.isFinite(minutes)||minutes<5||(!raw.nudgeSettingsVersion&&minutes===10))minutes=DEFAULT_MINUTES;return {nudgeSettingsVersion:VERSION,passiveNudgeMinutes:Math.min(240,Math.max(5,minutes)),passiveNudgesEnabled:raw.passiveNudgesEnabled!==false};}
  return {VERSION,DEFAULT_MINUTES,normalize};
});
