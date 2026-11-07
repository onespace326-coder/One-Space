
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const root = process.argv[2];
const html = fs.readFileSync(`${root}/index.html`, 'utf8');
const css = fs.existsSync(`${root}/onespace-v31-theme.css`) ? fs.readFileSync(`${root}/onespace-v31-theme.css`, 'utf8') : '';
const audio = fs.readFileSync(`${root}/aries-chrome-audio.js`, 'utf8');
const links = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)/gi)].map(m => m[1]);
assert.equal(links.at(-1)?.split('?')[0], 'onespace-v33-task-notifications.css', 'V33 task/notification layer must load after every other stylesheet');
assert.match(css, /--accent-strong/,'V31 theme layer must consume active accent tokens');
assert.match(css, /\.os-brand-intro[\s\S]*var\(--accent/,'opening intro must inherit the active theme accent');
assert.match(css, /body\.dark\[data-skin="noir"\]/,'Noir theme must have a dedicated branded intro treatment');
assert.match(css, /body\.dark\[data-skin="nexus"\]/,'Nexus theme must have a dedicated branded intro treatment');
assert.match(css, /body:not\(\.dark\)\[data-skin="noir"\][\s\S]*--accent:\s*#c83f49/,'light Noir must not fall back to the default blue accent');
assert.match(css, /body:not\(\.dark\)\[data-skin="nexus"\][\s\S]*--accent:\s*#719b22/,'light Nexus must not fall back to the default blue accent');
assert.match(css, /\.brandmark[\s\S]*var\(--accent/,'brand mark must use active theme tokens');
assert.match(audio, /waitForVoices/,'speech controller must wait for Chrome voices when they load asynchronously');
assert.match(audio, /voiceschanged/,'speech controller must listen for Chrome voice-list updates');
assert.match(audio, /Hear Aries/,'speech controller must provide manual replay when browser playback is blocked');
assert.match(audio, /window\.speakText\s*=/,'one final global speech entry point must remain available');

// Execute the real speech controller against a deterministic Web Speech API test double.
const elements = new Map();
function element(id='') {
  return { id, textContent:'', style:{}, attrs:{}, isConnected:false, disabled:false,
    classList:{add(){},remove(){},toggle(){}},
    setAttribute(k,v){this.attrs[k]=v}, removeAttribute(k){delete this.attrs[k]},
    addEventListener(){}, appendChild(){}, focus(){}, click(){},
  };
}
for (const id of ['voiceState','voiceDiagnosticStatus','diagVoiceCount','voiceOrb']) elements.set(id,element(id));
const body={appendChild(el){el.isConnected=true;elements.set(el.id,el)}};
const document={
  body,
  getElementById(id){return elements.get(id)||null},
  createElement(tag){return element(tag)},
  addEventListener(){},
};
const voices=[];
const utterances=[];
const synthListeners={};
const synth={
  speaking:false,pending:false,paused:false,
  getVoices(){return voices},
  addEventListener(name,fn){(synthListeners[name]??=[]).push(fn)},
  removeEventListener(){},
  cancel(){this.speaking=false;this.pending=false},
  resume(){this.paused=false},
  pause(){this.paused=true},
  speak(u){
    utterances.push(u); this.speaking=true;
    const fail=this.failNext; this.failNext=null;
    setTimeout(()=>{
      if(fail){u.onerror?.({error:fail});this.speaking=false;return;}
      u.onstart?.();
      setTimeout(()=>{this.speaking=false;u.onend?.()},3);
    },0);
  }
};
class Utterance { constructor(text){this.text=text;this.lang='';this.rate=1;this.pitch=1;this.volume=1;this.voice=null;} }
class CustomEvent { constructor(type,init={}){this.type=type;this.detail=init.detail;} }
const context={
  window:null,document,navigator:{userAgent:'Chrome test',userActivation:{hasBeenActive:false}},
  speechSynthesis:synth,SpeechSynthesisUtterance:Utterance,addEventListener(){},dispatchEvent(){},
  setTimeout,clearTimeout,setInterval,clearInterval,CustomEvent,console,
};
context.window=context;
context.speechSynthesis=synth;
context.SpeechSynthesisUtterance=Utterance;
vm.runInNewContext(audio,context,{filename:'aries-chrome-audio.js'});
const speechPromise=context.speakText('Aries voice regression test',true);
setTimeout(()=>{
  voices.push({name:'English Test Voice',lang:'en-US',voiceURI:'test-en',default:true});
  for(const fn of (synthListeners.voiceschanged||[])) fn();
},25);
await speechPromise;
await new Promise(r=>setTimeout(r,35));
assert.ok(utterances.length>=1,'speech must be queued after voices become available');
assert.equal(utterances[0].voice?.voiceURI,'test-en','speech must select an installed voice after async voice loading');

const beforeLong = utterances.length;
await context.speakText('word '.repeat(100),true);
await new Promise(r=>setTimeout(r,60));
const longUtterances = utterances.slice(beforeLong);
assert.ok(longUtterances.length > 1,'long replies must be split into short utterances');
assert.ok(longUtterances.every(u=>u.text.length <= 185),'speech chunks must stay within the short Chrome-safe limit');

const beforeFallback = utterances.length;
synth.failNext='voice-unavailable';
await context.speakText('Fallback voice test',true);
await new Promise(r=>setTimeout(r,25));
const fallbackUtterances = utterances.slice(beforeFallback);
assert.ok(fallbackUtterances.length >= 2,'an unavailable selected voice must trigger a system-voice retry');
assert.equal(fallbackUtterances[1].voice,null,'system fallback must not reuse the unavailable selected voice');

synth.failNext='not-allowed';
await context.speakText('Blocked speech replay test',true);
await new Promise(r=>setTimeout(r,15));
assert.ok(elements.has('ariesTapToHearButton'),'blocked playback must expose a manual replay button');
assert.match(elements.get('voiceDiagnosticStatus').textContent,/blocked|Tap to hear|permission/i,'blocked playback must expose a useful diagnostic');
console.log('PASS V32 theme/audio regression assertions');
