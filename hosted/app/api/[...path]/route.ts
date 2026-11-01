import {env} from 'cloudflare:workers';
import {handleApi,handleMcp} from '../../../lib/service.mjs';
export const dynamic='force-dynamic';
export function GET(request:Request){return new URL(request.url).pathname==='/api/mcp'?handleMcp(request,env.DB):handleApi(request,env.DB);}
export function POST(request:Request){return new URL(request.url).pathname==='/api/mcp'?handleMcp(request,env.DB):handleApi(request,env.DB);}
export function DELETE(request:Request){return handleApi(request,env.DB);}
