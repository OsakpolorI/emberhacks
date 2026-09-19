# Tell · EmberHacks 2026

**Can your story hold up?** A single-round voice and camera investigation powered by Gemini. Tell a story, answer adaptive questions, watch an evidence-backed suspicion trail, and receive a tentative verdict with exact transcript quotes.

## Run locally

Requires Node.js 22+ and desktop Chrome with a microphone; webcam optional.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Click Setup and paste a Gemini API key once, or copy `.env.example` to `.env.local` and fill `GEMINI_API_KEY`. The development-only setup form stores the key server-side in the ignored file. Never commit keys. Model IDs can be changed in `.env.local`; restart after manual changes.

```sh
npm test
npm run typecheck
npm run build
npm start
```

No database, account registration, external assets, or paid voice service required. Gemini availability and quota depend on your Google project. Free-tier limits can interrupt a session; the app displays that failure instead of making up a result.

## Controls

- **Start your investigation:** asks permission for microphone and camera; camera denial permits audio-only mode.
- **Hands-free:** local speech activity detection controls turns. Use headphones if speakers cause echo.
- **Push to talk:** switch during a round; hold the button or Space/Enter while focused and release to finish a turn.
- **End & assess:** ends capture and obtains the final evidence report.
- **Cancel round:** releases capture and resets without a verdict.
- **Explore a sample:** explicitly labeled fixed illustration; no camera, network inference, or real prediction.
- Click chart points to inspect their evidence. Click quotes to find their transcript turn.
- Download a JSON report containing the transcript, assessments and aggregate measurements. It contains no audio/video.

## How Gemini is central

1. Gemini Live receives audio and camera frames, understands the story, and chooses context-specific follow-ups. It is the interaction loop, not an added chat window.
2. A separate Gemini analysis call reviews transcript snapshots and returns a JSON assessment. Server validation rejects quotes not found in player speech. The final assessment sees the transcript without prior suspicion scores.
3. The dashboard separates AI interpretations from measured audio activity. Response latency and approximate speech rate never mechanically increase suspicion.

Camera context is used by the interviewer, not a facial lie classifier. The suspicion score is an uncalibrated game score. A convincing story may be invented, and an inconsistent story may be true. The app can say insufficient evidence. Do not use it for consequential judgments about people.

## Data and local security

Microphone audio and camera frames go to Google during active rounds. Transcript snapshots go through the local server to Gemini. This app stores no recordings or transcripts automatically. Google handles API data according to the terms of your selected service/tier. Setup is localhost-only in development and refuses to overwrite an existing `.env.local`. Production configuration uses environment variables. Do not expose this prototype server to the internet without adding access/rate controls.

## Stack

Next.js, React, TypeScript, Tailwind CSS, Recharts, Lucide, Zod, Google GenAI SDK, Web Audio AudioWorklet, MediaDevices, browser speech synthesis, Vitest. Laptop webcam and microphone. Amazfit is not integrated.

## Collaboration

Read `AGENTS.md` and `docs/PLAN.md`. Claim an issue and list owned files before editing. Work on one issue branch per isolated worktree. Keep `docs/work/<issue-id>.md` current and link it in the PR. The integrator owns shared contracts and dependencies. Never have two agents edit the same file without an explicit handoff.

## Verification and submission

See `docs/VERIFICATION.md` for observed checks and limitations, and `docs/DEMO.md` for the demo script. Test fixtures are in `src/lib/fixtures.ts`.

Team: Osakpolor Idusuyi. Second team member: to be supplied by the team owner.
