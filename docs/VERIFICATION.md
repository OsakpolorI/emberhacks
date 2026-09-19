# Verification record

Checked on September 19, 2026, on the local Windows development machine.

## Passed

- `npm test`: 28 tests across core evidence/metrics/queue logic, analysis routes, and round lifecycle.
- `npm run typecheck` and `npm run build`: passed with Next.js 16.3.5.
- `node scripts/check-secrets.mjs`: ignored local environment file, placeholder example, and no permanent key found in 11 client bundle files.
- Real Gemini credential mint and Live audio response passed with `@google/genai` 2.23 (`node scripts/check-gemini.mjs --live-only`). A previous text-inference check passed before the SDK upgrade.
- The final `/api/analyze` endpoint returned HTTP 200 for a contradiction fixture with a validated quote, likely-bluff verdict, and an approximately eight-second response using the fallback Gemini 3.6 Flash model. Earlier direct Gemini 3.8 Flash inference succeeded; some subsequent calls encountered free-tier quota or provider overload, which the endpoint handles.
- Two synthetic speech clips sent to Gemini Live produced accurate input transcripts and story-specific spoken follow-ups. These were a library-book question and a dinner-ingredient question. See ignored local `artifacts/live-audio-check.json` for the machine-readable check.
- Desktop Chrome: empty state, clearly labeled sample, chart-to-transcript navigation, reset, and setup flow were inspected. Cancel round released the attempted session.

## Still needs a person at the laptop

Chrome's microphone/camera permission prompt prevented an unattended real spoken round. Two human rounds, interruption/playback behavior, camera delivery, media release after a successful round, the final spoken/displayed verdict agreement, and push-to-talk in noise have **not** been certified. The 60–90-second live demo video has not been recorded. The sample preview and synthetic-audio API checks are not substitutes for these acceptance checks.

The second team member's name and GitHub account are unknown and must be added by the owner. No Amazfit integration or public hosting is claimed. The app is a game, not a validated lie detector; no predictive accuracy rate has been established.
