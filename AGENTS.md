# EmberHacks collaboration contract

Read this file and docs/PLAN.md before editing. Read your assigned GitHub issue and docs/work/<issue-id>.md before starting or resuming.

## Ownership

- Integrator: root config, dependencies/lockfile, src/lib/contracts.ts, live transport, round controller, dashboard shell.
- Evidence owner: src/lib/analysis.ts, server endpoints, evidence/chart components, reasoning fixtures.
- Current bootstrap owner: Codex. Until the repository exists, docs/work/bootstrap.md records the local reservation; it is NOT a remote task claim.

## Coordination

Claim a GitHub issue with owned file paths before parallel edits. Use one branch and isolated checkout/worktree per active task. Shared types require integrator approval and an explicit handoff. Never edit another owner's files without a handoff. Update the task log at checkpoints with tests, blockers and next action. PRs link an issue and include that log. Only the integrator changes the lockfile. Do not rewrite others' uncommitted work. Merge runnable increments, never secrets.

## Commands

`npm install`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.

## Invariants

No invented live data. Fixture previews are explicitly labeled. Suspicion is not calibrated probability. Quotes must match player transcript. Timing/face/heart-rate are not lie evidence. No permanent API keys in browser bundles. Stop media and connections on end/reset/unmount. Discard stale async responses. Single in-flight periodic analysis.

## Scope

One three-minute round, camera/mic, adaptive questions, suspicion timeline, final verdict. No database/auth/multiplayer/face tracking/watch integration without a separate approved task. Localhost first. Reserve the final 45 minutes for verification/submission.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
