import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RequestScope } from '../src/features/patients/request-scope.ts';

test('late clinic A response is ignored after unmount and clinic B activation, even if transport ignores abort',async()=>{
  const a=new RequestScope(),b=new RequestScope(),visible=[];
  let finish;const delayed=new Promise(resolve=>{finish=resolve;});
  const first=a.start();const request=delayed.then(value=>{if(first.current())visible.push(value);});
  a.cancel();const second=b.start();if(second.current())visible.push('clinic B');finish('clinic A');await request;
  assert.equal(first.signal.aborted,true);assert.deepEqual(visible,['clinic B']);
});
test('out-of-order searches and closed profiles cannot repopulate visible patient data',()=>{
  const scope=new RequestScope(),old=scope.start(),recent=scope.start();assert(!old.current());assert(recent.current());scope.cancel();assert(!recent.current());assert(recent.signal.aborted);
});
test('a completed stale write cannot reopen a profile after switching clinics',async()=>{
  const scope=new RequestScope(),save=scope.start();const completed=Promise.resolve({fictional:'patient'});scope.cancel();let visible=null;await completed.then(p=>{if(save.current())visible=p;});assert.equal(visible,null);
});
