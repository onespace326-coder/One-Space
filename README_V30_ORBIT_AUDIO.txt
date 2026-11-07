ONESPACE V30 — ORBIT INTRO + ARIES CHROME AUDIO REPAIR

BRAND / INTRO
- Replaced the old crescent mark with a bespoke orbit-and-core OneSpace emblem in the login and workspace wordmarks.
- Added a cinematic opening splash with animated orbital rings, perspective grid, gradient core and wordmark.
- Intro dismisses after load, has a hard timeout, and respects reduced-motion preference.
- Added V30 CSS and updated PWA theme colour and service-worker cache.

ARIES AUDIO
- Consolidated speech output through one V30 speech controller.
- Voice selection now falls back across exact language, same language, English, system default and first installed voice. If the requested Hindi voice is unavailable, it uses a supported installed voice rather than silently sending a language with no matching voice.
- Long assistant replies are split into short utterances and queued sequentially to avoid Chrome speech request length/queue failures.
- Removed unconditional speechSynthesis.cancel() before every utterance; cancellation is now conditional to avoid racing Chrome's speech service.
- Increased start timeout and added explicit error diagnostics and a manual replay button.
- Voice preview, chat replies and wake alerts continue to use the shared controller.

DEPLOY
1. Extract the ZIP and replace matching files in the existing GitHub Pages repository root.
2. Commit and wait for GitHub Pages to finish.
3. Hard refresh Chrome (Cmd+Shift+R on Mac / Ctrl+Shift+R on Windows).
4. In OneSpace Settings > Voice, choose Auto voice, press Play voice sample, then send Aries a short text message.
5. If still silent, check Chrome site controls > Site settings > Sound > Allow, ensure the tab is not muted, and verify the operating system output device/volume.

LIMITS
- Speech output uses the browser/device speech service; this update cannot override Chrome's site sound block, OS mute, missing speakers, or missing OS voices.
- Microphone input permission is separate from speaker output.
- Static checks cannot confirm audible playback in the user's Chrome profile.
- No Supabase SQL changes are included or required.
