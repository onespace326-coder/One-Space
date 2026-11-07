#!/usr/bin/env node
/** OneSpace V27 static verification. Run with: node onespace-v27-verify.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const pass = (message) => console.log(`PASS  ${message}`);
const fail = (message) => failures.push(message);

function checkJs(file) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); pass(`JavaScript syntax: ${file}`); }
  catch (error) { fail(`JavaScript syntax failed: ${file}\n${error.stderr?.toString() || error.message}`); }
}

for (const name of fs.readdirSync(root).filter(name => name.endsWith('.js')).sort()) checkJs(name);

const htmlPath = path.join(root, 'index.html');
if (!fs.existsSync(htmlPath)) fail('index.html is missing');
else {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  for (let i = 0; i < inlineScripts.length; i++) {
    const tmp = path.join('/tmp', `onespace-v27-inline-${process.pid}-${i + 1}.js`);
    fs.writeFileSync(tmp, inlineScripts[i][1]);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (error) { fail(`Inline script ${i + 1} failed syntax check: ${error.stderr?.toString() || error.message}`); }
    finally { fs.rmSync(tmp, { force: true }); }
  }
  if (failures.length === 0) pass(`${inlineScripts.length} inline HTML scripts parsed`);

  const refs = [
    ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]),
    ...[...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi)].map(m => m[1]),
  ];
  for (const ref of refs) {
    if (/^(?:https?:|data:|mailto:|#|\/\/)/i.test(ref)) continue;
    const clean = decodeURIComponent(ref.split(/[?#]/, 1)[0]);
    const target = path.resolve(root, clean);
    if (!target.startsWith(root + path.sep) && target !== root) { fail(`Reference escapes project root: ${ref}`); continue; }
    if (!fs.existsSync(target)) fail(`Referenced local asset is missing: ${ref}`);
  }
  if (!failures.some(x => x.includes('Referenced local asset'))) pass('Local HTML script/link references exist');
}

for (const [a, b] of [
  ['SUPABASE_V23_PREPARE.sql', 'supabase/migrations/202611060001_v23_prepare_scheduled_task_rpcs.sql'],
  ['SUPABASE_V23_ENFORCE.sql', 'supabase/migrations/202611060002_v23_enforce_column_and_task_grants.sql'],
]) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) fail(`SQL migration copy missing: ${a} / ${b}`);
  else if (fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8')) fail(`SQL migration copies differ: ${a} / ${b}`);
  else pass(`SQL migration copies match: ${a}`);
}


function requireText(file, pattern, description) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (pattern.test(source)) pass(description);
  else fail(`Required hardening check missing: ${description}`);
}

requireText('onespace-supabase-data.js', /fetch\(cfg\.googleSyncUrl[\s\S]{0,260}apikey:publicKey/, 'Google sync sends the publishable apikey header');
requireText('index.html', /fetch\(endpoint,[\s\S]{0,220}apikey:/, 'Google status check sends the publishable apikey header');
requireText('index.html', /fetch\(startUrl,[\s\S]{0,260}apikey:/, 'Google OAuth start sends the publishable apikey header');
requireText('index.html', /fetch\(cfg\.googleAttachmentUrl,[\s\S]{0,300}apikey:/, 'Gmail attachment fetch sends the publishable apikey header');
requireText('scheduled-tasks.js', /mail\\.google\\.com/i, 'Gmail composer accepts the broad Google mail scope');
requireText('scheduled-tasks.js', /if \(savingSchedule\) return/, 'Scheduled-task submit is protected against duplicate clicks');
requireText('onespace-v22-mail.js', /typeof sync !== 'function/, 'Mail sync fails visibly when the sync module is unavailable');
requireText('supabase/functions/aries-chat/index.ts', /untrusted reference data/, 'Aries marks workspace data as untrusted context');
requireText('sw.js', /onespace-v33-task-notifications-1/, 'Service-worker cache generation is V33');
requireText('index.html', /aries-chrome-audio\.js\?v=31\.0/, 'Unified V31 Chrome audio controller is loaded after the existing workspace scripts');
requireText('sw.js', /aries-chrome-audio\.js/, 'Chrome audio repair script is included in the service-worker shell');
requireText('aries-chrome-audio.js', /window\.speakText\s*=/, 'Unified Chrome speech controller exposes the shared speakText entry point');
requireText('aries-chrome-audio.js', /Hear Aries/, 'A manual replay path is offered when automatic playback fails');

const authConfig = fs.readFileSync(path.join(root, 'auth-config.js'), 'utf8');
if (/service_role\s*[:=]\s*["'][^"']+|sb_secret_[A-Za-z0-9_-]{10,}/i.test(authConfig)) fail('Potential server-side secret found in auth-config.js');
else pass('Browser auth config contains no detected service-role/secret key pattern');

if (failures.length) {
  console.error(`\n${failures.length} verification failure(s):`);
  failures.forEach((message, i) => console.error(`${i + 1}. ${message}`));
  process.exitCode = 1;
} else {
  console.log('\nOneSpace legacy hardening verification completed successfully.');
  console.log('Note: Deno Edge Functions, SQL execution, OAuth, Gmail scopes and live Supabase calls require deployment/runtime testing.');
}
