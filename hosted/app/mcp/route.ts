import {env} from 'cloudflare:workers';
import {handleMcp} from '../../lib/service.mjs';
export const dynamic='force-dynamic';
export function POST(request:Request){return handleMcp(request,env.DB);}
export function GET(request:Request){return handleMcp(request,env.DB);}
