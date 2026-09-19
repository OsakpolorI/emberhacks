import { describe, expect, it } from 'vitest';
import { hasGroundedConcern, targetBpm } from '../src/lib/heartbeat';
import type { AssessmentPoint } from '../src/lib/contracts';

const point = (overrides: Partial<AssessmentPoint>): AssessmentPoint => ({
  suspicionScore: 80,
  evidenceStrength: 'moderate',
  verdict: 'likely_bluff',
  evidence: [
    {
      category: 'implausible_claim',
      claim: 'A literal dragon',
      quotes: [{ turnId: 'player-1', text: 'I flew on a dragon' }],
    },
  ],
  uncertainty: [],
  explanation: 'The literal claim is implausible.',
  spokenSummary: 'Likely bluff.',
  sequence: 1,
  timestamp: 10,
  latencyMs: 0,
  ...overrides,
});

describe('simulated evidence pulse', () => {
  it('stays at rest for pending, absent, weak, or non-substantive assessments', () => {
    expect(targetBpm(undefined)).toBe(64);
    expect(
      targetBpm(
        point({
          suspicionScore: 95,
          evidence: [{ category: 'needs_clarification', claim: 'Unclear', quotes: [] }],
        }),
      ),
    ).toBe(64);
    expect(targetBpm(point({ suspicionScore: 55 }))).toBe(64);
    expect(targetBpm(point({ suspicionScore: null }))).toBe(64);
  });

  it('rises only for a cited substantive concern and returns when resolved', () => {
    expect(hasGroundedConcern(point({}))).toBe(true);
    expect(targetBpm(point({}))).toBeGreaterThan(64);
    expect(targetBpm(point({ suspicionScore: 20, verdict: 'insufficient_evidence' }))).toBe(64);
    expect(targetBpm(point({}), 70, 0)).toBe(70);
  });
});
