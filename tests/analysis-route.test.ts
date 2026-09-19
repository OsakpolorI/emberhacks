import { beforeEach, describe, expect, it, vi } from 'vitest';
import { previewAssessment } from '../src/lib/fixtures';
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/lib/server', () => ({
  gemini: () => ({ interactions: { create: mock.create } }),
  localRequest: () => true,
  apiError: () => Response.json({ error: 'unavailable' }, { status: 502 }),
}));
const turns = [
  {
    id: 'p1',
    speaker: 'player',
    text: 'We arrived at the restaurant at six.',
    startedAt: 0,
    endedAt: 5,
    completed: true,
    interrupted: false,
  },
  {
    id: 'p2',
    speaker: 'player',
    text: 'We left home at seven, then drove straight there.',
    startedAt: 6,
    endedAt: 10,
    completed: true,
    interrupted: false,
  },
];
function request(mode = 'final', transcript = turns) {
  return new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ roundId: 'test', sequence: 2, mode, turns: transcript }),
  });
}
beforeEach(() => {
  vi.resetModules();
  mock.create.mockReset();
  mock.create.mockResolvedValue({ output_text: JSON.stringify(previewAssessment) });
});
describe('analysis route resilience', () => {
  it('uses structured nonstored interactions and reports the actual model', async () => {
    const { POST } = await import('../src/app/api/analyze/route');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).model).toBe('gemini-3.8-flash');
    expect(mock.create.mock.calls[0][0].store).toBe(false);
  });
  it('falls back once on provider overload', async () => {
    mock.create.mockRejectedValueOnce(new Error('503 UNAVAILABLE'));
    const { POST } = await import('../src/app/api/analyze/route');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).model).toBe('gemini-3.6-flash');
    expect(mock.create).toHaveBeenCalledTimes(2);
  });
  it('cools down an exhausted primary model', async () => {
    mock.create.mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED'));
    const { POST } = await import('../src/app/api/analyze/route');
    await POST(request());
    await POST(request());
    expect(mock.create).toHaveBeenCalledTimes(3);
    expect(mock.create.mock.calls[2][0].model).toBe('gemini-3.6-flash');
  });
  it('returns inconclusive without spending a request for an empty round', async () => {
    const { POST } = await import('../src/app/api/analyze/route');
    const response = await POST(request('final', []));
    expect((await response.json()).verdict).toBe('insufficient_evidence');
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('allows tentative updates while the player is still speaking', async () => {
    mock.create.mockResolvedValue({
      output_text: JSON.stringify({
        ...previewAssessment,
        evidence: [previewAssessment.evidence[1]],
        evidenceStrength: 'weak',
      }),
    });
    const { POST } = await import('../src/app/api/analyze/route');
    const response = await POST(
      request(
        'live',
        turns.map((t) => ({ ...t, completed: false })),
      ),
    );
    expect((await response.json()).evidence).toHaveLength(1);
    expect(mock.create).toHaveBeenCalledTimes(1);
  });
});
