// A screenshot compositor, not a generative image or a recreation of the UI.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/feature-overview-hd');fs.mkdirSync(out,{recursive:true});
app.commandLine.appendSwitch('force-device-scale-factor','3');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'humancall-overview-')));
require('../src/main.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),captures={};
app.whenReady().then(async()=>{try{
 if(process.argv.includes('--compose-only')){for(const [key,size] of Object.entries(JSON.parse(fs.readFileSync(path.join(out,'captures.json'),'utf8')))){captures[key]={...size,data:'data:image/png;base64,'+fs.readFileSync(path.join(out,key+'.png')).toString('base64')};}await writePoster();app.isQuitting=true;app.quit();return;}
 let win;for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows().find(w=>/index\.html$/.test(w.webContents.getURL())&&!w.webContents.isLoading());if(win&&await win.webContents.executeJavaScript('Boolean(window.calendarUI&&state.settings.workStart)'))break;await wait(100);}assert.ok(win,'App did not initialize');
 win.webContents.setBackgroundThrottling(false);win.webContents.setZoomFactor(1);win.showInactive();
 const js=async source=>{try{return await win.webContents.executeJavaScript(source);}catch(e){console.error(source);throw e;}};
 const settled=async target=>{await target.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;for(const image of document.images){image.loading='eager';await image.decode().catch(()=>{});}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);await wait(180);};
 async function viewport(width,height){win.setContentSize(width,height);await wait(200);const size=await js('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');assert.equal(size.width,width);assert.equal(size.height,height);assert.equal(size.dpr,3);}
 async function capture(name,target,rect){await settled(target);const image=await target.webContents.capturePage(rect),data=image.toPNG(),size=image.getSize();fs.writeFileSync(path.join(out,name+'.png'),data);const result={width:size.width,height:size.height,data:'data:image/png;base64,'+data.toString('base64')};captures[name]=result;console.log('Captured '+name+': '+size.width+'x'+size.height);return result;}
 async function element(name,selector,options={}){const box=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)};})()`);if(options.height)box.height=Math.min(box.height,options.height);return capture(name,win,box);}
 await viewport(1280,720);
 await js(`(async()=>{
  closeConfigReminder();closeSettings();const NativeDate=Date,clock=new NativeDate('2026-11-04T10:30:00+08:00').getTime();window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
  state.settings.apiKey='';state.settings.providerConfigs={};state.settings.notifications=false;state.settings.momentsEnabled=false;state.settings.stickersEnabled=false;state.settings.speech.enabled=false;state.settings.theme='pastel-mix';state.settings.quietUntil='';
  const at=(day,h=10)=>new Date(2026,10,day,h).toISOString();
  state.tasks=[{id:'report',title:'准备季度报告',status:'active',projectName:'产品迭代',estimatedMinutes:45,scheduledDate:'2026-11-04',recordedBy:'user'},{id:'review',title:'梳理项目需求',status:'planned',scheduledDate:'2026-11-04',recordedBy:'zhixu'},{id:'meeting',kind:'meeting',title:'产品评审会',startsAt:at(5,10),durationMinutes:60,status:'planned',projectName:'产品迭代',recordedBy:'user'}];
  state.reminders=[{id:'walk',title:'起来走一走',nextAt:at(4,16),enabled:true,repeat:'daily',recordedBy:'user'}];state.supervisionEvents=[];state.agentContext=null;
  const lines=[['user','今天准备季度报告，下午 3 点提醒我。'],['assistant','记下了。下午 3 点提醒你，先整理关键数据。'],['user','明天上午 10 点开产品评审会，预计一个小时。'],['assistant','好，会议记在明天 10:00–11:00。']];state.messages=lines.map(([role,content],i)=>({id:i===1?'voice-demo':'demo-'+i,role,content,createdAt:new Date(clock-120000+i*30000).toISOString()}));
  state.moments=[{id:'demo-moment',friendId:'zhixu',content:'给脑子留一点空白，灵感会自己冒出来。',createdAt:new Date(clock-600000).toISOString(),image:{id:'photo:ocean'}}];state.momentActivity={};await save();renderAll();window.companionUI.showChat();chatScroll.toLatest();document.activeElement?.blur();
 })()`);
 // Disable only screenshot-time transitions and caret blinking. App typography,
 // spacing, content, colors, and icons are captured without alteration.
 await win.webContents.insertCSS('*{animation:none!important;transition:none!important;caret-color:transparent!important}');
 await capture('main',win);
 await js(`document.querySelector('[data-message-id="voice-demo"]').scrollIntoView({block:'center'});document.activeElement?.blur();`);
 const voiceRect=await js(`(()=>{const r=document.querySelector('[data-message-id="voice-demo"]').getBoundingClientRect();return{x:Math.floor(r.x-8),y:Math.floor(r.y-9),width:Math.min(660,Math.floor(innerWidth-r.x)),height:Math.ceil(r.height+20)};})()`);await capture('voice',win,voiceRect);captures.voice.icon=await js(`(()=>{const r=document.querySelector('[data-speak-message="voice-demo"]').getBoundingClientRect();return{x:(r.x+r.width/2-${voiceRect.x})/${voiceRect.width},y:(r.y+r.height/2-${voiceRect.y})/${voiceRect.height}};})()`);
 await viewport(1280,880);await js('toggleTaskPanel(true);document.activeElement?.blur();');await element('tasks','#taskPanel');await js('toggleTaskPanel(false)');
 await viewport(940,900);await js(`$('#momentsNavButton').click();document.activeElement?.blur();`);await element('moments','#momentsView',{height:820});
 await js(`window.companionUI.showChat();$('.companion-user-rail').click();document.activeElement?.blur();`);await element('profile','#selfProfileModal .self-profile-card');await js('window.companionUI.closeSelf()');
 const bubble=BrowserWindow.getAllWindows().find(w=>/bubble\.html$/.test(w.webContents.getURL()));assert.ok(bubble);await bubble.webContents.executeJavaScript(`document.querySelector('#alertSound').muted=true`);
 await js(`window.humanDispatch.showBubble({title:'知序',body:'季度报告的关键数据整理好了吗？接下来先核对数据，还是补充结论？',friendId:'zhixu',taskId:'report',suppressAlertSound:true,quickActions:[{label:'先核对关键数据',message:'我先核对关键数据'},{label:'先补充结论',message:'我先补充结论'}]});`);await wait(550);
 const bubbleRect=await bubble.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.bubble-shell').getBoundingClientRect();return{x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)};})()`);await capture('reminder',bubble,bubbleRect);await js('window.humanDispatch.hideBubble()');
 // Capture the unblurred real month first, then the real day drawer separately.
 await viewport(1490,1110);await js(`$('#calendarNavButton').click();window.calendarUI.openDay('2026-11-04');window.calendarUI.closeDrawer();document.activeElement?.blur();`);
 const monthRect=await js(`(()=>{const a=document.querySelector('.calendar-month-row').getBoundingClientRect(),b=document.querySelector('.calendar-board').getBoundingClientRect();return{x:Math.floor(b.x),y:Math.floor(a.y-3),width:Math.ceil(b.width),height:Math.ceil(b.bottom-a.y+3)};})()`);await capture('month',win,monthRect);
 await viewport(1280,760);await js(`window.calendarUI.openDay('2026-11-04');document.activeElement?.blur();`);await element('day','.calendar-day-drawer');
 const dates=await js(`(()=>{const keys=[...document.querySelectorAll('[data-calendar-day]')].map(button=>button.dataset.calendarDay);return{count:keys.length,key:window.calendarUI.selectedDay,title:$('#calendarDayTitle').textContent,entries:$('#calendarDayList').children.length,column:keys.indexOf('2026-11-04')%7};})()`);assert.equal(dates.count,42);assert.equal(dates.key,'2026-11-04');assert.match(dates.title,/星期三/);assert.equal(dates.entries,3);assert.equal(dates.column,2);
 const dimensions=Object.fromEntries(Object.entries(captures).map(([k,v])=>[k,{width:v.width,height:v.height,...(v.icon?{icon:v.icon}:{})}]));fs.writeFileSync(path.join(out,'captures.json'),JSON.stringify(dimensions,null,2));
 await writePoster(dates);app.isQuitting=true;app.quit();
}catch(error){console.error(String(error.stack||error).slice(0,2000));app.isQuitting=true;app.exit(1);}});

async function writePoster(dates){
 const stage=new BrowserWindow({show:false,width:2000,height:1200,useContentSize:true,frame:false,backgroundColor:'#f0eef9',webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});
 stage.setContentSize(2000,1200);
 const html=compose(captures);fs.writeFileSync(path.join(out,'overview.html'),html);await stage.loadFile(path.join(out,'overview.html'));
 await stage.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);await wait(300);
 const image=await stage.webContents.capturePage(),size=image.getSize();assert.deepEqual(size,{width:6000,height:3600});
 const target=path.join(root,'docs/media/humancall-feature-overview.png');fs.writeFileSync(target,image.toPNG());
 fs.writeFileSync(path.join(out,'detail-100-percent.png'),image.crop({x:1725,y:2190,width:1500,height:650}).toPNG());
 const previous=fs.existsSync(path.join(out,'verification.json'))?JSON.parse(fs.readFileSync(path.join(out,'verification.json'),'utf8')):{};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({dimensions:size,source:'actual Electron UI screenshots',dates:dates||previous.dates,panels:Object.fromEntries(Object.entries(captures).map(([key,v])=>[key,{width:v.width,height:v.height}]))},null,2));
 console.log('Wrote lossless 6K overview: '+target);
}

function compose(shots){
 const voiceAnchor={x:760+520*(shots.voice.icon?.x||.12),y:1002+520*shots.voice.height/shots.voice.width*(shots.voice.icon?.y||.2)};
 const targets={main:1140,reminder:290,moments:300,profile:270,tasks:342,voice:520,month:356,day:234};for(const [key,width] of Object.entries(targets))assert.ok(width*3<=shots[key].width,'Screenshot must never be upscaled: '+key);
 const img=(key,style='')=>`<img src="${shots[key].data}" alt="${key}" style="${style}">`;
 const panel=(key,x,y,width,extra='')=>`<div class="shot ${key}" style="left:${x}px;top:${y}px;width:${width}px;${extra}">${img(key)}</div>`;
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
 *{box-sizing:border-box}html,body{margin:0;width:2000px;height:1200px;overflow:hidden}body{font-family:'Segoe UI','Microsoft YaHei',sans-serif;color:#25213e;background:radial-gradient(ellipse at 12% 18%,#dcd6f480,transparent 42%),radial-gradient(ellipse at 93% 45%,#d5e4f580,transparent 42%),radial-gradient(ellipse at 45% 95%,#dbd5ed80,transparent 52%),#f4f2fb}
 body:before{content:'';position:absolute;width:1600px;height:590px;border:1px solid #aca5cf28;border-radius:50%;transform:rotate(-14deg);left:-80px;top:380px}body:after{content:'';position:absolute;width:1350px;height:600px;left:600px;top:-360px;border:1px solid #aaa1d72b;border-radius:50%;transform:rotate(-12deg);z-index:-1}
 header{position:absolute;left:54px;top:34px;z-index:80}.brand{font-size:16px;letter-spacing:6px;font-weight:600;color:#7762b6}h1{font-size:54px;letter-spacing:3px;font-weight:650;margin:6px 0 9px;line-height:1.2}h1 small{font-size:16px;font-weight:500;letter-spacing:1px;vertical-align:middle;margin-left:14px;background:#e5def5;border:1px solid #cfc5ec;padding:6px 12px;border-radius:18px;color:#67548f}.tagline{font-size:18px;letter-spacing:1px;color:#655a80;margin:0}
 .shot{position:absolute;background:#f1eff8;border:1px solid #d5cdeb;border-radius:16px;box-shadow:0 12px 35px #5e4f8823,0 2px 5px #65518f16;overflow:hidden;line-height:0;z-index:20}.shot img{display:block;width:100%;height:auto}.main{z-index:10;border-radius:18px;border:2px solid #d8cfee;box-shadow:0 20px 55px #5d4a822a}.voice{z-index:50;border:2px solid #bdb0df;border-radius:16px;box-shadow:0 10px 28px #67519630}.calendar{position:absolute;left:1352px;top:734px;width:592px;height:408px;z-index:40;border:1px solid #cfc5e7;border-radius:15px;background:#f1eff8;overflow:hidden;box-shadow:0 14px 40px #5e4f8827;display:flex;align-items:flex-start;gap:0}.calendar .month{width:348px;height:auto;flex:none;margin-top:21px}.calendar .day{width:216px;height:auto;flex:none;border-left:1px solid #d5cceb}.calendar span{position:absolute;left:14px;bottom:15px;font-size:13px;line-height:1.8;letter-spacing:.4px;color:#6b617f}
 .label{position:absolute;z-index:90}.label h2{font-size:24px;line-height:1.3;margin:0 0 8px;font-weight:650;letter-spacing:.5px;white-space:nowrap}.label b{display:inline-block;margin-right:10px;padding:2px 10px;background:#e0d7f1;color:#68548e;border:1px solid #c9bce4;border-radius:18px;font-size:18px;font-weight:600;vertical-align:2px;letter-spacing:0}.label p{font-size:15px;color:#625576;margin:0;letter-spacing:.35px;white-space:nowrap}svg.leaders{position:absolute;inset:0;z-index:70;pointer-events:none}svg.leaders path{fill:none;stroke:#a28ecf;stroke-width:1.3}svg.leaders circle{fill:#9680c5;stroke:#f5f1fc;stroke-width:1.3}
 footer{position:absolute;right:55px;bottom:26px;font-size:19px;letter-spacing:2px;color:#60517c}footer i{display:inline-block;width:35px;border-top:1px solid #a994cc;vertical-align:middle;margin-right:15px}
 </style><header><div class="brand">HUMANCALL</div><h1>人类调度<small>功能一览</small></h1><p class="tagline">奔赴既定的安排，也接住偶然的瞬间</p></header>
 ${panel('main',250,545,1140)}${panel('reminder',322,220,290)}${panel('moments',650,130,300)}${panel('profile',994,98,270)}${panel('tasks',1320,150,342)}${panel('voice',760,1002,520)}
 <div class="calendar">${img('month','width:356px;height:auto;margin-top:31px;flex:none')}${img('day','width:234px;height:auto;border-left:1px solid #d5cceb;flex:none')}<span>月视图查看安排<br>点击日期，管理当天清单</span></div>
 <div class="label" style="left:55px;top:780px"><h2><b>01</b>主页面</h2><p>自然对话 · 双伙伴陪伴</p></div>
 <div class="label" style="left:1710px;top:250px"><h2><b>02</b>任务清单</h2><p>记待办 · 拆任务 · 跟进度</p></div>
 <div class="label" style="left:54px;top:240px"><h2><b>03</b>消息提醒</h2><p>到点提醒 · 弹窗直接回复</p></div>
 <div class="label" style="left:760px;top:1118px"><h2><b>04</b>语音回复</h2><p>自动朗读 · 手动重播 · 自选音色</p></div>
 <div class="label" style="left:652px;top:51px"><h2><b>05</b>瞬笺</h2><p>图文记录 · 留住片刻</p></div>
 <div class="label" style="left:997px;top:20px"><h2><b>06</b>个人信息</h2><p>昵称头像 · 今日统计</p></div>
 <div class="label" style="left:1410px;top:656px"><h2><b>07</b>日历</h2><p>按日查看 · 管理当天清单</p></div>
 <svg class="leaders" viewBox="0 0 2000 1200"><path d="M199 805H225Q242 805 250 822"/><circle cx="250" cy="822" r="4"/><path d="M1700 277H1676L1662 302"/><circle cx="1662" cy="302" r="4"/><path d="M236 263H286Q308 263 322 283"/><circle cx="322" cy="283" r="4"/><path d="M772 1110H736V990Q736 982 745 982H${voiceAnchor.x-8}Q${voiceAnchor.x} 982 ${voiceAnchor.x} 990V${voiceAnchor.y-8}"/><circle cx="${voiceAnchor.x}" cy="${voiceAnchor.y}" r="7" style="fill:none;stroke:#9279c4;stroke-width:1.7"/><path d="M677 119V130"/><circle cx="677" cy="130" r="4"/><path d="M1021 90V98"/><circle cx="1021" cy="98" r="4"/><path d="M1435 726V734"/><circle cx="1435" cy="734" r="4"/></svg>
 <footer><i></i>有路可奔赴，有片刻可栖</footer></html>`;
}
