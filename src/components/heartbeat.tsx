'use client';
import { useEffect, useRef, useState } from 'react';
import type { AssessmentPoint } from '@/lib/contracts';
import { HeartbeatAudio, hasGroundedConcern, targetBpm } from '@/lib/heartbeat';

export function HeartStage({
  active,
  assessment,
  restingBpm,
  reactionBpm,
  volume,
  question,
  label,
}: {
  active: boolean;
  assessment: AssessmentPoint | undefined;
  restingBpm: number;
  reactionBpm: number;
  volume: number;
  question: string;
  label: string;
}) {
  const audio = useRef<HeartbeatAudio | null>(null);
  const target = targetBpm(assessment, restingBpm, reactionBpm);
  const [bpm, setBpm] = useState(restingBpm);
  const concern = hasGroundedConcern(assessment);

  useEffect(() => {
    const engine = new HeartbeatAudio();
    audio.current = engine;
    return () => {
      engine.stop();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setBpm((current) => {
          if (current === target) return current;
          return current + Math.sign(target - current) * Math.min(2, Math.abs(target - current));
        }),
      250,
    );
    return () => clearInterval(timer);
  }, [target]);
  useEffect(() => {
    audio.current?.setBpm(bpm);
  }, [bpm]);
  useEffect(() => {
    audio.current?.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    const engine = audio.current;
    if (!engine) return;
    if (active) void engine.start();
    else engine.stop();
    return () => engine.stop();
  }, [active]);

  const tension = concern
    ? Math.max(0.35, Math.min(1, (bpm - restingBpm) / Math.max(1, reactionBpm)))
    : 0;
  return (
    <section
      className={`heart-stage tension-${Math.min(4, Math.floor(tension * 4))} ${concern ? 'spiking' : ''}`}
      aria-label="Simulated evidence pulse"
      style={{ ['--beat' as string]: `${Math.round(60000 / bpm)}ms` }}
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
          <span>SIMULATED BPM</span>
        </div>
        <div className="heart-meter">
          <span>Evidence tension</span>
          <div className="heart-meter-track">
            <i style={{ width: `${Math.round(tension * 100)}%` }} />
          </div>
        </div>
        <p className="heart-label">{label}</p>
        <p className="heart-question">{question}</p>
        <p className="heart-disclaimer">
          The pulse reacts to cited story concerns only. It is not your measured heart rate.
        </p>
      </div>
    </section>
  );
}
