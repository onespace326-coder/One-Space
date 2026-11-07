ONESPACE V29 — AURORA PREMIUM REDESIGN
================================

DESIGN DIRECTION
- Aurora Command: a premium, calm workspace with refined glass surfaces, cool blue-violet light, clean typography, and restrained motion.
- First-time sessions default to the Aurora preset. Existing saved visual presets and light/dark preferences are preserved.
- The login/intro screen now uses a staggered entrance, animated ambient light, and a more polished sign-in card.
- Navigation, command bar, KPI cards, content panels, controls, dialogs, and responsive states share a consistent radius, border, shadow, and motion system.
- Aries has a more expressive intro banner and voice stage, with animated rings and refined conversation controls.
- Reduced-motion preferences are respected.

FUNCTIONALITY PRESERVED
- The audited V28 unified Aries speech controller and wake-alert routing are carried forward, including Chrome speech diagnostics and removal of the old delayed wake-alert playback path.
- No Supabase schema, RLS policy, OAuth, Gmail, Calendar, Drive, authentication, general Aries intelligence, or task logic was intentionally changed.
- Existing DOM IDs, data-page attributes, inline handlers, and script entry points are retained.
- The redesign is a final CSS layer plus a first-visit visual preset default; it does not replace existing app modules.

DEPLOY
1. Extract this ZIP.
2. Upload the contents to the root of the existing GitHub Pages repository, replacing matching files.
3. Wait for GitHub Pages to deploy.
4. Hard-refresh: Cmd+Shift+R on Mac or Ctrl+Shift+R on Windows.
5. If the old visual remains, close the tab and reopen it after the service worker updates.

NOTES
- A previously saved preset in localStorage is respected. To preview the new default Aurora preset in a browser that already saved another preset, open Settings > Appearance > Visual preset and choose Aurora Glass.
- Code/static validation is included in onespace-v29-verify.mjs. Live OAuth, Supabase, Google sync, microphone capture and actual sound output still require testing in the user's own deployed browser session.
