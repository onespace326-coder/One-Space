/* One-device, opt-in owner-face matching. Frames and the descriptor never leave this browser. This is NOT authentication or liveness detection. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const TEMPLATE_KEY = 'onespaceAriesOwnerFaceDescriptorV1';
  const MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
  const SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js';
  let stream=null, modelPromise=null, scanTimer=null, scanning=false, unknownCount=0, lastSpeechState='', ownerDescriptor=null, cameraStartedByWake=false;
  window.ariesOwnerRecognized=false;
  window.ariesFaceState='not_enrolled';
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function setFaceState(state,detail=''){
    window.ariesFaceState=state;
    const title=$('ariesFaceState'),desc=$('ariesFaceDetail'),dot=$('ariesFaceDot');
    if(title)title.textContent=state==='owner'?'Owner recognized':state==='guest'?'Unrecognized visitor':state==='no_face'?'No face detected':state==='working'?'Preparing face scan…':state==='enrolled'?'Owner face enrolled on this device':'Owner face not enrolled on this device';
    if(desc)desc.textContent=detail|| (state==='owner'?'Local face match. This is a convenience signal, not account authentication.':state==='guest'?'Aries will avoid personal context while the camera is active.':'Enroll the owner while the camera is on. Matching runs locally in this browser.');
    if(dot)dot.className='aries-face-dot '+(state==='owner'?'good':state==='guest'?'warn':'');
    const cameraStatus=$('ariesCameraStatus');if(cameraStatus&&stream)cameraStatus.textContent=state==='owner'?'Owner recognized':state==='guest'?'Visitor not recognized':'Camera on';
  }
  function readTemplate(){try{const v=JSON.parse(localStorage.getItem(TEMPLATE_KEY)||'null');if(Array.isArray(v)&&v.length===128&&v.every(Number.isFinite))ownerDescriptor=new Float32Array(v);else ownerDescriptor=null;}catch(_){ownerDescriptor=null;}return ownerDescriptor;}
  readTemplate();
  function loadScript(){
    if(window.faceapi)return Promise.resolve(window.faceapi);
    if(modelPromise)return modelPromise;
    modelPromise=new Promise((resolve,reject)=>{const old=document.querySelector('script[data-aries-face-api]');if(old){old.addEventListener('load',()=>window.faceapi?resolve(window.faceapi):reject(new Error('Face matching library did not initialise.')),{once:true});old.addEventListener('error',()=>reject(new Error('Could not load the face matching library.')),{once:true});return;}const script=document.createElement('script');script.src=SCRIPT_SRC;script.async=true;script.dataset.ariesFaceApi='true';script.onload=()=>window.faceapi?resolve(window.faceapi):reject(new Error('Face matching library did not initialise.'));script.onerror=()=>reject(new Error('Could not load face matching library. Check your internet connection.'));document.head.appendChild(script);});
    return modelPromise;
  }
  async function ensureModels(){
    const api=await loadScript();
    if(!api.nets.tinyFaceDetector.params)await api.nets.tinyFaceDetector.loadFromUri(MODEL_BASE);
    if(!api.nets.faceLandmark68Net.params)await api.nets.faceLandmark68Net.loadFromUri(MODEL_BASE);
    if(!api.nets.faceRecognitionNet.params)await api.nets.faceRecognitionNet.loadFromUri(MODEL_BASE);
    return api;
  }
  async function startCamera(){
    if(stream)return true;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access needs HTTPS or localhost and a supported browser.');
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1920},height:{ideal:1440},aspectRatio:{ideal:4/3}},audio:false});
    const video=$('ariesCameraPreview');if(video){video.srcObject=stream;video.hidden=false;await video.play().catch(()=>{});}
    const btn=$('ariesCameraToggle');if(btn)btn.textContent='Stop camera';
    setFaceState(ownerDescriptor?'enrolled':'not_enrolled','Camera is on. Frames stay in this tab and are not recorded or uploaded.');
    return true;
  }
  function stopCamera(){
    if(scanTimer){clearInterval(scanTimer);scanTimer=null;}scanning=false;
    stream?.getTracks().forEach(t=>t.stop());stream=null;window.ariesOwnerRecognized=false;unknownCount=0;lastSpeechState='';
    const video=$('ariesCameraPreview');if(video){video.pause?.();video.srcObject=null;video.hidden=true;}
    const btn=$('ariesCameraToggle');if(btn)btn.textContent='Start camera';
    const status=$('ariesCameraStatus');if(status)status.textContent='Camera off';
    setFaceState(ownerDescriptor?'enrolled':'not_enrolled','Camera off. No frames are being processed.');
  }
  async function detect(){
    if(!stream||scanning)return null;scanning=true;
    try{
      const api=await ensureModels();const video=$('ariesCameraPreview');if(!video||video.readyState<2)return null;
      const results=await api.detectAllFaces(video,new api.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:0.45})).withFaceLandmarks().withFaceDescriptors();
      if(results.length!==1){window.ariesOwnerRecognized=false;unknownCount++;return{kind:results.length===0?'no_face':'multiple',count:results.length};}
      return{kind:'face',descriptor:results[0].descriptor};
    }finally{scanning=false;}
  }
  function distance(a,b){let sum=0;for(let i=0;i<128;i++){const d=a[i]-b[i];sum+=d*d;}return Math.sqrt(sum);}
  function ownerName(){return window.getAriesPersonalProfile?.()?.preferred_name||'my boss';}
  function sayGuest(){
    if(lastSpeechState==='guest')return;lastSpeechState='guest';
    const prof=window.getAriesPersonalProfile?.()||{};const hindi=prof.preferred_language==='hi'||(typeof prefs!=='undefined'&&String(prefs.voiceLanguage||'').startsWith('hi'));const line=hindi?`Maaf kijiye. Main sirf apne boss ${ownerName()} se commands leta hoon.`:`Sorry, I only take commands from my boss, ${ownerName()}.`;
    if(window.speakText&&typeof prefs!=='undefined'&&prefs.voiceAssistantEnabled)window.speakText(line,true);
    else if(window.toast)window.toast('Aries: I only take private commands from my boss.');
  }
  async function assessOnce(){
    if(!stream)await startCamera();
    const frame=await detect();
    if(!frame){setFaceState('working','Camera is starting.');return false;}
    if(frame.kind==='no_face'){window.ariesOwnerRecognized=false;setFaceState('no_face','No face is visible. Private chat remains blocked when the owner privacy cue is enabled.');return false;}
    if(frame.kind==='multiple'){window.ariesOwnerRecognized=false;setFaceState('guest','More than one face is visible. Owner matching needs one face in frame.');if(unknownCount>=2)sayGuest();return false;}
    if(!ownerDescriptor){setFaceState('not_enrolled','No owner template is saved on this device. Select Enroll my face.');return false;}
    const d=distance(ownerDescriptor,frame.descriptor);const match=d<0.58;
    if(match){unknownCount=0;window.ariesOwnerRecognized=true;lastSpeechState='owner';setFaceState('owner',`Owner match detected for ${ownerName()}. This is not proof of identity or a secure unlock.`);return true;}
    unknownCount++;window.ariesOwnerRecognized=false;setFaceState('guest','This face does not match the enrolled owner. Aries will not use the owner profile while the camera remains active.');if(unknownCount>=2)sayGuest();return false;
  }
  async function enroll(){
    try{
      setFaceState('working','Loading local face models and requesting camera access…');await startCamera();const api=await ensureModels();const samples=[];
      for(let i=0;i<8&&samples.length<4;i++){
        await new Promise(r=>setTimeout(r,850));const video=$('ariesCameraPreview');if(!video||video.readyState<2)continue;
        const detections=await api.detectAllFaces(video,new api.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:0.48})).withFaceLandmarks().withFaceDescriptors();
        if(detections.length===1)samples.push(Array.from(detections[0].descriptor));
        else setFaceState('working',detections.length>1?'Only one person should be visible during enrollment.':'Keep your face centered and well lit.');
      }
      if(samples.length<3)throw new Error('I could not get three clear, complete face samples. Move a little farther from the camera, face the light, keep your full face inside the guide and try again.');
      const mean=Array.from({length:128},(_,i)=>samples.reduce((n,a)=>n+a[i],0)/samples.length);localStorage.setItem(TEMPLATE_KEY,JSON.stringify(mean));ownerDescriptor=new Float32Array(mean);unknownCount=0;window.ariesOwnerRecognized=true;
      setFaceState('owner',`Owner face enrolled on this device for ${ownerName()}. No photo was saved or uploaded.`);window.toast?.('Owner face enrolled on this device. Test recognition to check the match.');
      startRecognitionLoop();
    }catch(error){setFaceState('not_enrolled',error.message||'Face enrollment could not be completed.');window.toast?.(error.message||'Face enrollment failed.');}
  }
  function startRecognitionLoop(){
    if(scanTimer)clearInterval(scanTimer);if(!stream||!ownerDescriptor)return;
    assessOnce().catch(e=>setFaceState('not_enrolled',e.message));
    scanTimer=setInterval(()=>{assessOnce().catch(e=>setFaceState('not_enrolled',e.message));},1200);
  }
  window.toggleAriesCamera=async()=>{if(stream){cameraStartedByWake=false;stopCamera();return;}try{await startCamera();if(ownerDescriptor)startRecognitionLoop();}catch(error){window.toast?.(error.message||'Could not access the camera.');}};
  window.enrollAriesOwnerFace=enroll;
  window.testAriesOwnerFace=async()=>{try{if(!ownerDescriptor)throw new Error('Enroll the owner face on this device first.');await assessOnce();}catch(error){window.toast?.(error.message);}};
  window.removeAriesOwnerFace=()=>{if(!confirm('Remove the owner face template from this browser?'))return;localStorage.removeItem(TEMPLATE_KEY);ownerDescriptor=null;window.ariesOwnerRecognized=false;stopCamera();setFaceState('not_enrolled','Owner face template removed from this device.');window.toast?.('Owner face enrollment removed from this browser.');};
  const wakeCameraToggle=$('ariesCameraWithWakeWord');
  try{if(wakeCameraToggle)wakeCameraToggle.checked=localStorage.getItem('onespaceAriesCameraWithWakeWord')==='1';}catch(_){}
  wakeCameraToggle?.addEventListener('change',()=>{try{localStorage.setItem('onespaceAriesCameraWithWakeWord',wakeCameraToggle.checked?'1':'0');}catch(_){}if(!wakeCameraToggle.checked&&cameraStartedByWake){cameraStartedByWake=false;stopCamera();}else if(wakeCameraToggle.checked&&window.ariesWakeModeActive)window.dispatchEvent(new CustomEvent('aries:wake-mode-started'));window.toast?.(wakeCameraToggle.checked?'Camera will start with wake-word mode after browser permission.':'Camera will no longer start with wake-word mode.');});
  window.addEventListener('aries:wake-mode-started',async()=>{window.ariesWakeModeActive=true;if(!wakeCameraToggle?.checked)return;try{cameraStartedByWake=!stream;await startCamera();if(ownerDescriptor)startRecognitionLoop();}catch(error){cameraStartedByWake=false;window.toast?.('Aries wake mode is on, but camera could not start: '+(error.message||'Check camera permission.'));}});
  window.addEventListener('aries:wake-mode-stopped',()=>{window.ariesWakeModeActive=false;if(cameraStartedByWake){cameraStartedByWake=false;stopCamera();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cameraStartedByWake=false;stopCamera();}});
  $('ariesFaceGateEnabled')?.addEventListener('change',e=>{try{localStorage.setItem('onespaceAriesFaceGateEnabled',e.target.checked?'1':'0');}catch(_){}});
  const gate=$('ariesFaceGateEnabled');if(gate){try{gate.checked=localStorage.getItem('onespaceAriesFaceGateEnabled')==='1';}catch(_){}}
  // Keep everyday conversation available. The optional face cue only blocks requests
  // that would reveal private mailbox, calendar, task, file or profile information.
  // It is a convenience barrier, never a replacement for signed-in authorization.
  const previousSend=window.sendAssistantMessage;
  const privateIntent=/(\b(scan|read|search|open|show|summari[sz]e|review|check)\b.{0,60}\b(email|emails|mail|inbox|calendar|events|tasks|files|drive)\b)|(\b(my name|my profile|my tasks|my calendar|my emails|my inbox|my files|my drive|what do i have|what is due)\b)|(\b(send|delete|approve|change|update)\b.{0,50}\b(email|mail|event|task|file|calendar)\b)/i;
  if(typeof previousSend==='function')window.sendAssistantMessage=function(raw){
    const text=String(raw||'');
    const gate=$('ariesFaceGateEnabled')?.checked;
    const ownerReady=!!(stream&&ownerDescriptor&&window.ariesOwnerRecognized);
    const activeUnverified = !!(gate && stream && !ownerReady);
    if(activeUnverified&&privateIntent.test(text)){
      const state=window.ariesFaceState;
      const reason=state==='no_face'?'I cannot see your full face in the camera yet. Please centre your face inside the guide.':state==='not_enrolled'?'The owner face has not been enrolled on this browser yet. Please complete enrollment first.':state==='multiple'?'More than one face is visible. Please keep only the owner in frame.':'The camera cannot verify the enrolled owner.';
      const reply=`${reason} I only accept private workspace commands from my boss while the camera privacy cue is active. Everyday conversation is still available.`;
      window.appendChat?.(text,'user');window.appendChat?.(reply,'assistant');sayGuest();return;
    }
    return previousSend.apply(this,arguments);
  };
  if(ownerDescriptor)setFaceState('enrolled','Owner template exists in this browser. Start camera to verify the enrolled owner.');
  window.addEventListener('beforeunload',stopCamera);
})();
