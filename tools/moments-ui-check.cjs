// Runs in the renderer, both locally and against packaged release binaries.
module.exports = async function checkMomentsUI() {
  const check=(value,message)=>{if(!value)throw Error(message);};
  const original=structuredClone(state), NativeDate=Date;
  const at=new Date(2026,10,3,10).getTime();
  let clock=at;
  window.Date=class extends NativeDate {
    constructor(...args){super(...(args.length?args:[clock]));}
    static now(){return clock;}
  };
  try {
    await window.friendsUI.select('luye');
    state.moments=[
      {id:'zx-today',friendId:'zhixu',content:'知序今天的内容',createdAt:new Date(at-600000).toISOString()},
      {id:'fy-today',friendId:'luye',content:'枫言今天的内容',createdAt:new Date(at-300000).toISOString()},
      {id:'zx-old',friendId:'zhixu',content:'昨天的内容',createdAt:new Date(2026,10,2,23,59).toISOString()},
      {id:'zx-future',friendId:'zhixu',content:'未来的内容',createdAt:new Date(2026,10,4,10).toISOString()}
    ];
    state.messages=[{id:'notice',role:'assistant',kind:'moment',momentId:'zx-today',content:'知序今天的内容',createdAt:new Date(at-600000).toISOString()}];
    renderMessages();
    const notice=$('[data-message-id="notice"]');
    check(notice.querySelector('.sender-name').textContent.includes('知序'),'Moment notice author must come from the post');
    check(notice.querySelector('.avatar-image').getAttribute('src')==='/avatars/zhixu.png','Moment notice avatar');
    check(notice.querySelector('.moment-message-card span').textContent.includes('知序'),'Moment notice label');
    $('#momentsNavButton').click();
    check($('.moments-owner').hidden&&$('.moments-owner').getClientRects().length===0,'Shared feed must hide the entire owner card without leaving layout space');
    check(document.querySelectorAll('.moment-post').length===2,'Today excludes yesterday and future');
    check($('#moment-zx-today .moment-author').textContent==='知序','Zhixu author');
    check($('#moment-fy-today .moment-author').textContent==='枫言','Fengyan author');
    check($('#moment-zx-today .moment-post-avatar').dataset.friendId==='zhixu','Zhixu profile link');
    document.querySelector('[data-moment-person="zhixu"]').click();
    check(!$('.moments-owner').hidden&&$('#momentsOwnerName').textContent==='知序'&&!$('#momentsOwnerAvatar').hidden,'Filtered owner');
    document.querySelector('[data-moment-person="luye"]').click();check(!$('.moments-owner').hidden&&$('#momentsOwnerName').textContent==='枫言','Fengyan owner returns');
    document.querySelector('[data-moment-person="all"]').click();check($('.moments-owner').getClientRects().length===0,'Switching back to all hides the card again');
    document.querySelector('[data-moment-person="zhixu"]').click();
    check(document.querySelectorAll('.moment-post').length===1,'Friend filter');
    document.querySelector('[data-moment-period="all"]').click();
    check(Boolean($('#moment-zx-old'))&&!$('#moment-zx-future'),'Explicit history retains old posts and excludes future');
    window.companionUI.showChat();
    notice.querySelector('[data-open-moments]').click();
    check($('#momentsOwnerName').textContent==='知序','Opening notice follows the actual publisher');
    clock=new NativeDate(2026,10,4,0,1).getTime();
    window.companionUI.render();
    check(document.querySelectorAll('.moment-post').length===0,'Yesterday disappears when the calendar day changes');
    check($('#companionLatestMoment').textContent!=='枫言今天的内容','Profile preview cannot show yesterday as today');
    return {todayOnly:true,authorIdentity:true,history:true,midnight:true};
  } finally {
    window.Date=NativeDate;
    Object.assign(state,original);
    window.companionUI.showChat();
    await save();
    renderAll();
  }
};
