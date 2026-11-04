import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {handleApi,handleMcp,hashKey} from '../lib/service.mjs';
const origin='https://agentmeter.btcmax.chatgpt.site';
const event={eventKey:'request-1',model:'test-model',inputTokens:2000000,outputTokens:200000,inputPrice:1,outputPrice:4};
const headersFor=user=>user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@test.invalid'}:{};
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'agentmeter-d1-')),file=join(dir,'database.sqlite');let sql=new DatabaseSync(file);
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const db={prepare(statement){let args=[];const stmt={bind(...a){args=a;return stmt;},async first(){return sql.prepare(statement).get(...args)??null;},async all(){return {results:sql.prepare(statement).all(...args)};},async run(){const result=sql.prepare(statement).run(...args);return {meta:{changes:Number(result.changes)}};}};return stmt;}};
 async function request(path,{user='alice',method='GET',body,headers={},raw,mcp=false}={}){const h={...headersFor(user),...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{Origin:origin}:{}),...headers};for(const k of Object.keys(h))if(h[k]===null)delete h[k];const req=new Request(origin+path,{method,headers:h,body:raw??(body===undefined?undefined:JSON.stringify(body))});const response=await(mcp?handleMcp:handleApi)(req,db);const data=response.status===202?null:await response.json();return {status:response.status,data};}
 return {db,request,sql:()=>sql,restart(){sql.close();sql=new DatabaseSync(file);},close(){sql.close();rmSync(dir,{recursive:true,force:true});}};
}
async function create(f,extra={}){const r=await f.request('/api/keys',{method:'POST',body:{label:'Test agent',environment:'sandbox',scope:'write',...extra}});assert.equal(r.status,201);return r.data;}

test('sessions require authentication and same-origin writes',async()=>{const f=fixture();try{
 assert.equal((await f.request('/api/usage',{user:null})).status,401);
 assert.equal((await f.request('/api/usage')).data.events,0);
 for(const Origin of [null,'https://attacker.invalid'])assert.equal((await f.request('/api/usage',{method:'POST',body:event,headers:{Origin}})).status,403);
 assert.equal((await f.request('/api/usage')).data.events,0);
}finally{f.close();}});

test('API keys are hashed, account-scoped, environment-scoped and idempotent',async()=>{const f=fixture();try{
 const key=await create(f),headers={Authorization:'Bearer '+key.key};
 assert.equal(f.sql().prepare('SELECT key_hash FROM api_keys').get().key_hash,await hashKey(key.key));
 assert.ok(!JSON.stringify((await f.request('/api/keys')).data).includes(key.key));
 const writes=await Promise.all(Array.from({length:6},()=>f.request('/api/usage',{user:null,method:'POST',headers,body:event})));
 assert.equal(writes.filter(r=>r.data.recorded).length,1);
 assert.equal(writes.filter(r=>r.data.duplicate).length,5);
 assert.equal((await f.request('/api/usage',{user:null,headers})).data.costUsd,2.8);
 assert.equal((await f.request('/api/usage')).data.events,0);
 assert.equal((await f.request('/api/usage?environment=sandbox',{user:'bob'})).data.events,0);
 assert.equal((await f.request('/api/usage?environment=live',{user:null,headers})).status,403);
 assert.equal((await f.request('/api/events?environment=sandbox')).data.events.length,1);
 f.restart();assert.equal((await f.request('/api/usage',{user:null,headers})).data.events,1);
 assert.equal((await f.request('/api/usage',{user:null,method:'POST',headers,body:event})).data.duplicate,true);
}finally{f.close();}});

test('revocation, expiry, read-only scopes and key-management boundary are enforced',async()=>{const f=fixture();try{
 const key=await create(f,{scope:'read'}),headers={Authorization:'Bearer '+key.key};
 assert.equal((await f.request('/api/usage',{user:null,method:'POST',headers,body:event})).status,403);
 assert.equal((await f.request('/api/keys',{user:null,headers})).status,403);
 assert.equal((await f.request('/api/keys/'+key.id,{user:'bob',method:'DELETE'})).status,404);
 assert.equal((await f.request('/api/usage',{user:null,headers})).status,200);
 assert.equal((await f.request('/api/keys/'+key.id,{method:'DELETE'})).status,200);
 assert.equal((await f.request('/api/usage',{user:null,headers})).status,401);
 const expired=await create(f);f.sql().prepare('UPDATE api_keys SET expires_at=0 WHERE id=?').run(expired.id);
 assert.equal((await f.request('/api/usage',{user:null,headers:{Authorization:'Bearer '+expired.key}})).status,401);
}finally{f.close();}});

test('invalid inputs and oversized requests do not add events',async()=>{const f=fixture();try{
 for(const e of [{...event,inputTokens:-1},{...event,outputTokens:1.5},{...event,inputPrice:'1'},{...event,ownerId:'bob'},{...event,eventKey:''}])assert.equal((await f.request('/api/usage',{method:'POST',body:e})).status,400);
 assert.equal((await f.request('/api/usage',{method:'POST',raw:'{'})).status,400);
 assert.equal((await f.request('/api/usage',{method:'POST',body:event,headers:{'Content-Type':'text/plain'}})).status,415);
 assert.equal((await f.request('/api/usage',{method:'POST',body:{huge:'x'.repeat(70000)}})).status,413);
 assert.equal((await f.request('/api/usage')).data.events,0);
}finally{f.close();}});

test('active key quota is atomic and revocation frees a slot',async()=>{const f=fixture();try{
 const results=await Promise.all(Array.from({length:11},()=>f.request('/api/keys',{method:'POST',body:{label:'Agent'}})));
 assert.equal(results.filter(r=>r.status===201).length,10);assert.equal(results.filter(r=>r.status===429).length,1);
 await f.request('/api/keys/'+results.find(r=>r.status===201).data.id,{method:'DELETE'});
 assert.equal((await f.request('/api/keys',{method:'POST',body:{label:'Replacement'}})).status,201);
}finally{f.close();}});

test('MCP works with platform identity and scoped external keys',async()=>{const f=fixture();try{
 const call=(method,params={},options={})=>f.request('/mcp',{method:'POST',mcp:true,body:{jsonrpc:'2.0',id:1,method,params},...options});
 assert.equal((await call('server/discover',{}, {user:null})).data.result.supportedVersions[0],'2026-07-28');
 assert.equal((await call('tools/list',{}, {user:null})).data.result.tools.length,3);
 assert.equal((await call('tools/call',{name:'usage_summary'},{user:null})).data.result.isError,true);
 const write=await call('tools/call',{name:'record_usage',arguments:{...event,environment:'sandbox'}},{headers:{Authorization:'Bearer platform-oauth-placeholder',Origin:null}});
 assert.equal(write.data.result.isError,false);
 assert.equal(JSON.parse((await call('tools/call',{name:'usage_summary',arguments:{environment:'sandbox'}})).data.result.content[0].text).events,1);
 assert.equal((await call('tools/call',{name:'usage_summary'},{headers:{Origin:'https://attacker.invalid'}})).status,403);
 const key=await create(f,{scope:'read'});
 const read=await f.request('/api/mcp',{user:null,method:'POST',mcp:true,headers:{Authorization:'Bearer '+key.key,Origin:null},body:{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'recent_usage',arguments:{}}}});
 assert.equal(read.data.result.isError,false);
 assert.equal(JSON.parse(read.data.result.content[0].text).events.length,1);
 assert.equal((await call('not-a-method')).data.error.code,-32601);
}finally{f.close();}});

test('onboarding check is repeatable and rejects a live key before writing', async () => {
  const f = fixture();
  try {
    const { checkSandbox } = await import('../../examples/sandbox-check.mjs');
    async function clientFor(environment) {
      const { key } = await create(f, { environment });
      return { async request(path, body) {
        const response = await f.request(path, {
          user: null, method: body ? 'POST' : 'GET', body,
          headers: { Authorization: 'Bearer ' + key },
        });
        if (response.status >= 400) throw new Error(response.data.error);
        return response.data;
      } };
    }
    const client = await clientFor('sandbox');
    await checkSandbox(client);
    assert.equal((await checkSandbox(client)).retryDeduplicated, true);
    assert.equal((await client.request('/api/usage')).events, 1);
    assert.equal((await client.request('/api/usage')).costUsd, 0.3);
    const live = await clientFor('live');
    await assert.rejects(checkSandbox(live), /different environment/);
    assert.equal((await live.request('/api/usage')).events, 0);
  } finally {
    f.close();
  }
});
