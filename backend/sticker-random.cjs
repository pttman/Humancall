function shuffled(items,random=Math.random){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
function chooseRandom(items,random=Math.random){return items.length?items[Math.floor(random()*items.length)]:null;}
module.exports={shuffled,chooseRandom};
