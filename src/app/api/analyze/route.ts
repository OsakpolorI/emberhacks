import { z } from 'zod';
import { assessmentSchema, requestSchema } from '@/lib/contracts';
import { ANALYST_PROMPT, groundAssessment, meaningful, insufficient } from '@/lib/analysis';
import { apiError, gemini, localRequest } from '@/lib/server';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!localRequest(request))return Response.json({error:'Origin not allowed'},{status:403});
 const text=await request.text();if(text.length>160000)return Response.json({error:'Transcript too large'},{status:413});
 let input;try{input=requestSchema.parse(JSON.parse(text));}catch{return Response.json({error:'Invalid transcript request'},{status:400});}
 const start=Date.now();
 if(!meaningful(input.turns))return Response.json({...insufficient(),sequence:input.sequence,latencyMs:0});
 try{
 const response=await gemini().models.generateContent({model:process.env.GEMINI_ANALYSIS_MODEL||'gemini-3.8-flash',contents:JSON.stringify({mode:input.mode,transcript:input.turns}),config:{systemInstruction:ANALYST_PROMPT,responseMimeType:'application/json',responseJsonSchema:z.toJSONSchema(assessmentSchema),temperature:0.2,httpOptions:{timeout:25000}}});
 return Response.json({...groundAssessment(JSON.parse(response.text||'{}'),input.turns),sequence:input.sequence,latencyMs:Date.now()-start});
 }catch(error){return apiError(error);}
}
