const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type, X-Telegram-Init-Data", "Access-Control-Allow-Methods":"GET,POST,OPTIONS" };
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const now=()=>Math.floor(Date.now()/1000);
async function verifyTelegram(initData, token){
 if(!initData||!token) return null;
 const p=new URLSearchParams(initData), hash=p.get("hash"); if(!hash)return null; p.delete("hash");
 const entries=[...p.entries()].sort(([a],[b])=>a.localeCompare(b));
 const check=entries.map(([k,v])=>`${k}=${v}`).join("\n");
 const secret=await crypto.subtle.importKey("raw",new TextEncoder().encode("WebAppData"),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const secretBytes=await crypto.subtle.sign("HMAC",secret,new TextEncoder().encode(token));
 const key=await crypto.subtle.importKey("raw",secretBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(check));
 const hex=[...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,"0")).join("");
 if(hex!==hash)return null;
 const auth=Number(p.get("auth_date")); if(!auth||now()-auth>86400)return null;
 try{return JSON.parse(p.get("user")||"{}")}catch{return null}
}
async function userFrom(req,env){
 const u=await verifyTelegram(req.headers.get("X-Telegram-Init-Data"),env.BOT_TOKEN);
 if(!u?.id)return null;
 const id=String(u.id), username=u.username||"", first=u.first_name||"";
 await env.DB.prepare("INSERT OR IGNORE INTO users(telegram_id,username,first_name,created_at) VALUES(?,?,?,?)").bind(id,username,first,now()).run();
 await env.DB.prepare("UPDATE users SET username=?,first_name=? WHERE telegram_id=?").bind(username,first,id).run();
 return {id,username,first};
}
async function isAdmin(u,env){return !!u&&String(u.id)===String(env.ADMIN_TELEGRAM_ID||"");}
async function setting(env,key,def){const r=await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();return r?Number(r.value):def}
async function credit(env,id,amount,kind,note){await env.DB.batch([
 env.DB.prepare("UPDATE users SET balance=balance+? WHERE telegram_id=?").bind(amount,id),
 env.DB.prepare("INSERT INTO transactions(telegram_id,kind,amount,note,created_at) VALUES(?,?,?,?,?)").bind(id,kind,amount,note,now())
]);}
async function api(req,env){
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 const url=new URL(req.url), path=url.pathname;
 if(path==="/api/health")return json({ok:true,name:"SPC"});
 const u=await userFrom(req,env); if(!u)return json({error:"Telegram authentication failed. Open this app inside Telegram."},401);
 if(path==="/api/me"&&req.method==="GET"){
  const me=await env.DB.prepare("SELECT telegram_id,username,first_name,balance,referred_by,created_at FROM users WHERE telegram_id=?").bind(u.id).first();
  const tasks=await env.DB.prepare("SELECT id,title,description,url,reward FROM tasks WHERE active=1 ORDER BY id DESC").all();
  const tx=await env.DB.prepare("SELECT kind,amount,note,created_at FROM transactions WHERE telegram_id=? ORDER BY id DESC LIMIT 30").bind(u.id).all();
  return json({user:me,tasks:tasks.results,history:tx.results,isAdmin:await isAdmin(u,env)});
 }
 if(path==="/api/referral"&&req.method==="POST"){
  const body=await req.json().catch(()=>({ })), ref=String(body.ref||"");
  if(ref&&ref!==u.id){
   const inviter=await env.DB.prepare("SELECT telegram_id FROM users WHERE telegram_id=?").bind(ref).first();
   const mine=await env.DB.prepare("SELECT referred_by FROM users WHERE telegram_id=?").bind(u.id).first();
   if(inviter&&!mine.referred_by)await env.DB.prepare("UPDATE users SET referred_by=? WHERE telegram_id=?").bind(ref,u.id).run();
  }return json({ok:true});
 }
 if(path==="/api/mining/claim"&&req.method==="POST"){
  const row=await env.DB.prepare("SELECT mining_last_claim FROM users WHERE telegram_id=?").bind(u.id).first();
  if(now()-Number(row.mining_last_claim||0)<86400)return json({error:"Mining claim is available once every 24 hours."},429);
  const reward=await setting(env,"mining_daily",10);
  await env.DB.prepare("UPDATE users SET mining_last_claim=? WHERE telegram_id=?").bind(now(),u.id).run();
  await credit(env,u.id,reward,"mining","Daily mining claim");
  const referral=await env.DB.prepare("SELECT referred_by,referral_paid FROM users WHERE telegram_id=?").bind(u.id).first();
  if(referral?.referred_by&&!referral.referral_paid){
   const refReward=await setting(env,"referral_reward",200);
   await credit(env,String(referral.referred_by),refReward,"referral","Qualified referral reward");
   await env.DB.prepare("UPDATE users SET referral_paid=1 WHERE telegram_id=?").bind(u.id).run();
  }
  return json({ok:true,reward});
 }
 if(path==="/api/tasks/complete"&&req.method==="POST"){
  const body=await req.json().catch(()=>({})), taskId=Number(body.taskId), day=new Date().toISOString().slice(0,10);
  const task=await env.DB.prepare("SELECT id,title,reward FROM tasks WHERE id=? AND active=1").bind(taskId).first();if(!task)return json({error:"Task not found"},404);
  try{await env.DB.prepare("INSERT INTO task_completions(telegram_id,task_id,day_key,created_at) VALUES(?,?,?,?)").bind(u.id,taskId,day,now()).run()}catch{return json({error:"Already completed today"},409)}
  await credit(env,u.id,Number(task.reward),"task",`Task: ${task.title}`);return json({ok:true,reward:Number(task.reward)});
 }
 if(path.startsWith("/api/admin/")){
  if(!await isAdmin(u,env))return json({error:"Admin only"},403);
  if(path==="/api/admin/settings"&&req.method==="POST"){
   const b=await req.json();for(const k of ["mining_daily","referral_reward","task_reward"])if(b[k]!=null&&Number(b[k])>=0)await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k,String(Number(b[k]))).run();
   return json({ok:true});
  }
  if(path==="/api/admin/tasks"&&req.method==="POST"){
   const b=await req.json();if(!b.title)return json({error:"Title required"},400);
   await env.DB.prepare("INSERT INTO tasks(title,description,url,reward,active,created_at) VALUES(?,?,?,?,1,?)").bind(String(b.title).slice(0,120),String(b.description||"").slice(0,500),String(b.url||"").slice(0,500),Number(b.reward||15),now()).run();return json({ok:true});
  }
  if(path==="/api/admin/tasks/delete"&&req.method==="POST"){const b=await req.json();await env.DB.prepare("UPDATE tasks SET active=0 WHERE id=?").bind(Number(b.id)).run();return json({ok:true});}
  if(path==="/api/admin/credit"&&req.method==="POST"){const b=await req.json(),target=String(b.telegramId||""),amount=Number(b.amount);if(!target||!Number.isFinite(amount)||amount===0)return json({error:"Invalid credit"},400);const exists=await env.DB.prepare("SELECT telegram_id FROM users WHERE telegram_id=?").bind(target).first();if(!exists)return json({error:"User not found"},404);await credit(env,target,amount,"admin",String(b.note||"Admin adjustment").slice(0,200));return json({ok:true});}
  if(path==="/api/admin/users"&&req.method==="GET"){const r=await env.DB.prepare("SELECT telegram_id,username,balance,created_at FROM users ORDER BY created_at DESC LIMIT 100").all();return json(r.results);}
  return json({error:"Unknown admin route"},404);
 }
 return json({error:"Not found"},404);
}
export default {async fetch(req,env){
 const url=new URL(req.url);if(url.pathname.startsWith("/api/")){try{return await api(req,env)}catch(e){return json({error:"Server error"},500)}}
 if(env.ASSETS)return env.ASSETS.fetch(req);
 return new Response("SPC assets missing",{status:500});
}};
