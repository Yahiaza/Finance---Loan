const {app,safeStorage}=require('electron');
const http=require('http');
const https=require('https');
const fs=require('fs');
const path=require('path');

let baseState=null;
let revision=null;
let remoteUser=null;
let operationQueue=Promise.resolve();

const configFile=()=>path.join(app.getPath('userData'),'central-server.json');
const readConfig=()=>{try{return JSON.parse(fs.readFileSync(configFile(),'utf8'))}catch{return {enabled:false,serverUrl:'',username:'',token:''}}};
const writeConfig=patch=>{const next={...readConfig(),...patch,updatedAt:new Date().toISOString()};fs.mkdirSync(path.dirname(configFile()),{recursive:true});const temp=`${configFile()}.tmp`;fs.writeFileSync(temp,JSON.stringify(next,null,2),'utf8');fs.renameSync(temp,configFile());return next;};
const normalizeUrl=value=>{const raw=String(value||'').trim().replace(/\/+$/,'');if(!raw)return '';const parsed=new URL(raw);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('عنوان السيرفر يجب أن يبدأ بـ http:// أو https:// بدون بيانات دخول داخله.');return parsed.toString().replace(/\/$/,'');};
const encodeToken=token=>{if(!token)return '';try{if(safeStorage.isEncryptionAvailable())return `safe:${safeStorage.encryptString(token).toString('base64')}`}catch{}return `plain:${Buffer.from(token,'utf8').toString('base64')}`;};
const decodeToken=value=>{try{const raw=String(value||'');if(raw.startsWith('safe:'))return safeStorage.decryptString(Buffer.from(raw.slice(5),'base64'));if(raw.startsWith('plain:'))return Buffer.from(raw.slice(6),'base64').toString('utf8');return ''}catch{return ''}};
const token=()=>decodeToken(readConfig().token);
const deepEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

function request(route,{method='GET',body=null,authenticated=true,binary=false,timeout=20000}={}){
  return new Promise((resolve,reject)=>{
    const settings=readConfig();
    if(!settings.serverUrl)return reject(new Error('لم يتم تحديد عنوان السيرفر.'));
    const target=new URL(route,`${settings.serverUrl}/`),client=target.protocol==='https:'?https:http;
    const payload=body===null?null:Buffer.from(JSON.stringify(body));
    const headers={'user-agent':'Financial-Reports-Manager/4','accept':binary?'*/*':'application/json'};
    if(payload){headers['content-type']='application/json';headers['content-length']=payload.length;}
    if(authenticated&&token())headers.authorization=`Bearer ${token()}`;
    const req=client.request(target,{method,headers,timeout},res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>60*1024*1024){req.destroy(new Error('استجابة السيرفر أكبر من الحد المسموح.'));return;}chunks.push(chunk);});
      res.on('end',()=>{
        const buffer=Buffer.concat(chunks);
        if(binary&&res.statusCode>=200&&res.statusCode<300)return resolve({ok:true,status:res.statusCode,buffer,headers:res.headers});
        let data={};try{data=buffer.length?JSON.parse(buffer.toString('utf8')):{}}catch{data={ok:false,error:`استجابة غير صالحة من السيرفر (HTTP ${res.statusCode}).`};}
        resolve({...data,status:res.statusCode,ok:Boolean(data.ok&&res.statusCode>=200&&res.statusCode<300)});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بالسيرفر.')));req.on('error',reject);if(payload)req.write(payload);req.end();
  });
}

function configure(serverUrl){
  const url=normalizeUrl(serverUrl),current=readConfig();
  const changed=url!==current.serverUrl;
  if(changed){baseState=null;revision=null;remoteUser=null;}
  return publicStatus(writeConfig({serverUrl:url,token:changed?'':current.token,username:changed?'':current.username,enabled:changed?false:current.enabled}));
}

async function health(){const result=await request('/api/health',{authenticated:false,timeout:8000});if(!result.ok)throw new Error(result.error||'تعذر الوصول إلى السيرفر.');return result;}
async function login(username,password){
  await health();
  const result=await request('/api/login',{method:'POST',authenticated:false,body:{username,password}});
  if(!result.ok)throw new Error(result.error||'تعذر تسجيل الدخول.');
  writeConfig({username:result.user.username,token:encodeToken(result.token)});remoteUser=result.user;return {ok:true,user:result.user,...publicStatus()};
}
const publicStatus=(source=readConfig())=>({enabled:Boolean(source.enabled),configured:Boolean(source.serverUrl),authenticated:Boolean(decodeToken(source.token)),serverUrl:source.serverUrl||'',username:source.username||'',user:remoteUser,revision});
function setEnabled(value){const cfg=writeConfig({enabled:Boolean(value)});if(!value){baseState=null;revision=null;}return publicStatus(cfg);}

async function fetchState(){
  const result=await request('/api/state');
  if(!result.ok)throw Object.assign(new Error(result.error||'تعذر تحميل بيانات السيرفر.'),{status:result.status});
  remoteUser=result.user||remoteUser;return result;
}
async function loadState(){const result=await fetchState();baseState=clone(result.state);revision=Number(result.revision);return {ok:true,state:clone(result.state),revision,user:remoteUser,updatedAt:result.updatedAt};}

function mergeRecord(base,local,remote,location,conflicts){
  const missing=value=>value===undefined;
  if(missing(base)){
    if(missing(local))return clone(remote);
    if(missing(remote))return clone(local);
  }
  if(missing(local)){
    if(deepEqual(remote,base))return undefined;
    conflicts.push(`${location}: حذف محلي مقابل تعديل من مستخدم آخر`);return clone(remote);
  }
  if(missing(remote)){
    if(deepEqual(local,base))return undefined;
    conflicts.push(`${location}: تعديل محلي مقابل حذف من مستخدم آخر`);return clone(local);
  }
  if(deepEqual(local,base))return clone(remote);
  if(deepEqual(remote,base)||deepEqual(local,remote))return clone(local);
  const output={};
  for(const key of new Set([...Object.keys(base||{}),...Object.keys(local||{}),...Object.keys(remote||{})])){
    const b=base?.[key],l=local?.[key],r=remote?.[key];
    if(deepEqual(l,b))output[key]=clone(r);
    else if(deepEqual(r,b)||deepEqual(l,r))output[key]=clone(l);
    else{conflicts.push(`${location}.${key}`);output[key]=clone(r);}
  }
  return output;
}

function mergeStates(base={},local={},remote={}){
  const conflicts=[],merged={};
  for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
    const b=base[key],l=local[key],r=remote[key];
    const recordArray=[b,l,r].filter(Array.isArray).some(arr=>arr.some(x=>x&&typeof x==='object'&&x.id));
    if(recordArray){
      const bm=new Map((b||[]).map(x=>[x.id,x])),lm=new Map((l||[]).map(x=>[x.id,x])),rm=new Map((r||[]).map(x=>[x.id,x])),rows=[];
      for(const id of new Set([...bm.keys(),...lm.keys(),...rm.keys()])){const value=mergeRecord(bm.get(id),lm.get(id),rm.get(id),`${key}[${id}]`,conflicts);if(value!==undefined)rows.push(value);}
      merged[key]=rows;
    }else if(deepEqual(l,b))merged[key]=clone(r);
    else if(deepEqual(r,b)||deepEqual(l,r))merged[key]=clone(l);
    else{conflicts.push(key);merged[key]=clone(r);}
  }
  return {state:merged,conflicts};
}

function saveConflict(local,remote,conflicts){
  const dir=path.join(app.getPath('userData'),'central-conflicts');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`conflict-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(file,JSON.stringify({createdAt:new Date().toISOString(),conflicts,local,remote},null,2),'utf8');return file;
}

async function put(state,baseRevision){return request('/api/state',{method:'PUT',body:{baseRevision,state},timeout:45000});}
async function saveState(localState){
  if(baseState===null||revision===null)await loadState();
  if(deepEqual(localState,baseState))return {ok:true,state:clone(baseState),revision,unchanged:true};
  let result=await put(localState,revision);
  if(result.ok){baseState=clone(localState);revision=Number(result.revision);return {ok:true,state:clone(localState),revision};}
  if(!result.conflict)throw new Error(result.error||'تعذر حفظ البيانات على السيرفر.');
  const merged=mergeStates(baseState,localState,result.state||{});
  if(merged.conflicts.length){const conflictPath=saveConflict(localState,result.state,merged.conflicts);baseState=clone(result.state);revision=Number(result.revision);return {ok:false,conflict:true,state:clone(result.state),conflicts:merged.conflicts,conflictPath};}
  result=await put(merged.state,Number(result.revision));
  if(!result.ok)throw new Error(result.error||'تغيرت البيانات مرة أخرى أثناء المزامنة. أعد المحاولة.');
  baseState=clone(merged.state);revision=Number(result.revision);return {ok:true,state:clone(merged.state),revision,merged:true};
}

async function syncState(localState){
  if(baseState===null||revision===null)return loadState();
  const remote=await fetchState();
  if(Number(remote.revision)===revision)return {ok:true,state:clone(localState),revision,unchanged:true};
  const merged=mergeStates(baseState,localState,remote.state||{});
  if(merged.conflicts.length){const conflictPath=saveConflict(localState,remote.state,merged.conflicts);baseState=clone(remote.state);revision=Number(remote.revision);return {ok:false,conflict:true,state:clone(remote.state),conflicts:merged.conflicts,conflictPath};}
  baseState=clone(remote.state);revision=Number(remote.revision);
  if(!deepEqual(merged.state,remote.state))return saveState(merged.state);
  return {ok:true,state:clone(remote.state),revision,changed:true};
}

const mimeFor=file=>({'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.extname(file).toLowerCase()]||'');
async function uploadFile(filePath,displayName){
  const mimeType=mimeFor(filePath);if(!mimeType)throw new Error('نوع المرفق غير مسموح.');
  const data=fs.readFileSync(filePath);if(data.length>25*1024*1024)throw new Error('حجم المرفق يجب ألا يتجاوز 25MB.');
  const result=await request('/api/attachments',{method:'POST',body:{name:displayName||path.basename(filePath),mimeType,dataBase64:data.toString('base64')},timeout:90000});
  if(!result.ok)throw new Error(result.error||'تعذر رفع المرفق إلى السيرفر.');return result.attachment;
}
async function migrateAttachments(state){
  const next=clone(state);
  for(const order of next.purchaseOrders||[]){
    for(const key of ['orderAttachment','transferAttachment']){
      const attachment=order[key];
      if(attachment?.remote&&attachment.id)continue;
      if(attachment?.path&&fs.existsSync(attachment.path))order[key]=await uploadFile(attachment.path,attachment.name);
    }
  }
  return next;
}
async function importState(localState){
  const current=await fetchState();
  if(Number(current.revision)!==0||Object.keys(current.state||{}).length)throw new Error('السيرفر يحتوي على بيانات بالفعل ولن يتم استبدالها تلقائيًا.');
  const prepared=await migrateAttachments(localState);
  const result=await request('/api/import',{method:'POST',body:{baseRevision:0,state:prepared},timeout:120000});
  if(!result.ok)throw new Error(result.error||'تعذر نقل بيانات SQLite إلى السيرفر.');
  baseState=clone(prepared);revision=Number(result.revision);setEnabled(true);return {ok:true,state:prepared,revision};
}

const serialize=operation=>{
  const task=operationQueue.then(operation,operation);
  operationQueue=task.catch(()=>{});
  return task;
};
async function downloadAttachment(id,name){
  const result=await request(`/api/attachments/${encodeURIComponent(id)}`,{binary:true,timeout:90000});
  if(!result.ok)throw new Error(result.error||'تعذر تنزيل المرفق.');
  const dir=path.join(app.getPath('temp'),'finance-central-attachments');fs.mkdirSync(dir,{recursive:true});
  const safe=String(name||id).replace(/[\\/:*?"<>|\x00-\x1f]+/g,'-');const file=path.join(dir,`${id}-${safe}`);fs.writeFileSync(file,result.buffer);return file;
}

module.exports={
  configure,health,login,publicStatus,setEnabled,uploadFile,downloadAttachment,readConfig,
  loadState:()=>serialize(loadState),
  saveState:state=>serialize(()=>saveState(state)),
  syncState:state=>serialize(()=>syncState(state)),
  importState:state=>serialize(()=>importState(state))
};
