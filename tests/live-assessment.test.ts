import { dragonAssessment } from './assessment-fixture';
import { describe, expect, it } from 'vitest';
import { groundAssessment } from '../src/lib/analysis';
import {
  groundLiveAssessment,
  liveReviewFallback,
  playerSignature,
} from '../src/lib/live-assessment';
import type { Turn } from '../src/lib/contracts';

const turn: Turn = {
  id: 'p1',
  speaker: 'player',
  text: 'We flew on the dragon to Korea.',
  startedAt: 0,
  endedAt: 3,
  completed: true,
  interrupted: false,
};
describe('live assessment grounding', () => {
  it('accepts an impossible claim without requiring an unrelated contradiction', () => {
    expect(groundLiveAssessment(dragonAssessment, [turn])).toMatchObject({
      verdict: 'likely_bluff',
      suspicionScore: 92,
    });
  });
  it('waits for transcript completion and rejects invented evidence', () => {
    expect(groundLiveAssessment(dragonAssessment, [{ ...turn, completed: false }])).toBeNull();
    expect(
      groundLiveAssessment(
        {
          ...dragonAssessment,
          evidence: [{ ...dragonAssessment.evidence[0], quotes: ['I rode a unicorn.'] }],
        },
        [turn],
      ),
    ).toBeNull();
  });
  it('recovers exact source text from harmless capitalization differences', () => {
    const result = groundLiveAssessment(
      {
        ...dragonAssessment,
        evidence: [
          { ...dragonAssessment.evidence[0], quotes: ['we flew on the dragon to korea.'] },
        ],
      },
      [turn],
    );
    expect(result?.evidence[0].quotes[0]).toEqual({
      turnId: 'p1',
      text: 'We flew on the dragon to Korea',
    });
  });
  it('will not apply an older assessment to a new answer', () => {
    const correction = { ...turn, id: 'p2', text: 'It happened in a dream while I was asleep.' };
    expect(groundLiveAssessment(dragonAssessment, [turn, correction])).toBeNull();
    const last = groundLiveAssessment(dragonAssessment, [turn])!;
    expect(liveReviewFallback(last, playerSignature([turn]), [turn, correction]).verdict).toBe(
      'insufficient_evidence',
    );
  });
  it('uses a covered, validated live assessment during final-review quota failure', () => {
    const last = groundLiveAssessment(dragonAssessment, [turn])!;
    expect(liveReviewFallback(last, playerSignature([turn]), [turn])).toMatchObject({
      verdict: 'likely_bluff',
      suspicionScore: 92,
    });
  });
  it('the independent analyst accepts a grounded implausibility as evidence', () => {
    expect(
      groundAssessment(
        {
          ...dragonAssessment,
          spokenSummary: '',
          evidence: [
            { ...dragonAssessment.evidence[0], quotes: [{ turnId: turn.id, text: turn.text }] },
          ],
        },
        [turn],
      ).verdict,
    ).toBe('likely_bluff');
  });
});
