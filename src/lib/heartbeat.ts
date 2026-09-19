/** Theatrical tension meter for the live heart — not calibrated lie probability. */

export function tensionFrom(input: {
  suspicionScore: number | null | undefined;
  facePressure: number;
  spike: boolean;
  pending: boolean;
}): number {
  const score = input.suspicionScore == null ? 0.12 : Math.max(0, Math.min(1, input.suspicionScore / 100));
  const face = Math.max(0, Math.min(1, input.facePressure)) * 0.38;
  const boost = (input.spike ? 0.14 : 0) + (input.pending ? 0.06 : 0);
  return Math.max(0.05, Math.min(1, score * 0.65 + face + boost));
}

export function bpmFromTension(tension: number) {
  return Math.round(56 + tension * 86);
}

export function gainFromTension(tension: number) {
  return 0.035 + tension * 0.3;
}

/** Soft dual-thump heartbeat using Web Audio (no asset files). */
export class HeartbeatAudio {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private tension = 0.12;
  private muted = false;
  private running = false;

  setTension(tension: number) {
    this.tension = Math.max(0, Math.min(1, tension));
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
    const bpm = bpmFromTension(this.tension);
    const interval = 60000 / bpm;
    this.thump();
    this.timer = setTimeout(() => this.schedule(), interval);
  }

  private thump() {
    const ctx = this.context;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const master = gainFromTension(this.tension);
    this.hit(now, 48, 0.09, master);
    this.hit(now + 0.12, 36, 0.07, master * 0.72);
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
