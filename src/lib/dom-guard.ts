/**
 * Runs before React hydrates. Google Translate and some extensions move or replace
 * text nodes React rendered, and React's next update then calls removeChild or
 * insertBefore on a node that is no longer there, which crashes the whole page
 * ("Failed to execute 'removeChild' on 'Node'", Oct 15 on /). Skipping those calls
 * keeps the page working; the worst case is a stale bit of translated text.
 * Workaround from https://github.com/facebook/react/issues/11538.
 */
export const DOM_GUARD_SCRIPT = `(function(){
if(typeof Node!=="function"||!Node.prototype)return;
var remove=Node.prototype.removeChild;
Node.prototype.removeChild=function(child){
if(child.parentNode!==this)return child;
return remove.apply(this,arguments);
};
var insert=Node.prototype.insertBefore;
Node.prototype.insertBefore=function(node,ref){
if(ref&&ref.parentNode!==this)return node;
return insert.apply(this,arguments);
};
})();`;
