const crypto=require('crypto');
const {pool,initialize}=require('./database.cjs');
const {normalizeUsername,hashPassword}=require('./security.cjs');

async function main(){
  const username=normalizeUsername(process.argv[2]);
  const displayName=String(process.argv[3]||username).trim();
  const role=String(process.argv[4]||'editor').trim().toLowerCase();
  const password=String(process.env.FINANCE_NEW_USER_PASSWORD||'');
  if(!username||!password)throw new Error('Usage: set FINANCE_NEW_USER_PASSWORD, then run: npm run create-user -- username "Display Name" editor');
  if(!['admin','editor','viewer'].includes(role))throw new Error('Role must be admin, editor, or viewer.');
  if(password.length<10)throw new Error('Password must contain at least 10 characters.');
  await initialize();
  const secured=hashPassword(password);
  await pool.query(`INSERT INTO finance_users(id,username,display_name,role,password_salt,password_hash,active)
    VALUES($1,$2,$3,$4,$5,$6,true)
    ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,password_salt=excluded.password_salt,password_hash=excluded.password_hash,active=true,updated_at=now()`,
    [crypto.randomUUID(),username,displayName,role,secured.salt,secured.hash]);
  console.log(`User saved: ${username} (${role})`);
}

main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end().catch(()=>{}));
