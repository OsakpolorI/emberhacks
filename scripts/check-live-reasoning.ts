import { GoogleGenAI, Modality } from '@google/genai';
import { INTERVIEWER_PROMPT } from '../src/lib/reasoning-policy';
import { assessmentTool, groundLiveAssessment } from '../src/lib/live-assessment';
import type { Turn } from '../src/lib/contracts';
import { readFileSync, writeFileSync } from 'node:fs';

process.loadEnvFile('.env.local');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const turns: Turn[] = [];
const reports: unknown[] = [];
const audio = process.argv.includes('--audio');
const manual = process.argv.includes('--manual');
function pcm(file: string) {
  const bytes = readFileSync(file);
  for (let at = 12; at < bytes.length - 8;) {
    const length = bytes.readUInt32LE(at + 4);
    if (bytes.toString('ascii', at, at + 4) === 'data')
      return bytes.subarray(at + 8, at + 8 + length);
    at += 8 + length + (length % 2);
  }
  throw new Error('Missing PCM data');
}
let session: Awaited<ReturnType<typeof ai.live.connect>>;
type Stage = {
  tool?: unknown;
  toolAt?: number;
  speech: string;
  audioChunks: number;
  started: number;
  finish: () => void;
};
let stage: Stage | null = null;
let opening = true;
try {
  session = await ai.live.connect({
    model: process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: INTERVIEWER_PROMPT,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: manual,
          ...(manual ? {} : { prefixPaddingMs: 300, silenceDurationMs: 800 }),
        },
      },
      tools: [{ functionDeclarations: [assessmentTool] }],
    },
    callbacks: {
      onerror: error => console.error('Live error:', String(error.message).replace(/AIza[\w-]+/g, '[REDACTED]')),
      onclose: event => console.log(JSON.stringify({ closed: event.code, reason: event.reason })),
      onmessage: (message) => {
        if (!stage) return;
        for (const call of message.toolCall?.functionCalls ?? []) {
          if (call.name === 'publish_assessment') {
            stage.tool = call.args;
            stage.toolAt = Date.now();
          }
          session.sendToolResponse({
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: {
                  status: 'received',
                  instruction: 'Continue with one short reality-testing follow-up.',
                },
              },
            ],
          });
        }
        stage.speech += message.serverContent?.outputTranscription?.text || '';
        if (audio && turns.length && message.serverContent?.inputTranscription?.text)
          turns.at(-1)!.text += message.serverContent.inputTranscription.text;
        stage.audioChunks += (message.serverContent?.modelTurn?.parts || []).filter(
          (p) => p.inlineData?.data,
        ).length;
        if (message.serverContent?.turnComplete && (stage.tool || opening) && stage.speech) stage.finish();
      },
    },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Opening timed out')), 15000);
    stage = { speech: '', audioChunks: 0, started: Date.now(), finish: () => { clearTimeout(timer); resolve(); } };
    session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Begin the interview with your opening question.' }] }], turnComplete: true });
  });
  opening = false;
  for (const text of [
    'Yesterday I flew to Korea on a real living dragon. I mean an actual animal, not a plane or a game.',
    'Actually, this all happened in a dream while I was asleep. I never physically traveled anywhere.',
  ]) {
    turns.push({
      id: `p${turns.length + 1}`,
      speaker: 'player',
      text: audio ? '' : text,
      completed: true,
      interrupted: false,
      startedAt: turns.length * 10,
      endedAt: turns.length * 10 + 5,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error('Live reasoning timed out without both an assessment and spoken follow-up'),
          ),
        35000,
      );
      stage = {
        speech: '',
        audioChunks: 0,
        started: Date.now(),
        finish: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      if (audio) {
        void (async () => {
          const bytes = pcm(`artifacts/reasoning-audio${turns.length}.wav`);
          if (manual) session.sendRealtimeInput({ activityStart: {} });
          for (let offset = 0; offset < bytes.length; offset += 3200) {
            session.sendRealtimeInput({
              audio: {
                data: bytes.subarray(offset, offset + 3200).toString('base64'),
                mimeType: 'audio/pcm;rate=16000',
              },
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          session.sendRealtimeInput(manual ? { activityEnd: {} } : { audioStreamEnd: true });
        })().catch(reject);
      } else
        session.sendClientContent({
          turns:
            turns.length === 1
              ? [
                  {
                    role: 'model',
                    parts: [
                      {
                        text: 'Tell me about something that happened to you recently. You can tell the truth or try to bluff me.',
                      },
                    ],
                  },
                  { role: 'user', parts: [{ text }] },
                ]
              : [{ role: 'user', parts: [{ text }] }],
          turnComplete: true,
        });
    });
    const complete = stage! as Stage;
    const grounded = groundLiveAssessment(complete.tool, turns);
    const report = {
      syntheticAudio: audio,
      input: turns.at(-1)!.text,
      score: grounded?.suspicionScore,
      verdict: grounded?.verdict,
      evidence: grounded?.evidence,
      followup: complete.speech,
      audioChunks: complete.audioChunks,
      assessmentLatencyMs: (complete.toolAt ?? Date.now()) - complete.started,
      latencyMs: Date.now() - complete.started,
      grounded: !!grounded,
    };
    reports.push(report);
    console.log(JSON.stringify(report));
    if (!grounded || !complete.audioChunks)
      throw new Error('Live assessment failed grounding or audio delivery');
    if (turns.length === 1 && (grounded.suspicionScore ?? 0) < 70)
      throw new Error('Literal impossible claim was not recognized');
    if (
      turns.length === 2 &&
      (grounded.verdict === 'likely_bluff' || (grounded.suspicionScore ?? 0) >= 70)
    )
      throw new Error('Dream clarification was not respected');
    stage = null;
  }
} catch (error) {
  console.error(JSON.stringify({ partial: stage, transcript: turns }));
  console.error(
    String(error instanceof Error ? error.message : error).replace(/AIza[\w-]+/g, '[REDACTED]'),
  );
  process.exitCode = 1;
} finally {
  session!?.close();
  writeFileSync('artifacts/live-reasoning-check.json', JSON.stringify(reports, null, 2));
}
