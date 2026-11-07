ONESPACE V21 — SMART ARIES + WAKE + GLASS
==========================================
Deploy: upload the CONTENTS of this ZIP to the repo root (Replace files), then hard refresh (service worker cache is bumped).

1) ARIES AUTO-SCAN (smarter, faster)
- New engine: aries-v21-smart.js (runs in the browser, no server needed)
  * Understands deadlines: "by 5 pm Friday", "12 Nov", "15/11/2026", "in 3 days", "EOM", "kal", "next Monday"
  * Tells apart tasks for YOU from things the sender will do; skips newsletters, no-reply, OTP, promos
  * Detects bills/payments ("invoice due 18 Nov") and creates one clean task
  * Confidence score + duplicate check against your open tasks and earlier suggestions
  * Each message is scanned once (fast re-scans); HTML mail is parsed safely (no image loads/scripts)
- Clear tasks are ADDED AUTOMATICALLY to Upcoming tasks & deadlines (with deadline + priority). Uncertain ones wait for review.
- Planner shows an "Aries auto-scan" strip (last scan, emails read, tasks from email, Scan now, Pause),
  a "✦ Added by Aries from email" badge, and a "Not a task" button that removes it and stops it coming back.
- Fixed: High priority from the old local scan was saved as Normal; deadline was not saved locally.
- The cloud function aries-email-scan is now optional; the local scan always runs first.

2) ARIES WAKES UP ON NEW ALERTS
- aries-v21-wake.js: new mail, meeting in 15/5 min, task due within 1 h, newly overdue, and tasks Aries just added.
- Aries shows a glass card, animates the mic, plays a soft chime, and speaks ONE merged update (bursts are batched).
- Skips reading OTP/verification mails aloud. Quiet hours 22:00-07:00 (urgent items still show visually).
- Controls on Overview live bar: "Wake Aries on new alerts" + "Test wake". Card has Open / Replay / Mute 1 h / Allow alerts.
- Browser rule: sound needs one tap/keypress per page load; until then the card says "Tap to hear" and speaks on your first touch.
- Desktop notification + tab-title flash when the tab is hidden (after you allow alerts).

3) GLASS DESIGN (login to whole site)
- onespace-v21-glass.css loads last: colour field + frosted panels, nav, buttons, inputs, modals, popovers, toasts.
- Login: layered frosted panes behind the card. Works in light/dark and all skins (follows --accent).
- Falls back to solid surfaces if backdrop-filter or transparency is unavailable/reduced.

NOT POSSIBLE FROM THE BROWSER ALONE
- Waking Aries while the tab/app is fully closed needs server Web Push. Today Aries wakes while OneSpace is open (any tab).
