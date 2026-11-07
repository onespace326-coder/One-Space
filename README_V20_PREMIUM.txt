ONESPACE V20 — PREMIUM DESIGN PASS (visual only; no functions or features changed)
===================================================================================
Deploy: upload the CONTENTS of this ZIP to the repo root (Replace files), then hard refresh.

REMOVED
- Aries hero robot (blue/red glass head), orbit rings, "ARIES CORE · ONLINE" badge, both robot .webp files
- Every ball/orb: voice orb, banner orb, settings orb, executive-deck sphere, small "Ask Aries" dot
- Indigo/blue/lime leftovers in buttons, toggles, sliders, save button, ambient blobs, browser theme colour

CHANGED
- Logo: new ring-and-dot monogram (sidebar, login, favicon, app icons, maskable icon)
- Typography: DM Sans (UI) + Playfair Display (page titles only) + DM Mono (numbers); stray Georgia/Inter stacks removed
- Type scale: nothing below 10px; labels 11px, body 13–14px (was ~360 declarations at 6–9px)
- Voice button is the same element (#voiceOrb) restyled as a refined microphone; listening/speaking states still work
- Assistant page: compact intro card with the same two actions (Talk to Aries, Personalize Aries)
- New file onespace-v20-premium.css loads last; sw.js cache bumped to onespace-premium-v20

NOT IN THIS ZIP
- The copy "CoreGlass, chrome and light / Neural mesh / Modular intelligence" does not exist in these files, so nothing to remove here.

V20.1 ADDITIONS
- Overview: two independent columns (Needs your attention + Mail | Next event + Daily notes) so no row gaps remain.
- Live bar on Overview: choose sync rate (15s / 30s / 1 min / 5 min / off), "Sync now", last-synced status.
- Aries voice updates: spoken executive briefings at 10/15/30/60 min (new/important mail, next meeting, overdue and due-today tasks),
  plus an immediate update when a sync brings new mail. Quiet hours 22:00-07:00. "Brief me now" button. Uses device voices.
  Needs: voice assistant enabled in Settings, OneSpace open in a tab, and one tap on the page so the browser allows sound.
- Nine section artworks (assets/art/*.svg), each different, recoloured by the active theme; animated slowly. Motion respects reduced-motion.
- Login: animated aurora, drifting line-art, glass card with soft sheen, staggered entrance.
- supabase/functions/aries-chat: human-style conversation backend (see below).

TALKING TO ARIES LIKE A PERSON
The website alone cannot hold open-ended conversation; that needs a language model on a server.
1) supabase secrets set ANTHROPIC_API_KEY=... APP_ORIGIN=https://<your-github-pages-origin>
2) supabase functions deploy aries-chat
integrations-config.js already points to it. Not tested live from here.

NOT DONE
- Pinterest / third-party image or script feeds: not used (not reachable from my environment, and would add tracking, licensing and load risk). Artwork is generated locally.
