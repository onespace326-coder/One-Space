# OneSpace V33 — Task Email Source & Notification Read Controls

## Included changes

### 1. Email-origin context in Tasks
- Email-generated task rows now show a dedicated **Created from email** panel.
- The panel displays the original email subject, sender, connected Google mailbox, and received time when available.
- **View original email** opens the matching OneSpace email record, preferring its internal message UUID and retaining the account ID as a mailbox boundary.
- Existing task descriptions that contain `Source:` and `Account:` remain supported.
- The loader also supports the existing `tasks.source_mail_id` text column as a fallback.
- `saveTask` writes `source_mail_id` and records the task source (`aries-mail` or `onespace`) when saving.
- Manual OneSpace tasks remain independent of Google accounts; no account is assigned to them and no existing tasks are deleted.
- Provider message IDs are only accepted when the owning mailbox is known or the match is unambiguous across connected mailboxes.

### 2. Notification read controls
- Replaced the temporary **Mark seen** control with **Mark all read**.
- Each notification now has a separate **Mark read** control, independent from its open action.
- Read state for calendar and task notifications is persisted in browser local storage, namespaced by the signed-in OneSpace user.
- Marking an email notification read calls the existing `markEmailHandled` mailbox action. The UI checks that the in-memory email is no longer unread before treating the action as successful; the existing Gmail action wrapper reports and rolls back provider errors.
- Opening a task or calendar notification also marks that notification read.
- The notification badge now counts unread items, and the header action disables itself when everything is read.
- Added theme-token-based styling, keyboard focus treatment, compact mobile layout, and distinct open/read controls.

## Database impact

No SQL migration is required for these changes. The existing schema inspection confirms `tasks.source_mail_id` is already present as a text field. The UI continues using the current `email_messages`, `connected_accounts`, `tasks` and `calendar_events` tables.

## Files changed
- `index.html`
- `onespace-supabase-data.js`
- `onespace-v33-task-notifications.css` (new)
- `sw.js` (cache generation V33)
- `onespace-v32-static-verify.mjs` (updated for V33 asset/cache)
- `onespace-v32-regression.test.mjs` (updated final stylesheet check)
- `onespace-v32-data-integrity.test.mjs` (updated provider-ID matching assertion)
- `onespace-v33-task-notifications.test.mjs` (new regression assertions)

## Deployment
1. Back up the current site repository.
2. Extract this ZIP and upload the package contents to the site root, replacing corresponding files.
3. Deploy the site.
4. Hard refresh the browser. The service worker cache generation has been bumped to V33.
5. Open Tasks and verify an Aries-created task displays its source email panel. Manual tasks should continue to display as personal tasks.
6. Open Notifications and test individual **Mark read** and **Mark all read**. Gmail-backed email notifications require the existing deployed `google-mail-action-OneSpace` Edge Function and appropriate Gmail modify scope.

## Verification limits
The included checks validate JavaScript syntax, inline HTML script syntax, local asset references, CSS structure, existing V32 regression assertions and V33 source/read-state assertions. They do not exercise a real browser session, live Supabase writes, Gmail OAuth scopes, or the deployed Gmail Edge Function. Calendar/task notification read state is browser-local and is not synchronized between devices in this version.
