(function(){
  // On kidbookmaker.sites.tab.bot the API is same-origin; anywhere else (kidbookmaker.com, GitHub Pages, local) post to the live backend.
  var API=(location.hostname==="kidbookmaker.sites.tab.bot")?"/api/submit":"https://kidbookmaker.sites.tab.bot/api/submit";
  var form=document.getElementById("story-form"), err=document.getElementById("form-error"), btn=document.getElementById("submit-btn");
  var done=document.getElementById("done");
  var modal=document.getElementById("start"), sheet=document.getElementById("sheet"), lastFocus=null, mq=window.matchMedia("(max-width:639px)");
  function fit(){
    var vv=window.visualViewport;
    if(mq.matches&&vv){sheet.style.height=vv.height+"px";modal.style.top=vv.offsetTop+"px";modal.style.bottom="auto";modal.style.height=vv.height+"px";}
    else{sheet.style.height="";modal.style.top="";modal.style.bottom="";modal.style.height="";}
  }
  function openForm(e){
    if(e) e.preventDefault();
    lastFocus=document.activeElement; modal.hidden=false; document.documentElement.classList.add("modal-open"); fit();
    if(history.replaceState&&location.hash!=="#start") history.replaceState(null,"","#start");
    setTimeout(function(){ (done.hidden?form.story:done).focus({preventScroll:true}); },60);
  }
  function closeForm(){
    stopRec(); if(!done.hidden) document.getElementById("another").click(); modal.hidden=true; document.documentElement.classList.remove("modal-open");
    if(history.replaceState&&location.hash==="#start") history.replaceState(null,"",location.pathname+location.search);
    if(lastFocus&&lastFocus.focus) lastFocus.focus({preventScroll:true});
  }
  document.querySelectorAll("[data-open]").forEach(function(a){a.addEventListener("click",openForm);});
  modal.querySelectorAll("[data-close]").forEach(function(b){b.addEventListener("click",closeForm);});
  document.addEventListener("keydown",function(e){
    if(modal.hidden) return;
    if(e.key==="Escape"){closeForm();return;}
    if(e.key==="Tab"){
      var f=[].filter.call(sheet.querySelectorAll('button,a[href],input:not([type=hidden]):not([tabindex="-1"]),textarea,select'),function(x){return x.offsetParent!==null&&!x.disabled;});
      if(!f.length) return; var first=f[0], last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  if(window.visualViewport){visualViewport.addEventListener("resize",function(){if(!modal.hidden)fit();});visualViewport.addEventListener("scroll",function(){if(!modal.hidden)fit();});}
  window.addEventListener("resize",function(){if(!modal.hidden)fit();});
  form.addEventListener("focusin",function(e){ if(mq.matches&&/TEXTAREA|INPUT/.test(e.target.tagName)) setTimeout(function(){fit(); e.target.scrollIntoView({block:"nearest"});},300); });
  var recBlob=null, recorder=null, chunks=[], t0=0, timer=null, stream=null;
  var MAXF=20*1024*1024;
  // file names
  form.querySelectorAll('.file-pick input[type=file]').forEach(function(inp){
    inp.addEventListener("change",function(){
      var out=form.querySelector('.file-name[data-for="'+inp.id+'"]'); var f=inp.files[0];
      out.textContent=f?("✓ "+f.name+(f.size>MAXF?" (too big, 20 MB max)":"")):"";
    });
  });
  // recording
  var recBtn=document.getElementById("rec-btn"), recLabel=document.getElementById("rec-label"), recTime=document.getElementById("rec-time"),
      recPlay=document.getElementById("rec-play"), recClear=document.getElementById("rec-clear"), recBox=document.getElementById("rec-box");
  function fmt(s){return Math.floor(s/60)+":"+("0"+Math.floor(s%60)).slice(-2);}
  function stopRec(){ if(recorder&&recorder.state!=="inactive") recorder.stop(); }
  recBtn.addEventListener("click",function(){
    if(recorder&&recorder.state==="recording"){stopRec();return;}
    if(!navigator.mediaDevices||!window.MediaRecorder){showErr("Recording isn't supported in this browser. You can upload an audio file instead.");return;}
    navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){
      stream=s; chunks=[];
      var type=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg"].find(function(t){return MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t);});
      recorder=type?new MediaRecorder(s,{mimeType:type}):new MediaRecorder(s);
      recorder.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};
      recorder.onstop=function(){
        clearInterval(timer); stream.getTracks().forEach(function(t){t.stop();});
        recBlob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});
        recPlay.src=URL.createObjectURL(recBlob); recPlay.hidden=false; recClear.hidden=false;
        recBox.classList.remove("recording"); recLabel.textContent="Record again";
      };
      recorder.start(1000); t0=Date.now(); recTime.hidden=false; recTime.textContent="0:00";
      recBox.classList.add("recording"); recLabel.textContent="Stop recording"; recPlay.hidden=true;
      timer=setInterval(function(){var s=(Date.now()-t0)/1000; recTime.textContent=fmt(s); if(s>=600) stopRec();},250);
    }).catch(function(){showErr("We couldn't reach your microphone. You can allow it in your browser settings, or upload an audio file instead.");});
  });
  recClear.addEventListener("click",function(){recBlob=null;recPlay.hidden=true;recPlay.removeAttribute("src");recClear.hidden=true;recTime.hidden=true;recLabel.textContent="Record a voice note";});
  function showErr(m){err.textContent=m;err.hidden=false;}
  function extFor(t){return /mp4|m4a|aac/.test(t)?"m4a":/ogg/.test(t)?"ogg":"webm";}
  form.addEventListener("submit",function(e){
    e.preventDefault(); err.hidden=true;
    form.querySelectorAll(".invalid").forEach(function(x){x.classList.remove("invalid");});
    var story=form.story.value.trim(), email=form.email.value.trim();
    var audio=form.audio.files[0], sf=form.story_file.files[0];
    if(!story&&!recBlob&&!audio&&!sf){form.story.classList.add("invalid");form.story.focus();return showErr("Tell us the story: type a line, record it, or upload it.");}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){form.email.classList.add("invalid");form.email.focus();return showErr("Please add an email so we can send your preview.");}
    if((audio&&audio.size>MAXF)||(sf&&sf.size>MAXF)||(recBlob&&recBlob.size>MAXF)) return showErr("One of the files is over 20 MB. Please choose a smaller one.");
    var fd=new FormData(form);
    if(recBlob){fd.set("audio",recBlob,"voice-note."+extFor(recBlob.type));}
    else if(!audio){fd.delete("audio");}
    if(!sf) fd.delete("story_file");
    fd.set("page",location.href.slice(0,300));
    btn.disabled=true; btn.textContent="Sending…";
    var xhr=new XMLHttpRequest(); xhr.open("POST",API);
    xhr.upload.onprogress=function(ev){if(ev.lengthComputable&&ev.total>200000) btn.textContent="Sending… "+Math.round(ev.loaded/ev.total*100)+"%";};
    xhr.onload=function(){
      var ok=false; try{ok=JSON.parse(xhr.responseText).ok;}catch(_){}
      if(xhr.status>=200&&xhr.status<300&&ok){form.hidden=true;done.hidden=false;done.focus();}
      else{var m="Something went wrong sending your story. Please try again.";
        if(xhr.status===413)m="That file is too big (20 MB max).";
        if(xhr.status===429)m="Too many tries from here. Please wait a bit and try again.";
        fail(m);}
    };
    xhr.onerror=function(){fail("We couldn't reach the server. Check your connection and try again.");};
    xhr.send(fd);
  });
  function fail(m){btn.disabled=false;btn.textContent="Send my story";showErr(m);}
  document.getElementById("another").addEventListener("click",function(){
    form.reset(); recClear.click(); form.querySelectorAll(".file-name").forEach(function(x){x.textContent="";});
    btn.disabled=false; btn.textContent="Send my story"; done.hidden=true; form.hidden=false; form.story.focus();
  });
  form.addEventListener("input",function(e){ if(!err.hidden){err.hidden=true;} e.target.classList&&e.target.classList.remove("invalid"); form.story.classList.remove("invalid"); });
  if(location.hash==="#start") openForm();
})();
