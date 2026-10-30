(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.chatProfile=api;})(globalThis,function(){
 const defaults=Object.freeze({assistantName:'知序',userName:'我',assistantAvatar:'/avatars/zhixu.png',userAvatar:'/avatars/user.png'});
 const cleanName=(value,fallback)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,24)||fallback:fallback;
 function defaultsFor(settings={}){return settings.assistantFriendId==='luye'?{...defaults,assistantName:'陆野',assistantAvatar:'/avatars/luye.png'}:defaults;}
 function avatar(value,role,settings={}){const fallback=role==='user'?defaults.userAvatar:defaultsFor(settings).assistantAvatar;if(value===fallback||(role!=='user'&&['/avatars/zhixu.png','/avatars/luye.png'].includes(value)))return value;if(typeof value==='string'&&value.length<=260000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return value;return fallback;}
 function get(settings={}){return{assistantName:cleanName(settings.assistantName,defaultsFor(settings).assistantName),userName:cleanName(settings.userName,defaults.userName),assistantAvatar:avatar(settings.assistantAvatar,'assistant',settings),userAvatar:avatar(settings.userAvatar,'user')};}
 function normalize(settings){Object.assign(settings,get(settings));return settings;}
 return {defaults,defaultsFor,get,normalize,avatar};
});
