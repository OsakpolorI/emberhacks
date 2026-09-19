export class SpeechMeter {
  private baseline: number[] = [];
  private active = false;
  private quietSince = 0;
  private previous = 0;
  private playbackEnd: number | null = null;
  private overlap = false;
  speechMs = 0;
  silenceMs = 0;
  latencies: number[] = [];
  markPlaybackEnd(now: number) {
    this.playbackEnd = now;
    this.overlap = false;
  }
  sample(level: number, now: number, aiSpeaking: boolean) {
    const dt = this.previous ? Math.min(150, now - this.previous) : 0;
    this.previous = now;
    if (this.baseline.length < 14 && !aiSpeaking) {
      this.baseline.push(level);
      return { speaking: false, start: false, end: false, calibrating: true };
    }
    const floor = this.baseline.length
      ? this.baseline.reduce((a, b) => a + b, 0) / this.baseline.length
      : 0.003;
    const threshold = Math.max(0.012, Math.min(0.045, floor * 3));
    const loud = level > (this.active ? threshold * 0.65 : threshold);
    let start = false,
      end = false;
    if (loud) {
      this.quietSince = 0;
      if (!this.active) {
        this.active = true;
        start = true;
        if (aiSpeaking) {
          this.overlap = true;
          this.playbackEnd = null;
        } else if (this.playbackEnd !== null && !this.overlap) {
          this.latencies.push(Math.max(0, now - this.playbackEnd));
          this.playbackEnd = null;
        }
      }
    } else if (this.active) {
      if (!this.quietSince) this.quietSince = now;
      if (now - this.quietSince > 850) {
        this.active = false;
        end = true;
      }
    }
    if (!aiSpeaking) {
      if (loud) this.speechMs += dt;
      else this.silenceMs += dt;
    }
    return { speaking: loud, start, end, calibrating: false };
  }
}
