# Tell — delivery contract

## Product

Single-round Gemini voice/camera bluff investigation. Bright premium dashboard; continuous local speech activity; stepped, evidence-backed AI suspicion score; final likely bluff / likely truthful / insufficient evidence. No role assignment or truth reveal. Gemini is not a validated lie detector. Predictions remain uncalibrated.

## Architecture

Browser microphone -> AudioWorklet PCM + local VAD -> Gemini Live. JPEG camera frame every second. Ephemeral credentials minted server-side. Input/output transcription feeds a single-flight analysis queue every eight seconds. Gemini text analyst returns structured evidence; every quote must exist in a player turn. Completed transcript receives independent final analysis. Browser speech synthesis reads its canonical summary. No database or recording persistence.

Shared contracts: src/lib/contracts.ts. Live adapter: src/lib/live.ts. Evidence policy: src/lib/analysis.ts. Local setup only writes an ignored .env.local; permanent keys never travel in client bundles. Setup is disabled in production.

## Gates and hard cuts

0–25 min setup/contracts/API access. 25–85 min playable voice -> verdict. 85–145 min continuous conversation/camera/cleanup. 145–215 min charts/evidence/timing. 215–255 min verification/polish. 255–300 min feature freeze, demo and submission. Preserve a working build at every checkpoint. Push-to-talk is the same Live session with user-controlled activity boundaries, not a second transport. Watch and hosting are outside committed scope.

## State and limits

Ready -> connecting -> interviewing -> finalizing -> result; recoverable error can assess captured words or restart. Open-ended: unlimited follow-ups, the player ends with End & assess, or Gemini may call request_verdict once it judges the story explored (after the initial story and at least one follow-up). 30-minute safety ceiling only, not a game rule. Live sessions use context window compression and session resumption (reconnecting on GoAway/unexpected close) since audio+video sessions otherwise cap at 2 minutes. One analysis in flight, newest queued snapshot wins. Reset invalidates prior responses. End stops all media/timers/audio and closes the socket before final analysis.

## Evidence

No fabricated score animation, calibrated confidence claims, facial/physiological lie heuristics, or contradiction from incomplete phrases. All quoted passages are validated. Corrections and ambiguity require clarification. The local metrics never enter the suspicion request. Fixture sample is always labeled.

## Ownership

See AGENTS.md. Integrator owns root/shared contract/live/session/shell. Evidence owner owns endpoints/analysis/chart/evidence/fixtures. During bootstrap one agent implements sequentially. Before parallel work, claim a GitHub issue with owned paths and use separate worktrees. Task logs record current work so agents do not collide.

## Acceptance

Typecheck, production build, core tests. Six reasoning fixtures. Browser checks for empty/sample/results layouts, setup, device errors, reset and responsiveness. Real API text + ephemeral token smoke test when key available. Two human live rounds, interruptions, camera delivery, final voice consistency, and media release still require real device interaction. Never report sample preview as a successful live round.
