const {app}=require('electron');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {execFile}=require('child_process');

let baseState=null;
let revision=null;
let connected=false;
let operationQueue=Promise.resolve();

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const deepEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const configFile=()=>path.join(app.getPath('userData'),'access-storage.json');
const readConfig=()=>{try{return JSON.parse(fs.readFileSync(configFile(),'utf8'))}catch{return {enabled:false,databasePath:''}}};
const writeConfig=patch=>{const next={...readConfig(),...patch,updatedAt:new Date().toISOString()};fs.mkdirSync(path.dirname(configFile()),{recursive:true});const temp=`${configFile()}.tmp`;fs.writeFileSync(temp,JSON.stringify(next,null,2),'utf8');fs.renameSync(temp,configFile());return next;};
const bridgePath=()=>app.isPackaged?path.join(process.resourcesPath,'access-bridge.ps1'):path.join(__dirname,'access-bridge.ps1');
const powershellPath=()=>path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const serialize=operation=>{const task=operationQueue.then(operation,operation);operationQueue=task.catch(()=>{});return task;};
const safeDatabasePath=(value,requireExists=true)=>{const full=path.resolve(String(value||''));if(path.extname(full).toLowerCase()!=='.accdb')throw new Error('اختر ملف Microsoft Access بامتداد .accdb.');if(requireExists&&!fs.existsSync(full))throw new Error('ملف Access المحدد غير موجود.');return full;};

function publicStatus(source=readConfig()){
  return {enabled:Boolean(source.enabled),configured:Boolean(source.databasePath),connected:Boolean(source.enabled&&connected),databasePath:source.databasePath||'',revision,lastBackupAt:source.lastBackupAt||null};
}

function runBridge(payload,timeout=60000){
  return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID(),input=path.join(app.getPath('temp'),`finance-access-${id}.input.json`),output=path.join(app.getPath('temp'),`finance-access-${id}.output.json`);
    fs.writeFileSync(input,JSON.stringify(payload),'utf8');
    execFile(powershellPath(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',bridgePath(),'-InputPath',input,'-OutputPath',output],{windowsHide:true,timeout,maxBuffer:1024*1024},(error,_stdout,stderr)=>{
      try{
        if(error&&!fs.existsSync(output))throw new Error(error.killed?'انتهت مهلة الاتصال بقاعدة Access.':String(stderr||error.message).trim());
        const result=JSON.parse(fs.readFileSync(output,'utf8'));
        if(!result.ok&&!result.conflict)throw new Error(result.error||'تعذر التعامل مع قاعدة Access.');
        resolve(result);
      }catch(problem){reject(problem)}finally{try{if(fs.existsSync(input))fs.unlinkSync(input)}catch{};try{if(fs.existsSync(output))fs.unlinkSync(output)}catch{}}
    });
  });
}

function parseState(result){
  try{return JSON.parse(result.stateJson||'{}')}catch{throw new Error('بيانات Access غير صالحة أو تالفة. أوقف الاستخدام واستعد نسخة احتياطية.');}
}

async function readPath(databasePath){
  const file=safeDatabasePath(databasePath);
  const result=await runBridge({action:'read',databasePath:file});
  connected=true;
  return {state:parseState(result),revision:Number(result.revision),updatedAt:result.updatedAt,databasePath:file};
}

async function loadState(){
  const cfg=readConfig();if(!cfg.databasePath)throw new Error('لم يتم اختيار ملف Access المشترك.');
  const result=await readPath(cfg.databasePath);baseState=clone(result.state);revision=result.revision;return {ok:true,...result};
}

function mergeRecord(base,local,remote,location,conflicts){
  const missing=value=>value===undefined;
  if(missing(base)){if(missing(local))return clone(remote);if(missing(remote))return clone(local);}
  if(missing(local)){if(deepEqual(remote,base))return undefined;conflicts.push(`${location}: حذف محلي مقابل تعديل من مستخدم آخر`);return clone(remote);}
  if(missing(remote)){if(deepEqual(local,base))return undefined;conflicts.push(`${location}: تعديل محلي مقابل حذف من مستخدم آخر`);return clone(local);}
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
    const recordArray=[b,l,r].filter(Array.isArray).some(rows=>rows.some(item=>item&&typeof item==='object'&&item.id));
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
  const dir=path.join(app.getPath('userData'),'access-conflicts');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`conflict-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(file,JSON.stringify({createdAt:new Date().toISOString(),conflicts,local,remote},null,2),'utf8');return file;
}

async function writeState(state,baseRevision){
  const cfg=readConfig();
  return runBridge({action:'write',databasePath:safeDatabasePath(cfg.databasePath),baseRevision,stateJson:JSON.stringify(state)},90000);
}

async function saveState(localState){
  if(baseState===null||revision===null)await loadState();
  if(deepEqual(localState,baseState))return {ok:true,state:clone(baseState),revision,unchanged:true};
  let result=await writeState(localState,revision);
  if(result.ok){baseState=clone(localState);revision=Number(result.revision);connected=true;return {ok:true,state:clone(localState),revision};}
  const remote=JSON.parse(result.stateJson||'{}'),merged=mergeStates(baseState,localState,remote);
  if(merged.conflicts.length){const conflictPath=saveConflict(localState,remote,merged.conflicts);baseState=clone(remote);revision=Number(result.revision);return {ok:false,conflict:true,state:remote,conflicts:merged.conflicts,conflictPath};}
  result=await writeState(merged.state,Number(result.revision));
  if(!result.ok)throw new Error('تغيرت البيانات مرة أخرى أثناء المزامنة. أعد المحاولة.');
  baseState=clone(merged.state);revision=Number(result.revision);connected=true;return {ok:true,state:clone(merged.state),revision,merged:true};
}

async function syncState(localState){
  if(baseState===null||revision===null)return loadState();
  const cfg=readConfig(),remoteResult=await readPath(cfg.databasePath);
  if(remoteResult.revision===revision)return {ok:true,state:clone(localState),revision,unchanged:true};
  const merged=mergeStates(baseState,localState,remoteResult.state);
  if(merged.conflicts.length){const conflictPath=saveConflict(localState,remoteResult.state,merged.conflicts);baseState=clone(remoteResult.state);revision=remoteResult.revision;return {ok:false,conflict:true,state:clone(remoteResult.state),conflicts:merged.conflicts,conflictPath};}
  baseState=clone(remoteResult.state);revision=remoteResult.revision;
  if(!deepEqual(merged.state,remoteResult.state))return saveState(merged.state);
  return {ok:true,state:clone(remoteResult.state),revision,changed:true};
}

function attachmentDirectory(databasePath=readConfig().databasePath){return path.join(path.dirname(safeDatabasePath(databasePath)),'finance-attachments');}
function copyAttachment(source,displayName){
  const directory=attachmentDirectory();fs.mkdirSync(directory,{recursive:true});
  const ext=path.extname(source).toLowerCase(),base=path.basename(displayName||source,ext).replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,70)||'attachment';
  const target=path.join(directory,`${Date.now()}-${crypto.randomUUID().slice(0,8)}-${base}${ext}`),temporary=`${target}.uploading`;fs.copyFileSync(source,temporary);fs.renameSync(temporary,target);
  return {name:path.basename(displayName||source),path:target,type:ext==='.pdf'?'pdf':'image',sharedAccess:true,addedAt:new Date().toISOString()};
}
function migrateAttachments(state){
  const next=clone(state);
  for(const order of next.purchaseOrders||[])for(const key of ['orderAttachment','transferAttachment']){const attachment=order[key];if(attachment?.path&&fs.existsSync(attachment.path)&&!attachment.sharedAccess)order[key]=copyAttachment(attachment.path,attachment.name);}
  return next;
}

async function migrate(localState,databasePath){
  const file=safeDatabasePath(databasePath,false),initialized=await runBridge({action:'initialize',databasePath:file,createIfMissing:true}),remote={state:parseState(initialized),revision:Number(initialized.revision),updatedAt:initialized.updatedAt,databasePath:file};connected=true;
  if(remote.revision!==0||Object.keys(remote.state||{}).length)throw new Error('قاعدة Access تحتوي على بيانات بالفعل ولن يتم استبدالها تلقائيًا.');
  writeConfig({databasePath:file,enabled:false});
  const prepared=migrateAttachments(localState),result=await runBridge({action:'write',databasePath:file,baseRevision:0,stateJson:JSON.stringify(prepared)},120000);
  if(!result.ok)throw new Error('بدأ جهاز آخر استخدام القاعدة أثناء النقل. لم يتم استبدال بياناته.');
  writeConfig({databasePath:file,enabled:true});baseState=clone(prepared);revision=Number(result.revision);connected=true;
  return {ok:true,state:prepared,revision,databasePath:file};
}

async function activate(databasePath){
  const file=safeDatabasePath(databasePath),remote=await readPath(file);
  if(remote.revision===0&&Object.keys(remote.state||{}).length===0)throw new Error('قاعدة Access فارغة. انقل بيانات الجهاز الرئيسي إليها أولًا.');
  writeConfig({databasePath:file,enabled:true});baseState=clone(remote.state);revision=remote.revision;connected=true;return {ok:true,...remote};
}

async function backup(destinationDirectory,daily=false){
  const cfg=readConfig(),now=new Date(),stamp=daily?now.toISOString().slice(0,10):now.toISOString().replace(/[:.]/g,'-'),target=path.join(destinationDirectory,daily?'access-daily':'access-manual',`finance-access-${stamp}.accdb`);
  if(fs.existsSync(target))return {ok:true,path:target,skipped:true,lastBackupAt:cfg.lastBackupAt||null};
  const result=await runBridge({action:'backup',databasePath:safeDatabasePath(cfg.databasePath),backupPath:target},120000);
  const sourceAttachments=attachmentDirectory(cfg.databasePath),attachmentsPath=path.join(path.dirname(target),`finance-attachments-${stamp}`);
  if(fs.existsSync(sourceAttachments)&&!fs.existsSync(attachmentsPath))fs.cpSync(sourceAttachments,attachmentsPath,{recursive:true,errorOnExist:true});
  const lastBackupAt=new Date().toISOString();writeConfig({lastBackupAt});return {...result,attachmentsPath:fs.existsSync(attachmentsPath)?attachmentsPath:null,lastBackupAt};
}

async function backupIfDue(destinationDirectory){
  const last=Date.parse(readConfig().lastBackupAt||'');
  if(Number.isFinite(last)&&Date.now()-last<20*60*60*1000)return {ok:true,skipped:true};
  return backup(destinationDirectory,true);
}

function setEnabled(value){const cfg=writeConfig({enabled:Boolean(value)});if(!value){baseState=null;revision=null;connected=false;}return publicStatus(cfg);}
function markDisconnected(){connected=false;return publicStatus();}

module.exports={
  publicStatus,setEnabled,markDisconnected,copyAttachment,readConfig,
  backup:directory=>serialize(()=>backup(directory,false)),backupIfDue:directory=>serialize(()=>backupIfDue(directory)),
  loadState:()=>serialize(loadState),saveState:state=>serialize(()=>saveState(state)),syncState:state=>serialize(()=>syncState(state)),
  migrate:(state,file)=>serialize(()=>migrate(state,file)),activate:file=>serialize(()=>activate(file))
};
