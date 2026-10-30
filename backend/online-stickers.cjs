const {resolveSticker}=require('../frontend/online-sticker.js');
const CATALOG='https://zhaoolee.com/ChineseBQB/catalog/search.json';
const moods={acknowledge:['收到','好的','谢谢','点头'],encourage:['加油','鼓掌','厉害','你可以'],celebrate:['开心','鼓掌','庆祝','好耶'],rest:['摸鱼','睡觉','休息','下班'],comfort:['抱抱','辛苦','摸摸','安慰'],curious:['思考','疑问','问号','好奇']};
const aliases={clap:'鼓掌',clapping:'鼓掌',thumbsup:'厉害',ok:'好的',check:'收到',muscle:'加油',encouragement:'加油',encourage:'加油',congratulations:'庆祝',party:'开心',tada:'开心',confetti:'庆祝',sleep:'睡觉',sleepy:'睡觉',rest:'休息',hug:'抱抱',hugging:'抱抱',heart:'抱抱',thinking:'思考',curious:'好奇',cat:'猫',panda:'熊猫',thank:'谢谢',thanks:'谢谢',smile:'开心',joy:'开心','猫猫':'猫','熊猫头':'熊猫','金馆长':'熊猫','摸摸鱼':'摸鱼'};
function termsFor(query,mood){const text=String(query||'').toLowerCase();const words=text.match(/[a-z]+|[\u4e00-\u9fff]+/g)||[];const terms=words.map(w=>aliases[w]||w).filter(w=>!['表情','表情包','动图','gif','动态','中国','中文'].includes(w));return [...new Set(terms.length?terms:(moods[mood]||moods.celebrate))].slice(0,12);}
function networkFetch(...args){if(process.versions.electron){const net=require('electron').net;if(typeof net?.fetch==='function')return net.fetch(...args);}return fetch(...args);}
function createOnlineSearch({fetchImpl=networkFetch,now=Date.now}={}){
 let catalog=null,expires=0,inflight=null;const checks=new Map();
 async function loadCatalog(){
  if(catalog&&now()<expires)return catalog;if(inflight)return inflight;
  inflight=(async()=>{const res=await fetchImpl(CATALOG,{signal:AbortSignal.timeout(9000),redirect:'error'});if(!res.ok)throw Error('中文表情目录暂不可用（'+res.status+'）');const data=await res.json();if(!Array.isArray(data)||data.length>20000)throw Error('中文表情目录格式不正确');
   catalog=data.filter(i=>/^media\/[a-f0-9]{64}\.(gif|png|jpg|jpeg|webp)$/.test(i.src||'')&&typeof i.label==='string'&&typeof i.categoryTitle==='string'&&i.bytes>0&&i.bytes<=4*1024*1024).map(i=>({id:'chinesebqb:'+i.src.slice(6),label:i.label.slice(0,100),category:i.categoryTitle.slice(0,60),animated:i.animated===true,caption:i.label.replace(/^.*?\d{3,}[-_]?/,''),text:(i.label+' '+i.categoryTitle).toLowerCase()}));
   if(!catalog.length)throw Error('目录没有可用中文表情包');expires=now()+10*60000;return catalog;
  })();try{return await inflight;}finally{inflight=null;}
 }
 async function verify(sticker){const cached=checks.get(sticker.id);if(cached&&cached.until>now())return cached.ok;
  try{const res=await fetchImpl(sticker.url,{method:'HEAD',signal:AbortSignal.timeout(5000),redirect:'error'});const type=res.headers.get('content-type')?.split(';')[0];const size=Number(res.headers.get('content-length'));const ok=res.ok&&['image/gif','image/png','image/jpeg','image/webp'].includes(type)&&size>0&&size<=4*1024*1024;checks.set(sticker.id,{ok,until:now()+(ok?10*60000:15000)});return ok;}catch{return false;}
 }
 return async function search({query,mood,animated}={}){
  if(query!==undefined&&(typeof query!=='string'||query.trim().length>80))throw Error('表情搜索词应在 80 字以内');
  const terms=termsFor(query,mood);if(!terms.length)return [];const items=await loadCatalog();
  const candidates=items.map(item=>{const direct=terms.reduce((n,w)=>n+(item.caption.toLowerCase().includes(w)?12:item.text.includes(w)?4:0),0);return {...item,score:direct+(direct&&item.animated&&animated!==false?2:0)};}).filter(i=>i.score>0&&(animated!==false||!i.animated)).sort((a,b)=>b.score-a.score).slice(0,12);
  const found=[];for(let index=0;index<candidates.length&&found.length<6;index+=6){const valid=await Promise.all(candidates.slice(index,index+6).map(async item=>{const s=resolveSticker(item);return s&&await verify(s)?s:null;}));found.push(...valid.filter(Boolean));}
  if(candidates.length&&!found.length)throw Error('中文表情媒体暂不可用');return found.slice(0,6);
 };
}
const searchOnlineStickers=createOnlineSearch();module.exports={createOnlineSearch,searchOnlineStickers,termsFor};
