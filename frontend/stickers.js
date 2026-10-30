(function(root){
const catalog=Object.freeze([
  {
    "id": "got-it",
    "label": "收到",
    "mood": "acknowledge",
    "animated": false,
    "description": "确认收到安排、理解用户的信息",
    "url": "/stickers/got-it.svg",
    "stillUrl": "/stickers/got-it.svg"
  },
  {
    "id": "cheer",
    "label": "加油",
    "mood": "encourage",
    "animated": true,
    "description": "开始工作或需要一点鼓励时",
    "url": "/stickers/cheer.svg",
    "stillUrl": "/stickers/cheer-still.svg"
  },
  {
    "id": "done",
    "label": "搞定",
    "mood": "celebrate",
    "animated": false,
    "description": "实际完成任务后的轻松肯定",
    "url": "/stickers/done.svg",
    "stillUrl": "/stickers/done.svg"
  },
  {
    "id": "party",
    "label": "庆祝",
    "mood": "celebrate",
    "animated": true,
    "description": "用户明确完成工作、分享好消息时",
    "url": "/stickers/party.svg",
    "stillUrl": "/stickers/party-still.svg"
  },
  {
    "id": "rest",
    "label": "歇一会",
    "mood": "rest",
    "animated": true,
    "description": "安排休息、用户疲惫或需要放松时",
    "url": "/stickers/rest.svg",
    "stillUrl": "/stickers/rest-still.svg"
  },
  {
    "id": "comfort",
    "label": "慢慢来",
    "mood": "comfort",
    "animated": false,
    "description": "遇到困难或卡住时温和陪伴，严肃场景不玩笑",
    "url": "/stickers/comfort.svg",
    "stillUrl": "/stickers/comfort.svg"
  },
  {
    "id": "thinking",
    "label": "想一想",
    "mood": "curious",
    "animated": true,
    "description": "轻松讨论、需要补充细节时",
    "url": "/stickers/thinking.svg",
    "stillUrl": "/stickers/thinking-still.svg"
  },
  {
    "id": "thanks",
    "label": "谢谢",
    "mood": "acknowledge",
    "animated": false,
    "description": "感谢用户的配合或友好回应",
    "url": "/stickers/thanks.svg",
    "stillUrl": "/stickers/thanks.svg"
  }
].map(Object.freeze));
const get=id=>catalog.find(s=>s.id===id)||null;
const library={all:()=>catalog.slice(),get,search:(mood,animated)=>catalog.filter(s=>(!mood||s.mood===mood)&&(animated===undefined||s.animated===animated))};
if(typeof module==='object'&&module.exports)module.exports=library;
if(typeof window!=='undefined')window.stickerLibrary=library;
})(typeof globalThis!=='undefined'?globalThis:this);
