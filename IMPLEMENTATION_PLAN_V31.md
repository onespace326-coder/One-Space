# OneSpace V31 Implementation Plan

**Goal:** Make all visible brand/accent elements follow the selected visual preset and make Aries speech robust to Chrome's asynchronous voice discovery and blocked playback.

**Architecture:** Preserve the existing static HTML/CSS/JavaScript application and its current Supabase/Google integration paths. Add one final theme stylesheet and retain one final speech controller as the global entry point. Do not migrate the app to React or create a duplicate Lovable/Replit project.

**Files changed**
- `index.html` — load V31 theme CSS last, cache-bust the final Aries controller, and synchronize browser theme-color with the active surface.
- `onespace-v31-theme.css` — theme-aware brand, intro, accent components and missing palette mappings.
- `aries-chrome-audio.js` — final shared speech controller with voice readiness, fallback, chunking, diagnostics and replay.
- `sw.js` — bump cache version and precache the V31 theme stylesheet.
- `onespace-v31-static-verify.mjs` — package/static checks.
- `onespace-v31-regression.test.mjs` — mocked Web Speech API regression test.
- `README_V31_THEME_ARIES_AUDIO.txt` and `AUDIT_REPORT_V31_THEME_ARIES_AUDIO.md` — deployment and audit notes.

## Implementation sequence

1. Reproduce the theme issue from source: fixed blue V30 intro/logo colours and missing light-mode Noir/Nexus accent mappings.
2. Reproduce the speech issue from source: final V30 controller speaks before Chrome's asynchronous voice list is ready.
3. Add failing regression assertions for final stylesheet order, theme tokens, `voiceschanged`, installed-voice selection and manual replay.
4. Implement the V31 theme layer and shared Aries speech controller.
5. Update the service-worker cache so GitHub Pages clients can receive the new assets.
6. Run static syntax/reference/CSS checks, the Node Web Speech mock test, and headless Chromium computed-style checks across the supported themes.
7. Package the verified source for deployment.

## Constraints
- No Supabase schema, migration, authentication, Google OAuth, Gmail, Calendar, Drive or scheduler changes.
- Do not create a new Lovable or Replit copy of OneSpace.
- Actual audible output still depends on the user's Chrome sound permission, installed OS voices and output device.
- GitHub connection currently reports `push=false`; deployment must wait for write permission or be uploaded by the repository owner.

## Verification
- `node onespace-v31-static-verify.mjs`
- `node onespace-v31-regression.test.mjs .`
- Headless Chromium theme acceptance: 13 skin/appearance combinations; intro accent and main button accent must match the active body accent.
- Headless Chromium theme-color observer: browser theme-color updates after body theme changes.
