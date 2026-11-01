export class UsageClient {
 constructor(baseUrl,apiKey){this.baseUrl=baseUrl.replace(/\/$/,'');this.apiKey=apiKey;}
 async request(path,body){const r=await fetch(this.baseUrl+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+this.apiKey,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
 summary(){return this.request('/api/usage');}
 record(event){return this.request('/api/usage',event);}
}

