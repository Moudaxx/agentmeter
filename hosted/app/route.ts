import landing from '../content/landing.html?raw';
export function GET(){return new Response(landing,{headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=60'}});}
