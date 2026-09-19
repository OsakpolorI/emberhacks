import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localRequest } from '@/lib/server';
export const runtime='nodejs';
export async function GET(){return Response.json({configured:!!process.env.GEMINI_API_KEY,liveModel:process.env.GEMINI_LIVE_MODEL||'gemini-3.8-live',analysisModel:process.env.GEMINI_ANALYSIS_MODEL||'gemini-3.8-flash'},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){
 const hostname=new URL(`http://${request.headers.get('host')||new URL(request.url).host}`).hostname;
 if(process.env.NODE_ENV==='production'||!['localhost','127.0.0.1','[::1]'].includes(hostname)||!request.headers.get('origin')||!localRequest(request))return Response.json({error:'Setup is available only on the local development server.'},{status:403});
 if(process.env.GEMINI_API_KEY)return Response.json({error:'Already configured. Edit .env.local to change your key.'},{status:409});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid request'},{status:400});}
 if(typeof body.key!=='string'||!/^AIza[\w-]{20,100}$/.test(body.key))return Response.json({error:'Enter a valid Google API key.'},{status:400});
 try{await writeFile(join(process.cwd(),'.env.local'),`GEMINI_API_KEY=${body.key}\nGEMINI_LIVE_MODEL=gemini-3.8-live\nGEMINI_ANALYSIS_MODEL=gemini-3.8-flash\n`,{flag:'wx',mode:0o600});process.env.GEMINI_API_KEY=body.key;return Response.json({configured:true});}catch{return Response.json({error:'.env.local already exists or could not be written. Configure it locally.'},{status:409});}
}
