import { INTERVIEWER_PROMPT } from './reasoning-policy';
import { assessmentTool } from './live-assessment';
import { GoogleGenAI, Modality, Type, type Session, type LiveServerMessage } from '@google/genai';
import { SpeechMeter } from './metrics';
export type InputMode = 'auto' | 'ptt';

function b64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export class LiveInterview {
  session: Session | null = null;
  meter = new SpeechMeter();
  closed = false;
  mode: InputMode;
  private held = false;
  private context: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private streams: MediaStream[] = [];
  private sources = new Set<AudioBufferSourceNode>();
  private nextAudio = 0;
  private frameTimer: ReturnType<typeof setInterval> | undefined;
  private video: HTMLVideoElement | null = null;
  private ai = false;
  constructor(
    mode: InputMode,
    private callbacks: {
      message: (message: LiveServerMessage) => void;
      signal: (level: number, speaking: boolean, ai: boolean, meter: SpeechMeter) => void;
      camera: (stream: MediaStream | null) => void;
      frame: () => void;
      error: (message: string) => void;
    },
  ) {
    this.mode = mode;
  }
  async start() {
    const response = await fetch('/api/live-token', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
    });
    const config = await response.json();
    if (!response.ok) throw new Error(config.error);
    if (this.closed) return;
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (this.closed) {
      mic.getTracks().forEach((t) => t.stop());
      return;
    }
    this.streams.push(mic);
    let camera: MediaStream | null = null;
    try {
      camera = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: 15 },
      });
    } catch {
      /* Audio-only is a supported fallback. */
    }
    if (this.closed) {
      camera?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (camera) {
      this.streams.push(camera);
      this.callbacks.camera(camera);
    }
    const context = new AudioContext();
    this.context = context;
    await context.resume();
    await context.audioWorklet.addModule('/audio-worklet.js');
    if (this.closed) return;
    const ai = new GoogleGenAI({ apiKey: config.token, httpOptions: { apiVersion: 'v1alpha' } });
    const session = await ai.live.connect({
      model: config.model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: INTERVIEWER_PROMPT,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            prefixPaddingMs: 300,
            silenceDurationMs: 800,
          },
        },
        tools: [
          {
            functionDeclarations: [
              assessmentTool,
              {
                name: 'request_verdict',
                description: 'Finish after the initial story and at least two answered follow-ups.',
                parameters: { type: Type.OBJECT, properties: {} },
              },
            ],
          },
        ],
      },
      callbacks: {
        onmessage: (message) => {
          if (this.closed) return;
          const content = message.serverContent;
          if (content?.interrupted) this.clearPlayback();
          for (const part of content?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) this.play(part.inlineData.data);
          }
          this.callbacks.message(message);
        },
        onerror: () => {
          if (!this.closed)
            this.callbacks.error(
              'The live connection encountered an error. Assess the captured story or restart.',
            );
        },
        onclose: () => {
          if (!this.closed)
            this.callbacks.error(
              'The live connection closed. You can still assess the captured story.',
            );
        },
      },
    });
    if (this.closed) {
      session.close();
      return;
    }
    this.session = session;
    const worklet = new AudioWorkletNode(context, 'tell-capture');
    this.worklet = worklet;
    const source = context.createMediaStreamSource(mic);
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(worklet);
    worklet.connect(mute);
    mute.connect(context.destination);
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.closed) return;
      const samples = event.data;
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      const now = performance.now();
      const outputPlaying = this.sources.size > 0;
      const detected = this.meter.sample(rms, now, outputPlaying);
      this.callbacks.signal(rms, detected.speaking, outputPlaying, this.meter);
      // The local meter is only a dashboard measurement. Let Gemini detect
      // speech from the continuous stream, including quiet words and pauses.
      const send = this.mode === 'auto' || this.held;
      if (send && this.session) {
        const pcm = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++)
          pcm[i] = Math.max(-32768, Math.min(32767, samples[i] * 32767));
        this.session.sendRealtimeInput({
          audio: {
            data: b64(new Uint8Array(pcm.buffer)),
            mimeType: `audio/pcm;rate=${context.sampleRate}`,
          },
        });
      }
    };
    if (camera) {
      const video = document.createElement('video');
      this.video = video;
      video.srcObject = camera;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      this.frameTimer = setInterval(() => {
        if (this.closed || video.readyState < 2) return;
        canvas.getContext('2d')?.drawImage(video, 0, 0, 640, 480);
        this.session?.sendRealtimeInput({
          video: {
            data: canvas.toDataURL('image/jpeg', 0.6).split(',')[1],
            mimeType: 'image/jpeg',
          },
        });
        this.callbacks.frame();
      }, 1000);
    }
    this.session.sendClientContent({
      turns: [
        { role: 'user', parts: [{ text: 'Begin the interview with your opening question.' }] },
      ],
      turnComplete: true,
    });
  }
  private endAudioStream() {
    if (this.closed) return;
    // Automatic detection requires audioStreamEnd to flush buffered speech.
    // The next audio message reopens the stream without reconnecting.
    this.session?.sendRealtimeInput({ audioStreamEnd: true });
  }
  setMode(mode: InputMode) {
    if (mode === this.mode) return;
    if (this.mode === 'auto' || this.held) this.endAudioStream();
    this.held = false;
    this.mode = mode;
  }
  press() {
    if (this.closed || this.mode !== 'ptt' || this.held) return;
    this.held = true;
  }
  release() {
    if (!this.held) return;
    this.held = false;
    this.endAudioStream();
  }
  private play(data: string) {
    const context = this.context;
    if (!context || this.closed) return;
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer);
    const buffer = context.createBuffer(1, pcm.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const when = Math.max(context.currentTime, this.nextAudio);
    this.nextAudio = when + buffer.duration;
    this.sources.add(source);
    this.ai = true;
    source.onended = () => {
      this.sources.delete(source);
      if (!this.sources.size && this.ai) {
        this.ai = false;
        this.meter.markPlaybackEnd(performance.now());
      }
    };
    source.start(when);
  }
  clearPlayback() {
    this.ai = false;
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
    this.nextAudio = this.context?.currentTime ?? 0;
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.frameTimer);
    this.clearPlayback();
    this.worklet?.disconnect();
    if (this.worklet) this.worklet.port.onmessage = null;
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.session?.close();
    this.session = null;
    void this.context?.close().catch(() => {});
    this.callbacks.camera(null);
  }
}
