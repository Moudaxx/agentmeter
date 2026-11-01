export class UsageClient {
 constructor(baseUrl,apiKey,{siteAccessToken}={}){this.baseUrl=baseUrl.replace(/\/$/,'');this.apiKey=apiKey;this.siteAccessToken=siteAccessToken;}
 async request(path,body){const headers={Authorization:'Bearer '+this.apiKey,'Content-Type':'application/json'};if(this.siteAccessToken)headers['OAI-Sites-Authorization']='Bearer '+this.siteAccessToken;const r=await fetch(this.baseUrl+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});let data;try{data=await r.json();}catch{throw Error('HTTP '+r.status+' from the hosting access layer. Use the supported Site service access or the AgentMeter ChatGPT plugin.');}if(!r.ok)throw Error(data.error||'HTTP '+r.status);return data;}
 summary(){return this.request('/api/usage');}
 record(event){return this.request('/api/usage',event);}
}

