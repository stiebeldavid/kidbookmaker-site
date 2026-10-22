(function(){
  // On kidbookmaker.sites.tab.bot the API is same-origin; anywhere else (kidbookmaker.com, GitHub Pages, local) post to the live backend.
  var API=(location.hostname==="kidbookmaker.sites.tab.bot")?"/api/submit":"https://kidbookmaker.sites.tab.bot/api/submit";
  // UI strings: English defaults; a page can override them by defining window.KBM_STRINGS before this script (see /es/).
  var S={rec_unsupported:"Recording isn't supported in this browser. You can upload an audio file instead.",
    mic_error:"We couldn't reach your microphone. You can allow it in your browser settings, or upload an audio file instead.",
    rec_again:"Record again", rec_stop:"Stop recording", rec_start:"Record a voice note", too_big:" (too big, 20 MB max)",
    need_story:"Tell us the story: type a line, record it, or upload it.", need_email:"Please add an email so we can send your preview.",
    need_phone:"Please check the phone number: at least 7 digits (or leave it blank).",
    file_over:"One of the files is over 20 MB. Please choose a smaller one.", sending:"Sending…", submit:"Send my story",
    err_generic:"Something went wrong sending your story. Please try again.", err_413:"That file is too big (20 MB max).",
    err_429:"Too many tries from here. Please wait a bit and try again.", err_net:"We couldn't reach the server. Check your connection and try again.",
    photos_add:"Add photos", photos_add_more:"Add another photo", photos_count:"{n} of 3", photo_remove:"Remove photo",
    photos_max:"Only 3 photos fit. We kept the first 3.", photos_full:"That's 3 photos already. Remove one to add another.",
    photo_big:"{name} is over 20 MB. Please pick a smaller photo.", photo_type:"{name} isn't a photo. For documents, use \u201cUpload a file\u201d.",
    err_photos:"You can send up to 3 photos, and only images."};
  var ov=window.KBM_STRINGS||{}; for(var k in ov) if(Object.prototype.hasOwnProperty.call(ov,k)) S[k]=ov[k];
  // Where the story came from: page language (<html lang>) and an optional ?ref=name partner link, kept for the session.
  var LANG=(document.documentElement.getAttribute("lang")||"en").toLowerCase(), REF="";
  try{ REF=new URLSearchParams(location.search).get("ref")||sessionStorage.getItem("kbm_ref")||""; REF=REF.replace(/[^\w-]/g,"").slice(0,40); if(REF) sessionStorage.setItem("kbm_ref",REF); }catch(_){}
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
    if(inp.id==="photos") return; // handled by the photo picker below
    inp.addEventListener("change",function(){
      var out=form.querySelector('.file-name[data-for="'+inp.id+'"]'); var f=inp.files[0];
      out.textContent=f?("✓ "+f.name+(f.size>MAXF?S.too_big:"")):"";
    });
  });
  // photos: up to 3 images, picked one at a time or several at once; kept in PHOTOS and sent as repeated "photos" fields
  var MAXP=3, PHOTOS=[], pIn=document.getElementById("photos"), pList=document.getElementById("photo-list"),
      pMsg=document.getElementById("photos-msg"), pBtn=document.getElementById("photos-btn"), pCount=document.getElementById("photos-count");
  function isImg(f){ return /^image\//.test(f.type||"")||/\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)$/i.test(f.name||""); }
  function pSay(m){ if(!pMsg) return; pMsg.textContent=m||""; pMsg.hidden=!m; }
  function pRender(){
    if(!pList) return;
    pList.querySelectorAll("img[data-url]").forEach(function(im){ try{URL.revokeObjectURL(im.getAttribute("data-url"));}catch(_){} });
    pList.innerHTML="";
    PHOTOS.forEach(function(f,i){
      var li=document.createElement("li"), im=document.createElement("img"), nm=document.createElement("span"), rm=document.createElement("button");
      im.className="thumb"; im.alt=f.name||"photo";
      try{ var u=URL.createObjectURL(f); im.src=u; im.setAttribute("data-url",u); }catch(_){}
      im.onerror=function(){ var ph=document.createElement("span"); ph.className="thumb ph"; ph.textContent="\uD83D\uDCF7"; if(im.parentNode) im.parentNode.replaceChild(ph,im); };
      nm.className="pname"; nm.textContent=f.name||"photo";
      rm.type="button"; rm.className="rm"; rm.textContent="\u00D7"; rm.setAttribute("aria-label",S.photo_remove+": "+(f.name||""));
      rm.addEventListener("click",function(){ PHOTOS.splice(i,1); pSay(""); pRender(); if(pBtn) pBtn.focus(); });
      li.appendChild(im); li.appendChild(rm); li.appendChild(nm); pList.appendChild(li);
    });
    if(pBtn) pBtn.textContent=PHOTOS.length?S.photos_add_more:S.photos_add;
    if(pCount) pCount.textContent=PHOTOS.length?S.photos_count.replace("{n}",PHOTOS.length):"";
  }
  if(pIn){
    pIn.addEventListener("click",function(e){ if(PHOTOS.length>=MAXP){ e.preventDefault(); pSay(S.photos_full); } });
    pIn.addEventListener("change",function(){
      var picked=[].slice.call(pIn.files||[]), msgs=[], dropped=0;
      picked.forEach(function(f){
        if(!isImg(f)){ msgs.push(S.photo_type.replace("{name}",f.name||"")); return; }
        if(f.size>MAXF){ msgs.push(S.photo_big.replace("{name}",f.name||"")); return; }
        if(PHOTOS.length>=MAXP){ dropped++; return; }
        PHOTOS.push(f);
      });
      if(dropped) msgs.unshift(S.photos_max);
      pIn.value=""; pSay(msgs.join(" ")); pRender();
    });
  }
  // recording
  var recBtn=document.getElementById("rec-btn"), recLabel=document.getElementById("rec-label"), recTime=document.getElementById("rec-time"),
      recPlay=document.getElementById("rec-play"), recClear=document.getElementById("rec-clear"), recBox=document.getElementById("rec-box");
  function fmt(s){return Math.floor(s/60)+":"+("0"+Math.floor(s%60)).slice(-2);}
  function stopRec(){ if(recorder&&recorder.state!=="inactive") recorder.stop(); }
  recBtn.addEventListener("click",function(){
    if(recorder&&recorder.state==="recording"){stopRec();return;}
    if(!navigator.mediaDevices||!window.MediaRecorder){showErr(S.rec_unsupported);return;}
    navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){
      stream=s; chunks=[];
      var type=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg"].find(function(t){return MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t);});
      recorder=type?new MediaRecorder(s,{mimeType:type}):new MediaRecorder(s);
      recorder.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};
      recorder.onstop=function(){
        clearInterval(timer); stream.getTracks().forEach(function(t){t.stop();});
        recBlob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});
        recPlay.src=URL.createObjectURL(recBlob); recPlay.hidden=false; recClear.hidden=false;
        recBox.classList.remove("recording"); recLabel.textContent=S.rec_again;
      };
      recorder.start(1000); t0=Date.now(); recTime.hidden=false; recTime.textContent="0:00";
      recBox.classList.add("recording"); recLabel.textContent=S.rec_stop; recPlay.hidden=true;
      timer=setInterval(function(){var s=(Date.now()-t0)/1000; recTime.textContent=fmt(s); if(s>=600) stopRec();},250);
    }).catch(function(){showErr(S.mic_error);});
  });
  recClear.addEventListener("click",function(){recBlob=null;recPlay.hidden=true;recPlay.removeAttribute("src");recClear.hidden=true;recTime.hidden=true;recLabel.textContent=S.rec_start;});
  function showErr(m){err.textContent=m;err.hidden=false;}
  function extFor(t){return /mp4|m4a|aac/.test(t)?"m4a":/ogg/.test(t)?"ogg":"webm";}
  form.addEventListener("submit",function(e){
    e.preventDefault(); err.hidden=true;
    form.querySelectorAll(".invalid").forEach(function(x){x.classList.remove("invalid");});
    var story=form.story.value.trim(), email=form.email.value.trim();
    var audio=form.audio.files[0], sf=form.story_file.files[0];
    if(!story&&!recBlob&&!audio&&!sf&&!PHOTOS.length){form.story.classList.add("invalid");form.story.focus();return showErr(S.need_story);}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){form.email.classList.add("invalid");form.email.focus();return showErr(S.need_email);}
    var phone=form.phone?form.phone.value.trim().replace(/\s+/g," "):"";
    if(phone&&(!/^[0-9+()\-. ]+$/.test(phone)||phone.replace(/\D/g,"").length<7||phone.replace(/\D/g,"").length>15)){form.phone.classList.add("invalid");form.phone.focus();return showErr(S.need_phone);}
    if((audio&&audio.size>MAXF)||(sf&&sf.size>MAXF)||(recBlob&&recBlob.size>MAXF)) return showErr(S.file_over);
    var fd=new FormData(form);
    if(recBlob){fd.set("audio",recBlob,"voice-note."+extFor(recBlob.type));}
    else if(!audio){fd.delete("audio");}
    if(!sf) fd.delete("story_file");
    fd.delete("photos"); if(PHOTOS.length>MAXP) return showErr(S.photos_max);
    PHOTOS.forEach(function(f){ fd.append("photos",f,f.name||"photo.jpg"); });
    fd.set("page",location.href.slice(0,300));
    var tag=[]; if(LANG!=="en") tag.push("lang:"+LANG); if(REF) tag.push("ref:"+REF);
    // the backend keeps "notes" (4000 chars) but drops unknown fields, so lang/ref/phone ride in notes as tags
    var tags=(tag.length?"["+tag.join(" ")+"]":"")+(phone?"[phone:"+phone.replace(/[\[\]]/g,"")+"]":"");
    var own=(fd.get("notes")||"").toString().trim(); fd.delete("phone");
    if(tags||own) fd.set("notes",(tags+(own?" "+own:"")).trim());
    btn.disabled=true; btn.textContent=S.sending;
    var xhr=new XMLHttpRequest(); xhr.open("POST",API);
    xhr.upload.onprogress=function(ev){if(ev.lengthComputable&&ev.total>200000) btn.textContent=S.sending+" "+Math.round(ev.loaded/ev.total*100)+"%";};
    xhr.onload=function(){
      var ok=false; try{ok=JSON.parse(xhr.responseText).ok;}catch(_){}
      if(xhr.status>=200&&xhr.status<300&&ok){
        form.hidden=true;done.hidden=false;done.focus();
        var sid="", sfiles=null; try{var rj=JSON.parse(xhr.responseText); sid=rj.id||""; sfiles=rj.files||null;}catch(_){}
        var flist=[sf?("story file: "+sf.name):"",audio?("audio: "+audio.name):"",recBlob?"voice note (recorded)":""].concat(
          PHOTOS.map(function(f,i){ return "photo "+(i+1)+" of "+PHOTOS.length+": "+f.name; })).filter(Boolean);
        notify({name:(fd.get("author_name")||"").toString(),email:email,phone:phone,tags:tag.join(" "),story:story,
          files:flist.length?flist.length+" file"+(flist.length>1?"s":"")+": "+flist.join(", "):"",
          page:location.href.slice(0,300),id:sid,nfiles:(sf?1:0)+((audio||recBlob)?1:0)+PHOTOS.length,sfiles:sfiles});
      }
      else{var m=S.err_generic;
        if(xhr.status===413)m=S.err_413;
        if(xhr.status===400&&/too_many_photos|not_an_image/.test(xhr.responseText||""))m=S.err_photos;
        if(xhr.status===429)m=S.err_429;
        fail(m);}
    };
    xhr.onerror=function(){fail(S.err_net);};
    xhr.send(fd);
  });
  // Independent heads-up email on every successful submission (so a submission is seen even if the usual pipeline is down).
  // Fire-and-forget: it never blocks or changes the real submission, and any failure here is swallowed.
  var NOTIFY_TO=atob("c3RpZWJlbGRhdmlkQGdtYWlsLmNvbQ==");
  function notify(d){
    try{
      var when=new Date(), story=(d.story||"").replace(/\s+/g," ").trim();
      var body={_subject:"New KidBookMaker submission"+(d.name?" from "+d.name:""),_template:"table",_captcha:"false",
        Name:d.name||"(none)",Email:d.email||"(none)",Phone:d.phone||"(none)",Language_ref:d.tags||"en",
        Story:story?(story.slice(0,300)+(story.length>300?"…":"")):"(no typed story)",Files:d.files||"none",
        Page:d.page||"",Submission_id:d.id||"",Submitted:when.toISOString()+" ("+when.toLocaleString()+")",
        Note:"Tab handles this automatically; this copy is so you never miss one."};
      if(d.email) body._replyto=d.email;
      post("https://formsubmit.co/ajax/"+NOTIFY_TO,JSON.stringify(body));
    }catch(_){}
    try{ tabAlert(d); }catch(_){}
  }
  function post(url,json){
    var hdr={"Content-Type":"application/json","Accept":"application/json"};
    // keepalive lets the request finish even if the visitor closes the page; the service can take 30-60 s when busy
    if(window.fetch){ fetch(url,{method:"POST",headers:hdr,body:json,keepalive:json.length<60000}).catch(function(){}); }
    else{ var x=new XMLHttpRequest(); x.open("POST",url); x.timeout=90000;
      x.setRequestHeader("Content-Type","application/json"); x.setRequestHeader("Accept","application/json");
      x.onerror=x.ontimeout=function(){}; x.send(json); }
  }
  // Second, independent alert to the KidBookMaker inbox (Tab is woken the moment mail lands there).
  // Same fire-and-forget rules: it never blocks or changes the real submission, failures are swallowed.
  var TAB_ALERT_TO="feadbef77382f295aab157fe1c27a73c", // FormSubmit alias of the KidBookMaker inbox (activated for kidbookmaker.com)
       ADMIN="https://kidbookmaker.sites.tab.bot/api/admin/file?key=";
  function tabAlert(d){
    var when=new Date(), story=(d.story||"").trim(), test=/^\s*\[?TEST\b/i.test(story);
    var lang=/lang:es/.test(d.tags||"")?"ES":"EN", base=(d.id||"").replace(/^sub:story:/,""), links=[];
    if(d.sfiles&&d.sfiles.length) d.sfiles.forEach(function(f){ links.push((f.field||"file")+" ("+(f.name||"")+"): "+ADMIN+encodeURIComponent(f.key)); });
    else for(var i=0;i<(d.nfiles||0);i++) links.push(ADMIN+encodeURIComponent("file:"+base+":"+i));
    var body={_subject:"[KidBookMaker] "+(test?"TEST ":"")+"New story request"+(d.name?" from "+d.name:"")+" ("+lang+")",
      _template:"box",_captcha:"false",
      Submission_id:d.id||"(none returned)",Name:d.name||"(none)",Email:d.email||"(none)",Phone:d.phone||"(none)",
      Language_ref:d.tags||"en",Story:story||"(no typed story)",Files:d.files||"none",
      File_links:links.length?links.join("\n")+"\n(admin links: open with the site admin token)":"none",
      Page:d.page||"",Submitted:when.toISOString()+" ("+when.toLocaleString()+")",User_agent:(navigator.userAgent||"").slice(0,200)};
    post("https://formsubmit.co/ajax/"+TAB_ALERT_TO,JSON.stringify(body));
  }
  function fail(m){btn.disabled=false;btn.textContent=S.submit;showErr(m);}
  document.getElementById("another").addEventListener("click",function(){
    form.reset(); recClear.click(); form.querySelectorAll(".file-name").forEach(function(x){x.textContent="";}); PHOTOS=[]; pSay(""); pRender();
    btn.disabled=false; btn.textContent=S.submit; done.hidden=true; form.hidden=false; form.story.focus();
  });
  form.addEventListener("input",function(e){ if(!err.hidden){err.hidden=true;} e.target.classList&&e.target.classList.remove("invalid"); form.story.classList.remove("invalid"); });
  if(location.hash==="#start") openForm();
})();
