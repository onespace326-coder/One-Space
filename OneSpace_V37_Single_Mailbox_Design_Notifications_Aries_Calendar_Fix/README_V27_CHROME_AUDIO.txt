ONESPACE V27 — CHROME AUDIO REPAIR
==================================

WHAT CHANGED
- Added aries-chrome-audio.js as the final deferred application script so it owns the final voice-output entrypoints.
- Removed the awaited voiceschanged/timer delay before speech synthesis. Click-triggered test playback now calls speechSynthesis.speak() synchronously from the click handler.
- Uses the browser/device default voice immediately if Chrome has not populated getVoices() yet. A later voiceschanged event refreshes the voice list without delaying speech.
- Adds speech start/error/timeout diagnostics and a Tap to hear Aries replay button when automatic playback cannot start.
- Preserves the Speak assistant replies and master voice settings. The explicit Play voice sample remains available as a test while the assistant is switched off.
- Captures a real user gesture and resumes any existing suspended Web Audio context and speech synthesis queue.
- Bumped the service-worker cache key and included the new script in the precache shell.

DEPLOY
1. Upload the contents of this ZIP to the root of the existing GitHub Pages repository and replace matching files.
2. Wait for GitHub Pages deployment to finish.
3. Open the site in Chrome, then hard reload with Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows).
4. Open Settings > Voice and click Play voice sample once. This click starts speech directly rather than after a delay.
5. Send Aries a text message. With Speak assistant replies enabled, Aries should speak. If Chrome blocks automatic playback, use the displayed Tap to hear Aries button.

CHROME CHECKS
- Make sure the OneSpace tab is not muted (right-click tab > Unmute site/tab).
- Check Chrome site sound permission: lock/tune icon beside the address > Site settings > Sound > Allow.
- Check the operating-system output device and volume.
- Speech output and microphone input are separate. A microphone permission problem does not by itself prevent Aries from speaking.

LIMITS
- This repairs the client-side browser speech output. It does not install an operating-system voice or change Chrome's global/site audio permissions.
- Actual sound still depends on the Chrome profile, operating-system voice service, device output, and user/site audio permissions.
