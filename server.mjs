import {createServer} from 'node:http';
import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {cost,validateEvent} from './usage.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function createProduct({key=process.env.PRODUCT_API_KEY,file=process.env.DATA_FILE||join(root,'data/usage.json')}={}) {
 if(!key||key.length<24) throw new Error('Set PRODUCT_API_KEY to at least 24 random characters');
 mkdirSync(dirname(file),{recursive:true});
 let events=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];
 const summary=()=>({events:events.length,costUsd:events.reduce((s,e)=>s+e.costUsd,0),inputTokens:events.reduce((s,e)=>s+e.inputTokens,0),outputTokens:events.reduce((s,e)=>s+e.outputTokens,0)});
 const append=(e)=>{validateEvent(e);const prior=events.find(x=>x.eventKey===e.eventKey);if(prior)return {duplicate:true,event:prior};if(events.length>=50000)throw Error('Event limit reached; archive the ledger');const next={...e,costUsd:cost(e),createdAt:new Date().toISOString()};const all=[...events,next];writeFileSync(file+'.tmp',JSON.stringify(all),{mode:0o600});renameSync(file+'.tmp',file);events=all;return {recorded:true,event:next};};
 return createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&path==='/health')return send(200,{ok:true,product:"AgentMeter",version:'0.2.0'});
 if(req.method==='GET'&&path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'});return res.end(readFileSync(join(root,'public/index.html')));}
 const publicFiles={'/logo.svg':['public/logo.svg','image/svg+xml'],'/logo-symbol-only.png':['public/logo-symbol-only.png','image/png'],'/social-card.svg':['public/social-card.svg','image/svg+xml'],'/token.json':['public/token.json','application/json'],'/openapi.json':['openapi.json','application/json']};
 if(req.method==='GET'&&Object.hasOwn(publicFiles,path)){const [file,type]=publicFiles[path];try{const content=readFileSync(join(root,file));res.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff'});return res.end(content);}catch{return send(404,{error:'Not found'});}}
 const given=Buffer.from((req.headers.authorization||'').startsWith('Bearer ')?req.headers.authorization.slice(7):''),secret=Buffer.from(key);
 if(given.length!==secret.length||!timingSafeEqual(given,secret))return send(401,{error:'Unauthorized'});
 try{
 if(req.method==='GET'&&path==='/api/usage')return send(200,summary());
 if(req.method!=='POST')return send(404,{error:'Not found'});
 let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536)return send(413,{error:'Body too large'});}
 const data=JSON.parse(body);
 if(path==='/api/usage')return send(200,append(data));
 if(path!=='/mcp')return send(404,{error:'Not found'});
 const reply=result=>send(200,{jsonrpc:'2.0',id:data.id??null,result});
 if(data.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(data.method==='initialize')return reply({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:"amtr",version:'0.2.0'}});
 if(data.method==='notifications/initialized'){res.writeHead(202);return res.end();}
 if(data.method==='tools/list')return reply({tools:[{name:'usage_summary',description:'Read the actual usage ledger',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'record_usage',description:'Record an idempotent usage event; prices are caller supplied',inputSchema:{type:'object',properties:{eventKey:{type:'string'},model:{type:'string'},inputTokens:{type:'integer',minimum:0},outputTokens:{type:'integer',minimum:0},inputPrice:{type:'number',minimum:0},outputPrice:{type:'number',minimum:0}},required:['eventKey','model','inputTokens','outputTokens','inputPrice','outputPrice'],additionalProperties:false}}]});
 if(data.method==='tools/call'){try{const name=data.params?.name;if(!['usage_summary','record_usage'].includes(name))throw Error('Unknown tool');const result=name==='usage_summary'?summary():append(data.params.arguments);return reply({content:[{type:'text',text:JSON.stringify(result)}],isError:false});}catch(e){return reply({content:[{type:'text',text:e.message}],isError:true});}}
 return send(400,{error:'Unsupported method'});
 }catch(e){return send(400,{error:e.message});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||3000);createProduct().listen(port,'0.0.0.0',()=>console.log('Product listening on port '+port));}

