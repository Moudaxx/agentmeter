import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createProduct} from '../server.mjs';
import {UsageClient} from '../sdk.mjs';

const key = 'test-only-random-placeholder-32-characters';
const event = {eventKey:'event-1', model:'example-model', inputTokens:2000000, outputTokens:200000, inputPrice:1, outputPrice:4};
const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(),'agentmeter-test-'));
  const file = join(dir,'usage.json');
  let server;
  async function start() {
    server = createProduct({key,file});
    await new Promise(r => server.listen(0,'127.0.0.1',r));
    return 'http://127.0.0.1:' + server.address().port;
  }
  async function stop() { if (server?.listening) await new Promise(r => server.close(r)); }
  try { await fn({base:await start(), restart:async()=>{await stop();return start();}}); }
  finally { await stop(); rmSync(dir,{recursive:true,force:true}); }
}

test('public assets and API documentation do not expose the ledger', async()=>{
 await fixture(async({base})=>{
   const html = await (await fetch(base+'/')).text();
   assert.match(html,/AgentMeter/);
   assert.doesNotMatch(await (await fetch(base+'/logo.svg')).text(),/<text[\s>]/);
   const png = await fetch(base+'/logo-symbol-only.png');
   assert.equal(png.status,200);
   assert.equal(png.headers.get('content-type'),'image/png');
   const api = await (await fetch(base+'/openapi.json')).json();
   assert.ok(api.paths['/api/usage'].post);
   assert.equal((await fetch(base+'/api/usage',{headers:{Authorization:key}})).status,401);
   assert.equal((await fetch(base+'/data/usage.json')).status,401);
 });
});

test('SDK records explicit prices, survives restart and deduplicates event IDs', async()=>{
 await fixture(async({base,restart})=>{
   const sdk = new UsageClient(base,key);
   assert.equal((await sdk.record(event)).event.costUsd,2.8);
   assert.equal((await sdk.record(event)).duplicate,true);
   const afterRestart = new UsageClient(await restart(),key);
   assert.equal((await afterRestart.record(event)).duplicate,true);
   assert.deepEqual(await afterRestart.summary(),{events:1,costUsd:2.8,inputTokens:2000000,outputTokens:200000});
   await assert.rejects(new UsageClient(afterRestart.baseUrl,'wrong').summary(),/Unauthorized/);
 });
});

test('invalid usage and malformed bodies never enter the ledger', async()=>{
 await fixture(async({base})=>{
   const sdk = new UsageClient(base,key);
   for (const bad of [{...event,inputTokens:-1},{...event,inputTokens:1.5},{...event,inputPrice:'1'},{...event,eventKey:''}]) await assert.rejects(sdk.record(bad));
   const headers = {Authorization:'Bearer '+key,'Content-Type':'application/json'};
   assert.equal((await fetch(base+'/api/usage',{method:'POST',headers,body:'{'})).status,400);
   assert.equal((await fetch(base+'/api/usage',{method:'POST',headers,body:JSON.stringify({padding:'x'.repeat(70000)})})).status,413);
   assert.equal((await sdk.summary()).events,0);
 });
});

test('MCP and CLI operate on the same authenticated ledger', async()=>{
 await fixture(async({base})=>{
   const rpc = async(method,params={}) => (await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json();
   assert.equal((await rpc('initialize')).result.serverInfo.name,'amtr');
   assert.deepEqual((await rpc('tools/list')).result.tools.map(x=>x.name).sort(),['record_usage','usage_summary']);
   assert.equal((await rpc('tools/call',{name:'record_usage',arguments:event})).result.isError,false);
   assert.equal((await rpc('tools/call',{name:'not_a_tool'})).result.isError,true);
   const env={...process.env,PRODUCT_URL:base,PRODUCT_API_KEY:key};
   delete env.NODE_TEST_CONTEXT;
   const {stdout} = await run(process.execPath,['cli.mjs','summary'],{cwd:root,env});
   assert.equal(JSON.parse(stdout).costUsd,2.8);
 });
});
