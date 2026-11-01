export const VERSION='0.3.0';
const MAX_EVENTS=50000, MAX_BODY=65536;
const safeHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export function json(data,status=200){return Response.json(data,{status,headers:safeHeaders});}
function fail(status,message){throw new HttpError(status,message);}
function environment(value='live'){if(!['live','sandbox'].includes(value))fail(400,'environment must be live or sandbox');return value;}
function requireSameOrigin(req,required){const origin=req.headers.get('origin');if((required&&!origin)||(origin&&origin!==new URL(req.url).origin))fail(403,'Same-origin request required');}
export async function bodyJson(req){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'Use application/json');
 if(Number(req.headers.get('content-length'))>MAX_BODY)fail(413,'Body too large');
 const reader=req.body?.getReader();let length=0;const chunks=[];
 if(reader){while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY){await reader.cancel();fail(413,'Body too large');}chunks.push(value);}}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Invalid JSON');}
 if(!data||Array.isArray(data)||typeof data!=='object')fail(400,'JSON object required');return data;
}
export async function hashKey(key){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
export async function authenticate(req,db,{write=false,sessionOnly=false,mcp=false}={}){
 const auth=req.headers.get('authorization');
 const platformMcp=mcp&&new URL(req.url).pathname==='/mcp'&&req.headers.has('oai-authenticated-user-id')&&!auth?.startsWith('Bearer am_');
 if(auth&&!platformMcp){
  if(sessionOnly)fail(403,'Sign in to manage API keys');
  if(!/^Bearer am_[a-f0-9]{64}$/.test(auth))fail(401,'Invalid API key');
  const key=await db.prepare('SELECT owner_id,environment,scope FROM api_keys WHERE key_hash=? AND revoked_at IS NULL AND expires_at>?').bind(await hashKey(auth.slice(7)),Date.now()).first();
  if(!key)fail(401,'Invalid or expired API key');
  if(write&&key.scope!=='write')fail(403,'This key is read-only');
  return {ownerId:key.owner_id,environment:key.environment,mode:'key',scope:key.scope};
 }
 const ownerId=req.headers.get('oai-authenticated-user-id');
 if(!ownerId)fail(401,'Sign in or supply an API key');
 if(write)requireSameOrigin(req,!mcp);
 return {ownerId,environment:null,mode:'session',scope:'write'};
}
function principalEnvironment(principal,requested){const wanted=environment(requested??principal.environment??'live');if(principal.environment&&wanted!==principal.environment)fail(403,'API key belongs to a different environment');return wanted;}
function validateEvent(event){
 const fields=['eventKey','model','inputTokens','outputTokens','inputPrice','outputPrice'];
 if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(k=>!fields.includes(k)))fail(400,'Unexpected usage event fields');
 for(const [field,max] of [['eventKey',100],['model',80]])if(typeof event[field]!=='string'||!event[field].trim()||event[field].length>max)fail(400,'Invalid '+field);
 for(const k of fields.slice(2))if(typeof event[k]!=='number'||!Number.isFinite(event[k])||event[k]<0||event[k]>1e9)fail(400,'Invalid '+k);
 if(!Number.isInteger(event.inputTokens)||!Number.isInteger(event.outputTokens))fail(400,'Token counts must be integers');
 return event;
}
function eventView(row){return {eventKey:row.event_key,model:row.model,inputTokens:row.input_tokens,outputTokens:row.output_tokens,inputPrice:row.input_price,outputPrice:row.output_price,costUsd:row.cost_usd,createdAt:row.created_at};}
export async function recordUsage(db,principal,data,requested){
 const mode=principalEnvironment(principal,requested),e=validateEvent(data);
 if(principal.scope!=='write')fail(403,'This key is read-only');
 const at=new Date().toISOString(),cost=(e.inputTokens*e.inputPrice+e.outputTokens*e.outputPrice)/1e6;
 const result=await db.prepare('INSERT OR IGNORE INTO usage_events(owner_id,environment,event_key,model,input_tokens,output_tokens,input_price,output_price,cost_usd,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM usage_events WHERE owner_id=? AND environment=?)<?').bind(principal.ownerId,mode,e.eventKey,e.model,e.inputTokens,e.outputTokens,e.inputPrice,e.outputPrice,cost,at,principal.ownerId,mode,MAX_EVENTS).run();
 const row=await db.prepare('SELECT * FROM usage_events WHERE owner_id=? AND environment=? AND event_key=?').bind(principal.ownerId,mode,e.eventKey).first();
 if(!row)fail(429,'Ledger limit reached; export your records');
 return {environment:mode,...(Number(result.meta?.changes)>0?{recorded:true}:{duplicate:true}),event:eventView(row)};
}
export async function usageSummary(db,principal,requested){
 const mode=principalEnvironment(principal,requested);
 const row=await db.prepare('SELECT COUNT(*) AS events, COALESCE(SUM(cost_usd),0) AS costUsd, COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens FROM usage_events WHERE owner_id=? AND environment=?').bind(principal.ownerId,mode).first();
 return {...row,environment:mode};
}
export async function recentEvents(db,principal,requested){const mode=principalEnvironment(principal,requested);const rows=await db.prepare('SELECT * FROM usage_events WHERE owner_id=? AND environment=? ORDER BY created_at DESC,event_key DESC LIMIT 100').bind(principal.ownerId,mode).all();return {environment:mode,events:rows.results.map(eventView)};}
async function keyList(db,ownerId){return (await db.prepare('SELECT id,label,prefix,environment,scope,created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt FROM api_keys WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(ownerId).all()).results;}
async function createKey(db,ownerId,data){
 if(typeof data.label!=='string'||!data.label.trim()||data.label.length>60)fail(400,'Choose a key label (1–60 characters)');
 const mode=environment(data.environment??'sandbox'),scope=data.scope??'write';if(!['read','write'].includes(scope))fail(400,'Invalid key scope');
 const now=Date.now(),expires=now+30*24*60*60*1000,id=crypto.randomUUID();
 const token='am_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 const result=await db.prepare('INSERT INTO api_keys(id,owner_id,label,prefix,key_hash,environment,scope,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM api_keys WHERE owner_id=? AND revoked_at IS NULL AND expires_at>?)<10').bind(id,ownerId,data.label.trim(),token.slice(0,11),await hashKey(token),mode,scope,now,expires,ownerId,now).run();
 if(!Number(result.meta?.changes))fail(429,'Limit of 10 active keys reached');
 return {id,key:token,environment:mode,scope,expiresAt:expires};
}
export async function handleApi(req,db){
 try{
  const url=new URL(req.url),path=url.pathname;
  if(!db)fail(503,'Storage unavailable');
  if(path==='/api/session'){if(req.method!=='GET')fail(405,'Method not allowed');return json({authenticated:!!req.headers.get('oai-authenticated-user-id')});}
  const keys=path==='/api/keys'||path.startsWith('/api/keys/');
  const principal=await authenticate(req,db,{write:!['GET','HEAD'].includes(req.method),sessionOnly:keys});
  if(path==='/api/usage'&&req.method==='GET')return json(await usageSummary(db,principal,url.searchParams.get('environment')??undefined));
  if(path==='/api/usage'&&req.method==='POST')return json(await recordUsage(db,principal,await bodyJson(req),url.searchParams.get('environment')??undefined));
  if(path==='/api/events'&&req.method==='GET')return json(await recentEvents(db,principal,url.searchParams.get('environment')??undefined));
  if(path==='/api/keys'&&req.method==='GET')return json({keys:await keyList(db,principal.ownerId)});
  if(path==='/api/keys'&&req.method==='POST')return json(await createKey(db,principal.ownerId,await bodyJson(req)),201);
  if(path.startsWith('/api/keys/')&&req.method==='DELETE'){
   const id=decodeURIComponent(path.slice('/api/keys/'.length));
   const result=await db.prepare('UPDATE api_keys SET revoked_at=? WHERE id=? AND owner_id=? AND revoked_at IS NULL').bind(Date.now(),id,principal.ownerId).run();
   if(!Number(result.meta?.changes))fail(404,'Active key not found');return json({revoked:true});
  }
  fail(404,'Not found');
 }catch(e){return json({error:e instanceof HttpError?e.message:'Service temporarily unavailable'},e instanceof HttpError?e.status:503);}
}
const environmentProperty={type:'string',enum:['live','sandbox'],description:'Choose an isolated ledger. API keys are restricted to their own environment.'};
export const tools=[
 {name:'usage_summary',description:'Read your actual recorded token and cost totals. Prices are caller supplied.',inputSchema:{type:'object',properties:{environment:environmentProperty},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'record_usage',description:'Record one agent usage event. Duplicate eventKey returns the original event without adding cost again. Use sandbox for tests.',inputSchema:{type:'object',properties:{environment:environmentProperty,eventKey:{type:'string',maxLength:100},model:{type:'string',maxLength:80},inputTokens:{type:'integer',minimum:0,maximum:1e9},outputTokens:{type:'integer',minimum:0,maximum:1e9},inputPrice:{type:'number',minimum:0,maximum:1e9},outputPrice:{type:'number',minimum:0,maximum:1e9}},required:['eventKey','model','inputTokens','outputTokens','inputPrice','outputPrice'],additionalProperties:false},annotations:{readOnlyHint:false,idempotentHint:true}},
 {name:'recent_usage',description:'Read up to 100 of your most recent usage records.',inputSchema:{type:'object',properties:{environment:environmentProperty},additionalProperties:false},annotations:{readOnlyHint:true}}
];
export async function handleMcp(req,db){
 if(req.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
 let data;
 try{requireSameOrigin(req,false);data=await bodyJson(req);}catch(e){return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:e.message}},e.status??400);}
 const id=data.id??null,reply=result=>json({jsonrpc:'2.0',id,result});
 if(data.jsonrpc!=='2.0'||typeof data.method!=='string'||!(id===null||typeof id==='string'||typeof id==='number'))return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
 if(data.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(data.method==='initialize')return reply({protocolVersion:['2026-07-28','2025-11-25','2025-03-26'].includes(data.params?.protocolVersion)?data.params.protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'agentmeter',version:VERSION}});
 if(data.method==='notifications/initialized')return new Response(null,{status:202,headers:safeHeaders});
 if(data.method==='ping')return reply({});
 if(data.method==='tools/list')return reply({tools});
 if(data.method!=='tools/call')return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}},400);
 try{
  if(!db)fail(503,'Storage unavailable');
  const name=data.params?.name;if(!tools.some(x=>x.name===name))fail(400,'Unknown tool');
  const args=data.params.arguments??{};if(!args||Array.isArray(args)||typeof args!=='object')fail(400,'Invalid arguments');
  const principal=await authenticate(req,db,{write:name==='record_usage',mcp:true});
  const {environment:requested,...event}=args;
  if(name!=='record_usage'&&Object.keys(event).length)fail(400,'Unexpected arguments');
  const result=name==='record_usage'?await recordUsage(db,principal,event,requested):name==='recent_usage'?await recentEvents(db,principal,requested):await usageSummary(db,principal,requested);
  return reply({content:[{type:'text',text:JSON.stringify(result)}],isError:false});
 }catch(e){return reply({content:[{type:'text',text:e instanceof HttpError?e.message:'Service temporarily unavailable'}],isError:true});}
}
