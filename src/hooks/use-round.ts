'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  assessmentSchema,
  emptyRound,
  roundReducer,
  shouldFinish,
  type AnalyzeRequest,
  type AssessmentPoint,
  type RoundState,
  type Turn,
} from '@/lib/contracts';
import { LiveInterview, type InputMode } from '@/lib/live';
import { LatestQueue } from '@/lib/queue';
import { previewRound } from '@/lib/fixtures';
import {
  groundLiveAssessment,
  liveReviewFallback,
  playerSignature,
  liveAssessmentSchema,
} from '@/lib/live-assessment';

class AnalysisError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function analyze(item: AnalyzeRequest, signal: AbortSignal): Promise<AssessmentPoint> {
  const started = Date.now();
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
    signal: AbortSignal.any([signal, AbortSignal.timeout(28000)]),
  });
  const body = await response.json();
  if (!response.ok) throw new AnalysisError(body.error || 'Analysis unavailable', response.status);
  return {
    ...assessmentSchema.parse(body),
    sequence: item.sequence,
    timestamp: 0,
    latencyMs: body.latencyMs ?? Date.now() - started,
    model: body.model,
  };
}
export function useRound() {
  const [state, dispatch] = useReducer(roundReducer, undefined, () => emptyRound());
  const current = useRef(state);
  const [mode, setModeState] = useState<InputMode>('auto');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const live = useRef<LiveInterview | null>(null);
  const queue = useRef<LatestQueue<AnalyzeRequest, AssessmentPoint> | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finalController = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const lastAnalyzed = useRef('');
  const quotaPauseUntil = useRef(0);
  const pendingLive = useRef<unknown>(null);
  const lastLive = useRef<{ point: AssessmentPoint; covered: string } | null>(null);
  const lastSpeechAt = useRef(0);
  const finishRef = useRef<() => Promise<void>>(async () => {});
  function patch(patch: Partial<RoundState>, id = current.current.id) {
    if (id !== current.current.id) return;
    current.current = { ...current.current, ...patch };
    dispatch({ type: 'patch', id, patch });
  }
  function replace(next: RoundState) {
    current.current = next;
    dispatch({ type: 'reset', state: next });
  }
  function cleanup() {
    clearInterval(timer.current);
    clearTimeout(connectionTimer.current);
    queue.current?.close();
    live.current?.stop();
    live.current = null;
    finalController.current?.abort();
    window.speechSynthesis?.cancel();
    setStream(null);
    pendingLive.current = null;
    lastLive.current = null;
  }
  useEffect(
    () => () => {
      clearInterval(timer.current);
      clearTimeout(connectionTimer.current);
      queue.current?.close();
      live.current?.stop();
      finalController.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );
  function addText(speaker: Turn['speaker'], text: string, finished = false) {
    if (speaker === 'player' && text) lastSpeechAt.current = Date.now();
    const s = current.current;
    const turns = s.turns.map((t) => ({ ...t }));
    let turn = turns.findLast((t) => t.speaker === speaker && !t.completed && !t.interrupted);
    if (!turn && text) {
      turn = {
        id: `${speaker}-${turns.length + 1}`,
        speaker,
        text: '',
        startedAt: s.elapsed,
        endedAt: null,
        completed: false,
        interrupted: false,
      };
      turns.push(turn);
    }
    if (turn) {
      turn.text += text;
      if (finished) {
        turn.completed = true;
        turn.endedAt = s.elapsed;
      }
    }
    patch({
      turns,
      ...(speaker === 'player' && text ? { assessmentPending: true } : {}),
      ...(speaker === 'gemini' && turn ? { question: turn.text } : {}),
    });
  }
  function acceptLiveAssessment() {
    if (!pendingLive.current) return;
    const assessment = groundLiveAssessment(pendingLive.current, current.current.turns);
    if (!assessment) return;
    const covered = playerSignature(current.current.turns);
    pendingLive.current = null;
    if (lastLive.current?.covered === covered) return;
    const point: AssessmentPoint = {
      ...assessment,
      sequence: ++sequence.current,
      timestamp: current.current.elapsed,
      latencyMs: 0,
      model: 'Gemini Live',
    };
    lastLive.current = { point, covered };
    patch({
      points: [...current.current.points, point],
      analysisError: null,
      assessmentPending: false,
    });
  }
  async function finish() {
    const s = current.current;
    if (!['interviewing', 'error'].includes(s.phase) || s.preview) return;
    const id = s.id;
    patch({ phase: 'finalizing', error: null, aiSpeaking: false, assessmentPending: true });
    clearInterval(timer.current);
    queue.current?.close();
    live.current?.stop();
    live.current = null;
    setStream(null);
    const controller = new AbortController();
    finalController.current = controller;
    const input: AnalyzeRequest = {
      roundId: id,
      sequence: ++sequence.current,
      mode: 'final',
      turns: s.turns,
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await analyze(
          input,
          AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        );
        if (current.current.id !== id || controller.signal.aborted) return;
        patch(
          {
            phase: 'result',
            final: result,
            points: [...current.current.points, { ...result, timestamp: s.elapsed }],
            analysisError: null,
            assessmentPending: false,
          },
          id,
        );
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(result.spokenSummary);
          utterance.lang = 'en-US';
          utterance.rate = 1;
          window.speechSynthesis.speak(utterance);
        }
        return;
      } catch (e) {
        if (controller.signal.aborted || current.current.id !== id) return;
        if (attempt === 1 || (e instanceof AnalysisError && e.status === 429)) {
          const fallback = lastLive.current
            ? liveReviewFallback(lastLive.current.point, lastLive.current.covered, s.turns)
            : null;
          patch(
            {
              phase: 'result',
              error: fallback ? null : e instanceof Error ? e.message : 'Assessment unavailable',
              final: fallback,
              assessmentPending: false,
              analysisError: fallback
                ? 'Independent review unavailable; using the validated Live assessment where it covers the complete story.'
                : null,
            },
            id,
          );
          if (fallback && 'speechSynthesis' in window)
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(fallback.spokenSummary));
          return;
        }
      }
    }
  }
  finishRef.current = finish;
  async function start() {
    cleanup();
    const id = crypto.randomUUID();
    replace({ ...emptyRound(id), phase: 'connecting', startedAt: Date.now() });
    sequence.current = 0;
    lastAnalyzed.current = '';
    quotaPauseUntil.current = 0;
    let signalTime = 0;
    let frameCount = 0;
    queue.current = new LatestQueue(
      (item, signal) => {
        if (Date.now() < quotaPauseUntil.current)
          throw new AnalysisError(
            'Gemini quota reached. Live assessments are paused for one minute.',
            429,
          );
        return analyze(item, signal);
      },
      (result, item) => {
        if (current.current.id !== id || current.current.phase !== 'interviewing') return;
        if (result.sequence <= (current.current.points.at(-1)?.sequence ?? -1)) return;
        patch(
          {
            points: [
              ...current.current.points,
              { ...result, timestamp: (Date.now() - current.current.startedAt) / 1000 },
            ],
            analysisError: null,
            assessmentPending:
              playerSignature(item.turns) !== playerSignature(current.current.turns),
          },
          id,
        );
      },
      (error) => {
        if (error instanceof AnalysisError && error.status === 429)
          quotaPauseUntil.current = Date.now() + 60000;
        patch({ analysisError: error instanceof Error ? error.message : 'Analysis delayed' }, id);
      },
      8000,
    );
    const engine = new LiveInterview(mode, {
      camera: (camera) => {
        if (current.current.id !== id) return;
        setStream(camera);
        patch({ camera: !!camera }, id);
      },
      frame: () => {
        frameCount++;
        if (current.current.id === id) patch({ cameraFrames: frameCount }, id);
      },
      error: (message) => {
        if (
          current.current.id !== id ||
          !['connecting', 'interviewing'].includes(current.current.phase)
        )
          return;
        patch({ phase: 'error', error: message, aiSpeaking: false }, id);
        clearInterval(timer.current);
        queue.current?.close();
        engine.stop();
      },
      signal: (level, speaking, aiSpeaking, meter) => {
        if (current.current.id !== id || current.current.phase !== 'interviewing') return;
        const now = performance.now();
        if (now - signalTime < 100) return;
        signalTime = now;
        patch(
          {
            signals: [
              ...current.current.signals,
              {
                timestamp: (Date.now() - current.current.startedAt) / 1000,
                level,
                speaking,
                aiSpeaking,
              },
            ].slice(-2000),
            aiSpeaking,
            speechMs: meter.speechMs,
            silenceMs: meter.silenceMs,
            latencies: [...meter.latencies],
          },
          id,
        );
      },
      message: (message) => {
        // Live can send transcripts before start() finishes setting up media.
        if (
          current.current.id !== id ||
          !['connecting', 'interviewing'].includes(current.current.phase)
        )
          return;
        const c = message.serverContent;
        if (c?.inputTranscription)
          addText('player', c.inputTranscription.text ?? '', !!c.inputTranscription.finished);
        if (c?.outputTranscription) {
          patch({
            turns: current.current.turns.map((t) =>
              t.speaker === 'player' && !t.completed
                ? { ...t, completed: true, endedAt: current.current.elapsed }
                : t,
            ),
          });
          addText('gemini', c.outputTranscription.text ?? '', !!c.outputTranscription.finished);
        }
        if (c?.interrupted)
          patch({
            aiSpeaking: false,
            turns: current.current.turns.map((t) =>
              t.speaker === 'gemini' && !t.completed
                ? { ...t, interrupted: true, completed: true, endedAt: current.current.elapsed }
                : t,
            ),
          });
        if (c?.turnComplete) {
          patch({
            turns: current.current.turns.map((t) =>
              !t.completed ? { ...t, completed: true, endedAt: current.current.elapsed } : t,
            ),
          });
        }
        // Tools may precede transcription delivery. Retry grounding after each fragment.
        for (const call of message.toolCall?.functionCalls ?? []) {
          if (call.name === 'publish_assessment') {
            const valid = liveAssessmentSchema.safeParse(call.args).success;
            if (valid) pendingLive.current = call.args;
            acceptLiveAssessment();
            engine.session?.sendToolResponse({
              functionResponses: [
                {
                  id: call.id,
                  name: call.name,
                  response: {
                    status: valid ? 'received' : 'invalid',
                    instruction: valid
                      ? 'Continue with one short reality-testing follow-up. The player ends the round with the End button. The client verifies quotes against the transcript.'
                      : 'Call publish_assessment with every required field and exact quotes.',
                  },
                },
              ],
            });
            continue;
          }
          acceptLiveAssessment();
          // Ending is player-controlled via End & assess; ignore request_verdict.
          engine.session?.sendToolResponse({
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: {
                  status: 'continue',
                  instruction:
                    'Keep interviewing with one short follow-up. The player ends the round when ready.',
                },
              },
            ],
          });
        }
        acceptLiveAssessment();
        if (c?.turnComplete && shouldFinish(current.current.turns, current.current.elapsed, true))
          void finishRef.current();
      },
    });
    live.current = engine;
    const startupTimeout = setTimeout(() => {
      if (current.current.id === id && current.current.phase === 'connecting') {
        engine.stop();
        patch(
          {
            phase: 'error',
            error:
              'Connection timed out. Allow microphone access in the browser, then retry. Camera access is optional.',
          },
          id,
        );
      }
    }, 30000);
    connectionTimer.current = startupTimeout;
    try {
      await engine.start();
      clearTimeout(startupTimeout);
      if (current.current.id !== id || engine.closed) return;
      patch({ phase: 'interviewing', startedAt: Date.now() }, id);
      let lastRequest = Date.now();
      let limitReachedAt = 0;
      timer.current = setInterval(() => {
        if (current.current.id !== id || current.current.phase !== 'interviewing') return;
        const elapsed = (Date.now() - current.current.startedAt) / 1000;
        patch({ elapsed }, id);
        if (shouldFinish(current.current.turns, elapsed, false)) {
          limitReachedAt ||= Date.now();
          if (
            elapsed >= 190 ||
            lastLive.current?.covered === playerSignature(current.current.turns) ||
            Date.now() - limitReachedAt >= 10000
          ) {
            void finishRef.current();
            return;
          }
        }
        const signature = current.current.turns
          .filter((t) => t.speaker === 'player')
          .map((t) => `${t.text}:${t.completed}`)
          .join('|');
        if (
          Date.now() >= quotaPauseUntil.current &&
          Date.now() - lastRequest >= 20000 &&
          Date.now() - lastSpeechAt.current >= 12000 &&
          lastLive.current?.covered !== playerSignature(current.current.turns) &&
          signature &&
          signature !== lastAnalyzed.current
        ) {
          lastRequest = Date.now();
          lastAnalyzed.current = signature;
          queue.current?.push({
            roundId: id,
            sequence: ++sequence.current,
            mode: 'live',
            turns: current.current.turns.map((t) => ({ ...t })),
          });
        }
      }, 1000);
    } catch (error) {
      clearTimeout(startupTimeout);
      engine.stop();
      if (current.current.id === id)
        patch(
          { phase: 'error', error: error instanceof Error ? error.message : 'Unable to connect' },
          id,
        );
    }
  }
  function setMode(next: InputMode) {
    setModeState(next);
    live.current?.setMode(next);
  }
  function reset() {
    cleanup();
    replace(emptyRound(crypto.randomUUID()));
  }
  function preview() {
    cleanup();
    replace(previewRound());
  }
  return {
    state,
    stream,
    mode,
    setMode,
    start,
    finish,
    reset,
    preview,
    press: () => live.current?.press(),
    release: () => live.current?.release(),
  };
}
