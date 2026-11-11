export function buildTransferRegister(templates,transfers){
  const groups=new Map(templates.map(template=>[template.id,{...template,rows:[]}]));
  for(const row of transfers){
    let group=groups.get(row.templateId);
    if(!group){
      // Legacy data was saved as one group per date and department.
      const id='legacy:'+JSON.stringify([row.date,row.department]);
      if(!groups.has(id))groups.set(id,{id,name:'حوالات '+(row.department||'بدون قسم'),date:row.date,department:row.department,rows:[]});
      group=groups.get(id);
    }
    group.rows.push(row);
  }
  return [...groups.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

export function renameTemplateDepartment(templates,transfers,group,value){
  const department=value.trim();
  if(!department||department===group.department)return null;
  const {rows,...template}=group;
  const name=template.name==='حوالات '+(template.department||'بدون قسم')?'حوالات '+department:template.name;
  const updated={...template,name,department};
  const rowIds=new Set(rows.map(row=>row.id));
  return {
    supplierTransferTemplates:templates.some(x=>x.id===updated.id)?templates.map(x=>x.id===updated.id?updated:x):[...templates,updated],
    supplierTransfers:transfers.map(row=>rowIds.has(row.id)?{...row,department,templateId:updated.id}:row),
    supplierTransferDepartment:department
  };
}
