const http=require('http');
const https=require('https');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {config}=require('./config.cjs');
const {pool,initialize}=require('./database.cjs');
const {normalizeUsername,verifyPassword,newToken,hashToken}=require('./security.cjs');

const MAX_JSON_BYTES=35*1024*1024;
const attempts=new Map();
const json=(res,status,value)=>{const body=Buffer.from(JSON.stringify(value));res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':body.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);};
const readJson=req=>new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>MAX_JSON_BYTES){reject(Object.assign(new Error('Request is too large'),{status:413}));req.destroy();return;}chunks.push(chunk);});req.on('end',()=>{try{resolve(chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{})}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}))}});req.on('error',reject);});
const safeName=value=>String(value||'file').replace(/[\\/:*?"<>|\x00-\x1f]+/g,'-').slice(0,140)||'file';
const stateCounts=state=>{const s=state||{};return {incomes:(s.incomes||[]).length,expenses:(s.expenses||[]).length,pending:(s.pending||[]).length,banks:(s.banks||[]).length,loans:(s.loans||[]).length,suppliers:(s.suppliers||[]).length,purchaseOrders:(s.purchaseOrders||[]).length};};

async function authenticate(req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)return null;
  const result=await pool.query(`SELECT u.id,u.username,u.display_name,u.role FROM finance_sessions s JOIN finance_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,[hashToken(token)]);
  if(!result.rows[0])return null;
  pool.query('UPDATE finance_sessions SET last_seen_at=now() WHERE token_hash=$1',[hashToken(token)]).catch(()=>{});
  return {...result.rows[0],token};
}

async function login(req,res){
  const ip=req.socket.remoteAddress||'unknown',record=attempts.get(ip)||{count:0,until:0};
  if(record.until>Date.now())return json(res,429,{ok:false,error:'محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.'});
  const body=await readJson(req),username=normalizeUsername(body.username);
  const result=await pool.query('SELECT * FROM finance_users WHERE username=$1 AND active=true',[username]);
  const user=result.rows[0];
  if(!user||!verifyPassword(body.password,user.password_salt,user.password_hash)){
    record.count+=1;if(record.count>=6){record.until=Date.now()+60000;record.count=0;}attempts.set(ip,record);
    return json(res,401,{ok:false,error:'اسم المستخدم أو كلمة المرور غير صحيحة.'});
  }
  attempts.delete(ip);
  const token=newToken();
  await pool.query('INSERT INTO finance_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'30 days\')',[hashToken(token),user.id]);
  return json(res,200,{ok:true,token,user:{id:user.id,username:user.username,displayName:user.display_name,role:user.role}});
}

async function getState(res,user){
  const result=await pool.query('SELECT revision,state,updated_at FROM finance_state WHERE id=1');
  const row=result.rows[0];
  json(res,200,{ok:true,revision:Number(row.revision),state:row.state||{},updatedAt:row.updated_at,user:{username:user.username,displayName:user.display_name,role:user.role}});
}

async function putState(req,res,user,action='save',preparedBody=null){
  if(user.role==='viewer')return json(res,403,{ok:false,error:'هذا المستخدم لديه صلاحية مشاهدة فقط.'});
  const body=preparedBody||await readJson(req);
  if(!body.state||typeof body.state!=='object'||Array.isArray(body.state))return json(res,400,{ok:false,error:'حالة البرنامج غير صالحة.'});
  const baseRevision=Number(body.baseRevision);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=(await client.query('SELECT revision,state FROM finance_state WHERE id=1 FOR UPDATE')).rows[0];
    if(Number(current.revision)!==baseRevision){await client.query('ROLLBACK');return json(res,409,{ok:false,conflict:true,revision:Number(current.revision),state:current.state||{}});}
    const revision=baseRevision+1;
    await client.query('UPDATE finance_state SET revision=$1,state=$2::jsonb,updated_at=now(),updated_by=$3 WHERE id=1',[revision,JSON.stringify(body.state),user.id]);
    await client.query('INSERT INTO finance_audit_log(revision,user_id,action,details) VALUES($1,$2,$3,$4::jsonb)',[revision,user.id,action,JSON.stringify(stateCounts(body.state))]);
    await client.query('COMMIT');
    json(res,200,{ok:true,revision,updatedAt:new Date().toISOString()});
  }catch(error){try{await client.query('ROLLBACK')}catch{};throw error;}finally{client.release();}
}

async function importState(req,res,user){
  if(user.role!=='admin')return json(res,403,{ok:false,error:'نقل قاعدة SQLite يتطلب حساب مدير.'});
  const body=await readJson(req);
  const current=(await pool.query('SELECT revision,state FROM finance_state WHERE id=1')).rows[0];
  if(Number(current.revision)!==0||Object.keys(current.state||{}).length)return json(res,409,{ok:false,error:'السيرفر يحتوي على بيانات بالفعل ولن يتم استبدالها تلقائيًا.'});
  return putState(req,res,user,'initial-sqlite-import',body);
}

async function uploadAttachment(req,res,user){
  if(user.role==='viewer')return json(res,403,{ok:false,error:'لا توجد صلاحية لإضافة مرفقات.'});
  const body=await readJson(req),data=String(body.dataBase64||'');
  if(!data)return json(res,400,{ok:false,error:'بيانات الملف غير موجودة.'});
  const buffer=Buffer.from(data,'base64');
  if(!buffer.length||buffer.length>25*1024*1024)return json(res,413,{ok:false,error:'حجم المرفق يجب ألا يتجاوز 25MB.'});
  const mime=String(body.mimeType||'application/octet-stream').slice(0,100);
  const allowed=new Set(['application/pdf','image/png','image/jpeg','image/webp']);
  if(!allowed.has(mime))return json(res,415,{ok:false,error:'يسمح فقط بصور PNG/JPG/WEBP أو ملفات PDF.'});
  const ext={'application/pdf':'.pdf','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[mime];
  const id=crypto.randomUUID(),stored=`${id}${ext}`,target=path.join(config.filesDir,stored),temp=`${target}.tmp`;
  fs.writeFileSync(temp,buffer,{flag:'wx'});fs.renameSync(temp,target);
  const original=safeName(body.name);
  await pool.query('INSERT INTO finance_attachments(id,original_name,stored_name,mime_type,size_bytes,uploaded_by) VALUES($1,$2,$3,$4,$5,$6)',[id,original,stored,mime,buffer.length,user.id]);
  json(res,201,{ok:true,attachment:{id,name:original,type:mime==='application/pdf'?'pdf':'image',mimeType:mime,size:buffer.length,remote:true,addedAt:new Date().toISOString()}});
}

async function downloadAttachment(res,user,id){
  const row=(await pool.query('SELECT * FROM finance_attachments WHERE id=$1',[id])).rows[0];
  if(!row)return json(res,404,{ok:false,error:'المرفق غير موجود.'});
  const file=path.join(config.filesDir,row.stored_name);
  if(!fs.existsSync(file))return json(res,404,{ok:false,error:'ملف المرفق غير موجود على السيرفر.'});
  res.writeHead(200,{'content-type':row.mime_type,'content-length':row.size_bytes,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,'cache-control':'private, no-store','x-content-type-options':'nosniff'});
  fs.createReadStream(file).pipe(res);
}

async function handler(req,res){
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,service:'finance-central-server',time:new Date().toISOString()});
    if(req.method==='POST'&&url.pathname==='/api/login')return login(req,res);
    const user=await authenticate(req);
    if(!user)return json(res,401,{ok:false,error:'يلزم تسجيل الدخول إلى السيرفر.'});
    if(req.method==='GET'&&url.pathname==='/api/me')return json(res,200,{ok:true,user:{username:user.username,displayName:user.display_name,role:user.role}});
    if(req.method==='GET'&&url.pathname==='/api/state')return getState(res,user);
    if(req.method==='PUT'&&url.pathname==='/api/state')return putState(req,res,user);
    if(req.method==='POST'&&url.pathname==='/api/import')return importState(req,res,user);
    if(req.method==='POST'&&url.pathname==='/api/attachments')return uploadAttachment(req,res,user);
    const attachmentMatch=url.pathname.match(/^\/api\/attachments\/([0-9a-f-]{36})$/i);
    if(req.method==='GET'&&attachmentMatch)return downloadAttachment(res,user,attachmentMatch[1]);
    json(res,404,{ok:false,error:'المسار غير موجود.'});
  }catch(error){console.error(error);if(!res.headersSent)json(res,error.status||500,{ok:false,error:error.status?error.message:'حدث خطأ داخلي في السيرفر.'});else res.destroy();}
}

initialize().then(()=>{
  const useTls=Boolean(config.tlsCert&&config.tlsKey);
  if(Boolean(config.tlsCert)!==Boolean(config.tlsKey))throw new Error('FINANCE_TLS_CERT and FINANCE_TLS_KEY must be configured together.');
  const server=useTls
    ?https.createServer({cert:fs.readFileSync(path.resolve(config.tlsCert)),key:fs.readFileSync(path.resolve(config.tlsKey))},handler)
    :http.createServer(handler);
  server.requestTimeout=45000;server.headersTimeout=20000;server.keepAliveTimeout=5000;
  server.listen(config.port,config.host,()=>console.log(`Finance central server listening on ${useTls?'https':'http'}://${config.host}:${config.port}`));
}).catch(error=>{console.error('Server startup failed:',error.message);process.exitCode=1;pool.end().catch(()=>{});});
