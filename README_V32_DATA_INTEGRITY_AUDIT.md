ONESPACE V32 — DATA INTEGRITY, NOTIFICATIONS & GOOGLE WORKSPACE AUDIT
=====================================================================

WHAT WAS FIXED IN THE WEBSITE CODE
----------------------------------
1. Workspace queries are explicitly filtered by the authenticated Supabase
   user ID, in addition to the project's Row Level Security policies.
2. Gmail messages are shown only when their account_id belongs to a currently
   connected Google Workspace account for the signed-in user.
3. Google Calendar rows are shown only when their account_id is connected.
   OneSpace-created events remain visible as private OneSpace events.
4. Google Drive rows are shown only for connected Google account IDs. Private
   Supabase Storage files remain visible; disconnected Google Drive rows do not.
5. Email-generated tasks are shown only if their Source message still belongs
   to an active connected mailbox. The task stores its Source and Account IDs
   in its description metadata. Provider message IDs are matched within their
   owning mailbox so another connected mailbox cannot accidentally validate
   a stale task. Manual tasks remain independent of mail accounts.
   Aries pending email-action suggestions are also pruned when their source mail
   disappears or its account is disconnected, and are cleared on sign-out.
   Aries chat history and personal profile/journal UI are also cleared on sign-out;
   late cloud responses from the previous user are ignored.
6. The Attention Radar opens the exact email, or opens the exact source email
   for an email-derived task. A manual task opens its row in My tasks.
7. Notification rows carry their source IDs. Mail notifications open the exact
   message, calendar notifications open the exact day, and task notifications
   open the source email or the corresponding task row.
8. The old shared localStorage email cache is no longer restored. Drafts are
   stored under a per-Supabase-user key, not shared across login identities.
9. Repeated initial auth callbacks are deduplicated by signed-in user ID.
   Sign-out clears in-memory mail, calendar, tasks, contacts, files and accounts.
10. The Gmail footer now uses the same Google Workspace connection controller
    as the main Connect Google button; parallel connection redirects are blocked.
11. The six-second mailbox session/render poll is removed. Mail refreshes on
    authentication, real data updates and tab visibility. Background Google
    sync retains a 30-second default (user preference can override it, with a
    30-second minimum).
12. Creating a calendar event now saves it to the Supabase OneSpace calendar
    and reloads the cloud data. The UI labels it honestly as a OneSpace event.
13. Toast notifications are positioned at the bottom-left and use the current
    website theme tokens. Notification popovers share the existing panel, line,
    text and accent variables.
14. Scheduled-task account selection and run-history listing are owner-scoped.
    Drive metadata and Aries memory deletion also check the authenticated owner ID.
15. The service-worker cache is bumped to V32 and precaches the new stylesheet.

WHY GOOGLE CAN ASK TWICE
------------------------
There are two separate Google permissions in this architecture:
- Google sign-in authenticates the person to OneSpace through Supabase Auth.
- Connect Google Workspace grants the additional Gmail, Calendar and Drive
  scopes and stores provider credentials for secure server-side sync.

These are distinct authorization purposes, not two OneSpace login accounts.
The frontend now deduplicates repeated auth events and routes every mailbox
connect button through one guarded connection handler. Combining both Google
consents into one prompt requires changing and deploying the server-side OAuth
flow to request the extra scopes at sign-in and securely vault/refresh those
provider tokens. That server code is not present in this ZIP, so V32 does not
pretend it has merged the two OAuth grants.

SUPABASE SCHEMA STATUS — IMPORTANT
----------------------------------
The supplied project ZIP does NOT contain the referenced supabase-schema.sql
or a complete base-schema migration. The existing V23 SQL files only prepare
and enforce scheduled-task RPCs/permissions. A safe base schema cannot be
reconstructed from this frontend bundle alone without risking incorrect table
columns, constraints, foreign keys, storage policies or Row Level Security.

Run SUPABASE_V32_SCHEMA_AUDIT.sql in Supabase SQL Editor. It is READ-ONLY and
reports table existence, required columns, whether RLS is enabled or forced,
and the RLS policies present. It does not create or change database objects. Use its output to compare the live schema
before adding/repairing any base-schema migration.

GOOGLE SERVER-SIDE SYNC STATUS — IMPORTANT
------------------------------------------
The browser config points to these Supabase Edge Function endpoints:
- google-oauth-start
- google-integration-status
- google-sync
- google-send-OneSpace
- google-mail-action-OneSpace
- google-mail-attachment
- aries-email-scan / aries-health / aries-approve-reply

Only supabase/functions/aries-chat/index.ts is included in the supplied ZIP.
The Google OAuth, sync, send, mail-action and attachment Edge Function source
is absent. V32 fixes how the website validates and displays data returned by
those functions, but it cannot verify or deploy the missing backend logic.
For end-to-end Gmail / Calendar / Drive sync, the deployed Edge Functions must:
- derive the owner from the authenticated Supabase JWT;
- reject account IDs not owned by that user and still connected;
- store provider tokens only in a server-side vault, never browser tables;
- upsert email_messages, calendar_events and drive_files with the matching
  connected_accounts.id in account_id;
- handle revoked scopes/tokens and disconnected accounts;
- paginate/delta-sync provider data and return clear per-account errors.
The frontend can read synced Google Calendar events. The current bundle does
not include an endpoint to create/write events back to Google Calendar; new
manual events are saved to the OneSpace calendar only.

FILES ADDED / UPDATED
---------------------
- index.html
- onespace-supabase-data.js
- onespace-v22-mail.js
- onespace-v19-executive.js
- aries-intelligence.js
- aries-personalization.js
- scheduled-tasks.js
- sw.js
- onespace-v32-data-integrity.css
- SUPABASE_V32_SCHEMA_AUDIT.sql
- onespace-v32-static-verify.mjs
- onespace-v32-regression.test.mjs
- onespace-v32-data-integrity.test.mjs

LOCAL VERIFICATION
------------------
Run from the extracted project root:
  node onespace-v32-static-verify.mjs
  node onespace-v32-regression.test.mjs .
  node onespace-v32-data-integrity.test.mjs .

These checks cover source syntax, local references, stylesheet/cache order,
account-scoped query filters, task source links, notification/radar routing,
auth-event deduplication, disconnected-account refresh, mail refresh behaviour
and calendar persistence.
They do NOT prove live Supabase SQL, OAuth, Gmail API, Google Calendar API or
Drive sync. Those require the deployed backend and a real test account.

DEPLOYMENT / LIVE CHECKLIST
---------------------------
1. Back up the current GitHub Pages repository and Supabase database.
2. Run SUPABASE_V32_SCHEMA_AUDIT.sql in the configured Supabase project. Repair
   missing tables/columns/RLS using the authoritative schema migration for
   this project; do not execute an invented schema based on this ZIP.
3. Upload the ZIP contents into the existing GitHub Pages repository root,
   preserving assets/, icons/ and supabase/ paths; commit the deployment branch.
4. Deploy/verify the Google Edge Functions listed above in the SAME Supabase
   project. Keep service-role keys, OAuth client secrets and refresh tokens in
   Supabase secrets only, never in auth-config.js.
5. Hard-refresh the site (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows). The
   service worker automatically changes to the V32 cache after activation.
6. Test a connected Google account: Gmail unread mail, Google calendar events
   and Google Drive files should appear. Then disconnect/revoke a test account
   and confirm its mail, calendar, Drive items and mail-derived tasks disappear
   after the next successful sync/data load.
7. Click an Attention Radar email and verify the exact message opens. Click an
   email-derived Radar task and verify its exact source email opens. Test each
   notification kind similarly.
8. Sign out and sign in as a different test user; no prior user's mail, tasks,
   events, Drive files or contacts should remain visible.
9. Create a OneSpace calendar event and confirm it persists after a reload.
   Google Calendar write-back is not available in this source bundle.

NOT DEPLOYED FROM THIS SESSION
------------------------------
The files are prepared locally in this V32 package. They were not pushed to
GitHub, no SQL was run against the live Supabase database, and no Google Edge
Functions were deployed or live-tested from this session.
