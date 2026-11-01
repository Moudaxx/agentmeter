import {env} from 'cloudflare:workers';
import {json,VERSION} from '../../lib/service.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{if(!env.DB)throw Error('Missing database');await env.DB.prepare('SELECT 1 AS ok').first();return json({ok:true,product:'AgentMeter',version:VERSION,storage:'ready'});}catch{return json({ok:false,storage:'unavailable'},503);}}
