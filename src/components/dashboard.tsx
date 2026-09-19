'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Fingerprint,
  FlaskConical,
  Headphones,
  Mic,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Waves,
  X,
} from 'lucide-react';
import { useRound } from '@/hooks/use-round';
import { SuspicionChart, ActivityChart } from './charts';
import { EvidenceCards } from './evidence';
import { HeartStage } from './heartbeat';
import { answeredFollowups, type AssessmentPoint } from '@/lib/contracts';

function time(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}
const verdictLabels = {
  likely_bluff: 'A few things don’t add up.',
  likely_truthful: 'Your story holds together.',
  insufficient_evidence: 'The story is still open.',
};
export default function Dashboard() {
  const round = useRound();
  const { state } = round;
  const video = useRef<HTMLVideoElement>(null);
  const [setup, setSetup] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [setupMessage, setSetupMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<AssessmentPoint | null>(null);
  const [help, setHelp] = useState(false);
  const [showRadar, setShowRadar] = useState(true);
  const [showTalk, setShowTalk] = useState(true);
  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((x) => setConfigured(x.configured))
      .catch(() => setConfigured(false));
  }, []);
  useEffect(() => {
    if (video.current) video.current.srcObject = round.stream;
  }, [round.stream]);
  useEffect(() => setSelected(null), [state.id]);
  const active = state.phase === 'interviewing';
  const busy = active || state.phase === 'connecting' || state.phase === 'finalizing';
  const showAudit = state.phase === 'result' || state.preview;
  const liveFocus = !showAudit;
  const latest = state.points.at(-1);
  const score = latest?.suspicionScore;
  const evidence = (selected ?? state.final ?? latest)?.evidence ?? [];
  const heartLabel =
    state.phase === 'connecting'
      ? 'Locking onto your voice and face…'
      : state.phase === 'finalizing'
        ? 'Holding the last pulse while evidence settles…'
        : active
          ? state.face.spike
            ? 'Spike detected — listening harder'
            : state.assessmentPending
              ? 'Weighing that answer…'
              : 'Live pulse'
          : 'Idle pulse — start when ready';
  const meanLatency = state.latencies.length
    ? state.latencies.reduce((a, b) => a + b, 0) / state.latencies.length / 1000
    : null;
  const words = state.turns
    .filter((t) => t.speaker === 'player' && t.completed)
    .reduce((sum, t) => sum + t.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const wpm = state.speechMs > 3000 ? Math.round(words / (state.speechMs / 60000)) : null;
  async function save() {
    setSaving(true);
    setSetupMessage('');
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setConfigured(true);
      setKey('');
      setSetup(false);
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : 'Unable to save');
    } finally {
      setSaving(false);
    }
  }
  function exportReport() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            kind: state.preview ? 'sample-preview' : 'session-report',
            turns: state.turns,
            assessments: state.points,
            final: state.final,
            metrics: {
              speechMs: state.speechMs,
              silenceMs: state.silenceMs,
              responseLatenciesMs: state.latencies,
            },
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tell-${state.preview ? 'sample' : state.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function quote(id: string) {
    document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand-icon" href="/" aria-label="Tell home">
          <Fingerprint size={27} />
        </a>
        <div className="rail-links">
          <button className="rail-button selected" aria-label="Investigation dashboard">
            <Activity size={21} />
          </button>
          <button className="rail-button" aria-label="How it works" onClick={() => setHelp(true)}>
            <CircleHelp size={21} />
          </button>
        </div>
        <button className="rail-button bottom" aria-label="Setup" onClick={() => setSetup(true)}>
          <Settings2 size={21} />
        </button>
        <div className="avatar">O</div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="wordmark">
            tell<span>●</span>
            <span className="brand-divider" />
            <span className="workspace-label">The investigation room</span>
          </div>
          <div className="topbar-right">
            <span className="gemini-badge">
              <Sparkles size={13} /> Powered by Gemini
            </span>
            <button className="icon-button" aria-label="Open setup" onClick={() => setSetup(true)}>
              <Settings2 size={17} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">HUMAN STORIES. AI CURIOSITY.</div>
              <h1>
                Can your story hold up<span>?</span>
              </h1>
              <p>Tell it your way. Let the evidence do the talking.</p>
            </div>
            <button
              className="secondary-button preview-button"
              disabled={busy}
              onClick={round.preview}
            >
              <FlaskConical size={16} /> Explore a sample <ArrowRight size={15} />
            </button>
          </div>
          {state.preview && (
            <div className="notice preview-notice">
              <FlaskConical size={17} />
              <span>
                <b>Sample investigation.</b> All data below is a fixed illustration, not live Gemini
                output.
              </span>
              <button onClick={round.reset}>
                Exit sample <X size={14} />
              </button>
            </div>
          )}
          {state.error && (
            <div className="notice error-notice" role="alert">
              <CircleHelp size={18} />
              <span>{state.error}</span>
              {state.phase === 'error' && state.turns.length > 0 && (
                <button onClick={round.finish}>Assess captured story</button>
              )}
            </div>
          )}
          <section className="session-strip">
            <div className="session-name">
              <span className={`status-dot ${active ? 'live' : ''}`} />
              <b>
                {state.preview
                  ? 'Sample session'
                  : state.phase === 'ready'
                    ? 'Ready when you are'
                    : state.phase === 'connecting'
                      ? 'Connecting your senses…'
                      : active
                        ? 'Investigation in progress'
                        : state.phase === 'finalizing'
                          ? 'Following the evidence…'
                          : state.phase === 'error'
                            ? 'Session interrupted'
                            : 'Investigation complete'}
              </b>
              <span className="session-tag">ONE STORY · ONE ROUND</span>
            </div>
            <div className="session-meta">
              <Clock3 size={14} />
              <span>
                {time(state.elapsed)} <span className="muted">/ 03:00</span>
              </span>
              <span className="meta-divider" />
              <span>
                {answeredFollowups(state.turns)} <span className="muted">follow-ups</span>
              </span>
            </div>
          </section>
          <div className={`dashboard-grid ${liveFocus ? 'live-focus' : ''}`}>
            {liveFocus ? (
              <div className="live-column">
                <HeartStage
                  active={active || state.phase === 'finalizing'}
                  suspicionScore={score}
                  facePressure={state.face.pressure}
                  spike={state.face.spike}
                  pending={state.assessmentPending}
                  question={state.question}
                  label={heartLabel}
                />
                <section className="panel live-trail-panel" aria-live="polite">
                  <div className="panel-heading">
                    <div className="section-title">
                      <span className="little-icon">
                        <Activity size={17} />
                      </span>
                      <h2>Live evidence trail</h2>
                      <span className="tiny-label">CONTENT REVIEW</span>
                    </div>
                    <span className={`updated ${state.assessmentPending ? 'pending' : ''}`}>
                      <span className={`mini-dot ${active ? 'green' : ''}`} />
                      {state.assessmentPending
                        ? 'Gemini is reading that answer…'
                        : latest
                          ? `Updated ${Math.max(0, Math.floor(state.elapsed - latest.timestamp))}s ago`
                          : 'Waiting for your first answer'}
                    </span>
                  </div>
                  <div className="live-trail-summary">
                    <div className="live-score-block">
                      <span className="eyebrow">AI SUSPICION</span>
                      <div>
                        <strong>{score ?? '—'}</strong>
                        <span>/ 100</span>
                      </div>
                      <small>
                        {latest ? `${latest.evidenceStrength} evidence` : 'No assessment yet'}
                      </small>
                    </div>
                    <div className="live-read-block">
                      <span className="eyebrow">LATEST READ</span>
                      <p>
                        {latest?.explanation ??
                          'Your first completed answer will create a grounded read here.'}
                      </p>
                      {latest?.evidence[0] && (
                        <button
                          className="live-quote"
                          onClick={() => quote(latest.evidence[0].quotes[0]?.turnId)}
                        >
                          <span>{latest.evidence[0].category.replaceAll('_', ' ')}</span>“
                          {latest.evidence[0].quotes[0]?.text}”
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="live-chart-wrap">
                    <SuspicionChart
                      points={state.points}
                      elapsed={state.elapsed}
                      onSelect={setSelected}
                    />
                  </div>
                  <div className="live-trail-footnote">
                    <ShieldCheck size={14} /> The score follows spoken content and cited evidence.
                    Face and voice cues stay separate observations.
                  </div>
                </section>
                <div className="live-side-row">
                  <section className="panel player-panel compact-player">
                    <div className="panel-heading">
                      <div className="section-title">
                        <h2>In the frame</h2>
                      </div>
                      <span className={`device-badge ${state.camera ? 'connected' : ''}`}>
                        <Camera size={12} />
                        {state.camera ? 'CAMERA ON' : 'CAMERA OFF'}
                      </span>
                    </div>
                    <div
                      className={`camera-window ${state.camera ? 'has-camera' : ''} ${state.face.spike ? 'cue-spike' : ''} ${state.face.pressure > 0.45 ? 'cue-hot' : ''}`}
                    >
                      <video
                        ref={video}
                        autoPlay
                        muted
                        playsInline
                        aria-label="Your camera preview"
                      />
                      {!state.camera && (
                        <div className="camera-placeholder">
                          <div className="camera-orbit">
                            <Camera size={28} strokeWidth={1.3} />
                          </div>
                          <strong>A little face-to-face.</strong>
                          <span>Your camera preview appears here.</span>
                        </div>
                      )}
                      {state.camera && state.face.labels.length > 0 && state.face.spike && (
                        <div className="face-cue-chip" aria-live="polite">
                          {state.face.labels.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {state.camera && (
                      <div className="face-cues compact-cues">
                        <div className="face-pressure">
                          <span>Face pressure</span>
                          <div className="face-pressure-track">
                            <i style={{ width: `${Math.round(state.face.pressure * 100)}%` }} />
                          </div>
                        </div>
                        <div className="cue-observation">
                          <span className="eyebrow">BEHAVIOR CUES</span>
                          <p>
                            {state.face.lastNote ??
                              (state.face.calibrating
                                ? 'Calibrating a personal baseline…'
                                : 'Near baseline')}
                          </p>
                          <small>Game flavor only. Never used to decide the suspicion score.</small>
                        </div>
                      </div>
                    )}
                  </section>
                  <section className="panel interviewer-panel live-controls">
                    <span className="eyebrow">CONTROLS</span>
                    <div className="ai-status">
                      <span className={`mini-dot ${active ? 'green' : ''}`} />
                      {active
                        ? state.aiSpeaking
                          ? 'Gemini is speaking'
                          : 'Gemini is listening'
                        : state.phase === 'finalizing'
                          ? 'Gemini is reviewing the evidence'
                          : state.phase === 'connecting'
                            ? 'Connecting…'
                            : 'Ready to listen'}
                    </div>
                    <div className="input-mode">
                      <button
                        className={round.mode === 'auto' ? 'active' : ''}
                        disabled={state.phase === 'connecting'}
                        onClick={() => round.setMode('auto')}
                      >
                        <Radio size={13} /> Hands-free
                      </button>
                      <button
                        className={round.mode === 'ptt' ? 'active' : ''}
                        disabled={state.phase === 'connecting'}
                        onClick={() => round.setMode('ptt')}
                      >
                        <Mic size={13} /> Push to talk
                      </button>
                    </div>
                    {active && round.mode === 'ptt' && (
                      <button
                        className="hold-button"
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          round.press();
                        }}
                        onPointerUp={round.release}
                        onPointerCancel={round.release}
                        onLostPointerCapture={round.release}
                        onBlur={round.release}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            round.press();
                          }
                        }}
                        onKeyUp={round.release}
                      >
                        Hold to speak
                      </button>
                    )}
                    {busy ? (
                      <button
                        className="primary-button"
                        disabled={state.phase !== 'interviewing'}
                        onClick={round.finish}
                      >
                        {active ? (
                          <>
                            <Square size={14} /> End & assess
                          </>
                        ) : (
                          <>
                            <span className="spinner" />
                            {state.phase === 'connecting' ? 'Connecting…' : 'Assessing…'}
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={() => {
                          if (configured === false) setSetup(true);
                          else void round.start();
                        }}
                      >
                        <Play size={16} fill="currentColor" />
                        Start your investigation
                        <ArrowRight size={16} />
                      </button>
                    )}
                    {busy && (
                      <button className="text-button" onClick={round.reset}>
                        Cancel round
                      </button>
                    )}
                    <span className="privacy-note">
                      <ShieldCheck size={12} /> Media streams to Gemini during your round.
                    </span>
                  </section>
                </div>
                <div className="live-optionals">
                  <button
                    className={`optional-toggle ${showRadar ? 'open' : ''}`}
                    onClick={() => setShowRadar((v) => !v)}
                  >
                    <AudioLines size={15} /> Voice radar <ChevronDown size={14} />
                  </button>
                  {showRadar && (
                    <section className="panel activity-panel optional-panel">
                      <div className="waveform-row">
                        <Mic size={16} />
                        <ActivityChart signals={state.signals} />
                        <span className="live-label">{active ? 'LIVE' : 'STANDBY'}</span>
                      </div>
                      <div className="metric-grid">
                        <div>
                          <span className="metric-label">Response time</span>
                          <strong>
                            {meanLatency === null ? '—' : meanLatency.toFixed(1)}
                            <small>{meanLatency !== null ? 's' : ''}</small>
                          </strong>
                        </div>
                        <div>
                          <span className="metric-label">Speaking pace</span>
                          <strong>
                            {wpm ?? '—'}
                            <small>{wpm !== null ? 'wpm' : ''}</small>
                          </strong>
                        </div>
                        <div>
                          <span className="metric-label">Speaking time</span>
                          <strong>
                            {state.speechMs ? Math.round(state.speechMs / 1000) : '—'}
                            <small>{state.speechMs ? 's' : ''}</small>
                          </strong>
                        </div>
                      </div>
                    </section>
                  )}
                  <button
                    className={`optional-toggle ${showTalk ? 'open' : ''}`}
                    onClick={() => setShowTalk((v) => !v)}
                  >
                    <Headphones size={15} /> Live conversation{' '}
                    <span className="count-badge">{state.turns.length}</span>
                    <ChevronDown size={14} />
                  </button>
                  {showTalk && (
                    <section className="panel transcript-panel optional-panel">
                      <div className="transcript-list compact-transcript" aria-live="polite">
                        {!state.turns.length ? (
                          <div className="empty-section">
                            <strong>Conversation appears as you speak.</strong>
                          </div>
                        ) : (
                          state.turns.map((turn) => (
                            <article
                              className={`transcript-turn ${turn.speaker}`}
                              id={`turn-${turn.id}`}
                              key={turn.id}
                            >
                              <div className="speaker-icon">
                                {turn.speaker === 'gemini' ? (
                                  <Sparkles size={15} />
                                ) : (
                                  <span>Y</span>
                                )}
                              </div>
                              <div>
                                <header>
                                  <b>{turn.speaker === 'gemini' ? 'Gemini' : 'You'}</b>
                                  <time>{time(turn.startedAt)}</time>
                                </header>
                                <p>{turn.text}</p>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="main-column">
                  <section className="panel suspicion-panel">
                    <div className="panel-heading">
                      <div className="section-title">
                        <span className="little-icon">
                          <Activity size={17} />
                        </span>
                        <h2>The suspicion trail</h2>
                        <span className="tiny-label">AI ASSESSMENT</span>
                      </div>
                      <span className="updated">
                        <span className={`mini-dot ${active ? 'green' : ''}`} />
                        {latest
                          ? `Updated ${Math.max(0, Math.floor(state.elapsed - latest.timestamp))}s ago`
                          : 'Awaiting your story'}
                      </span>
                    </div>
                    <div className="score-row">
                      <div>
                        <span className="score">{score ?? '—'}</span>
                        <span className="score-unit">/ 100</span>
                        <span className="evidence-strength">
                          {latest ? `${latest.evidenceStrength} evidence` : 'No assessment yet'}
                        </span>
                      </div>
                      <div className="chart-legend">
                        <span /> AI suspicion <CircleHelp size={13} />
                      </div>
                    </div>
                    <SuspicionChart
                      points={state.points}
                      elapsed={state.elapsed}
                      onSelect={setSelected}
                    />
                    <div className="chart-footnote">
                      <ShieldCheck size={14} />
                      <span>
                        An evidence-based game score. Not a probability or a lie detector.
                      </span>
                    </div>
                    {state.analysisError && (
                      <div className="analysis-warning">
                        {state.analysisError} · Last assessment retained.
                      </div>
                    )}
                  </section>
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <div className="section-title">
                        <span className="little-icon mint">
                          <AudioLines size={17} />
                        </span>
                        <h2>Your voice, in the moment</h2>
                      </div>
                      <span className="tiny-label">MEASURED LOCALLY</span>
                    </div>
                    <div className="waveform-row">
                      <Mic size={16} />
                      <ActivityChart signals={state.signals} />
                      <span className="live-label">{active ? 'LIVE' : 'STANDBY'}</span>
                    </div>
                    <div className="metric-grid">
                      <div>
                        <span className="metric-label">
                          <Clock3 size={13} /> Response time
                        </span>
                        <strong>
                          {meanLatency === null ? '—' : meanLatency.toFixed(1)}
                          <small>{meanLatency !== null ? 's' : ''}</small>
                        </strong>
                      </div>
                      <div>
                        <span className="metric-label">
                          <Waves size={13} /> Speaking pace
                        </span>
                        <strong>
                          {wpm ?? '—'}
                          <small>{wpm !== null ? 'wpm' : ''}</small>
                        </strong>
                      </div>
                      <div>
                        <span className="metric-label">
                          <Mic size={13} /> Speaking time
                        </span>
                        <strong>
                          {state.speechMs ? Math.round(state.speechMs / 1000) : '—'}
                          <small>{state.speechMs ? 's' : ''}</small>
                        </strong>
                      </div>
                    </div>
                  </section>
                </div>
                <aside className="side-column">
                  <section className="panel player-panel">
                    <div className="panel-heading">
                      <div className="section-title">
                        <h2>In the frame</h2>
                      </div>
                      <span className={`device-badge ${state.camera ? 'connected' : ''}`}>
                        <Camera size={12} />
                        {state.camera ? 'CAMERA ON' : 'CAMERA OFF'}
                      </span>
                    </div>
                    <div className={`camera-window ${state.camera ? 'has-camera' : ''}`}>
                      <video
                        ref={video}
                        autoPlay
                        muted
                        playsInline
                        aria-label="Your camera preview"
                      />
                      {!state.camera && (
                        <div className="camera-placeholder">
                          <div className="camera-orbit">
                            <Camera size={28} strokeWidth={1.3} />
                          </div>
                          <strong>Sample / review frame</strong>
                          <span>
                            {state.preview
                              ? 'Sample mode uses no camera.'
                              : 'Camera was used during the live round.'}
                          </span>
                        </div>
                      )}
                    </div>
                  </section>
                  <section className="panel interviewer-panel">
                    <span className="eyebrow">ROUND COMPLETE</span>
                    <h3>Review the audit below.</h3>
                    <p className="current-question">{state.question}</p>
                    <button
                      className="primary-button"
                      onClick={() => {
                        if (configured === false) setSetup(true);
                        else void round.start();
                      }}
                    >
                      <Play size={16} fill="currentColor" />
                      Start a new investigation
                      <ArrowRight size={16} />
                    </button>
                  </section>
                </aside>
              </>
            )}
          </div>
          {state.phase === 'result' && !state.preview && (
            <section className="panel verdict-panel" aria-live="polite">
              <div className="verdict-symbol">
                <Fingerprint size={32} />
              </div>
              <div>
                <div className="eyebrow">THE FINAL WORD</div>
                <h2>
                  {state.final ? verdictLabels[state.final.verdict] : 'Assessment unavailable.'}
                </h2>
                <p>
                  {state.final?.explanation ??
                    'Your transcript is still available below. Start again when the connection is ready.'}
                </p>
                {state.final?.uncertainty.map((u, i) => (
                  <span className="uncertainty" key={i}>
                    {u}
                  </span>
                ))}
              </div>
              <button className="secondary-button" onClick={exportReport}>
                <ArrowDownToLine size={16} /> Save report
              </button>
            </section>
          )}
          {showAudit && (
            <div className="bottom-grid">
              <section className="panel transcript-panel">
                <div className="panel-heading">
                  <div className="section-title">
                    <span className="little-icon">
                      <Headphones size={16} />
                    </span>
                    <h2>The conversation</h2>
                    <span className="count-badge">{state.turns.length}</span>
                  </div>
                  <button
                    className="icon-button"
                    disabled={!state.turns.length}
                    onClick={exportReport}
                    aria-label="Download transcript and report"
                  >
                    <ArrowDownToLine size={16} />
                  </button>
                </div>
                <div className="transcript-list" aria-live="polite">
                  {!state.turns.length ? (
                    <div className="empty-section">
                      <strong>A good story starts with a conversation.</strong>
                      <p>Your words and Gemini’s questions will appear here.</p>
                    </div>
                  ) : (
                    state.turns.map((turn) => (
                      <article
                        className={`transcript-turn ${turn.speaker}`}
                        id={`turn-${turn.id}`}
                        key={turn.id}
                      >
                        <div className="speaker-icon">
                          {turn.speaker === 'gemini' ? <Sparkles size={15} /> : <span>Y</span>}
                        </div>
                        <div>
                          <header>
                            <b>{turn.speaker === 'gemini' ? 'Gemini' : 'You'}</b>
                            <time>{time(turn.startedAt)}</time>
                            {!turn.completed && <span className="transcribing">transcribing</span>}
                          </header>
                          <p>{turn.text}</p>
                          {turn.interrupted && <small>Interrupted</small>}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
              <section className="panel evidence-panel">
                <div className="panel-heading">
                  <div className="section-title">
                    <span className="little-icon amber">
                      <GitEvidence />
                    </span>
                    <h2>What stands out</h2>
                    <span className="count-badge">{evidence.length}</span>
                  </div>
                  {selected && (
                    <button className="text-button" onClick={() => setSelected(null)}>
                      Latest <ChevronDown size={13} />
                    </button>
                  )}
                </div>
                {evidence.length ? (
                  <EvidenceCards cards={evidence} onQuote={quote} />
                ) : (
                  <div className="empty-section">
                    <div className="evidence-empty-icon">
                      <ShieldCheck size={27} strokeWidth={1.4} />
                    </div>
                    <strong>Evidence, before assumptions.</strong>
                    <p>Specific details and quoted comparisons appear in the final audit.</p>
                  </div>
                )}
                <div className="evidence-footer">
                  <Check size={12} /> Every quote is checked against your transcript.
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Fingerprint size={15} /> tell · Built for EmberHacks 2026
            </span>
            <span>A conversation experiment. Always room for uncertainty.</span>
            <button onClick={() => setHelp(true)}>
              How it works <ArrowRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {setup && (
        <div className="modal-backdrop" onClick={() => setSetup(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setSetup(false)}
              aria-label="Close setup"
            >
              <X size={19} />
            </button>
            <div className="ai-avatar">
              <Settings2 size={24} />
            </div>
            <h2 id="setup-title">Connect your curiosity.</h2>
            <p>
              {configured
                ? 'Gemini is configured on this laptop. Your API key stays on the server.'
                : 'Add your Gemini API key once. It is saved only in this project’s ignored .env.local file.'}
            </p>
            {!configured && (
              <>
                <label htmlFor="api-key">Gemini API key</label>
                <input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  placeholder="Paste your API key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                <button className="primary-button" disabled={!key || saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save local configuration'}
                  <ArrowRight size={16} />
                </button>
              </>
            )}
            {configured && (
              <div className="configured-message">
                <Check size={17} /> API key configured
              </div>
            )}
            {setupMessage && (
              <p role="alert" className="error-text">
                {setupMessage}
              </p>
            )}
            <small>
              Configuration is available only on the local development server. No account or
              database required.
            </small>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setHelp(false)}
              aria-label="Close help"
            >
              <X size={19} />
            </button>
            <div className="ai-avatar">
              <Sparkles size={24} />
            </div>
            <h2 id="help-title">One story. A closer look.</h2>
            <ol className="how-list">
              <li>
                <b>Tell a story.</b> Speak naturally about something that happened to you. Truth or
                bluff—it’s your choice.
              </li>
              <li>
                <b>Follow the questions.</b> Gemini listens, sees visual context, and asks about the
                details.
              </li>
              <li>
                <b>See the evidence.</b> The chart updates when Gemini assesses new words. Speech
                activity updates locally.
              </li>
              <li>
                <b>Feel the pulse.</b> The live stage is a reactive heartbeat — tempo and thump rise
                with suspicion and face cues (theatrical, not proof).
              </li>
              <li>
                <b>Get a thoughtful verdict.</b> Ask as many follow-ups as you like, then tap End
                &amp; assess for the full audit trail. Soft three-minute cap. Inconclusive is a
                valid answer.
              </li>
            </ol>
            <p>
              Camera and microphone are sent to Google during the round. The app does not save
              recordings. Speech patterns and facial expressions are not proof of deception.
            </p>
            <button className="primary-button" onClick={() => setHelp(false)}>
              Got it <Check size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function GitEvidence() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M8 3h8l4 4v14H4V3h4M8 11h8M8 15h5" />
      <path d="M15 3v5h5" />
    </svg>
  );
}
