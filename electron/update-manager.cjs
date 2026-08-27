const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');

let latestUpdateInfo = null;
let downloadedUpdatePath = '';

const settingsPath = () => path.join(app.getPath('userData'), 'update-settings.json');
const defaults = { owner:'', repo:'Financial-Reports-Manager', autoCheck:true };

function readSettings(){
  try{
    if(!fs.existsSync(settingsPath())) return {...defaults};
    const parsed=JSON.parse(fs.readFileSync(settingsPath(),'utf8'));
    return {...defaults,...parsed,autoCheck:parsed?.autoCheck!==false};
  }catch{return {...defaults};}
}
function saveSettings(value={}){
  const next={...readSettings(),...value};
  next.owner=String(next.owner||'').trim();
  next.repo=String(next.repo||'').trim();
  next.autoCheck=next.autoCheck!==false;
  fs.mkdirSync(path.dirname(settingsPath()),{recursive:true});
  const tmp=`${settingsPath()}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(next,null,2),'utf8');
  fs.renameSync(tmp,settingsPath());
  return next;
}
function configured(s=readSettings()){
  return Boolean(s.owner && s.repo && !/^(YOUR_|CHANGE_ME)/i.test(s.owner));
}
function compareVersions(current,latest){
  const a=String(current||'0').replace(/^v/i,'').split(/[.-]/).map(v=>Number(v)||0);
  const b=String(latest||'0').replace(/^v/i,'').split(/[.-]/).map(v=>Number(v)||0);
  const len=Math.max(a.length,b.length);
  for(let i=0;i<len;i+=1){
    const left=a[i]||0,right=b[i]||0;
    if(right>left)return true;
    if(right<left)return false;
  }
  return false;
}
function requestJson(url){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{'User-Agent':'Financial-Reports-Manager','Accept':'application/vnd.github+json'}},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();requestJson(res.headers.location).then(resolve).catch(reject);return;}
      if(res.statusCode!==200){res.resume();reject(new Error(res.statusCode===404?'لم يتم العثور على GitHub Release لهذا المستودع.':`GitHub HTTP ${res.statusCode}`));return;}
      let data=''; res.setEncoding('utf8'); res.on('data',c=>data+=c); res.on('end',()=>{try{resolve(JSON.parse(data))}catch(e){reject(e)}});
    });
    req.on('error',reject); req.setTimeout(15000,()=>req.destroy(new Error('انتهت مهلة الاتصال بـ GitHub.')));
  });
}
function downloadFile(url,destination,onProgress){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{'User-Agent':'Financial-Reports-Manager','Accept':'application/octet-stream'}},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();downloadFile(res.headers.location,destination,onProgress).then(resolve).catch(reject);return;}
      if(res.statusCode!==200){res.resume();reject(new Error(`Download HTTP ${res.statusCode}`));return;}
      const total=Number(res.headers['content-length']||0); let received=0;
      const temp=`${destination}.part`;
      try{if(fs.existsSync(temp))fs.unlinkSync(temp)}catch{}
      const output=fs.createWriteStream(temp);
      res.on('data',chunk=>{received+=chunk.length;if(total>0)onProgress?.(Math.min(100,received/total*100));});
      res.pipe(output);
      output.on('finish',()=>output.close(()=>{
        try{if(fs.existsSync(destination))fs.unlinkSync(destination);fs.renameSync(temp,destination);onProgress?.(100);resolve(destination)}catch(e){reject(e)}
      }));
      output.on('error',err=>{try{if(fs.existsSync(temp))fs.unlinkSync(temp)}catch{};reject(err)});
    });
    req.on('error',reject); req.setTimeout(120000,()=>req.destroy(new Error('انتهت مهلة تنزيل التحديث.')));
  });
}
async function check(){
  const source=readSettings();
  const currentVersion=app.getVersion();
  if(!configured(source)) return {success:false,configured:false,currentVersion,source,message:'حدد حساب GitHub واسم المستودع من قسم التحديثات أولاً.'};
  try{
    const release=await requestJson(`https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/releases/latest`);
    const latestVersion=String(release.tag_name||release.name||'').replace(/^v/i,'').trim();
    if(!latestVersion) throw new Error('تعذر قراءة رقم الإصدار من GitHub Release.');
    const assetPattern=/^Financial-Reports-Portable-[0-9A-Za-z._-]+\.exe$/i;
    const asset=(release.assets||[]).find(a=>assetPattern.test(a.name||''));
    latestUpdateInfo={currentVersion,latestVersion,updateAvailable:compareVersions(currentVersion,latestVersion),notes:release.body||'',publishedAt:release.published_at||release.created_at||'',htmlUrl:release.html_url||'',asset:asset?{name:asset.name,url:asset.browser_download_url,size:asset.size||0}:null,source};
    return {success:true,configured:true,...latestUpdateInfo};
  }catch(error){return {success:false,configured:true,currentVersion,source,message:error?.message||'تعذر الاتصال بـ GitHub.'};}
}
async function download(onProgress){
  if(!latestUpdateInfo?.updateAvailable)return {success:false,message:'تحقق من وجود تحديث أولاً.'};
  if(!latestUpdateInfo.asset)return {success:false,message:'الإصدار موجود، لكن ملف Portable غير مرفوع داخل GitHub Release.'};
  const destination=path.join(app.getPath('downloads'),latestUpdateInfo.asset.name);
  try{downloadedUpdatePath=await downloadFile(latestUpdateInfo.asset.url,destination,onProgress);return {success:true,path:downloadedUpdatePath};}
  catch(error){return {success:false,message:error?.message||'فشل تنزيل التحديث.'};}
}
function showDownloaded(){if(!downloadedUpdatePath||!fs.existsSync(downloadedUpdatePath))return false;shell.showItemInFolder(downloadedUpdatePath);return true;}
async function launchDownloaded(){
  if(!downloadedUpdatePath||!fs.existsSync(downloadedUpdatePath))return {success:false,message:'ملف التحديث غير موجود.'};
  const result=await shell.openPath(downloadedUpdatePath);
  if(result)return {success:false,message:result};
  return {success:true,path:downloadedUpdatePath};
}
function getStatus(){return {currentVersion:app.getVersion(),source:readSettings(),configured:configured(),...(latestUpdateInfo||{}),latestUpdateInfo,downloadedUpdatePath:downloadedUpdatePath&&fs.existsSync(downloadedUpdatePath)?downloadedUpdatePath:''};}
module.exports={readSettings,saveSettings,getStatus,check,download,showDownloaded,launchDownloaded};
