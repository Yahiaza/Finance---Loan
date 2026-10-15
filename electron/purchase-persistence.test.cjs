const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {purchaseAttachmentSlots,mirrorTransferAttachment}=require('./purchase-attachments.cjs');

test('SQLite reopening preserves partial status, paid amount and every transfer attachment',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'purchase-db-'));
  const actualRequire=createRequire(path.join(__dirname,'database.cjs'));
  const module={exports:{}};
  const app={getPath:()=>directory,getVersion:()=>'test'};
  // Background backup scheduling is outside this synchronous round-trip test.
  const context={module,exports:module.exports,process,console,Buffer,__dirname,setTimeout:()=>0,require:name=>name==='electron'?{app}:actualRequire(name)};
  let database;
  try{
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'database.cjs'),'utf8'),context);
    database=module.exports;await database.initialize();
    database.saveState({purchaseOrders:[{id:'partial',orderNumber:'P1',amount:'3000',status:'partial',paidAmount:'1250.50',transferAttachments:[{attachmentId:'a',fileName:'a.png'},{attachmentId:'b',fileName:'b.pdf'}]}]});
    database.close();
    const row=database.loadState().purchaseOrders[0];
    assert.equal(row.status,'partial');assert.equal(row.paidAmount,'1250.50');
    assert.deepEqual(Array.from(row.transferAttachments,x=>x.fileName),['a.png','b.pdf']);
  }finally{database?.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('attachment migration processes all transfers, keeps stable identities and mirrors the first',()=>{
  const order={orderAttachment:{name:'request.pdf'},transferAttachment:{name:'old-mirror.png'},transferAttachments:[{attachmentId:'a',name:'a.png'},{attachmentId:'b',name:'b.png'}]};
  const slots=purchaseAttachmentSlots(order);
  assert.equal(slots.length,3);
  slots.forEach(slot=>slot.set({name:slot.attachment.name,storage:'access',fileName:slot.attachment.name}));
  mirrorTransferAttachment(order);
  assert.deepEqual(order.transferAttachments.map(x=>x.attachmentId),['a','b']);
  assert.equal(order.transferAttachments[1].storage,'access');
  assert.equal(order.transferAttachment,order.transferAttachments[0]);
});
