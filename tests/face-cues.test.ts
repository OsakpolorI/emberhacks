import { describe, expect, it } from 'vitest';
import {
  dist,
  eyeAspectRatio,
  pctChange,
  summarizeAnswer,
} from '../src/lib/face-cues';

describe('face cue math', () => {
  it('computes EAR for an open-looking eye', () => {
    const landmarks = Array.from({ length: 400 }, () => ({ x: 0, y: 0 }));
    const idx = [33, 160, 158, 133, 153, 144] as const;
    landmarks[33] = { x: 0, y: 0 };
    landmarks[133] = { x: 1, y: 0 };
    landmarks[160] = { x: 0.3, y: -0.15 };
    landmarks[158] = { x: 0.7, y: -0.15 };
    landmarks[153] = { x: 0.7, y: 0.15 };
    landmarks[144] = { x: 0.3, y: 0.15 };
    expect(eyeAspectRatio(landmarks, idx)).toBeGreaterThan(0.2);
  });

  it('flags elevated blink and head motion deltas', () => {
    const summary = summarizeAnswer(
      { blinkRate: 14, headMotion: 0.18, eyeOpenness: 0.7 },
      { blinkRate: 23, headMotion: 0.34, eyeOpenness: 0.68, blinkCount: 4 },
    );
    expect(summary.elevated).toBe(true);
    expect(summary.labels).toEqual(expect.arrayContaining(['blinks ↑', 'head motion ↑']));
    expect(summary.prompt).toContain('blink rate up');
  });

  it('stays quiet near baseline', () => {
    const summary = summarizeAnswer(
      { blinkRate: 14, headMotion: 0.18, eyeOpenness: 0.7 },
      { blinkRate: 15, headMotion: 0.19, eyeOpenness: 0.69, blinkCount: 1 },
    );
    expect(summary.elevated).toBe(false);
    expect(summary.prompt).toContain('near baseline');
  });

  it('supports distance and percent helpers', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pctChange(23, 14)).toBe(64);
  });
});
