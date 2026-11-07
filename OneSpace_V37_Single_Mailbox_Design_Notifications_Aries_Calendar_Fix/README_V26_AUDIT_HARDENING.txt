ONESPACE V26 — GOOGLE / ARIES / TASK RELIABILITY HARDENING
=========================================================

PURPOSE
-------
This is a focused hardening update to the supplied V25 OneSpace package. It
repairs client-side issues that can be confirmed from the supplied source and
strengthens the included Aries chat Edge Function. Existing UI design, Supabase
project URL, browser publishable key, V23 SQL policies/RPCs, and user data model
are retained.

WHAT CHANGED
------------
1. Google Edge Function requests now consistently include BOTH the signed-in
   user's Authorization bearer token and the project's publishable `apikey`:
   - Google sync
   - Google account status check (Accounts page)
   - Google OAuth start (Accounts page)
   - Gmail attachment retrieval
   Existing mail-module connect/status, send, approval and mail-action calls
   already included the publishable key.

2. Gmail send-account selection now recognises narrow Gmail send/compose/modify
   scopes AND Google's broad https://mail.google.com/ scope. The Mail check uses
   consistent case-insensitive scope handling and tolerates scopes stored as an
   array or a string.

3. Google sync no longer displays a success message when its client module is
   missing, no account was confirmed, or the result explicitly reports failure.
   The Accounts page uses the same success-confirmation check.

4. Edge Function connectivity probes now clear their timeout in all cases and
   distinguish an endpoint responding from a successful authenticated action.
   A successful OPTIONS probe is not represented as proof that Gmail works.

5. Scheduled-task saves prevent repeated form submissions while an RPC is in
   progress, handle network/RPC exceptions visibly, and require Supabase to
   return a task ID for a newly created schedule before showing success.

6. Google background auto-sync safely handles malformed or unavailable browser
   storage values and applies a 15-second minimum / one-hour maximum interval.

7. The included aries-chat Edge Function:
   - treats email/document/workspace context as untrusted reference data;
   - no longer puts workspace context inside the privileged system prompt;
   - accepts only the client's known `hi` / `en` language values in the system
     prompt, rather than interpolating arbitrary request text;
   - validates method, JSON body, message and required environment settings;
   - has bounded upstream request time and clearer timeout/response errors;
   - prefers Supabase's current `SUPABASE_PUBLISHABLE_KEYS` environment map,
     while retaining `SUPABASE_ANON_KEY` as a migration fallback;
   - adds no-store response headers.

8. Service-worker cache generation advanced to V26 so browsers refresh the
   patched files after deployment.

FILES UPDATED
-------------
- index.html
- onespace-supabase-data.js
- scheduled-tasks.js
- onespace-v22-mail.js
- supabase/functions/aries-chat/index.ts
- sw.js

FILES ADDED
-----------
- onespace-v27-verify.mjs       Repeatable static validation script
- AUDIT_REPORT_V26.txt          Audit results and remaining blockers
- README_V26_AUDIT_HARDENING.txt

DEPLOYMENT — WEBSITE
--------------------
1. Extract this ZIP.
2. Upload the CONTENTS of the extracted folder to the root of the existing
   GitHub Pages repository, replacing the matching files. Keep the `assets/`,
   `icons/`, and `supabase/` folders.
3. Commit the upload and wait for GitHub Pages to publish it.
4. Open OneSpace and hard-refresh (Cmd+Shift+R on Mac / Ctrl+Shift+R on Windows).
5. In the Accounts page, run Mail check and verify Google status, scopes,
   endpoints, and a live read-only sync.

DEPLOYMENT — ARIES EDGE FUNCTION
--------------------------------
The browser ZIP does not deploy Edge Functions automatically. Deploy the
updated function source from this package to the existing Supabase project:

  supabase functions deploy aries-chat

Keep the required Supabase and Anthropic secrets configured in Supabase. The
project's APP_ORIGIN should remain the exact website origin:

  https://onespace326-coder.github.io

Do not add the GitHub Pages repository path to APP_ORIGIN. ANTHROPIC_API_KEY is
required. ARIES_MODEL is optional; the current source default is
`claude-sonnet-5-5`.

SQL
---
No new SQL migration is included or required for these client-side and
aries-chat changes. Keep the existing V23 PREPARE and ENFORCE migrations already
applied. Do not rerun or modify permissions unless a separate database audit
has confirmed that it is necessary.

IMPORTANT — GOOGLE BACKEND SOURCE IS STILL REQUIRED
--------------------------------------------------
The uploaded V25 ZIP contains only `supabase/functions/aries-chat/index.ts`.
It does NOT contain the server-side source for the Google / Gmail functions,
including:
- google-oauth-start
- google-oauth-callback
- google-integration-status
- google-sync
- google-send-OneSpace
- google-mail-action-OneSpace
- google-mail-attachment
- aries-approve-reply
- aries-email-scan
- aries-health

This update repairs the browser callers but cannot audit or repair backend
OAuth refresh-token storage, Google API request handling, provider scope
validation, account ownership checks, Gmail action contracts, or backend CORS
for those missing functions. Do not replace them with placeholder functions.
A full server-side Google audit requires those function folders and their
Supabase logs. The scheduled-task execution worker / Cron source is also not
included, so saved schedules can be tested here but actual timed execution must
be verified against the deployed worker.

VALIDATION
----------
Run from the extracted project root:

  node onespace-v27-verify.mjs

The script checks root JavaScript syntax, inline scripts in index.html, local
HTML asset references, V23 SQL-copy consistency, and that auth-config.js does
not contain a detected service-role/secret-key pattern. It does not make live
network calls or execute SQL. See AUDIT_REPORT_V26.txt for exact results and
runtime limitations.
