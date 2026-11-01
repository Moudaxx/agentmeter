import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {UsageClient} from '../sdk.mjs';
test('SDK reports host access failures and supports a separate Site credential',async()=>{
 const server=createServer((req,res)=>{if(req.headers['oai-sites-authorization']==='Bearer test-site-credential'&&req.headers.authorization==='Bearer test-api-key'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"events":0}');}else{res.writeHead(403,{'Content-Type':'text/plain'});res.end('error code: 1010');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{await assert.rejects(new UsageClient(base,'test-api-key').summary(),/HTTP 403 from the hosting access layer/);assert.equal((await new UsageClient(base,'test-api-key',{siteAccessToken:'test-site-credential'}).summary()).events,0);}
 finally{await new Promise(r=>server.close(r));}
});
