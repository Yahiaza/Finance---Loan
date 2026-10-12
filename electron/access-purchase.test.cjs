const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const actualRequire=createRequire(path.join(__dirname,'access-client.cjs'));
const scope=require('./purchase-scope.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));

// Exercise the actual client and merge code, replacing only the external ACE driver.
function client(shared,purchaseOnly){
  const files=new Map();
  const configPath=path.join('/client','access-storage.json');
  files.set(configPath,JSON.stringify({enabled:true,databasePath:'/shared/finance.accdb'}));
  const fakeFs={readFileSync:file=>files.get(file),writeFileSync:(file,data)=>files.set(file,String(data)),existsSync:file=>file===path.resolve('/shared/finance.accdb')||files.has(file),mkdirSync:()=>{},renameSync:(from,to)=>{files.set(to,files.get(from));files.delete(from);},unlinkSync:file=>files.delete(file)};
  const execFile=(_command,args,_options,callback)=>{
    const input=args[args.indexOf('-InputPath')+1],output=args[args.indexOf('-OutputPath')+1];
    const payload=JSON.parse(files.get(input));
    let result;
    if(payload.action==='read')result={ok:true,revision:shared.revision,stateJson:JSON.stringify(shared.state)};
    else if(payload.action==='write'){
      if(payload.baseRevision!==shared.revision)result={ok:false,conflict:true,revision:shared.revision,stateJson:JSON.stringify(shared.state)};
      else {shared.state=JSON.parse(payload.stateJson);shared.revision++;result={ok:true,revision:shared.revision};}
    }else throw new Error('Unexpected driver action '+payload.action);
    files.set(output,JSON.stringify(result));callback(null,'','');
  };
  const module={exports:{}};
  const context={module,exports:module.exports,__dirname,process,Buffer,console,require:name=>name==='electron'?{app:{getPath:()=>'/client',isPackaged:false}}:name==='fs'?fakeFs:name==='child_process'?{execFile}:name==='./purchase-scope.cjs'?{...scope,purchaseOnly}:actualRequire(name)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'access-client.cjs'),'utf8'),context);
  return module.exports;
}
function initial(){return {state:{incomes:[{id:'i',amount:'500'}],banks:[{id:'b',balance:'100'}],purchaseOrders:[{id:'p',orderNumber:'P1',amount:'50',statement:'قديم'}],purchaseOrderDepartments:['الإدارة'],purchaseRequesters:['المحاسب']},revision:1};}

test('purchase client cannot alter non-purchase financial data',async()=>{
  const shared=initial(),app=client(shared,true);
  await app.loadState();
  const result=await app.saveState({incomes:[],banks:[],purchaseOrders:[{id:'p',orderNumber:'P1',amount:'75'}]});
  assert.equal(result.ok,true);
  assert.deepEqual(shared.state.incomes,[{id:'i',amount:'500'}]);
  assert.deepEqual(shared.state.banks,[{id:'b',balance:'100'}]);
  assert.equal(shared.state.purchaseOrders[0].amount,'75');
});

test('simultaneous full and purchase saves retain finance edits and both new requests',async()=>{
  const shared=initial(),full=client(shared,false),purchase=client(shared,true);
  const fullSnapshot=(await full.loadState()).state;
  const purchaseSnapshot=(await purchase.loadState()).state;
  fullSnapshot.incomes[0].amount='900';fullSnapshot.purchaseOrders.push({id:'full',orderNumber:'P2'});
  assert.equal((await full.saveState(fullSnapshot)).ok,true);
  purchaseSnapshot.purchaseOrders.push({id:'accountant',orderNumber:'P3',orderAttachment:{storage:'access',fileName:'image.png'}});
  assert.equal((await purchase.saveState(purchaseSnapshot)).ok,true);
  assert.equal(shared.state.incomes[0].amount,'900');
  assert.deepEqual(new Set(shared.state.purchaseOrders.map(row=>row.id)),new Set(['p','full','accountant']));
});

test('purchase polling merges local request changes with remote finance edits',async()=>{
  const shared=initial(),full=client(shared,false),purchase=client(shared,true);
  const fullSnapshot=(await full.loadState()).state;
  const local=scope.selectPurchaseState((await purchase.loadState()).state);
  fullSnapshot.banks[0].balance='700';await full.saveState(fullSnapshot);
  local.purchaseOrders[0].amount='85';
  assert.equal((await purchase.syncState(local)).ok,true);
  assert.equal(shared.state.banks[0].balance,'700');
  assert.equal(shared.state.purchaseOrders[0].amount,'85');
});

test('conflicting request edits report conflict instead of overwriting the other accountant',async()=>{
  const shared=initial(),a=client(shared,true),b=client(shared,true);
  const first=(await a.loadState()).state,second=(await b.loadState()).state;
  first.purchaseOrders[0].amount='90';await a.saveState(first);
  second.purchaseOrders[0].amount='120';const result=await b.saveState(second);
  assert.equal(result.ok,false);assert.equal(result.conflict,true);
  assert.equal(shared.state.purchaseOrders[0].amount,'90');
});
