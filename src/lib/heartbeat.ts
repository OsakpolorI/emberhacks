import type { AssessmentPoint } from './contracts';

/** A simulated game pulse. Only a grounded content concern changes its tempo. */
export function hasGroundedConcern(point: AssessmentPoint | undefined): boolean {
  return (
    !!point &&
    point.suspicionScore !== null &&
    point.suspicionScore >= 60 &&
    point.evidenceStrength !== 'insufficient' &&
    point.evidence.some((card) =>
      ['possible_contradiction', 'implausible_claim'].includes(card.category),
    )
  );
}

export function targetBpm(
  point: AssessmentPoint | undefined,
  restingBpm = 64,
  reactionBpm = 32,
): number {
  const rest = Math.max(50, Math.min(90, restingBpm));
  if (!hasGroundedConcern(point)) return rest;
  const strength = Math.max(0, Math.min(1, ((point!.suspicionScore ?? 60) - 60) / 40));
  return Math.round(rest + Math.max(0, Math.min(40, reactionBpm)) * (0.35 + 0.65 * strength));
}

/** Soft dual-thump heartbeat using Web Audio (no asset files). */
export class HeartbeatAudio {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private bpm = 64;
  private volume = 0.35;
  private running = false;

  setBpm(bpm: number) {
    this.bpm = Math.max(50, Math.min(130, bpm));
  }
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  async start() {
    if (this.running) return;
    this.running = true;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctx();
    if (this.context.state === 'suspended') await this.context.resume();
    this.schedule();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    void this.context?.close().catch(() => {});
    this.context = null;
  }

  private schedule() {
    if (!this.running || !this.context) return;
    this.thump();
    this.timer = setTimeout(() => this.schedule(), 60000 / this.bpm);
  }

  private thump() {
    const ctx = this.context;
    if (!ctx || this.volume <= 0) return;
    const now = ctx.currentTime;
    const gain = 0.1 * this.volume;
    this.hit(now, 48, 0.09, gain);
    this.hit(now + 0.12, 36, 0.07, gain * 0.72);
  }

  private hit(when: number, freq: number, duration: number, volume: number) {
    const ctx = this.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(18, freq * 0.45), when + duration);
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
}
