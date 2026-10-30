const library=require('../frontend/stickers.js');const {searchOnlineStickers}=require('./online-stickers.cjs');
function chooseSticker(id) {const sticker=library.get(id);if(!sticker)throw new Error('表情包不存在，请先查找可用表情');return {...sticker};}
async function searchStickerCandidates(args,settings={}) {
  const local=()=>library.search(args.mood,args.animated);
  if(args.source==='local'||settings.onlineStickersEnabled===false)return {source:'local',stickers:local(),reason:settings.onlineStickersEnabled===false?'用户已关闭联网搜索':undefined};
  try {const stickers=await searchOnlineStickers(args);return {source:'online',provider:'ChineseBQB · 中文表情包',stickers};}
  catch {return {source:'local',fallback:true,warning:'联网动图搜索失败，返回内置表情；不得声称已从网上找到素材。',stickers:local()};}
}
module.exports={searchStickers:library.search,chooseSticker,searchStickerCandidates};
