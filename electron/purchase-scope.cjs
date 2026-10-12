const keys=['purchaseOrders','purchaseOrderDepartments','purchaseRequesters'];
const purchaseOnly=require('../package.json').appVariant==='purchase';
function selectPurchaseState(state={}){return Object.fromEntries(keys.map(key=>[key,state[key]||[]]));}
function restrictPurchaseWrite(base={},local={}){
  const result={...base};
  for(const key of keys)if(Object.hasOwn(local,key))result[key]=local[key];
  return result;
}
function updateAssetPattern(purchase=purchaseOnly){return purchase?/^Purchase-Orders-Portable-[0-9A-Za-z._-]+\.exe$/i:/^Financial-Reports-Portable-[0-9A-Za-z._-]+\.exe$/i;}
function configurePurchaseStorage(app){
  const directory=require('node:path').join(app.getPath('appData'),'purchase-orders-manager');
  require('node:fs').mkdirSync(directory,{recursive:true});
  app.setName('purchase-orders-manager');
  app.setPath('userData',directory);
}
module.exports={purchaseOnly,selectPurchaseState,restrictPurchaseWrite,updateAssetPattern,configurePurchaseStorage};
