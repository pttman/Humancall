(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.riceBook=api;})(globalThis,function(){
  const labels={chat:'日常回复与任务调度',check_in:'主动提醒',moment:'瞬笺',model_test:'模型连接测试',agent:'任务调度',reply:'日常回复',sticker:'表情筛选',moment_image:'瞬笺配图'};
  const valid=n=>Number.isSafeInteger(n)&&n>=0;
  function groups(records=[]){
    const map=new Map();
    for(const row of records){
      if(!row||typeof row.id!=='string')continue;
      const id=row.operationId||row.id;
      if(!map.has(id))map.set(id,{id,kind:row.kind,friendId:row.friendId,taskId:row.taskId,createdAt:row.createdAt,calls:[],total:0,unknown:0});
      const group=map.get(id);group.calls.push(row);if(valid(row.total))group.total+=row.total;else group.unknown++;
      if(row.createdAt<group.createdAt)group.createdAt=row.createdAt;
    }
    return [...map.values()];
  }
  function amount(total,unknown=0){return (unknown?'已知使用 ':'已使用 ')+total.toLocaleString('zh-CN')+' token'+(unknown?' · '+unknown+' 次用量未返回':'');}
  return {groups,amount,labels,valid};
});
