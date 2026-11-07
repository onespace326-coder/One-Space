ONESPACE V23 — SECURITY HARDENING
================================

What changed
------------
1. connected_accounts is now queried with an explicit browser-safe projection.
   The browser no longer selects token_vault_ref or opaque provider metadata.
2. Scheduled task create, edit, pause and resume now use three SECURITY DEFINER
   database RPCs. Each RPC derives the owner from auth.uid(); callers cannot
   submit a different user_id.
3. Scheduled task listing selects only UI-required columns. Worker internals
   locked_at, last_run_at and run_count are not sent to the browser.
4. Scheduled task status can only be changed through the guarded pause/resume
   RPC. Direct client INSERT and UPDATE privileges are removed in the enforce
   phase; owner-scoped DELETE remains available.
5. The service-worker cache version has been advanced to V23.

SAFE UPGRADE ORDER — IMPORTANT
------------------------------
Do these steps in this order to avoid breaking the currently deployed V22 app:

STEP 1 — SUPABASE PREPARE (before website deployment)
  Open Supabase > SQL Editor.
  Run SUPABASE_V23_PREPARE.sql.
  This creates the three RPCs but does not revoke V22's existing table grants.
  The old V22 frontend continues to work during the upgrade.

STEP 2 — DEPLOY WEBSITE FILES
  Extract this ZIP and upload its contents to the GitHub Pages repository root,
  replacing the matching website files.
  Keep the supabase/ folder and the SQL files in the repository for reference.

STEP 3 — SUPABASE ENFORCE (after website deployment)
  Open Supabase > SQL Editor.
  Run SUPABASE_V23_ENFORCE.sql.
  The V23 website now uses safe column projections and RPCs, so the tighter
  database grants match the deployed frontend.

STEP 4 — VERIFY
  The final SELECT statements in SUPABASE_V23_ENFORCE.sql show the expected
  privileges. Also test the app manually:
    - Sign in and open Accounts; connected Google accounts should still list.
    - Open Tasks > Scheduled tasks; existing schedules should list.
    - Create a reminder, edit it, pause it, resume it and delete it.
    - Ask Aries to create a future reminder.
    - Confirm the scheduled worker can still claim due jobs.

IMPORTANT LIMITATIONS
---------------------
- The uploaded V22 ZIP contains only the aries-chat Edge Function. The Google
  OAuth / sync / mail Edge Function source is not included. This update does
  not alter connected_accounts INSERT/UPDATE/DELETE grants, because their
  server-side write path cannot be verified from the supplied project ZIP.
  The browser-safe SELECT restriction is applied; the Google Edge Functions
  should be inspected separately before changing their write permissions.
- Do not expose the Supabase service_role key in browser code.
- This package does not deploy Supabase Edge Functions or configure Cron.
- Apply these scripts to the same Supabase project configured in auth-config.js.

Files
-----
SUPABASE_V23_PREPARE.sql  Create owner-checked scheduled-task RPCs.
SUPABASE_V23_ENFORCE.sql  Restrict sensitive SELECT and scheduled-task writes.
supabase/migrations/     Copies of the two SQL migration stages.


ONESPACE V24 — ARIES CONVERSATIONAL SCHEDULING FIX
=================================================

Changes in this package:
- Aries now understands reminder requests in natural English and can collect
  missing task, date and time details over multiple turns.
- A follow-up such as "9 AM" is attached to the current user's pending reminder
  draft rather than sent to the generic chat model.
- Pending reminder drafts are stored per signed-in user and expire after two
  hours; they are not shared between accounts.
- A complete reminder is saved through create_my_scheduled_task() using the
  authenticated user session. Aries confirms only after Supabase returns a task ID.
- Reminder intent is processed before mail-scan intent, so "remind me to check
  my emails" does not accidentally start an inbox scan.
- Fixes escaped whitespace expressions in the task-intent detector.
- The Aries chat system prompt explicitly requires Boss-only addressing and
  forbids claiming an action succeeded unless the application confirms it.

No new SQL is required. This update uses the V23 RPCs already installed.

Deployment:
1. Upload the contents of this ZIP to the GitHub Pages repository root.
2. Deploy the updated aries-chat Edge Function from supabase/functions/aries-chat
   if you want the strengthened conversational prompt to take effect.
3. Hard-refresh the site and test: "Remind me to check emails", then "tomorrow",
   then "9 AM". Also test the one-message form:
   "Remind me tomorrow at 9 AM to check my emails."

The scheduled-task worker still needs to be active for a saved reminder to run.
