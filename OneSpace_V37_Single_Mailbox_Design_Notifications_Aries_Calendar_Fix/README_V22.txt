ONESPACE V22 — OVERVIEW RESTRUCTURE + MAILBOX CONNECT + GMAIL ACTION FIXES
==========================================================================
Deploy: upload the CONTENTS of this ZIP to the repo root (Replace files), then hard refresh (service-worker cache bumped to v22).

1) OVERVIEW (new order, one spacing scale, no ragged gaps)
   header + live-sync bar -> Executive command deck -> 4 KPI cards -> [Needs attention | Next event]
   -> [Mail overview | Daily notes] -> Task planner -> Aries activity log
   - Removed duplicates: the "Your day, thoughtfully organised" banner and the deck's second KPI strip.
   - Cards in each row now share the same height and gap (16 px). Notes box fills its card. Live bar is one row.
   - Files: onespace-v22-overview.css (loads last).

2) MAILBOX CONNECTION
   - "No mailbox connected" was hard-coded and never changed. It now shows the real state:
     checking / signed out / not connected / connected (N mailboxes, last sync) / problem.
   - "Connect Gmail" starts Google sign-in directly from Overview and Mail; errors appear on the spot.
   - Empty inbox / empty Needs-attention card show state-aware messages with Connect / Sync buttons.
   - New "Mail check" (Overview footer and Connected accounts page): read-only test of session, Google link,
     Gmail permissions, every Edge Function, synced messages and a live sync.

3) GMAIL ACTIONS (star, archive, delete, mark read, restore, bulk, send)
   - FIXED: bulk Archive / Delete / Mark-read changed only the local copy and never reached Gmail.
   - Single actions are now instant and roll back with a clear message if Gmail rejects them.
   - Clear errors when aries-approve-reply is not deployed (sending was blocked with a vague message).
   - Priority card: sorts newest-first and ignores Sent / Trash / Archive (UUID ids broke the old sort).
   - Messages now carry a received timestamp for stable ordering.

STILL REQUIRED ON SUPABASE (not part of this ZIP)
   google-oauth-start, google-integration-status, google-sync, google-send-OneSpace,
   google-mail-action-OneSpace, aries-approve-reply, google-mail-attachment.
   Each Google account must grant the gmail.modify permission (star / archive / delete) — Mail check tells you.
   "Delete" moves a message to Gmail Trash. Permanent delete is not supported by the current mail-action function.
