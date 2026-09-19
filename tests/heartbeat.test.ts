import { describe, expect, it } from 'vitest';
import { bpmFromTension, gainFromTension, tensionFrom } from '../src/lib/heartbeat';

describe('heartbeat tension', () => {
  it('rises with suspicion and face pressure', () => {
    const calm = tensionFrom({
      suspicionScore: 10,
      facePressure: 0.05,
      spike: false,
      pending: false,
    });
    const hot = tensionFrom({
      suspicionScore: 90,
      facePressure: 0.8,
      spike: true,
      pending: true,
    });
    expect(hot).toBeGreaterThan(calm);
    expect(bpmFromTension(hot)).toBeGreaterThan(bpmFromTension(calm));
    expect(gainFromTension(hot)).toBeGreaterThan(gainFromTension(calm));
  });

  it('stays bounded', () => {
    const t = tensionFrom({
      suspicionScore: 200,
      facePressure: 2,
      spike: true,
      pending: true,
    });
    expect(t).toBeLessThanOrEqual(1);
    expect(t).toBeGreaterThan(0);
  });
});
