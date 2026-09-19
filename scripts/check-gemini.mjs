import { GoogleGenAI, Modality } from '@google/genai';
import { existsSync } from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if(!process.env.GEMINI_API_KEY){console.error('No GEMINI_API_KEY configured.');process.exit(1);}
const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
try{
 if(process.argv.includes('--list')){const models=await ai.models.list({config:{pageSize:100}});for await(const model of models){if(/flash|live/.test(model.name??''))console.log(JSON.stringify({name:model.name,actions:model.supportedActions}));}process.exit(0);}
 const text=await ai.models.generateContent({model:process.env.GEMINI_ANALYSIS_MODEL,contents:'Reply with the single word READY.',config:{maxOutputTokens:30,httpOptions:{timeout:20000}}});
 console.log(JSON.stringify({check:'text inference',model:process.env.GEMINI_ANALYSIS_MODEL,success:!!text.text}));
 const token=await ai.authTokens.create({config:{uses:1,expireTime:new Date(Date.now()+300000).toISOString(),newSessionExpireTime:new Date(Date.now()+60000).toISOString(),httpOptions:{apiVersion:'v1alpha'}}});
 console.log(JSON.stringify({check:'ephemeral credential',success:!!token.name}));
 const ephemeral=new GoogleGenAI({apiKey:token.name,httpOptions:{apiVersion:'v1alpha'}});
 await new Promise(async(resolve,reject)=>{let session;let done=false;const timeout=setTimeout(()=>{done=true;session?.close();reject(new Error('Live audio response timed out'));},20000);try{session=await ephemeral.live.connect({model:process.env.GEMINI_LIVE_MODEL,config:{responseModalities:[Modality.AUDIO],realtimeInputConfig:{automaticActivityDetection:{disabled:true}},inputAudioTranscription:{},outputAudioTranscription:{}},callbacks:{onmessage:message=>{if(message.serverContent?.modelTurn?.parts?.some(p=>p.inlineData?.data)){done=true;clearTimeout(timeout);console.log(JSON.stringify({check:'live audio response',model:process.env.GEMINI_LIVE_MODEL,success:true}));session?.close();resolve();}},onerror:()=>{if(!done){done=true;clearTimeout(timeout);reject(new Error('Live connection error'));}},onclose:event=>{if(!done){done=true;clearTimeout(timeout);reject(new Error(`Live closed: ${event.reason}`));}}}});session.sendClientContent({turns:[{role:'user',parts:[{text:'Say hello in one short sentence.'}]}],turnComplete:true});}catch(e){clearTimeout(timeout);session?.close();reject(e);}});
}catch(error){console.error(String(error.message??error).replace(/AIza[\w-]+/g,'[REDACTED]'));process.exitCode=1;}
