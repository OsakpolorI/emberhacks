# Tell — recording and submission script

## Record this real round (about 75–90 seconds)

Keep a small toy dragon or another harmless prop in the camera frame if you have one. It gives Gemini visible context, but do not claim the camera proves any past event. Record the real app, not **Explore a sample**. Add the narration as a voice-over afterward, or pause it while talking to Gemini so it does not enter the story transcript.

| On screen | What to say |
| --- | --- |
| **0:00–0:10 — Show the dashboard; click Start your investigation.** | “This is Tell, a voice and camera bluff game. I give Gemini a story, and it interviews me to see whether the story holds up.” |
| **0:10–0:35 — Speak to Gemini and let it answer.** | To Gemini: “Last weekend I flew to Korea on a real, living dragon.” When Gemini asks whether you mean a dream, nickname, or fiction, answer clearly: “I mean an actual living dragon, not a dream or a plane.” Do not talk over its question. |
| **0:35–0:55 — Show the live chart and latest evidence.** | Voice-over: “Gemini Live listens, sees camera frames, asks follow-ups, and publishes an assessment after an answer. The chart moves only when an assessment arrives. Tell checks every displayed quote against my transcript, so you can inspect why the score changed.” |
| **0:55–1:10 — Show the camera and pulse briefly.** | “The camera gives Gemini context about what is visible now. Local face cues can shape a question, but blinking and appearance never count as lie evidence. The heartbeat is a simulated effect; it rises only for a cited concern in the story.” |
| **1:10–1:30 — Click End & assess; show the final panel and quoted evidence.** | “A separate Gemini review reads the completed transcript and gives a tentative verdict with evidence and uncertainty. Tell is a game about claims and consistency, not a scientific lie detector.” |

If Gemini asks a different useful follow-up, answer that instead of forcing the example dialogue. If it ends the round on its own, skip the End button. Wait for the real assessment before describing a chart change. Keep the webcam preview and at least one spoken Gemini question visible in the recording. If you edit for length, preserve the actual order of question, answer, assessment, and verdict.

## Submission description (paste and add your team names)

**Tell** is a single-round voice and camera bluff game. A player tells a true or invented story aloud. Gemini Live listens to the microphone, receives camera frames, asks story-specific follow-up questions, and publishes structured assessments during the interview. Tell plots those assessments as a live suspicion trail and displays exact player quotes that the app verifies against the transcript. When the round ends, a separate Gemini analysis reviews the completed transcript for a tentative verdict: likely bluff, likely truthful, or insufficient evidence.

The interface also shows local speech activity and approximate facial cues. These may help the conversation feel situated, but they do not determine suspicion. The heartbeat is a simulated visualization driven by grounded story concerns, not a measured pulse. Tell is an experimental social game, not a validated lie detector.

**Gemini’s role:** Gemini Live interprets spoken and visual input, conducts the interview, and publishes live assessments. The separate final analysis reviews the transcript without previous scores. Without Gemini’s interpretation and follow-ups, the core interaction does not work.

**Technologies:** Next.js, React, TypeScript, Tailwind CSS, Google GenAI SDK, Gemini Live, Gemini analysis API, MediaPipe Face Landmarker, Web Audio/AudioWorklet, Recharts, Zod, and browser speech synthesis. Hardware: laptop microphone and optional webcam. No smartwatch is integrated.

**Before submitting:** include the GitHub repository link, the real demo recording, and the names of all team members. The GitHub usernames alone may not satisfy the names requirement.
