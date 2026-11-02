(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.chatProfile=api;})(globalThis,function(){
 const defaults=Object.freeze({assistantName:'知序',userName:'我',assistantAvatar:'/avatars/zhixu.png',userAvatar:'/avatars/user.png'});
 const userAvatarPresets=Object.freeze([{src:'/avatars/user.png',label:'原版 · 默认'},{src:'/avatars/user-blue.png',label:'蓝色'},{src:'/avatars/user-orange.png',label:'暖橙'},{src:'/avatars/user-green.png',label:'青绿'}]);
 const cleanName=(value,fallback)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,24)||fallback:fallback;
 function defaultsFor(settings={}){return settings.assistantFriendId==='luye'?{...defaults,assistantName:'枫言',assistantAvatar:'/avatars/luye.png'}:defaults;}
 function classicAvatar(settings={}){return defaultsFor(settings).assistantAvatar;}
 function assistantAvatarPresets(settings={}){const prefix=settings.assistantFriendId==='luye'?'luye':'zhixu';return [{src:'/avatars/'+prefix+'.png',label:'原版 · 默认'},{src:'/avatars/'+prefix+'-group1.png',label:'水墨'},{src:'/avatars/'+prefix+'-group2.png',label:'柔光'},{src:'/avatars/'+prefix+'-group3.png',label:'暖绘'}];}
 function avatar(value,role,settings={}){if(typeof value==='string'&&/^\/avatars\/(zhixu|luye|user)-classic\.png$/.test(value))value=value.replace('-classic.png','.png');const fallback=role==='user'?defaults.userAvatar:defaultsFor(settings).assistantAvatar;const presets=role==='user'?userAvatarPresets:[...assistantAvatarPresets(),...assistantAvatarPresets({assistantFriendId:'luye'})];if(value===fallback||presets.some(p=>p.src===value))return value;if(typeof value==='string'&&value.length<=260000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return value;return fallback;}
 function get(settings={}){return{assistantName:cleanName(settings.assistantFriendId==='luye'&&settings.assistantName==='陆野'?'枫言':settings.assistantName,defaultsFor(settings).assistantName),userName:cleanName(settings.userName,defaults.userName),assistantAvatar:avatar(settings.assistantAvatar,'assistant',settings),userAvatar:avatar(settings.userAvatar,'user')};}
 function normalize(settings){Object.assign(settings,get(settings));return settings;}
 return {defaults,defaultsFor,get,normalize,avatar,classicAvatar,userAvatarPresets,assistantAvatarPresets};
});
