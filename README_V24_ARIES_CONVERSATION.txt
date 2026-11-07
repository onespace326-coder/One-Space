ONESPACE V24 — ARIES CONVERSATIONAL SCHEDULING FIX
=================================================

Purpose
-------
Fix Aries' generic fallback when the user asks to create a reminder in natural
language or provides the date/time in a separate follow-up message.

Changes
-------
1. Understands reminder requests such as:
   - Remind me tomorrow at 9 AM to check my emails.
   - Remind me to check my emails tomorrow at 9 AM.
   - Can you remind me to check my emails?
2. Supports multi-turn collection of task, date and time:
   - Remind me to check my emails.
   - Tomorrow.
   - 9 AM.
3. Also supports date/time first, then task title:
   - Remind me tomorrow at 9 AM.
   - Check my emails.
4. Stores unfinished reminder drafts in localStorage under the signed-in user's
   own namespace. Drafts expire after two hours and do not cross user accounts.
5. Uses the existing authenticated Supabase RPC create_my_scheduled_task().
   The task list refreshes immediately after a successful Aries RPC save.
   The RPC derives ownership from auth.uid(). No new SQL is required when the
   V23 PREPARE migration has already been installed.
6. Processes reminder intent before inbox scan intent so a reminder to check
   email is not mistaken for a request to scan the inbox.
7. Confirms success only after Supabase returns a saved task ID.
8. Supports cancelling an unfinished reminder draft.
9. Fixes incorrectly escaped whitespace expressions in the older explicit task
   intent detector.
10. Strengthens the aries-chat system prompt: address the user only as Boss, keep
    everyday conversation natural, avoid generic task/deadline disclaimers, and
    never claim an action succeeded without an application action result.

Files changed
-------------
- aries-intelligence.js
- scheduled-tasks.js
- supabase/functions/aries-chat/index.ts
- sw.js (cache version advanced to V24)
- README_V24_ARIES_CONVERSATION.txt

Deployment
----------
1. Extract this ZIP and upload its contents to the GitHub Pages repository root,
   replacing the existing files. This deploys the browser reminder flow.
2. Deploy the updated aries-chat Edge Function so the Boss-only prompt rule also
   applies to general AI conversations. With Supabase CLI, from the linked
   project directory run: supabase functions deploy aries-chat
3. Hard-refresh OneSpace.
4. Test the one-message flow:
   Remind me tomorrow at 9 AM to check my emails.
5. Test the multi-message flow:
   Remind me to check my emails. -> Tomorrow. -> 9 AM.
6. Check Tasks > Scheduled tasks and confirm the saved task appears.

Notes
-----
- No Supabase SQL is included or required for this conversational fix. It uses
  the V23 RPC permissions already verified in this project.
- The reminder is saved with action_type='reminder'. The actual execution still
  depends on the OneSpace scheduled-task worker being configured and active.
- If the browser is in a timezone other than the user's intended timezone, the
  browser's current timezone is used.
