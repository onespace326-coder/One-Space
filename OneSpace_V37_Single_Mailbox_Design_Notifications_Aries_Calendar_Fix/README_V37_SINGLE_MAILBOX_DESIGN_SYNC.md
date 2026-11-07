# OneSpace V37 — Single Mailbox, Workday, Notifications & Calendar UX

## Summary

This release updates the supplied V33 website package. It limits each signed-in Supabase identity to one active Google mailbox in OneSpace, improves source verification for email-generated tasks, strengthens the notification **Mark seen** interaction, fixes selected-day and welcome-layout clipping, adds Calendar sync status/manual sync, and makes Aries' local scan cover every received message currently synchronized to the selected mailbox.

## 1. One Google mailbox per OneSpace login

- The app prefers the connected Google account whose email address matches the signed-in Supabase user's email.
- When there is exactly one connected Google account and no matching address, that single account remains a compatibility fallback.
- If there are multiple connected accounts and none matches the login email, no mailbox is selected; OneSpace does not guess or pool data.
- Gmail rows are loaded only for the selected `account_id`; Google Calendar and Drive rows are filtered to that same account. OneSpace-created calendar events and manual tasks remain independent.
- Manual Google connection flow refuses a second connected Google mailbox for the same Supabase user.
- The app's account card changes to **Sync Google** once the selected mailbox is connected.
- Other legacy account rows are ignored by the frontend and sync caller. They are **not deleted, revoked or marked disconnected** by this website-only release. Do not delete them without confirming which mailbox owns their records.
- Separate Supabase login identities remain separate. This package does not merge the two Auth users or their tasks/emails.

## 2. Tasks and source-email verification

- Email-generated tasks are displayed only if the source identifier resolves to a message in the selected mailbox.
- The main Tasks view shows a **Created from email** panel with subject, sender, mailbox and received date, plus **View email**.
- Workday selected-day task details show the same source context and a **View email** action.
- The action opens the actual OneSpace email record. It matches the internal email row ID or provider message ID and uses `account_id` as an extra boundary.
- Manual OneSpace tasks remain visible without an email-source panel or button.
- Existing task rows are not deleted or modified by this frontend change. A legacy email-generated task whose source cannot be verified is hidden from the email-derived task view rather than presented with a misleading link.

## 3. Aries inbox scan

- The local Aries scanner iterates through all email messages loaded from Supabase for the one selected mailbox; the data loader paginates the full stored message table rather than stopping at 160/400 messages.
- Received Inbox and archived messages are included. Sent, drafts, spam and trash are excluded from task extraction to reduce false positives from outgoing messages and junk.
- Content fingerprints let the scanner re-check messages when their content changes. New/updated mail triggers a scan; unchanged messages are skipped on periodic scans.
- Aries task suggestions retain source message and mailbox IDs so accepted tasks can show their original email.
- This is coverage of **all received messages currently synchronized into OneSpace**, not a guarantee that every message still on Google's servers has been imported. The Google Edge Function's import limits/pagination and the deployed `aries-email-scan` server implementation are outside this website ZIP and were not changed here. Email attachments are not OCR-scanned by the local task extractor.

## 4. Notifications — Mark seen

- Notification **Mark seen** and **Mark all seen** are separate from Gmail's unread/read state.
- Clicking a notification also marks the notification seen before navigating to its source.
- Seen keys are persisted in browser local storage and namespaced by the current Supabase user ID.
- The badge counts unseen OneSpace notification items.
- The UI copy explains that marking a notification seen does not change Gmail's unread flag. Marking a mail notification seen is not a Gmail `users.messages.modify` operation.
- Seen state is browser-local in this version; it is not synchronized between devices or stored in the Supabase `notifications` table.

## 5. Workday, welcome and Calendar UX

- Calendar's **SELECTED DAY** summary is restored as a bordered rounded card.
- Workday's **SELECTED DAY** heading receives a visible bordered card.
- Welcome date uses `en-GB` formatting, e.g. `Saturday, 7 November 2026`; welcome description wraps and no longer gets clipped by a narrow flex box.
- Calendar now shows the active mailbox, last-sync time, loading/error feedback and a **Sync Google** control. The manual control invokes the selected mailbox's full Google sync, which may refresh Gmail and Drive as well as Calendar.
- Calendar data is loaded in parallel with the other workspace tables. Manual refresh and the existing periodic Google refresh trigger the same data reload flow.

## 6. Additional fix

- Fixed an inherited malformed multiline JavaScript string in the email reader's HTML iframe source. The string now uses escaped newlines and all 16 inline JavaScript blocks parse.
- Service-worker cache generation is now `onespace-v37-single-mailbox-1`; updated scripts and stylesheet use `?v=37.0`.

## Files changed

- `index.html`
- `onespace-supabase-data.js`
- `aries-intelligence.js`
- `aries-v18-task-calendar.js`
- `onespace-v37-single-mailbox.css` (new)
- `sw.js`
- `onespace-v37-regression.test.mjs` (new)

## Deployment

1. Back up the existing website repository.
2. Extract the ZIP into the site root, preserving the folder structure and existing `icons/` directory.
3. Deploy the static site.
4. Hard-refresh the browser or unregister the previous service worker if an old cache persists.
5. Sign in using each OneSpace login separately. Each login sees only its selected Google mailbox; this package does not merge identities.
6. In Calendar, test **Sync Google** and inspect the on-screen status. It uses the currently deployed `google-sync` Edge Function.
7. In Tasks, verify an Aries-created task shows its source-email context and opens the original email; verify manual tasks have no View email button.
8. In Notifications, test **Mark seen**, **Mark all seen**, and opening an alert.
9. Trigger Aries scan and check that the reported scanned count covers all received messages currently synchronized into the selected mailbox.

## Verification and limits

- `onespace-v37-regression.test.mjs`: 23 static regression assertions passed.
- Node syntax checks passed for the changed external JavaScript files and supporting app scripts.
- All 16 inline JavaScript blocks in `index.html` parsed successfully.
- Local asset references resolved; ZIP integrity checked.
- No live Supabase/Google requests, actual OAuth flow, real browser visual test, or production deployment were performed in this environment.
- The deployed Edge Function source is not included in this website ZIP. This release does not change backend Google sync pagination, Calendar sync tokens, OAuth, notification cloud persistence, or the server-side Aries scan implementation.
