'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import { assessmentSchema, canRequestVerdict, emptyRound, roundReducer, shouldFinish, type AnalyzeRequest, type AssessmentPoint, type RoundState, type Turn } from '@/lib/contracts';
import { LiveInterview, type InputMode } from '@/lib/live';
import { LatestQueue } from '@/lib/queue';
import { previewRound } from '@/lib/fixtures';

async function analyze(item:AnalyzeRequest,signal:AbortSignal):Promise<AssessmentPoint>{const started=Date.now();const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item),signal});const body=await response.json();if(!response.ok)throw new Error(body.error||'Analysis unavailable');return {...assessmentSchema.parse(body),sequence:item.sequence,timestamp:0,latencyMs:body.latencyMs??Date.now()-started};}
export function useRound(){
 const [state,dispatch]=useReducer(roundReducer,undefined,()=>emptyRound());const current=useRef(state);const [mode,setModeState]=useState<InputMode>('auto');const [stream,setStream]=useState<MediaStream|null>(null);
 const live=useRef<LiveInterview|null>(null);const queue=useRef<LatestQueue<AnalyzeRequest,AssessmentPoint>|null>(null);const timer=useRef<ReturnType<typeof setInterval>|undefined>(undefined);const finalController=useRef<AbortController|null>(null);const sequence=useRef(0);const lastAnalyzed=useRef('');const finishRef=useRef<()=>Promise<void>>(async()=>{});
 function patch(patch:Partial<RoundState>,id=current.current.id){if(id!==current.current.id)return;current.current={...current.current,...patch};dispatch({type:'patch',id,patch});}
 function replace(next:RoundState){current.current=next;dispatch({type:'reset',state:next});}
 function cleanup(){clearInterval(timer.current);queue.current?.close();live.current?.stop();live.current=null;finalController.current?.abort();window.speechSynthesis?.cancel();setStream(null);}
 useEffect(()=>()=>{clearInterval(timer.current);queue.current?.close();live.current?.stop();finalController.current?.abort();window.speechSynthesis?.cancel();},[]);
 function addText(speaker:Turn['speaker'],text:string,finished=false){const s=current.current;const turns=s.turns.map(t=>({...t}));let turn=turns.findLast(t=>t.speaker===speaker&&!t.completed&&!t.interrupted);if(!turn&&text){turn={id:`${speaker}-${turns.length+1}`,speaker,text:'',startedAt:s.elapsed,endedAt:null,completed:false,interrupted:false};turns.push(turn);}if(turn){turn.text+=text;if(finished){turn.completed=true;turn.endedAt=s.elapsed;}}patch({turns,...(speaker==='gemini'&&turn?{question:turn.text}:{})});}
 async function finish(){
  const s=current.current;if(!['interviewing','error'].includes(s.phase)||s.preview)return;
  const id=s.id;patch({phase:'finalizing',error:null,aiSpeaking:false});clearInterval(timer.current);queue.current?.close();live.current?.stop();live.current=null;setStream(null);
  const controller=new AbortController();finalController.current=controller;
  const input:AnalyzeRequest={roundId:id,sequence:++sequence.current,mode:'final',turns:s.turns};
  for(let attempt=0;attempt<2;attempt++){try{const result=await analyze(input,AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]));if(current.current.id!==id||controller.signal.aborted)return;patch({phase:'result',final:result,points:[...current.current.points,{...result,timestamp:s.elapsed}],analysisError:null},id);if('speechSynthesis'in window){const utterance=new SpeechSynthesisUtterance(result.spokenSummary);utterance.lang='en-US';utterance.rate=1;window.speechSynthesis.speak(utterance);}return;}catch(e){if(controller.signal.aborted||current.current.id!==id)return;if(attempt===1)patch({phase:'result',error:e instanceof Error?e.message:'Assessment unavailable',final:null},id);}}
 }
 finishRef.current=finish;
 async function start(){
  cleanup();const id=crypto.randomUUID();replace({...emptyRound(id),phase:'connecting',startedAt:Date.now()});sequence.current=0;lastAnalyzed.current='';let signalTime=0;let frameCount=0;
  queue.current=new LatestQueue(analyze,(result,item)=>{if(current.current.id!==id||current.current.phase!=='interviewing')return;patch({points:[...current.current.points,{...result,timestamp:(Date.now()-current.current.startedAt)/1000}],analysisError:null},id);},error=>patch({analysisError:error instanceof Error?error.message:'Analysis delayed'},id));
  const engine=new LiveInterview(mode,{
   camera:camera=>{if(current.current.id!==id)return;setStream(camera);patch({camera:!!camera},id);},frame:()=>{frameCount++;if(current.current.id===id)patch({cameraFrames:frameCount},id);},
   error:message=>{if(current.current.id!==id||!['connecting','interviewing'].includes(current.current.phase))return;patch({phase:'error',error:message,aiSpeaking:false},id);clearInterval(timer.current);queue.current?.close();engine.stop();},
   signal:(level,speaking,aiSpeaking,meter)=>{if(current.current.id!==id||current.current.phase!=='interviewing')return;const now=performance.now();if(now-signalTime<100)return;signalTime=now;patch({signals:[...current.current.signals,{timestamp:(Date.now()-current.current.startedAt)/1000,level,speaking,aiSpeaking}].slice(-2000),aiSpeaking,speechMs:meter.speechMs,silenceMs:meter.silenceMs,latencies:[...meter.latencies]},id);},
   message:message=>{
    if(current.current.id!==id||current.current.phase!=='interviewing')return;
    const c=message.serverContent;
    if(c?.inputTranscription)addText('player',c.inputTranscription.text??'',!!c.inputTranscription.finished);
    if(c?.outputTranscription){patch({turns:current.current.turns.map(t=>t.speaker==='player'&&!t.completed?{...t,completed:true,endedAt:current.current.elapsed}:t)});addText('gemini',c.outputTranscription.text??'',!!c.outputTranscription.finished);}
    if(c?.interrupted)patch({aiSpeaking:false,turns:current.current.turns.map(t=>t.speaker==='gemini'&&!t.completed?{...t,interrupted:true,completed:true,endedAt:current.current.elapsed}:t)});
    if(c?.turnComplete){patch({turns:current.current.turns.map(t=>!t.completed?{...t,completed:true,endedAt:current.current.elapsed}:t)});if(shouldFinish(current.current.turns,current.current.elapsed,true)){void finishRef.current();return;}}
    for(const call of message.toolCall?.functionCalls??[]){const allowed=call.name==='request_verdict'&&canRequestVerdict(current.current.turns);engine.session?.sendToolResponse({functionResponses:[{id:call.id,name:call.name,response:{status:allowed?'finalizing':'continue',instruction:allowed?'The app is producing the verdict. Do not speak further.':'Ask another relevant follow-up; at least two must be answered.'}}]});if(allowed)void finishRef.current();}
   }
  });live.current=engine;
  try{await engine.start();if(current.current.id!==id||engine.closed)return;patch({phase:'interviewing',startedAt:Date.now()},id);let lastRequest=Date.now();timer.current=setInterval(()=>{if(current.current.id!==id||current.current.phase!=='interviewing')return;const elapsed=(Date.now()-current.current.startedAt)/1000;patch({elapsed},id);if(shouldFinish(current.current.turns,elapsed,false)){void finishRef.current();return;}const signature=current.current.turns.filter(t=>t.speaker==='player').map(t=>t.text).join('|');if(Date.now()-lastRequest>=8000&&signature&&signature!==lastAnalyzed.current){lastRequest=Date.now();lastAnalyzed.current=signature;queue.current?.push({roundId:id,sequence:++sequence.current,mode:'live',turns:current.current.turns.map(t=>({...t}))});}},1000);}catch(error){engine.stop();if(current.current.id===id)patch({phase:'error',error:error instanceof Error?error.message:'Unable to connect'},id);}
 }
 function setMode(next:InputMode){setModeState(next);live.current?.setMode(next);}
 function reset(){cleanup();replace(emptyRound(crypto.randomUUID()));}
 function preview(){cleanup();replace(previewRound());}
 return {state,stream,mode,setMode,start,finish,reset,preview,press:()=>live.current?.press(),release:()=>live.current?.release()};
}
