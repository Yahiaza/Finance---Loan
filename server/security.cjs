const crypto=require('crypto');

const normalizeUsername=value=>String(value||'').trim().toLowerCase();
const hashPassword=(password,salt=crypto.randomBytes(16).toString('hex'))=>({
  salt,
  hash:crypto.scryptSync(String(password),salt,64,{N:16384,r:8,p:1}).toString('hex')
});
const verifyPassword=(password,salt,expected)=>{
  try{
    const actual=Buffer.from(hashPassword(password,salt).hash,'hex');
    const target=Buffer.from(String(expected||''),'hex');
    return actual.length===target.length&&crypto.timingSafeEqual(actual,target);
  }catch{return false;}
};
const newToken=()=>crypto.randomBytes(32).toString('base64url');
const hashToken=token=>crypto.createHash('sha256').update(String(token||'')).digest('hex');

module.exports={normalizeUsername,hashPassword,verifyPassword,newToken,hashToken};
