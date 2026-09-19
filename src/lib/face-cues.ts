/** Client-side MediaPipe face cues for hackathon wow — not calibrated lie evidence. */

export type FaceCueBaseline = {
  blinkRate: number;
  headMotion: number;
  eyeOpenness: number;
};

export type FaceCueLive = {
  tracking: boolean;
  calibrated: boolean;
  calibrating: boolean;
  blinkRate: number;
  blinkCount: number;
  eyeOpenness: number;
  headMotion: number;
  mouthMotion: number;
  pressure: number;
  spike: boolean;
  labels: string[];
};

export type FaceCueAnswerSummary = {
  baseline: FaceCueBaseline;
  current: FaceCueBaseline & { blinkCount: number };
  deltas: { blinkRatePct: number; headMotionPct: number; eyeOpennessPct: number };
  elevated: boolean;
  labels: string[];
  prompt: string;
};

const BASELINE_MS = 12000;
const BLINK_ON = 0.55;
const BLINK_OFF = 0.35;
const ELEVATION_PCT = 45;

// MediaPipe Face Mesh indices for Eye Aspect Ratio.
const LEFT_EAR = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EAR = [362, 385, 387, 263, 373, 380] as const;
const NOSE = 1;
const MOUTH = [13, 14] as const;

export function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function eyeAspectRatio(
  landmarks: Array<{ x: number; y: number }>,
  idx: readonly [number, number, number, number, number, number],
): number {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => landmarks[i]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0.3;
  const vertical = dist(p2, p6) + dist(p3, p5);
  const horizontal = 2 * dist(p1, p4);
  return horizontal > 0 ? vertical / horizontal : 0.3;
}

export function blendshapeScore(
  categories: Array<{ categoryName?: string; score?: number }> | undefined,
  name: string,
): number {
  const hit = categories?.find((c) => c.categoryName === name);
  return hit?.score ?? 0;
}

export function pctChange(current: number, baseline: number): number {
  if (baseline <= 0.0001) return current > 0.0001 ? 100 : 0;
  return Math.round(((current - baseline) / baseline) * 100);
}

export function summarizeAnswer(
  baseline: FaceCueBaseline,
  current: FaceCueBaseline & { blinkCount: number },
): FaceCueAnswerSummary {
  const deltas = {
    blinkRatePct: pctChange(current.blinkRate, baseline.blinkRate),
    headMotionPct: pctChange(current.headMotion, baseline.headMotion),
    eyeOpennessPct: pctChange(current.eyeOpenness, baseline.eyeOpenness),
  };
  const labels: string[] = [];
  if (deltas.blinkRatePct >= ELEVATION_PCT) labels.push('blinks ↑');
  if (deltas.headMotionPct >= ELEVATION_PCT) labels.push('head motion ↑');
  if (deltas.eyeOpennessPct <= -ELEVATION_PCT) labels.push('eyes narrower');
  const elevated = labels.length > 0;
  const bits = [
    deltas.blinkRatePct >= ELEVATION_PCT
      ? `blink rate up ${deltas.blinkRatePct}% vs baseline`
      : null,
    deltas.headMotionPct >= ELEVATION_PCT
      ? `head motion up ${deltas.headMotionPct}% vs baseline`
      : null,
    deltas.eyeOpennessPct <= -ELEVATION_PCT
      ? `eyes looked more closed (${Math.abs(deltas.eyeOpennessPct)}% vs baseline)`
      : null,
  ].filter(Boolean);
  const prompt = elevated
    ? `Behavioral cue packet for the answer that just finished (game flavor, not proof of lying): ${bits.join('; ')}. If useful, briefly notice one cue in one short clause, then ask exactly ONE content question about the story. Do not say they are caught lying because of blinking or motion. Do not speak numbers aloud. Still call publish_assessment before your question.`
    : `Behavioral cues for the last answer were near baseline. Ignore face cues this turn; ask one content follow-up after publish_assessment.`;
  return { baseline, current, deltas, elevated, labels, prompt };
}

type Landmark = { x: number; y: number; z?: number };

export class FaceCueTracker {
  private landmarker: {
    detectForVideo: (
      video: HTMLVideoElement,
      timestamp: number,
    ) => {
      faceLandmarks: Landmark[][];
      faceBlendshapes?: Array<{ categories: Array<{ categoryName?: string; score?: number }> }>;
    };
    close: () => void;
  } | null = null;
  private video: HTMLVideoElement | null = null;
  private startedAt = 0;
  private faceSeenAt = 0;
  private baseline: FaceCueBaseline | null = null;
  private baselineSamples: FaceCueBaseline[] = [];
  private blinkCount = 0;
  private answerBlinkStart = 0;
  private answerStartedAt = 0;
  private answerMotion: number[] = [];
  private answerOpenness: number[] = [];
  private eyesClosed = false;
  private lastNose: { x: number; y: number } | null = null;
  private motionEma = 0;
  private mouthEma = 0;
  private opennessEma = 0.3;
  private lastSpikeAt = 0;
  private lastLabels: string[] = [];
  private lastTs = 0;

  static async create(video: HTMLVideoElement): Promise<FaceCueTracker | null> {
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const wasm = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm',
      );
      const landmarker = await vision.FaceLandmarker.createFromOptions(wasm, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });
      const tracker = new FaceCueTracker();
      tracker.landmarker = landmarker;
      tracker.video = video;
      tracker.startedAt = performance.now();
      tracker.answerStartedAt = tracker.startedAt;
      return tracker;
    } catch {
      return null;
    }
  }

  startAnswer() {
    this.answerBlinkStart = this.blinkCount;
    this.answerStartedAt = performance.now();
    this.answerMotion = [];
    this.answerOpenness = [];
  }

  endAnswer(): FaceCueAnswerSummary | null {
    if (!this.baseline) return null;
    const elapsedMin = Math.max((performance.now() - this.answerStartedAt) / 60000, 1 / 120);
    const blinks = Math.max(0, this.blinkCount - this.answerBlinkStart);
    const current = {
      blinkRate: blinks / elapsedMin,
      headMotion:
        this.answerMotion.length > 0
          ? this.answerMotion.reduce((a, b) => a + b, 0) / this.answerMotion.length
          : this.motionEma,
      eyeOpenness:
        this.answerOpenness.length > 0
          ? this.answerOpenness.reduce((a, b) => a + b, 0) / this.answerOpenness.length
          : this.opennessEma,
      blinkCount: blinks,
    };
    const summary = summarizeAnswer(this.baseline, current);
    if (summary.elevated) {
      this.lastSpikeAt = performance.now();
      this.lastLabels = summary.labels;
    }
    this.startAnswer();
    return summary;
  }

  tick(): FaceCueLive {
    const empty: FaceCueLive = {
      tracking: false,
      calibrated: !!this.baseline,
      calibrating: !this.baseline && this.faceSeenAt > 0,
      blinkRate: 0,
      blinkCount: this.blinkCount,
      eyeOpenness: this.opennessEma,
      headMotion: this.motionEma,
      mouthMotion: this.mouthEma,
      pressure: 0,
      spike: performance.now() - this.lastSpikeAt < 1600,
      labels: this.lastLabels,
    };
    const video = this.video;
    const landmarker = this.landmarker;
    if (!video || !landmarker || video.readyState < 2) return empty;
    const now = performance.now();
    if (now - this.lastTs < 66) {
      return { ...empty, tracking: this.faceSeenAt > 0, ...this.liveExtras(now) };
    }
    this.lastTs = now;
    let result;
    try {
      result = landmarker.detectForVideo(video, now);
    } catch {
      return empty;
    }
    const landmarks = result.faceLandmarks[0];
    if (!landmarks?.length) return empty;
    if (!this.faceSeenAt) this.faceSeenAt = now;

    const categories = result.faceBlendshapes?.[0]?.categories;
    const blinkL = blendshapeScore(categories, 'eyeBlinkLeft');
    const blinkR = blendshapeScore(categories, 'eyeBlinkRight');
    const blinkScore = (blinkL + blinkR) / 2;
    const jaw = blendshapeScore(categories, 'jawOpen');

    const ear =
      (eyeAspectRatio(landmarks, LEFT_EAR) + eyeAspectRatio(landmarks, RIGHT_EAR)) / 2;
    const openness = Math.max(0, Math.min(1, ear / 0.3));
    this.opennessEma = this.opennessEma * 0.85 + openness * 0.15;

    const closed = blinkScore >= BLINK_ON || ear < 0.18;
    const open = blinkScore <= BLINK_OFF && ear >= 0.2;
    if (closed && !this.eyesClosed) this.eyesClosed = true;
    if (open && this.eyesClosed) {
      this.eyesClosed = false;
      this.blinkCount += 1;
    }

    const nose = landmarks[NOSE];
    if (nose && this.lastNose) {
      const step = Math.min(0.2, dist(nose, this.lastNose) * 8);
      this.motionEma = this.motionEma * 0.9 + step * 0.1;
    }
    if (nose) this.lastNose = { x: nose.x, y: nose.y };

    const top = landmarks[MOUTH[0]];
    const bottom = landmarks[MOUTH[1]];
    const mouth = top && bottom ? Math.min(1, dist(top, bottom) * 12) : jaw;
    this.mouthEma = this.mouthEma * 0.85 + mouth * 0.15;

    this.answerMotion.push(this.motionEma);
    this.answerOpenness.push(this.opennessEma);
    if (this.answerMotion.length > 900) this.answerMotion.shift();
    if (this.answerOpenness.length > 900) this.answerOpenness.shift();

    if (!this.baseline) {
      this.baselineSamples.push({
        blinkRate: this.currentBlinkRate(now),
        headMotion: this.motionEma,
        eyeOpenness: this.opennessEma,
      });
      if (now - this.faceSeenAt >= BASELINE_MS && this.baselineSamples.length >= 20) {
        const n = this.baselineSamples.length;
        this.baseline = {
          blinkRate:
            this.baselineSamples.reduce((s, x) => s + x.blinkRate, 0) / n || 12,
          headMotion:
            this.baselineSamples.reduce((s, x) => s + x.headMotion, 0) / n || 0.05,
          eyeOpenness:
            this.baselineSamples.reduce((s, x) => s + x.eyeOpenness, 0) / n || 0.7,
        };
        this.baselineSamples = [];
        this.startAnswer();
      }
    }

    return {
      tracking: true,
      calibrated: !!this.baseline,
      calibrating: !this.baseline,
      blinkRate: this.currentBlinkRate(now),
      blinkCount: this.blinkCount,
      eyeOpenness: this.opennessEma,
      headMotion: this.motionEma,
      mouthMotion: this.mouthEma,
      pressure: this.pressure(),
      spike: now - this.lastSpikeAt < 1600,
      labels: this.lastLabels,
    };
  }

  private currentBlinkRate(now: number) {
    const mins = Math.max((now - (this.faceSeenAt || this.startedAt)) / 60000, 1 / 60);
    return this.blinkCount / mins;
  }

  private pressure() {
    if (!this.baseline) return Math.min(1, this.motionEma * 4);
    const blink = Math.max(0, pctChange(this.currentBlinkRate(performance.now()), this.baseline.blinkRate));
    const head = Math.max(0, pctChange(this.motionEma, this.baseline.headMotion));
    return Math.max(0, Math.min(1, Math.max(blink, head) / 100));
  }

  private liveExtras(now: number): Pick<FaceCueLive, 'blinkRate' | 'pressure' | 'spike' | 'labels' | 'calibrated' | 'calibrating' | 'blinkCount' | 'eyeOpenness' | 'headMotion' | 'mouthMotion'> {
    return {
      blinkRate: this.currentBlinkRate(now),
      blinkCount: this.blinkCount,
      eyeOpenness: this.opennessEma,
      headMotion: this.motionEma,
      mouthMotion: this.mouthEma,
      pressure: this.pressure(),
      spike: now - this.lastSpikeAt < 1600,
      labels: this.lastLabels,
      calibrated: !!this.baseline,
      calibrating: !this.baseline && this.faceSeenAt > 0,
    };
  }

  close() {
    try {
      this.landmarker?.close();
    } catch {
      /* ignore */
    }
    this.landmarker = null;
    this.video = null;
  }
}
