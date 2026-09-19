// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveInterview } from '../src/lib/live';
import { useRound } from '../src/hooks/use-round';
import { insufficient } from '../src/lib/analysis';
import { dragonAssessment } from './assessment-fixture';

type Callbacks = ConstructorParameters<typeof LiveInterview>[1];
const harness = vi.hoisted(() => ({
  start: vi.fn(),
  engines: [] as Array<{
    callbacks: Callbacks;
    closed: boolean;
    stop: ReturnType<typeof vi.fn>;
    session: { sendToolResponse: ReturnType<typeof vi.fn> };
  }>,
}));
vi.mock('../src/lib/live', () => ({
  LiveInterview: class {
    closed = false;
    session = { sendToolResponse: vi.fn() };
    constructor(
      public mode: string,
      public callbacks: Callbacks,
    ) {
      harness.engines.push(this);
    }
    start = harness.start;
    stop = vi.fn(() => {
      this.closed = true;
    });
    setMode = vi.fn();
    press = vi.fn();
    release = vi.fn();
  },
}));
const reply = () =>
  new Response(JSON.stringify({ ...insufficient(), sequence: 1, latencyMs: 5 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
beforeEach(() => {
  harness.engines.length = 0;
  harness.start.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply()),
  );
  vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
      lang = '';
      rate = 1;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function player(text = 'Yesterday I went to the library with my sister and returned a book.') {
  harness.engines.at(-1)!.callbacks.message({
    text: undefined,
    data: undefined,
    serverContent: { inputTranscription: { text, finished: true } },
  });
}
describe('actual round lifecycle', () => {
  it('updates the trail from a Live tool without spending a text API request', async () => {
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    act(() => {
      player('We flew on the dragon to Korea.');
      harness.engines[0].callbacks.message({
        text: undefined,
        data: undefined,
        toolCall: {
          functionCalls: [
            { name: 'publish_assessment', id: 'assessment-1', args: dragonAssessment },
          ],
        },
      });
    });
    expect(result.current.state.points.at(-1)?.suspicionScore).toBe(92);
    expect(result.current.state.assessmentPending).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Quota reached' }), { status: 429 }),
    );
    await act(() => result.current.finish());
    expect(result.current.state.final?.verdict).toBe('likely_bluff');
    expect(result.current.state.final?.uncertainty[0]).toContain(
      'Independent final review unavailable',
    );
  });
  it('grounds tools that arrive before the matching input transcript', async () => {
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    act(() =>
      harness.engines[0].callbacks.message({
        text: undefined,
        data: undefined,
        toolCall: {
          functionCalls: [{ name: 'publish_assessment', id: 'early', args: dragonAssessment }],
        },
      }),
    );
    expect(result.current.state.points).toHaveLength(0);
    act(() => player('We flew on the dragon to Korea.'));
    expect(result.current.state.points).toHaveLength(1);
  });
  it('preserves transcripts received while media startup is still connecting', async () => {
    harness.start.mockImplementation(async () => {
      harness.engines[0].callbacks.message({
        text: undefined,
        data: undefined,
        serverContent: { outputTranscription: { text: 'Tell me your story.', finished: true } },
      });
      player('I went to the library.');
    });
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    expect(result.current.state.phase).toBe('interviewing');
    expect(result.current.state.turns.map((turn) => turn.text)).toEqual([
      'Tell me your story.',
      'I went to the library.',
    ]);
  });

  it('displays partial input transcripts and completes them on the final fragment', async () => {
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    act(() =>
      harness.engines[0].callbacks.message({
        text: undefined,
        data: undefined,
        serverContent: { inputTranscription: { text: 'I went' } },
      }),
    );
    expect(result.current.state.turns[0]).toMatchObject({ text: 'I went', completed: false });
    act(() => player(' to the library.'));
    expect(result.current.state.turns).toHaveLength(1);
    expect(result.current.state.turns[0]).toMatchObject({
      text: 'I went to the library.',
      completed: true,
    });
  });

  it('finalizes once even when End is clicked twice', async () => {
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    act(() => player());
    await act(async () => {
      await Promise.all([result.current.finish(), result.current.finish()]);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.state.phase).toBe('result');
    expect(harness.engines[0].stop).toHaveBeenCalled();
  });
  it('does not let an old final response overwrite a reset round', async () => {
    let resolve!: (r: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    act(() => player());
    let finishing!: Promise<void>;
    act(() => {
      finishing = result.current.finish();
    });
    act(() => result.current.reset());
    await act(async () => {
      resolve(reply());
      await finishing;
    });
    expect(result.current.state.phase).toBe('ready');
    expect(result.current.state.final).toBeNull();
  });
  it('ignores transcript events from a stopped session', async () => {
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    const old = harness.engines[0];
    act(() => result.current.reset());
    act(() =>
      old.callbacks.message({
        text: undefined,
        data: undefined,
        serverContent: { inputTranscription: { text: 'late words', finished: true } },
      }),
    );
    expect(result.current.state.turns).toHaveLength(0);
  });
  it('records interrupted interviewer speech', async () => {
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    act(() => {
      harness.engines[0].callbacks.message({
        text: undefined,
        data: undefined,
        serverContent: { outputTranscription: { text: 'What happened before' } },
      });
      harness.engines[0].callbacks.message({
        text: undefined,
        data: undefined,
        serverContent: { interrupted: true },
      });
    });
    expect(result.current.state.turns[0].interrupted).toBe(true);
  });
  it('ignores model request_verdict; only the End button finishes', async () => {
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    act(() => {
      player();
      player('We left at five.');
      player('Then we ate dinner.');
      harness.engines[0].callbacks.message({
        text: undefined,
        data: undefined,
        toolCall: { functionCalls: [{ name: 'request_verdict', id: 'tool-1' }] },
      });
    });
    expect(result.current.state.phase).toBe('interviewing');
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.engines[0].session.sendToolResponse).toHaveBeenCalled();
  });
  it('does not immediately retry an exhausted quota', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Quota reached' }), { status: 429 }),
    );
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    act(() => player());
    await act(() => result.current.finish());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.state.final).toBeNull();
    expect(result.current.state.error).toBe('Quota reached');
  });
  it('stops media on unmount', async () => {
    const { result, unmount } = renderHook(() => useRound());
    await act(() => result.current.start());
    unmount();
    expect(harness.engines[0].stop).toHaveBeenCalled();
  });
  it('automatically finalizes at the hard time limit', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRound());
    await act(() => result.current.start());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(190000);
    });
    expect(result.current.state.phase).toBe('result');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
