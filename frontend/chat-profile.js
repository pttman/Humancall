(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.chatProfile=api;})(globalThis,function(){
 const defaults=Object.freeze({assistantName:'知序',userName:'我',assistantAvatar:'/avatars/zhixu.svg',userAvatar:'/avatars/user.svg'});
 const cleanName=(value,fallback)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,24)||fallback:fallback;
 function avatar(value,role){const fallback=role==='user'?defaults.userAvatar:defaults.assistantAvatar;if(value===fallback)return value;if(typeof value==='string'&&value.length<=260000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return value;return fallback;}
 function get(settings={}){return{assistantName:cleanName(settings.assistantName,defaults.assistantName),userName:cleanName(settings.userName,defaults.userName),assistantAvatar:avatar(settings.assistantAvatar,'assistant'),userAvatar:avatar(settings.userAvatar,'user')};}
 function normalize(settings){Object.assign(settings,get(settings));return settings;}
 return {defaults,get,normalize,avatar};
});
