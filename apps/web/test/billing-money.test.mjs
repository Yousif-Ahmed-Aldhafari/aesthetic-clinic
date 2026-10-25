import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decimal, formatMoney, preview } from '../src/features/billing/billing-money.ts';
import { RequestScope } from '../src/lib/request-scope.ts';
test('billing presentation preserves minor-unit digits for 0/2/3-scale currencies and large amounts',()=>{
  assert.equal(decimal('1005',3),'1.005');assert.equal(decimal('30',2),'0.30');assert.equal(decimal('15',0),'15');
  assert(formatMoney('999999999999999','KWD',3).endsWith('KWD'));assert(formatMoney('1005','KWD',3).includes('٠٠٥'));
});
test('billing preview uses exact quantity/discount/tax arithmetic and rejects excess precision',()=>{
  assert.equal(preview([{quantity:'2',unitPrice:'100',discount:'10',taxBasisPoints:500},{quantity:'1',unitPrice:'0.50',discount:'0',taxBasisPoints:0}],2),'20000');
  assert.equal(preview([{quantity:'1',unitPrice:'1.001',discount:'0',taxBasisPoints:0}],2),null);
});
test('late financial list/detail/payment results cannot repopulate a switched clinic',async()=>{
  const gates=[new RequestScope(),new RequestScope(),new RequestScope()];const tickets=gates.map(g=>g.start());gates.forEach(g=>g.cancel());const visible=[];await Promise.all(tickets.map(async(t,n)=>{const result=await Promise.resolve({clinic:'old',n});if(t.current())visible.push(result);}));assert.deepEqual(visible,[]);assert(tickets.every(t=>t.signal.aborted));
});
