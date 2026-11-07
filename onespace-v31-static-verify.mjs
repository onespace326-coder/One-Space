#!/usr/bin/env node
/** OneSpace V31 static verification. Run with: node onespace-v31-static-verify.mjs */
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
for (const name of fs.readdirSync(root).filter(name => name.endsWith('.js') || name.endsWith('.mjs')).filter(name => name !== 'onespace-v31-static-verify.mjs').sort()) checkJs(name);

const htmlPath = path.join(root, 'index.html');
if (!fs.existsSync(htmlPath)) fail('index.html is missing');
else {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  for (let i = 0; i < inlineScripts.length; i++) {
    const tmp = path.join('/tmp', `onespace-v29-inline-${process.pid}-${i + 1}.js`);
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
  if (!failures.some(x => x.includes('Referenced local asset'))) pass('All local HTML script/link references exist');
  if (!/onespace-v29-premium\.css\?v=29\.0/.test(html)) fail('V29 premium stylesheet is not loaded from index.html');
  else pass('V29 premium base layer is present');
  const styleLinks = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)/gi)].map(match => match[1]);
  if (styleLinks.at(-1)?.split('?')[0] !== 'onespace-v31-theme.css') fail('V31 theme stylesheet is not the final CSS layer');
  else pass('V31 theme stylesheet loads after every legacy stylesheet');
  const externalScripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)/gi)].map(match => match[1]);
  if (externalScripts.at(-1)?.split('?')[0] !== 'aries-chrome-audio.js') fail('V31 Aries controller is not the final external script');
  else pass('V31 Aries controller loads after legacy external scripts');
  if (!/let skin=localStorage\.getItem\('onespaceVisualPreset'\)\|\|'aurora'/.test(html) || !/const initial=localStorage\.getItem\('onespaceVisualPreset'\)\|\|'aurora'/.test(html)) fail('Aurora first-visit preset default is missing');
  else pass('Aurora default respects existing saved preset values');
}

for (const name of fs.readdirSync(root).filter(name => name.endsWith('.css'))) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  let depth = 0, quote = '', comment = false, escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (comment) { if (c === '*' && n === '/') { comment = false; i++; } continue; }
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '*') { comment = true; i++; continue; }
    if (c === '"' || c === "'" ) { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth < 0) break; }
  }
  if (depth !== 0 || quote || comment) fail(`Unbalanced CSS/JS blocks or strings: ${name}`);
}
if (failures.length === 0) pass('CSS brace and string balance checks');

for (const [a, b] of [
  ['SUPABASE_V23_PREPARE.sql', 'supabase/migrations/202611060001_v23_prepare_scheduled_task_rpcs.sql'],
  ['SUPABASE_V23_ENFORCE.sql', 'supabase/migrations/202611060002_v23_enforce_column_and_task_grants.sql'],
]) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) fail(`SQL migration copy missing: ${a} / ${b}`);
  else if (fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8')) fail(`SQL migration copies differ: ${a} / ${b}`);
  else pass(`SQL migration copies match: ${a}`);
}


const wake = fs.readFileSync(path.join(root, 'aries-v21-wake.js'), 'utf8');
if (!/window\.speakQueued \|\| window\.speakText/.test(wake)) fail('Aries wake notifications do not route through the shared speech controller');
else pass('Aries wake notifications use the shared Chrome speech controller');
if (!/speak\(msg\.text\);/.test(wake) || /setTimeout\(\(\) => speak\(msg\.text\), 650\)/.test(wake)) fail('Aries wake notification still delays speech after delivery');
else pass('Aries wake notification avoids the old 650 ms speech delay');
const audio = fs.readFileSync(path.join(root, 'aries-chrome-audio.js'), 'utf8');
if (!/const errors/.test(audio) || !/onespace:aries-speech-error/.test(audio)) fail('Chrome speech error diagnostics are missing');
else pass('Chrome speech diagnostics include actionable error states');
if (!/aries-chrome-audio\.js\?v=31\.0/.test(fs.readFileSync(htmlPath, 'utf8'))) fail('Unified V31 voice controller is not loaded');
else pass('Unified V31 voice controller is loaded after all legacy speech entrypoints');
if (!/onespace-v31-theme\.css\?v=31\.0/.test(fs.readFileSync(htmlPath, 'utf8'))) fail('V31 theme-aware stylesheet is not loaded');
else pass('V31 theme-aware stylesheet is loaded');
if (!/onespace-v31-theme-meta/.test(fs.readFileSync(htmlPath, 'utf8'))) fail('Dynamic browser theme-color sync is missing');
else pass('Browser theme-color follows the selected appearance');

if (!/onespace-v30-intro-controller/.test(fs.readFileSync(htmlPath, 'utf8')) || !/onespaceBrandIntro/.test(fs.readFileSync(htmlPath, 'utf8'))) fail('Animated Orbit brand intro is missing');
else pass('Animated Orbit brand intro is present');
if (!/splitText/.test(audio) || !/voice\?\.lang/.test(audio)) fail('Voice chunking or installed-voice language fallback is missing');
else pass('Long speech chunking and installed voice language fallback are present');
if (!/waitForVoices/.test(audio) || !/voiceschanged/.test(audio)) fail('Chrome asynchronous voice discovery handling is missing');
else pass('Chrome asynchronous voice discovery is handled');
if (!/Hear Aries/.test(audio) || !/manual-replay/.test(audio)) fail('Manual voice replay path is missing');
else pass('Manual replay is available when Chrome blocks speech');
const themeCss = fs.readFileSync(path.join(root, 'onespace-v31-theme.css'), 'utf8');
if (!/body:not\(\.dark\)\[data-skin="noir"\][\s\S]*--accent:\s*#c83f49/.test(themeCss)) fail('Light Noir palette is missing');
else pass('Light Noir accent palette is defined');
if (!/body:not\(\.dark\)\[data-skin="nexus"\][\s\S]*--accent:\s*#719b22/.test(themeCss)) fail('Light Nexus palette is missing');
else pass('Light Nexus accent palette is defined');
if (!/body\.dark\[data-skin="studio"\][\s\S]*--accent:\s*#c79a78/.test(themeCss)) fail('Dark Studio palette is missing');
else pass('Dark Studio keeps its warm accent palette');

const fullHtml = fs.readFileSync(htmlPath, 'utf8');
if (/function unlockAudio\(\)[\s\S]{0,220}new SpeechSynthesisUtterance\(' '\)/.test(fullHtml)) fail('Legacy silent speech unlock utterance has returned');
else pass('Audio unlock does not enqueue a competing silent utterance');

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
if (!/onespace-v31-theme-audio-1/.test(sw)) fail('Service worker cache version is not V31'); else pass('Service worker cache version bumped to V31');
if (!/onespace-v30-premium\.css/.test(sw)) fail('V30 CSS is not precached by the service worker'); else pass('V30 base stylesheet is included in service-worker shell');
if (!/onespace-v31-theme\.css/.test(sw)) fail('V31 theme CSS is not precached by the service worker'); else pass('V31 theme stylesheet is included in service-worker shell');
const config = fs.readFileSync(path.join(root, 'auth-config.js'), 'utf8');
if (/service_role\s*[:=]\s*["'][^"']+|sb_secret_[A-Za-z0-9_-]{10,}/i.test(config)) fail('Potential server-side secret found in auth-config.js');
else pass('Browser auth config contains no detected service-role/secret key pattern');

if (failures.length) {
  console.error(`\n${failures.length} verification failure(s):`);
  failures.forEach((message, i) => console.error(`${i + 1}. ${message}`));
  process.exitCode = 1;
} else {
  console.log('\nOneSpace V31 static verification completed successfully.');
  console.log("Note: static/runtime mocks do not certify audible playback in the user Chrome profile; live Supabase, OAuth and Google integrations still require deployment testing.");
}
