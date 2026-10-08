export function renameTransferDepartment(transfers,date,oldDepartment,newDepartment){
  const department=String(newDepartment||'').trim();
  if(!department)return transfers;
  return transfers.map(row=>row.date===date&&(!oldDepartment||row.department===oldDepartment)?{...row,department}:row);
}
