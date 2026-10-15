// Visit the canonical list once; retain the singular field as a compatibility mirror.
function purchaseAttachmentSlots(order){
  const slots=[];
  if(order.orderAttachment)slots.push({attachment:order.orderAttachment,set:value=>{order.orderAttachment=value;}});
  if(Array.isArray(order.transferAttachments))order.transferAttachments.forEach((attachment,index)=>{
    if(attachment)slots.push({attachment,set:value=>{order.transferAttachments[index]={...value,attachmentId:attachment.attachmentId||attachment.id||`legacy-transfer-${index}`};}});
  });
  else if(order.transferAttachment)slots.push({attachment:order.transferAttachment,set:value=>{order.transferAttachment=value;}});
  return slots;
}
function mirrorTransferAttachment(order){if(Array.isArray(order.transferAttachments))order.transferAttachment=order.transferAttachments[0]||null;}
module.exports={purchaseAttachmentSlots,mirrorTransferAttachment};
