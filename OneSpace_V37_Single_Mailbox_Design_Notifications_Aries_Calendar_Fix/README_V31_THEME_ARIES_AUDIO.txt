ONESPACE V31 — THEME + ARIES CHROME AUDIO REPAIR

WHAT CHANGED
1. Added onespace-v31-theme.css as the final stylesheet so the active visual preset wins over legacy styles.
2. Replaced fixed-blue V30 intro/logo accents with the active --accent and --accent-strong tokens.
3. Completed missing appearance mappings for Noir (red), Nexus (lime) and dark Studio (warm brown), preventing those themes from falling back to the default blue.
4. Updated the brand mark, intro, voice orb, upload hero, file icons, selected task controls and navigation accents to follow the active palette. The browser theme-color meta tag now tracks the selected surface colour.
5. Replaced the V30 Aries speech controller with a single V31 controller. It waits briefly for Chrome's asynchronous voice list (voiceschanged), selects a supported installed voice, retries once with the system voice if the selected voice fails, and splits long replies into short utterances.
6. Added clearer playback diagnostics and a manual Hear Aries replay control for browser/site audio blocks.
7. Removed the periodic pause/resume keep-alive workaround; speech queue progression now follows utterance start/end/error events.
8. Bumped the service-worker cache to V31 and added the new stylesheet to its shell.

PRESERVED
- No Supabase schema or SQL changes.
- No Google OAuth, Gmail, Calendar, Drive, scheduler or Aries data-flow changes.
- Existing theme choices and stored preference keys are retained.

TEST
Run:
  node onespace-v31-static-verify.mjs
  node onespace-v31-regression.test.mjs .

The regression test uses a deterministic Web Speech API test double. It checks asynchronous voice discovery, installed-voice selection, long-reply chunking, system-voice fallback and the manual replay path.

DEPLOY
1. Extract this ZIP.
2. Upload/replace the package files in the root of the existing One-Space GitHub Pages repository. Keep the existing directory structure.
3. Commit the changes to the intended deployment branch.
4. Wait for GitHub Pages to publish, then hard-refresh Chrome:
   Mac: Cmd+Shift+R
   Windows: Ctrl+Shift+R
5. In OneSpace Settings, select the desired Visual theme and Appearance mode.
6. In Settings > Voice, set Voice selection to Auto, set Spoken language to Auto/English (India) or a language installed on the device, enable Aries and Auto-speak, then press Play voice sample.
7. Send Aries a short text message. If Chrome blocks automatic speech, press Hear Aries.

IMPORTANT LIMITS
- A static or mocked speech test cannot certify audible output in the user's Chrome profile or operating system.
- If playback is still silent after deployment, check Chrome Site settings > Sound = Allow, confirm the tab is not muted, and verify the OS output device and volume.
- Microphone permission is separate from speaker output permission.
- This ZIP is prepared for deployment. It has not been pushed to GitHub from this session because the connected GitHub permission currently reports push=false.
