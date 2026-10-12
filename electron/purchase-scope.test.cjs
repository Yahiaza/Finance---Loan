const test=require('node:test');
const assert=require('node:assert/strict');
const {restrictPurchaseWrite,selectPurchaseState,updateAssetPattern}=require('./purchase-scope.cjs');
test('purchase save preserves unrelated financial records even when missing or changed locally',()=>{
  const base={incomes:[{id:'income',amount:900}],banks:[{id:'bank',balance:500}],departments:['finance'],purchaseOrders:[{id:'old'}],futureField:{value:42}};
  const local={incomes:[],banks:[],departments:[],purchaseOrders:[{id:'new',orderAttachment:{fileName:'shared.png'}}]};
  assert.deepEqual(restrictPurchaseWrite(base,local),{...base,purchaseOrders:local.purchaseOrders});
});
test('purchase responses expose only the three purchase collections',()=>{
  assert.deepEqual(selectPurchaseState({incomes:[1],purchaseOrders:[2]}),{purchaseOrders:[2],purchaseOrderDepartments:[],purchaseRequesters:[]});
});
test('each edition accepts only its own updater executable',()=>{
  assert.equal(updateAssetPattern(true).test('Purchase-Orders-Portable-4.2.8-x64.exe'),true);
  assert.equal(updateAssetPattern(true).test('Financial-Reports-Portable-4.2.8-x64.exe'),false);
  assert.equal(updateAssetPattern(false).test('Purchase-Orders-Portable-4.2.8-x64.exe'),false);
});
