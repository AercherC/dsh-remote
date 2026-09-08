/**
 * Chromium 95 兼容层。脚本由网关直接插到 HTML 的第一个页面脚本之前，
 * 因此不依赖 Android WebView 的 document-start 能力或回调时序。
 * 所有补丁均为“缺失才定义”，不会覆盖新内核的原生实现。
 */
export const LEGACY_WEBVIEW_POLYFILL = `<script data-dsh-legacy-webview-polyfill>
(function(){
  'use strict';
  var define=function(target,name,value){
    if(typeof target[name]!=='function')Object.defineProperty(target,name,{configurable:true,writable:true,value:value});
  };
  var ap=Array.prototype;
  define(ap,'findLast',function(callback,thisArg){
    if(this==null)throw new TypeError('Array.prototype.findLast called on null or undefined');
    if(typeof callback!=='function')throw new TypeError('callback must be a function');
    var object=Object(this),length=object.length>>>0;
    for(var i=length-1;i>=0;i--)if(callback.call(thisArg,object[i],i,object))return object[i];
  });
  define(ap,'findLastIndex',function(callback,thisArg){
    if(this==null)throw new TypeError('Array.prototype.findLastIndex called on null or undefined');
    if(typeof callback!=='function')throw new TypeError('callback must be a function');
    var object=Object(this),length=object.length>>>0;
    for(var i=length-1;i>=0;i--)if(callback.call(thisArg,object[i],i,object))return i;
    return -1;
  });
  if(typeof Promise==='function')define(Promise,'withResolvers',function(){
    var resolve,reject,PromiseCtor=typeof this==='function'?this:Promise;
    var promise=new PromiseCtor(function(res,rej){resolve=res;reject=rej;});
    return {promise:promise,resolve:resolve,reject:reject};
  });
  if(typeof AbortSignal==='function'&&typeof AbortController==='function'){
    define(AbortSignal,'any',function(signals){
      var list=Array.from(signals),controller=new AbortController(),listeners=[];
      var finish=function(signal){
        if(controller.signal.aborted)return;
        for(var j=0;j<listeners.length;j++)listeners[j][0].removeEventListener('abort',listeners[j][1]);
        try{controller.abort(signal.reason);}catch(_error){controller.abort();}
      };
      for(var i=0;i<list.length;i++){
        var signal=list[i];
        if(!signal||typeof signal.addEventListener!=='function')throw new TypeError('value is not an AbortSignal');
        if(signal.aborted){finish(signal);break;}
        (function(current){var listener=function(){finish(current);};listeners.push([current,listener]);current.addEventListener('abort',listener,{once:true});})(signal);
      }
      return controller.signal;
    });
    define(AbortSignal,'timeout',function(milliseconds){
      var delay=Number(milliseconds);
      if(!isFinite(delay)||delay<0)throw new RangeError('milliseconds must be a finite non-negative number');
      var controller=new AbortController();
      setTimeout(function(){
        var reason;
        try{reason=new DOMException('The operation timed out.','TimeoutError');}catch(_error){reason=new Error('The operation timed out.');reason.name='TimeoutError';}
        try{controller.abort(reason);}catch(_error2){controller.abort();}
      },delay);
      return controller.signal;
    });
    define(AbortSignal.prototype,'throwIfAborted',function(){if(this.aborted)throw this.reason;});
  }
  window.__dshLegacyWebViewPolyfill='gateway-v1';
})();
</script>`

/** 只改写完整 HTML 文档；找不到 head 时仍放在首个脚本之前。 */
export function injectLegacyWebViewPolyfill(html: string): string {
  if (html.includes('data-dsh-legacy-webview-polyfill')) return html
  const head = /<head(?:\s[^>]*)?>/i.exec(html)
  if (head !== null && head.index !== undefined) {
    const offset = head.index + head[0].length
    return `${html.slice(0, offset)}${LEGACY_WEBVIEW_POLYFILL}${html.slice(offset)}`
  }
  const script = /<script(?:\s|>)/i.exec(html)
  const offset = script?.index ?? 0
  return `${html.slice(0, offset)}${LEGACY_WEBVIEW_POLYFILL}${html.slice(offset)}`
}
