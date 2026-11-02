(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.momentPhotos=api;})(globalThis,function(){
  // Fixed photographs only. Model output cannot supply an arbitrary image URL.
  const entries=[
    ['mountains','photo-1464822759023-fed622ff2c3b','层叠的山峰，远方、挑战、攀登、坚持'],
    ['ocean','photo-1471922694854-ff1b63b20054','海浪、日出与飞鸟，放空、自由、希望、松弛'],
    ['coffee','photo-1495474472287-4d71bcdd2085','三杯咖啡碰杯，朋友、陪伴、小憩、分享、灵感'],
    ['road','photo-1500534623283-312aade485b7','群山与落日，黄昏、收工、温暖、留白、远方'],
    ['peaks','photo-1515266591878-f93e32bc5937','俯瞰蓝色雪山与云雾，清醒、辽阔、距离、安静、思绪']
  ];
  const all=()=>entries.map(([id,photo,label])=>({id:'photo:'+id,provider:'photograph',label,animated:false,url:'/moment-photos/'+id+'.jpg',sourceUrl:'https://images.unsplash.com/'+photo}));
  const get=value=>all().find(p=>p.id===value?.id)||null;
  return {all,get};
});
