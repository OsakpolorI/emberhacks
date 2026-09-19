import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveConnectParameters } from '@google/genai';
import { LiveInterview } from '../src/lib/live';

const harness = vi.hoisted(() => ({
  connect: vi.fn(),
  sendRealtimeInput: vi.fn(),
  sendClientContent: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@google/genai', async (original) => ({
  ...(await original<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    live = { connect: harness.connect };
  },
}));

let capture: { onmessage: ((event: { data: Float32Array }) => void) | null };
let engine: LiveInterview;
let stopTrack: ReturnType<typeof vi.fn>;
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
function chunk(level: number) {
  capture.onmessage?.({ data: new Float32Array(2048).fill(level) });
}
beforeEach(() => {
  vi.clearAllMocks();
  stopTrack = vi.fn();
  harness.connect.mockResolvedValue(harness);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ token: 'ephemeral-test-token', model: 'test-live' })),
    ),
  );
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => {
        if (constraints.video) throw new Error('Camera unavailable');
        return { getTracks: () => [{ stop: stopTrack }] };
      }),
    },
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = 48000;
      destination = {};
      audioWorklet = { addModule: vi.fn(async () => {}) };
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
      createMediaStreamSource = node;
      createGain = () => ({ ...node(), gain: { value: 1 } });
    },
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { onmessage: null };
      connect = vi.fn();
      disconnect = vi.fn();
      constructor() {
        capture = this.port;
      }
    },
  );
  engine = new LiveInterview('auto', {
    message: vi.fn(),
    signal: vi.fn(),
    camera: vi.fn(),
    frame: vi.fn(),
    error: vi.fn(),
  });
});
afterEach(() => {
  engine.stop();
  vi.unstubAllGlobals();
});

describe('microphone delivery to Gemini', () => {
  it('enables provider speech detection and input/output transcripts', async () => {
    await engine.start();
    const setup = harness.connect.mock.calls[0][0] as LiveConnectParameters;
    expect(setup.config?.realtimeInputConfig?.automaticActivityDetection?.disabled).toBe(false);
    expect(setup.config?.inputAudioTranscription).toEqual({});
    expect(setup.config?.outputAudioTranscription).toEqual({});
  });

  it('delivers the first quiet microphone chunk during local meter calibration', async () => {
    await engine.start();
    chunk(0.002);
    expect(harness.sendRealtimeInput).toHaveBeenCalledTimes(1);
    const audio = harness.sendRealtimeInput.mock.calls[0][0].audio;
    expect(audio.mimeType).toBe('audio/pcm;rate=48000');
    const bytes = Buffer.from(audio.data, 'base64');
    expect(bytes.length).toBe(4096);
    expect(bytes.readInt16LE(0)).toBe(65);
  });

  it('keeps sending quiet speech and silence after calibration', async () => {
    await engine.start();
    for (let i = 0; i < 14; i++) chunk(0.001);
    harness.sendRealtimeInput.mockClear();
    chunk(0.005);
    chunk(0);
    expect(harness.sendRealtimeInput.mock.calls.every(([message]) => message.audio)).toBe(true);
    expect(harness.sendRealtimeInput).toHaveBeenCalledTimes(2);
  });

  it('sends push-to-talk audio only while held and flushes on release', async () => {
    engine.setMode('ptt');
    await engine.start();
    chunk(0.1);
    expect(harness.sendRealtimeInput).not.toHaveBeenCalled();
    engine.press();
    chunk(0.1);
    engine.release();
    engine.release();
    chunk(0.1);
    expect(harness.sendRealtimeInput).toHaveBeenCalledTimes(2);
    expect(harness.sendRealtimeInput.mock.calls[0][0].audio).toBeDefined();
    expect(harness.sendRealtimeInput).toHaveBeenLastCalledWith({ audioStreamEnd: true });
  });

  it('resumes hands-free delivery immediately when switching mid-speech', async () => {
    await engine.start();
    for (let i = 0; i < 14; i++) chunk(0.001);
    chunk(0.1);
    engine.setMode('ptt');
    engine.setMode('auto');
    harness.sendRealtimeInput.mockClear();
    chunk(0.1);
    expect(harness.sendRealtimeInput).toHaveBeenCalledTimes(1);
    expect(harness.sendRealtimeInput.mock.calls[0][0].audio).toBeDefined();
  });

  it('closes the audio stream when switching from hands-free to push-to-talk', async () => {
    await engine.start();
    chunk(0.01);
    engine.setMode('ptt');
    expect(harness.sendRealtimeInput).toHaveBeenLastCalledWith({ audioStreamEnd: true });
  });

  it('releases the microphone and prevents further sends after stop', async () => {
    await engine.start();
    engine.stop();
    chunk(0.1);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.sendRealtimeInput).not.toHaveBeenCalled();
  });
});
