const MOODS=['acknowledge','encourage','celebrate','rest','comfort','curious'];
function family(id=''){return String(id).replace(/_1f3f[b-f]/g,'');}
function explicitRepeat(text=''){if(/不要|别再|不用|不想/.test(text))return false;return /同一张|同一个|再发一[次遍]|再来一次|重复发|刚[才刚].*那张|上一张/.test(text);}
function recentAssistantTurns(messages){
 const turns=new Map();for(let i=messages.length-1;i>=0;i--){const m=messages[i];if(m.role!=='assistant')continue;const id=m.replyToId||m.id||'legacy-'+i;if(!turns.has(id)&&turns.size>=3)break;const existing=turns.get(id)||{};turns.set(id,{...m,...existing,sticker:existing.sticker||m.sticker});}return [...turns.values()];
}
function stickerPolicy({settings,state,text,id}) {
  if(settings.stickersEnabled===false)return '用户关闭了表情包';
  if(/(?:不要|别|不用|停止)(?:再|给我)?(?:发|发送|用)?(?:表情|动图|贴纸)|(?:只|仅)(?:用|发)?文字/.test(text||''))return '用户本轮选择纯文字';
  const recent=recentAssistantTurns(state.messages||[]);
  const explicit=/表情包|贴纸|动图|发.*表情/.test(text||'')||explicitRepeat(text);
  const frequency=['lively','balanced','quiet'].includes(settings.stickerFrequency)?settings.stickerFrequency:'lively';
  if(!explicit && frequency==='balanced' && recent[0]?.sticker)return '适中频率：本轮先用文字回应';
  if(!explicit && frequency==='quiet' && recent.some(m=>m.sticker))return '少用频率：近期已有表情';
  if(id&&!explicitRepeat(text)&&recent.some(m=>m.sticker?.id&&family(m.sticker.id)===family(id)))return '近期发过同类表情，请换一张';
  return null;
}
async function automaticSticker({settings,state,text,finished,search,select,deadline=Infinity}) {
  if(!finished.stickerMood&&!finished.stickerQuery || finished.stickerMood==='none')return {sticker:null};
  const reason=stickerPolicy({settings,state,text});if(reason)return {sticker:null,reason};
  if(Date.now()+15000>deadline)return {sticker:null,reason:'保留回复时限，本轮先发文字'};
  const args={mood:finished.stickerMood,query:finished.stickerQuery,animated:true};
  let output=await search(args,settings);
  const eligible=items=>items.filter(s=>!stickerPolicy({settings,state,text,id:s.id})).slice(0,6);
  let candidates=eligible(output.stickers);
  if(!candidates.length&&finished.stickerQuery&&MOODS.includes(finished.stickerMood)&&Date.now()+15000<deadline){output=await search({mood:finished.stickerMood,animated:true},settings);candidates=eligible(output.stickers);}
  const sticker=candidates.length?(select?await select({userText:text,reply:finished.reply,candidates,mood:finished.stickerMood,deadline}):require('./sticker-selector.cjs').rankForReply({reply:finished.reply,mood:finished.stickerMood,candidates})):null;
  return {sticker:sticker?{...sticker}:null,source:output.source,fallback:output.fallback,reason:sticker?null:'没有找到合适且未重复的动图'};
}
module.exports={MOODS,family,stickerPolicy,automaticSticker,recentAssistantTurns};
