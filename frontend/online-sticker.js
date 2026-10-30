(function(){
  function resolveSticker(value) {
    const localLibrary=typeof module==='object'&&module.exports?require('./stickers.js'):window.stickerLibrary;
    const id=typeof value==='string'?value:value?.id;
    const local=localLibrary.get(id);if(local)return local;
    const chinese=/^chinesebqb:([a-f0-9]{64})\.(gif|png|jpg|jpeg|webp)$/.exec(id||'');
    if(chinese&&typeof value==='object'){
      const [,hash,ext]=chinese;const base='https://zhaoolee.com/ChineseBQB/';const animated=ext==='gif'&&value.animated!==false;
      return {id,provider:'chinesebqb',animated,label:typeof value.label==='string'?value.label.slice(0,100):'中文表情包',url:base+'media/'+hash+'.'+ext,stillUrl:base+'thumbs/'+hash+'.webp',sourceUrl:'https://github.com/zhaoolee/ChineseBQB',attribution:'ChineseBQB · 中文表情包'};
    }
    // Older conversations can still display their previously selected Emoji.
    if(typeof value!=='object'||!/^noto:[a-f0-9]{4,6}(?:_[a-f0-9]{4,6}){0,8}$/.test(id || ''))return null;
    const codepoint=id.slice(5);
    return {id,provider:'noto',animated:true,label:typeof value.label==='string'?value.label.slice(0,100):'动态表情',url:'https://fonts.gstatic.com/s/e/notoemoji/latest/'+codepoint+'/512.gif',stillUrl:'https://fonts.gstatic.com/s/e/notoemoji/latest/'+codepoint+'/512.png',sourceUrl:'https://googlefonts.github.io/noto-emoji-files/',attribution:'Google Noto Emoji',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'};
  }
  if(typeof module==='object'&&module.exports)module.exports={resolveSticker};
  if(typeof window!=='undefined')window.resolveSticker=resolveSticker;
})();
