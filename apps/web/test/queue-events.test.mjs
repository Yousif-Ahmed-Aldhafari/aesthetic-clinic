import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queueEvents } from '../src/features/queue/live-events.ts';
import { RequestScope } from '../src/lib/request-scope.ts';
test('queue subscriptions use cookies, resynchronize on reconnect and ignore stale clinic events after cleanup',()=>{
  const original=globalThis.EventSource,streams=[];
  class FakeEvents {listeners=new Map();closed=false;constructor(url,options){this.url=url;this.options=options;streams.push(this);}addEventListener(name,fn){this.listeners.set(name,fn);}close(){this.closed=true;}emit(name){this.listeners.get(name)?.();}}
  globalThis.EventSource=FakeEvents;
  try{let a=0,b=0,ended=0;const closeA=queueEvents('clinics/clinic-a/queue/events',()=>a++,()=>{},()=>ended++);streams[0].onopen();streams[0].emit('resync');assert.equal(a,2);assert.equal(streams[0].options.withCredentials,true);assert.equal(streams[0].url,'/api/v1/clinics/clinic-a/queue/events');closeA();
    const closeB=queueEvents('clinics/clinic-b/queue/events',()=>b++,()=>{},()=>ended++);streams[0].emit('resync');streams[0].onopen();streams[0].emit('access-ended');assert.equal(a,2);assert.equal(ended,0);streams[1].onopen();streams[1].onopen();assert.equal(b,2);streams[1].emit('access-ended');streams[1].emit('resync');assert.equal(b,2);assert.equal(ended,1);assert(streams[0].closed&&streams[1].closed);closeB();
  }finally{globalThis.EventSource=original;}
});
test('late queue snapshots, call-next replies and transfer replies cannot repopulate a switched clinic',async()=>{
  for(const operation of ['snapshot','call-next','transfer']){const gate=new RequestScope(),request=gate.start();let release;const delayed=new Promise(r=>release=r);let visible='clinic-b';const pending=delayed.then(()=>{if(request.current())visible=`clinic-a-${operation}`;});gate.cancel();release();await pending;assert.equal(visible,'clinic-b');assert(request.signal.aborted);}
});
