#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.';
const html=fs.readFileSync(`${root}/index.html`,'utf8');
const data=fs.readFileSync(`${root}/onespace-supabase-data.js`,'utf8');
const css=fs.readFileSync(`${root}/onespace-v33-task-notifications.css`,'utf8');
const sw=fs.readFileSync(`${root}/sw.js`,'utf8');

assert.match(html,/Created from email/,'email-generated tasks must be visibly identified');
assert.match(html,/sourceMailSubject/,'task view must show the original email subject');
assert.match(html,/sourceMailSender/,'task view must show the original email sender');
assert.match(html,/sourceMailAccountEmail/,'task view must show which connected mailbox created the task');
assert.match(html,/sourceMailInternalId\|\|t\.sourceMailId/,'task source view must navigate using the internal message ID when available');
assert.match(data,/sourceId=meta\.sourceId\|\|t\.source_mail_id\|\|null/,'task loader must support the existing source_mail_id column and legacy description metadata');
assert.match(data,/sourceMailInternalId:sourceMail\.id/,'task mapping must retain the internal source message ID');
assert.match(data,/source_mail_id:task\.sourceMailId\?String\(task\.sourceMailId\):null/,'email-created tasks must persist their source identifier to the existing source_mail_id column');
assert.match(data,/task\.sourceMailId\?\(task\.source\|\|'aries-mail'\):\(task\.source\|\|'onespace'\)/,'manual tasks must remain OneSpace tasks and email-created tasks retain their origin');
assert.match(html,/Mark all read/,'notification header must provide a mark-all-read action');
assert.match(html,/data-notification-read/,'each notification must have an individual mark-read control');
assert.match(html,/onespaceNotificationRead:/,'notification read state must be persisted per signed-in user');
assert.match(html,/await window\.markEmailHandled\(message\.id\)/,'marking an email notification read must use the mailbox mark-read action');
assert.match(html,/if\(message\.unread\)\{window\.toast\?\.\('Gmail could not confirm/,'failed Gmail mark-read operations must not silently appear successful');
assert.match(css,/\.task-source-email/,'source-email view must have a dedicated responsive panel style');
assert.match(css,/\.notification-mark-read/,'notification read control must have dedicated theme-aware styling');
assert.match(sw,/onespace-v33-task-notifications-1/,'service worker cache must be versioned for V33');
assert.match(sw,/onespace-v33-task-notifications\.css/,'new V33 styles must be precached');
console.log('PASS V33 task email source view, persistent notification read controls, Gmail mark-read integration and cache version assertions');
