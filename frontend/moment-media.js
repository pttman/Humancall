(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./online-sticker.js').resolveSticker:root.resolveSticker);if(node)module.exports=api;else root.momentMedia=api;})(globalThis,function(resolve){
  function get(value){if(!value||typeof value!=='object'||!/^chinesebqb:[a-f0-9]{64}\.(gif|png|jpg|jpeg|webp)$/.test(value.id||''))return null;const result=resolve(value);return result?.provider==='chinesebqb'?result:null;}
  function normalize(value){const image=get(value);return image?{id:image.id,label:image.label,animated:image.animated}:null;}
  return{get,normalize};
});
