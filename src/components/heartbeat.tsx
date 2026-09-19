'use client';
import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  HeartbeatAudio,
  bpmFromTension,
  tensionFrom,
} from '@/lib/heartbeat';

export function HeartStage({
  active,
  suspicionScore,
  facePressure,
  spike,
  pending,
  question,
  label,
}: {
  active: boolean;
  suspicionScore: number | null | undefined;
  facePressure: number;
  spike: boolean;
  pending: boolean;
  question: string;
  label: string;
}) {
  const audio = useRef<HeartbeatAudio | null>(null);
  const [muted, setMuted] = useState(false);
  const tension = tensionFrom({ suspicionScore, facePressure, spike, pending });
  const bpm = bpmFromTension(tension);
  const beatMs = Math.round(60000 / bpm);

  useEffect(() => {
    const engine = new HeartbeatAudio();
    audio.current = engine;
    return () => {
      engine.stop();
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    audio.current?.setTension(tension);
  }, [tension]);

  useEffect(() => {
    audio.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    const engine = audio.current;
    if (!engine) return;
    if (active) void engine.start();
    else engine.stop();
    return () => engine.stop();
  }, [active]);

  return (
    <section
      className={`heart-stage tension-${Math.min(4, Math.floor(tension * 4))} ${spike ? 'spiking' : ''}`}
      aria-label="Reactive heartbeat stage"
      style={{ ['--beat' as string]: `${beatMs}ms` }}
    >
      <div className="heart-glow" />
      <div className="heart-rings" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="heart-core" aria-hidden>
        <svg viewBox="0 0 24 24" className="heart-svg">
          <path d="M12 21s-6.7-4.3-9.3-8.1C.4 9.7 1.1 5.8 4.3 4.3 6.4 3.3 8.8 3.8 10.3 5.5L12 7.4l1.7-1.9c1.5-1.7 3.9-2.2 6-1.2 3.2 1.5 3.9 5.4 1.6 8.6C18.7 16.7 12 21 12 21z" />
        </svg>
      </div>
      <div className="heart-readout">
        <div className="heart-bpm">
          <strong>{active ? bpm : '—'}</strong>
          <span>BPM</span>
        </div>
        <div className="heart-meter">
          <span>Tension</span>
          <div className="heart-meter-track">
            <i style={{ width: `${Math.round(tension * 100)}%` }} />
          </div>
        </div>
        <p className="heart-label">{label}</p>
        <p className="heart-question">{question}</p>
        <p className="heart-disclaimer">
          Theatrical pulse from suspicion + face cues — not medical or proof of lying.
        </p>
      </div>
      <button
        className="heart-mute"
        type="button"
        aria-pressed={muted}
        onClick={() => setMuted((m) => !m)}
        title={muted ? 'Unmute heartbeat' : 'Mute heartbeat'}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        {muted ? 'Muted' : 'Pulse audio'}
      </button>
    </section>
  );
}
