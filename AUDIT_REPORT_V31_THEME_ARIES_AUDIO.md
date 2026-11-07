# OneSpace V31 Audit & Fix Report

Date: 06 Nov 2026
Input: OneSpace_V30_Orbit_Intro_Aries_Audio_Fix.zip
Repository inspected: onespace326-coder/One-Space (main)

## Findings

### 1. Theme colour did not consistently follow the selected visual preset
- The existing theme controller and CSS define accent tokens for the supported visual presets.
- The V30 brand/intro stylesheet hard-coded navy and blue values for the logo tile, intro background, orbital grid, glow, wordmark highlight and progress bar. Those elements therefore stayed blue even when the rest of the interface changed theme.
- The style layer also lacked light-mode accent token mappings for the Noir and Nexus presets. When either was manually switched to light appearance, those palettes could fall back to the root blue accent.
- Some legacy elements (brand mark, upload hero, voice orb and selected task control) still used fixed colours.

### 2. Aries speech could fail while Chrome was loading voices
- The earlier inline preview controller waited for the Web Speech API voice list.
- The final V30 controller replaced it but called `speechSynthesis.speak()` immediately after `getVoices()`. Chrome may populate voices asynchronously and signals updates through `voiceschanged`.
- The V30 controller did not wait for that update before selecting a voice, so it could attempt speech before the installed voice list was ready.
- A silent/blocked playback also needs an actionable retry path because browser sound permissions and OS audio output are outside website control.

## V31 Changes

- Added `onespace-v31-theme.css` after every legacy stylesheet. Branding and key accent surfaces now consume the active CSS theme tokens.
- Added missing light-mode accent tokens for Noir and Nexus and a warm dark Studio palette, so every preset keeps its identity across appearance modes.
- Updated logo SVG stop colours, intro lighting, orbital grid, upload hero, voice orb, file/stat icons, task checkbox and navigation accent to use theme variables. Added a theme-color observer so the browser chrome follows the selected surface.
- Replaced the final Aries speech controller with V31:
  - waits up to 1.6 seconds for `voiceschanged` when the voice list is initially empty;
  - chooses the configured voice, exact language, same language, English fallback, then system default;
  - retries once with the device/system voice if the chosen voice fails or never starts;
  - chunks long replies into short utterances and advances through `onend`;
  - surfaces useful errors and a manual Hear Aries replay button;
  - exposes `window.ariesAudioDiagnostics` and `window.stopAriesSpeech`.
- Removed the periodic pause/resume keep-alive timer.
- Updated the service-worker cache version and precached the V31 stylesheet.

## Verification

- `node onespace-v31-static-verify.mjs` — PASS.
- `node onespace-v31-regression.test.mjs .` — PASS.
- Headless Chromium computed-style acceptance — PASS across 13 preset/appearance combinations (Studio light/dark, Noir light/dark, Nexus light/dark, Aurora light/dark, Ocean, Orchid, Sage, Graphite and Sunset). Intro accent and primary action colour matched the active theme accent in every case.
- Headless Chromium theme-color observer test — PASS; browser theme-color updated from Noir dark to Studio light after a theme change.
- Headless Chromium Web Speech API mock — PASS; the controller waited for `voiceschanged`, selected the loaded voice, and exposed the Hear Aries button after a simulated `not-allowed` error.
- The runtime regression test verifies asynchronous voice loading, installed voice selection, long-reply chunking, system-voice retry and blocked-playback replay.
- JavaScript syntax checks passed for package scripts and inline HTML scripts.
- Local HTML asset references exist.
- CSS brace/string balance checks passed.
- Supabase migration copies match.
- Browser auth config has no detected service-role/secret-key pattern.

## Not Certified

- Audible playback in the user's actual Chrome profile, speaker device or operating system.
- Live Supabase authentication, Google OAuth/Gmail/Calendar/Drive sync and scheduler behavior after deployment.
- Chrome site Sound permission, tab mute, OS output device and installed OS voices.

## Deployment Access

The connected GitHub repository is readable, but its reported permission is `push=false`. No live commit or deployment was made. The ZIP is ready for upload to the existing repository; the live site remains unchanged until an authorized write/deploy path is available.
