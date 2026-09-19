import { z } from 'zod';

export const turnSchema = z.object({
  id: z.string().max(100),
  speaker: z.enum(['player', 'gemini']),
  text: z.string().max(12000),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  completed: z.boolean(),
  interrupted: z.boolean(),
});
export type Turn = z.infer<typeof turnSchema>;
export const evidenceSchema = z.object({
  claim: z.string().max(500),
  category: z.enum([
    'possible_contradiction',
    'implausible_claim',
    'consistent_detail',
    'needs_clarification',
    'insufficient_evidence',
  ]),
  quotes: z.array(z.object({ turnId: z.string(), text: z.string().min(1).max(1500) })).max(4),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const assessmentSchema = z.object({
  suspicionScore: z.number().min(0).max(100).nullable(),
  evidenceStrength: z.enum(['insufficient', 'weak', 'moderate', 'strong']),
  evidence: z.array(evidenceSchema).max(3),
  uncertainty: z.array(z.string().max(500)).max(5),
  explanation: z.string().max(1800),
  verdict: z.enum(['likely_bluff', 'likely_truthful', 'insufficient_evidence']),
  spokenSummary: z.string().max(1800),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export const requestSchema = z.object({
  roundId: z.string().min(1).max(100),
  sequence: z.number().int().nonnegative(),
  mode: z.enum(['live', 'final']),
  turns: z.array(turnSchema).max(100),
});
export type AnalyzeRequest = z.infer<typeof requestSchema>;
export type AssessmentPoint = Assessment & {
  sequence: number;
  timestamp: number;
  latencyMs: number;
  model?: string;
};
export type Signal = { timestamp: number; level: number; speaking: boolean; aiSpeaking: boolean };
export type Phase = 'ready' | 'connecting' | 'interviewing' | 'finalizing' | 'result' | 'error';
export type RoundState = {
  id: string;
  phase: Phase;
  startedAt: number;
  elapsed: number;
  turns: Turn[];
  points: AssessmentPoint[];
  signals: Signal[];
  latencies: number[];
  speechMs: number;
  silenceMs: number;
  question: string;
  aiSpeaking: boolean;
  camera: boolean;
  cameraFrames: number;
  error: string | null;
  analysisError: string | null;
  assessmentPending: boolean;
  final: Assessment | null;
  preview: boolean;
};
export const emptyRound = (id = ''): RoundState => ({
  id,
  phase: 'ready',
  startedAt: 0,
  elapsed: 0,
  turns: [],
  points: [],
  signals: [],
  latencies: [],
  speechMs: 0,
  silenceMs: 0,
  question: 'Your story starts here.',
  aiSpeaking: false,
  camera: false,
  cameraFrames: 0,
  error: null,
  analysisError: null,
  assessmentPending: false,
  final: null,
  preview: false,
});
export type RoundAction =
  { type: 'reset'; state: RoundState } | { type: 'patch'; id: string; patch: Partial<RoundState> };
export function roundReducer(state: RoundState, action: RoundAction): RoundState {
  if (action.type === 'reset') return action.state;
  if (action.id !== state.id) return state;
  return { ...state, ...action.patch };
}
export function answeredFollowups(turns: Turn[]) {
  return Math.max(
    0,
    turns.filter((t) => t.speaker === 'player' && t.completed && t.text.trim()).length - 1,
  );
}
// Open-ended: the player can end anytime with "End & assess", and Gemini may
// call request_verdict once it feels the conversation has run its course.
// MAX_SESSION_SECONDS is only a safety ceiling against a forgotten open tab.
export const MAX_SESSION_SECONDS = 30 * 60;
export function shouldFinish(elapsed: number) {
  return elapsed >= MAX_SESSION_SECONDS;
}
export function canRequestVerdict(turns: Turn[]) {
  return answeredFollowups(turns) >= 1;
}
