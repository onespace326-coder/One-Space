ONESPACE V19 — EXECUTIVE ASSISTANT UPDATE
=========================================

GITHUB PAGES INSTALLATION (NO TERMINAL)
1. Open the One-Space GitHub repository.
2. Upload the CONTENTS of this ZIP into the repository root (do not upload the ZIP itself as a nested folder).
3. Preserve the assets/ and icons/ folders.
4. Choose Replace files when GitHub asks, then commit to the branch used by GitHub Pages.
5. After deployment, open OneSpace and hard refresh (Cmd+Shift+R on Mac).

WHAT THIS WEBSITE ZIP CHANGES
- Adds a premium Executive Command Center to Overview.
- Adds a CEO-focused priority radar and KPI strip.
- Adds multiple light/dark theme presets: Studio, Noir, Nexus, Aurora Glass, Ocean, Orchid, Sage, Graphite and Sunset.
- Adds iOS-inspired glass surfaces and motion, with reduced-motion support.
- Adds account hub for up to four Google accounts.
- Adds account-aware mailbox filters and per-account/manual all-account sync controls.
- Changes browser sync to iterate through all connected Google accounts.
- Adds Aries email and urgent-task wake-up alerts based on new synced records.
- Makes visible and spoken Aries replies address the user as “Boss”.
- Adds new stylesheet and JavaScript modules and bumps service-worker cache version.

REQUIRED SUPABASE FUNCTION UPDATES
Deploy the companion ZIP OneSpace_V19_Supabase_Multi_Google_Functions.zip:
- google-oauth-start
- google-oauth-callback
- google-integration-status

The updated OAuth functions allow one primary Google account plus three additional accounts (four maximum) and present Google's account chooser. Existing V18.2 google-sync already accepts accountId; the V19 website calls it once per connected account.

IMPORTANT LIMITATIONS
- The user must explicitly connect each Google account through Google's consent screen.
- Gmail, Calendar and Drive are only available for scopes actually granted to each account.
- Browser notification wake-ups work while OneSpace is running in a browser tab. Notifications after the page/browser is fully closed require a separately configured Web Push/VAPID backend and subscription flow; this ZIP does not claim that closed-page push is active.
- Aries remains the no-OpenAI, rule-based/workspace assistant. It uses stored memory and workspace context, not model training or unrestricted ChatGPT-level reasoning.
- Static source checks are not a live integration test. Confirm live OAuth, per-account sync and sending with test accounts after deployment.
