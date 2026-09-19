import { describe, it, expect, vi } from 'vitest';
import { groundAssessment, insufficient } from '../src/lib/analysis';
import {
  canRequestVerdict,
  emptyRound,
  roundReducer,
  shouldFinish,
  type Turn,
} from '../src/lib/contracts';
import { previewAssessment, reasoningFixtures } from '../src/lib/fixtures';
import { LatestQueue } from '../src/lib/queue';
import { SpeechMeter } from '../src/lib/metrics';
const turns: Turn[] = [
  {
    id: 'p1',
    speaker: 'player',
    text: 'We arrived at the restaurant at six.',
    startedAt: 0,
    endedAt: 10,
    completed: true,
    interrupted: false,
  },
  {
    id: 'p2',
    speaker: 'player',
    text: 'We left home at seven, then drove straight there.',
    startedAt: 15,
    endedAt: 20,
    completed: true,
    interrupted: false,
  },
];
describe('grounded evidence', () => {
  it('accepts exact player quotes', () =>
    expect(groundAssessment(previewAssessment, turns).evidence).toHaveLength(2));
  it('discards fabricated quotes and withholds the verdict', () => {
    const input = {
      ...previewAssessment,
      evidence: [
        {
          ...previewAssessment.evidence[0],
          quotes: [{ turnId: 'p1', text: 'You blinked suspiciously' }],
        },
      ],
    };
    expect(groundAssessment(input, turns)).toEqual(
      insufficient(
        'No sufficiently grounded evidence was available. A consistent story alone cannot establish truth.',
      ),
    );
  });
  it('rejects interviewer words as player evidence', () =>
    expect(
      groundAssessment(
        previewAssessment,
        turns.map((t) => ({ ...t, speaker: 'gemini' as const })),
      ).verdict,
    ).toBe('insufficient_evidence'));
  it('does not treat unfinished speech as contradiction', () =>
    expect(
      groundAssessment(
        { ...previewAssessment, evidence: [previewAssessment.evidence[0]] },
        turns.map((t) => ({ ...t, completed: false })),
      ).evidence,
    ).toHaveLength(0));
  it('keeps insufficient evidence score null', () =>
    expect(
      groundAssessment({ ...previewAssessment, evidenceStrength: 'insufficient' }, turns)
        .suspicionScore,
    ).toBeNull());
  it('has all six reasoning fixtures', () => expect(reasoningFixtures).toHaveLength(6));
});
describe('round boundaries', () => {
  it('ignores stale round responses', () => {
    const state = emptyRound('new');
    expect(roundReducer(state, { type: 'patch', id: 'old', patch: { error: 'late' } })).toBe(state);
  });
  it('only finalizes past the safety ceiling', () => {
    expect(shouldFinish(1799)).toBe(false);
    expect(shouldFinish(1800)).toBe(true);
  });
  it('requires at least one answered follow-up before a verdict', () => {
    expect(canRequestVerdict(turns.slice(0, 1))).toBe(false);
    expect(canRequestVerdict(turns)).toBe(true);
  });
});
describe('single-flight analysis', () => {
  it('coalesces to newest snapshot without overlap', async () => {
    const completed: number[] = [];
    const runs: number[] = [];
    let release: () => void = () => {};
    const queue = new LatestQueue<number, number>(
      async (i) => {
        runs.push(i);
        if (i === 1) await new Promise<void>((r) => (release = r));
        return i;
      },
      (result) => completed.push(result),
      () => {},
    );
    queue.push(1);
    queue.push(2);
    queue.push(3);
    expect(runs).toEqual([1]);
    release();
    await vi.waitFor(() => expect(completed).toEqual([1, 3]));
    expect(runs).toEqual([1, 3]);
  });
  it('discards a response after cancellation', async () => {
    let release: () => void = () => {};
    const accept = vi.fn();
    const queue = new LatestQueue<number, number>(
      async (i) => {
        await new Promise<void>((r) => (release = r));
        return i;
      },
      accept,
      () => {},
    );
    queue.push(1);
    queue.close();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(accept).not.toHaveBeenCalled();
  });
});
describe('speech measurements', () => {
  it('excludes AI playback from speech and silence durations', () => {
    const meter = new SpeechMeter();
    for (let i = 1; i <= 14; i++) meter.sample(0.001, i * 50, false);
    meter.sample(0.1, 800, true);
    meter.sample(0.001, 850, true);
    expect(meter.speechMs).toBe(0);
    expect(meter.silenceMs).toBe(0);
  });
  it('measures latency only after completed playback', () => {
    const meter = new SpeechMeter();
    for (let i = 1; i <= 14; i++) meter.sample(0.001, i * 50, false);
    meter.markPlaybackEnd(800);
    meter.sample(0.08, 1300, false);
    expect(meter.latencies).toEqual([500]);
  });
  it('does not score overlaps as response latency', () => {
    const meter = new SpeechMeter();
    for (let i = 1; i <= 14; i++) meter.sample(0.001, i * 50, false);
    meter.markPlaybackEnd(800);
    meter.sample(0.08, 900, true);
    expect(meter.latencies).toEqual([]);
  });
});
