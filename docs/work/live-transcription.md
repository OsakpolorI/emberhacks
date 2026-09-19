# Live transcription repair

Owner: Codex, acting as integrator; sequential work in an isolated clone on
`fix/live-transcription`. No parallel workers or shared-contract changes.

Owned files: `src/lib/live.ts`, `src/hooks/use-round.ts`, `tests/live.test.ts`,
`tests/round.test.tsx`, `README.md`, and this log.

## Changes

- Hands-free capture now streams all microphone chunks to Gemini automatic
  activity detection. Local meter calibration and volume thresholds no longer
  discard quiet or early words.
- Switching modes during detected speech no longer leaves audio delivery gated
  until a new local start event.
- Push-to-talk sends audio only while held; release or switching away flushes
  the stream with `audioStreamEnd`. Gemini can detect pauses while held.
- Transcript events received during startup are preserved. Existing round ID
  and phase guards still discard events after reset/stop.
- Input/output transcription and configurable Gemini model IDs remain enabled.

## Validation (September 19, 2026)

- Seven transport tests exercise real LiveInterview code with mocked browser
  media and provider transport. Six failed against the original implementation;
  all pass with the fix.
- Two new round tests cover startup and partial/final input transcripts.
- All 37 tests pass. The Windows sandbox blocks esbuild parent-directory lookup
  for the default test config, so the suite ran with an ignored equivalent
  native-loaded config: `node node_modules/vitest/vitest.mjs run --config
  artifacts/vitest.sandbox.mjs --configLoader native`.
- `npm run typecheck`, `npm run build`, and `git diff --check` pass.
- Secret check passes for the empty example and 11 client build files. No actual
  key is available in this checkout, so a configured-key leak test and live
  provider/microphone verification were not performed.

## Delivery and remaining verification

Delivery: user authorized pushing the fix on September 19, 2026. Publish the
isolated `fix/live-transcription` branch for pull-request review; keep main
unchanged. Related bootstrap task: #1. A real Chrome microphone round is still
needed: confirm the opening, speak at normal and low volume, verify input
transcripts and relevant follow-ups, switch modes mid-speech, release push-to-talk,
and check reset releases the microphone. The user's existing server-side key
should be preserved; never commit it.

Rollback: before merge, close the pull request. After merge, revert its merge
or squash commit in a new commit; do not reset or force-push shared history.
