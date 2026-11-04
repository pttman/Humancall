(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.stateMerge=api;})(globalThis,function(){
  const fields=['tasks','reminders','projects','supervisionEvents'],ids=['zhixu','luye'],copy=value=>value===undefined?undefined:structuredClone(value);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function value(base,incoming,latest){
    if(same(base,incoming))return copy(latest);
    if(base&&incoming&&latest&&typeof base==='object'&&typeof incoming==='object'&&typeof latest==='object'&&!Array.isArray(base)&&!Array.isArray(incoming)&&!Array.isArray(latest)){
      const result=copy(latest);for(const key of new Set([...Object.keys(base),...Object.keys(incoming)])){if(same(base[key],incoming[key]))continue;if(!Object.hasOwn(incoming,key))delete result[key];else result[key]=value(base[key],incoming[key],latest[key]);}return result;
    }
    return copy(incoming);
  }
  function records(base=[],incoming=[],latest=[]){
    const before=new Map(base.map(item=>[item.id,item])),after=new Map(incoming.map(item=>[item.id,item])),result=new Map(latest.map(item=>[item.id,copy(item)]));
    for(const id of before.keys())if(!after.has(id))result.delete(id);
    for(const [id,item]of after){if(!before.has(id))result.set(id,value(undefined,item,result.get(id)));else if(result.has(id))result.set(id,value(before.get(id),item,result.get(id)));}
    return [...result.values()];
  }
  function context(state,id,key){return (state.activeFriendId||'zhixu')===id?state[key]:state.friends?.[id]?.[key];}
  function baseOf(state){if(!state)return null;return {activeFriendId:state.activeFriendId,...Object.fromEntries(fields.map(key=>[key,copy(state[key]||[])])),agentContext:copy(state.agentContext),pendingConfirmation:copy(state.pendingConfirmation),friends:Object.fromEntries(ids.map(id=>[id,{agentContext:copy(context(state,id,'agentContext')),pendingConfirmation:copy(context(state,id,'pendingConfirmation'))}]))};}
  function shared(base,incoming,latest){
    if(!base)return incoming;const result={...incoming};for(const key of fields)result[key]=records(base[key],incoming[key],latest[key]);
    if(incoming.friends){result.friends=copy(incoming.friends);for(const id of ids){result.friends[id]||={};for(const key of ['agentContext','pendingConfirmation']){const merged=value(context(base,id,key),context(incoming,id,key),context(latest,id,key));result.friends[id][key]=merged;if((incoming.activeFriendId||'zhixu')===id)result[key]=merged;}}}
    return result;
  }
  return {baseOf,shared,records};
});
