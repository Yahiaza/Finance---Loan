const fs=require('fs');
const path=require('path');

function loadEnv(){
  const file=path.join(__dirname,'.env');
  if(fs.existsSync(file)){
    for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
      const line=raw.trim();
      if(!line||line.startsWith('#'))continue;
      const at=line.indexOf('=');
      if(at<1)continue;
      const key=line.slice(0,at).trim();
      let value=line.slice(at+1).trim();
      if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
      if(process.env[key]===undefined)process.env[key]=value;
    }
  }
}

loadEnv();

const bool=value=>/^(1|true|yes|on)$/i.test(String(value||''));
const config={
  databaseUrl:String(process.env.DATABASE_URL||'').trim(),
  host:String(process.env.FINANCE_HOST||'0.0.0.0').trim(),
  port:Math.max(1,Math.min(65535,Number(process.env.FINANCE_PORT)||5050)),
  filesDir:path.resolve(String(process.env.FINANCE_FILES_DIR||path.join(__dirname,'data','attachments'))),
  adminUsername:String(process.env.FINANCE_ADMIN_USERNAME||'admin').trim(),
  adminPassword:String(process.env.FINANCE_ADMIN_PASSWORD||''),
  adminName:String(process.env.FINANCE_ADMIN_NAME||'مدير النظام').trim(),
  pgSsl:bool(process.env.PGSSL),
  tlsCert:String(process.env.FINANCE_TLS_CERT||'').trim(),
  tlsKey:String(process.env.FINANCE_TLS_KEY||'').trim()
};

module.exports={config};
