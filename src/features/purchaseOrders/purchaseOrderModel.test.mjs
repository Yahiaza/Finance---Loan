import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentAmounts,purchaseTotals,purchaseStatus,transferAttachments,transferAttachmentPatch} from './purchaseOrderModel.mjs';
import {normalizeState} from '../../store/state.js';
import {formatAmountInput} from '../../utils/appUtils.js';

test('paid and remaining totals include partial payments rather than full request value',()=>{
  assert.deepEqual(purchaseTotals([{status:'spent',amount:'1,000'},{status:'partial',amount:'3,000',paidAmount:'1,250.50'},{status:'unspent',amount:'500'}]),{all:4500,spent:2250.5,unspent:2249.5,partial:1250.5});
  assert.deepEqual(paymentAmounts({status:'partial',amount:'1,000',paidAmount:'2,000'}),{total:1000,paid:1000,remaining:0});
  assert.equal(purchaseStatus('partial'),'partial');
  assert.equal(formatAmountInput('1250.50'),'1,250.50');
});
test('legacy transfer remains available when new transfers are added',()=>{
  const old={name:'old.png',path:'old.png'};
  const initial=transferAttachments({transferAttachment:old});
  const patch=transferAttachmentPatch([...initial,{name:'second.png',attachmentId:'second'}]);
  assert.deepEqual(transferAttachments(patch).map(x=>x.name),['old.png','second.png']);
  assert.equal(old.attachmentId,undefined);
  assert.deepEqual(transferAttachments(transferAttachmentPatch([])),[]);
});
test('normalization retains partial state and all transfer files across reload',()=>{
  const raw={purchaseOrders:[{id:'p',amount:'3,000',status:'partial',paidAmount:'1,250.50',transferAttachments:[{attachmentId:'a',name:'a.png'},{attachmentId:'b',name:'b.pdf'}]}]};
  const restored=normalizeState(normalizeState(raw)).purchaseOrders[0];
  assert.equal(restored.status,'partial');
  assert.equal(restored.paidAmount,'1,250.50');
  assert.equal(restored.transferAttachments.length,2);
});
