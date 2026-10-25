// Only invalidations cross this channel; reconnect fetches a fresh REST snapshot.
export function queueEvents(path:string,resync:()=>void,connection:(connected:boolean)=>void,ended:()=>void){
  const source=new EventSource(`/api/v1/${path}`,{withCredentials:true});let active=true;
  const refresh=()=>{if(active)resync();};
  source.onopen=()=>{if(active){connection(true);refresh();}};
  source.addEventListener('resync',refresh);
  source.addEventListener('access-ended',()=>{if(active){active=false;connection(false);source.close();ended();}});
  source.addEventListener('reconnect',()=>{if(active)connection(false);});
  source.onerror=()=>{if(active)connection(false);};
  return ()=>{active=false;source.close();};
}
