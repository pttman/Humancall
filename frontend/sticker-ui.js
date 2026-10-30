(() => {
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');const paused=new Set();
  function create(value) {
    const sticker=window.resolveSticker(value);if(!sticker)return null;const id=sticker.id;
    const figure=document.createElement('figure');figure.className='chat-sticker';
    const image=document.createElement('img');image.width=96;image.height=96;image.alt=sticker.label+'表情包';image.decoding='async';image.referrerPolicy='no-referrer';
    const fallback=document.createElement('figcaption');fallback.textContent='['+sticker.label+']';fallback.hidden=true;
    let playing=sticker.animated&&!reduced.matches&&!paused.has(id);const button=document.createElement('button');button.type='button';button.className='sticker-animation-toggle';
    const update=()=>{image.src=playing?sticker.url:sticker.stillUrl;button.disabled=reduced.matches;button.textContent=reduced.matches?'静态显示':playing?'暂停动画':'播放动画';button.setAttribute('aria-label',button.textContent+'：'+sticker.label);button.setAttribute('aria-pressed',String(playing));};
    button.addEventListener('click',()=>{playing=!playing;if(playing)paused.delete(id);else paused.add(id);update();});
    image.addEventListener('error',()=>{image.hidden=true;fallback.hidden=false;button.hidden=true;});
    figure.append(image,fallback);if(sticker.animated)figure.append(button);
    if(sticker.provider){
      const credits=document.createElement('details');credits.className='sticker-source';const summary=document.createElement('summary');summary.textContent='来源';credits.append(summary);
      for(const [label,url]of [[sticker.attribution,sticker.sourceUrl],...(sticker.licenseUrl?[[sticker.license,sticker.licenseUrl]]:[]),['原图',sticker.url]]){
        const link=document.createElement('a');link.textContent=label;link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.addEventListener('click',event=>{if(window.humanDispatch?.openExternal){event.preventDefault();window.humanDispatch.openExternal(url).catch(()=>{});}});credits.append(link);
      }
      figure.append(credits);
    }
    update();return figure;
  }
  function mount(container,messages=[]) {container.querySelectorAll('[data-sticker-id],[data-sticker-index]').forEach(host=>{const value=host.hasAttribute('data-sticker-index')?messages[Number(host.dataset.stickerIndex)]?.sticker:host.dataset.stickerId;const item=create(value);host.replaceChildren(...(item?[item]:[]));});}
  window.stickerUI={create,mount};
})();
