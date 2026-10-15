import {parseAmount} from '../../utils/appUtils.js';

export const purchaseStatus=value=>['spent','partial'].includes(value)?value:'unspent';
export const purchaseStatusLabel=value=>value==='spent'?'تم الصرف':value==='partial'?'سداد جزئي':'لم يتم الصرف';
export function transferAttachments(order){
  const items=Array.isArray(order.transferAttachments)?order.transferAttachments:(order.transferAttachment?[order.transferAttachment]:[]);
  return items.filter(x=>x&&typeof x==='object').map((x,i)=>({...x,attachmentId:x.attachmentId||x.id||x.fileName||`legacy-transfer-${i}`}));
}
export function transferAttachmentPatch(items){return {transferAttachments:items,transferAttachment:items[0]||null};}
export function paymentAmounts(order){
  const total=parseAmount(order.amount);
  const paid=order.status==='spent'?total:order.status==='partial'?Math.min(total,parseAmount(order.paidAmount)):0;
  return {total,paid,remaining:Math.max(0,total-paid)};
}
export function purchaseTotals(orders){
  return orders.reduce((sum,order)=>{
    const {total,paid,remaining}=paymentAmounts(order);
    return {all:sum.all+total,spent:sum.spent+paid,unspent:sum.unspent+remaining,partial:sum.partial+(order.status==='partial'?paid:0)};
  },{all:0,spent:0,unspent:0,partial:0});
}
