ONESPACE V25 — ARIES TASK SOURCE LINKS & MAIL ACTION RELIABILITY

WHAT CHANGED
1. Tasks created from email now retain their source email ID inside the existing task description field. On reload, OneSpace reconstructs sourceMailId from that description.
2. The Upcoming Tasks list displays an “Open source email” action for tasks that have an email source. It opens the matching cached mailbox message in the Mail page.
3. Local/imported messages without a Gmail provider message ID can now be archived, trashed, restored, starred, or marked unread inside OneSpace without being incorrectly blocked by the Gmail-only endpoint requirement.
4. Bulk mail actions distinguish local-only changes from changes confirmed by Gmail.
5. Service worker cache version was bumped to V25.

DEPLOYMENT
- Extract this ZIP and upload the CONTENTS of this folder to the root of the existing GitHub Pages repository, replacing the corresponding files.
- No new SQL migration is included or required for these UI/source-link changes.
- Keep the existing V23 RPC migrations and grants as installed.
- Hard refresh the website after GitHub Pages deploys.

IMPORTANT LIMITATION — LIVE GMAIL ACTIONS
The ZIP contains the browser caller for google-mail-action-OneSpace, but it does not contain that Supabase Edge Function's source. Live Gmail archive/trash/restore/star/read operations still depend on that deployed function, Gmail OAuth scopes (including gmail.modify), and its expected action contract. This package improves local handling and error rollback, but does not claim to repair the server-side Gmail endpoint. If live Gmail actions still fail, provide the source folder for google-mail-action-OneSpace and its deployment logs so the backend contract can be audited and fixed safely.

TESTS
- JavaScript syntax checks passed for all project .js files.
- 13 inline scripts in index.html passed Node syntax checks.
- ZIP integrity should be checked after packaging.
- Live Supabase/Gmail operations require deployment and real-account testing.
