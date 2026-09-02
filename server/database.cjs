const {Pool}=require('pg');
const crypto=require('crypto');
const fs=require('fs');
const {config}=require('./config.cjs');
const {normalizeUsername,hashPassword}=require('./security.cjs');

if(!config.databaseUrl)throw new Error('DATABASE_URL is missing. Copy .env.example to .env and configure PostgreSQL first.');
const pool=new Pool({connectionString:config.databaseUrl,max:12,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,ssl:config.pgSsl?{rejectUnauthorized:true}:false});

async function initialize(){
  fs.mkdirSync(config.filesDir,{recursive:true});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_users(
      id uuid PRIMARY KEY,
      username text NOT NULL UNIQUE,
      display_name text NOT NULL,
      role text NOT NULL CHECK(role IN ('admin','editor','viewer')),
      password_salt text NOT NULL,
      password_hash text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS finance_sessions(
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES finance_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS finance_state(
      id smallint PRIMARY KEY CHECK(id=1),
      revision bigint NOT NULL DEFAULT 0,
      state jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES finance_users(id)
    );
    CREATE TABLE IF NOT EXISTS finance_audit_log(
      id bigserial PRIMARY KEY,
      revision bigint NOT NULL,
      user_id uuid REFERENCES finance_users(id),
      action text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS finance_attachments(
      id uuid PRIMARY KEY,
      original_name text NOT NULL,
      stored_name text NOT NULL UNIQUE,
      mime_type text NOT NULL,
      size_bytes bigint NOT NULL,
      uploaded_by uuid REFERENCES finance_users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO finance_state(id,revision,state) VALUES(1,0,'{}'::jsonb) ON CONFLICT(id) DO NOTHING;
    CREATE INDEX IF NOT EXISTS idx_finance_sessions_expiry ON finance_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_finance_audit_created ON finance_audit_log(created_at DESC);
  `);
  await pool.query('DELETE FROM finance_sessions WHERE expires_at < now()');
  const users=await pool.query('SELECT count(*)::int AS count FROM finance_users');
  if(users.rows[0].count===0){
    if(!config.adminPassword||config.adminPassword==='CHANGE_THIS_ADMIN_PASSWORD')throw new Error('Set a strong FINANCE_ADMIN_PASSWORD in server/.env before the first start.');
    const password=hashPassword(config.adminPassword);
    await pool.query('INSERT INTO finance_users(id,username,display_name,role,password_salt,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),normalizeUsername(config.adminUsername),config.adminName,'admin',password.salt,password.hash]);
    console.log(`Initial administrator created: ${normalizeUsername(config.adminUsername)}`);
  }
}

module.exports={pool,initialize};
