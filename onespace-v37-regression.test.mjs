import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.dirname(new URL(import.meta.url).pathname);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const data = read('onespace-supabase-data.js');
const aries = read('aries-intelligence.js');
const taskCalendar = read('aries-v18-task-calendar.js');
const css = read('onespace-v37-single-mailbox.css');
const sw = read('sw.js');
const checks = [];
function check(name, fn) { fn(); checks.push(name); }

check('single mailbox selection prefers authenticated login email', () => {
  assert.match(data, /choosePrimaryGoogleAccount\(rows,user\)/);
  assert.match(data, /a\.email\|\|''\)\.trim\(\)\.toLowerCase\(\)===login/);
  assert.match(data, /if\(matching\.length\)return sortNewest\(matching\)\[0\]/);
  assert.match(data, /if\(active\.length===1\)return active\[0\]/);
  assert.match(data, /return null/);
});
check('mail loader is filtered to the one selected account and paginated', () => {
  assert.match(data, /eq\('account_id',primaryId\)/);
  assert.match(data, /fetchAllPages\(/);
  assert.match(data, /connectedRows=primaryAccount\?\[primaryAccount\]:\[\]/);
});
check('Google sync sends one exact account ID, not an account batch', () => {
  assert.match(data, /const request=\{\.\.\.\(options\|\|\{\}\),accountId:primary\.id\}/);
  assert.match(data, /explicitAccountId&&explicitAccountId!==String\(primary\.id\)/);
  assert.doesNotMatch(data, /for\s*\(const\s+account\s+of\s+accounts/);
});
check('connection flow blocks adding a second Google mailbox', () => {
  assert.match(html, /One Google mailbox is already connected for this OneSpace login/);
  assert.match(html, /existingAccounts\|\|\[\]\)\.length/);
  assert.match(html, /id=\"googleOverviewConnectBtn\"/);
  assert.match(html, /overviewAction\.innerHTML=connected\?'Sync Google/);
});
check('manual tasks remain, email tasks require a verifiable source in selected mailbox', () => {
  assert.match(data, /if\(!isEmailTask\)[\s\S]*?return base/);
  assert.match(data, /if\(!sourceMail\)return null/);
  assert.match(data, /sourceMailInternalId:sourceMail\.id/);
  assert.match(data, /sourceMailAccountId:sourceMail\.accountId/);
});
check('main task view displays source email panel only for email-linked task', () => {
  assert.match(html, /hasEmailSource=!!t\.sourceMailId/);
  assert.match(html, /hasEmailSource\?`<section class="task-source-email"/);
  assert.match(html, /View email/);
  assert.match(html, /openTaskSourceEmail=async function/);
});
check('Workday task details show verified original email source', () => {
  assert.match(taskCalendar, /sourceMailId\?`<div class="aries-workday-source"/);
  assert.match(taskCalendar, /sourceMailSender/);
  assert.match(taskCalendar, /sourceMailAccountEmail/);
  assert.match(taskCalendar, /data-open-task-mail/);
});
check('Aries local scan includes all synchronized received messages without page cap', () => {
  assert.match(aries, /function inboxRows\(\)[\s\S]*?return list\.filter/);
  assert.match(aries, /!m\.outbound[\s\S]*?\['sent','trash','spam','drafts'\]/);
  assert.match(aries, /Include archived mail/);
  assert.match(aries, /const rows = inboxRows\(\)/);
  assert.doesNotMatch(aries, /inboxRows\(\)\.slice\(0,\s*(160|400)/);
  assert.match(aries, /onespace:data-loaded/);
});
check('notification state says seen and is separate from Gmail unread state', () => {
  assert.match(html, /persistent per-user seen state, separate from Gmail unread\/read flags/);
  assert.match(html, /Mark seen/);
  assert.match(html, /Mark all seen/);
  assert.match(html, /notificationReadKeys\.add\(String\(key\)\)/);
  assert.match(html, /Gmail read status was not changed/);
});
check('opening notification marks it seen before navigation', () => {
  assert.match(html, /notificationReadKeys\.add\(key\);persistNotificationReadState\(\);[\s\S]*?if\(kind==='mail'\)/);
});
check('Workday selected day has rectangle styling', () => {
  assert.match(html, /class="aries-task-day-heading"/);
  assert.match(css, /\.aries-task-day-heading\{[^}]*border:1px solid/);
  assert.match(css, /\.selected-day-top\{[^}]*border:1px solid/);
});
check('welcome title/date copy wraps instead of clipping', () => {
  assert.match(html, /Your personal workspace, ready when your accounts are connected\./);
  assert.match(html, /toLocaleDateString\('en-GB',[\s\S]*?weekday:'long',day:'numeric',month:'long',year:'numeric'/);
  assert.match(css, /\.welcome\{[^}]*flex-wrap:wrap/);
  assert.match(css, /overflow-wrap:anywhere/);
});
check('Calendar has manual sync and visible status/loading/error feedback', () => {
  assert.match(html, /id="calendarSyncStatus"/);
  assert.match(html, /id="calendarSyncNowBtn"/);
  assert.match(html, /window\.syncOneSpaceCalendarNow=async function/);
  assert.match(html, /Syncing Gmail, Calendar and Drive/);
  assert.match(html, /Google sync failed/);
});
check('service worker caches V37 CSS and busts updated script cache', () => {
  assert.match(sw, /onespace-v37-single-mailbox-1/);
  assert.match(sw, /onespace-v37-single-mailbox\.css/);
  assert.match(sw, /onespace-supabase-data\.js\?v=37\.0/);
  assert.match(sw, /aries-intelligence\.js\?v=37\.0/);
});
check('all inline JavaScript blocks parse', () => {
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  let parsed = 0;
  for (const [, attrs, body] of blocks) {
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = attrs.match(/\btype\s*=\s*["']([^"']+)/i)?.[1]?.toLowerCase();
    if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) continue;
    new vm.Script(body, { filename: `inline-script-${parsed + 1}.js` });
    parsed++;
  }
  assert.ok(parsed >= 12, `Expected many inline scripts; parsed ${parsed}`);
  checks.push(`inline scripts parse (${parsed})`);
});

for (const file of [
  'onespace-supabase-data.js',
  'aries-intelligence.js',
  'aries-v18-task-calendar.js',
  'sw.js',
  'scheduled-tasks.js',
  'aries-v21-smart.js',
]) {
  const source = read(file);
  new vm.Script(source, { filename: file });
  checks.push(`${file} syntax`);
}

// Verify local referenced assets exist.
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
const missing = refs.filter(ref => !/^(?:https?:|data:|#|javascript:)/i.test(ref) && !ref.startsWith('/') && !ref.includes('${') && !fs.existsSync(path.join(root, ref.split('?')[0])));
assert.deepEqual(missing, [], `Missing local assets: ${missing.join(', ')}`);
checks.push('local HTML asset references resolve');

console.log(`PASS ${checks.length} checks`);
for (const name of checks) console.log(` - ${name}`);
