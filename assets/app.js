const vid=document.getElementById('vid'),cvs=document.getElementById('cvs'),ctx=cvs.getContext('2d');
const btn=document.getElementById('btnMain'),flashOv=document.getElementById('flashOv');
const cdNum=document.getElementById('cdNum'),camPh=document.getElementById('camPh');
const statusBadge=document.getElementById('statusBadge');

let cam=null,pose=null,running=false,shooting=false;
let buf=[],snapCount=0,selectedSec=3;
let snapData=[null,null,null];
let lastMeasures={sh:'—',hp:'—',rt:'—',size:'—',name:'—'};

document.querySelectorAll('.cd-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    if(shooting) return;
    document.querySelectorAll('.cd-btn').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel');
    selectedSec=parseInt(b.dataset.sec);
  });
});

function dist(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}
function classify(sr){
  if(sr<0.30) return {letter:'XS',name:'extra small'};
  if(sr<0.36) return {letter:'S',name:'small'};
  if(sr<0.42) return {letter:'M',name:'medium'};
  if(sr<0.48) return {letter:'L',name:'large'};
  return {letter:'XL',name:'extra large'};
}

function drawSkel(lms){
  const w=cvs.width,h=cvs.height;
  ctx.clearRect(0,0,w,h);
  [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]].forEach(([a,b])=>{
    const la=lms[a],lb=lms[b];
    if(!la||!lb||la.visibility<0.4||lb.visibility<0.4) return;
    ctx.beginPath();ctx.moveTo(la.x*w,la.y*h);ctx.lineTo(lb.x*w,lb.y*h);
    ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1.5;ctx.stroke();
  });
  [0,11,12,13,14,15,16,23,24,25,26,27,28].forEach(i=>{
    const lm=lms[i];if(!lm||lm.visibility<0.4) return;
    ctx.beginPath();ctx.arc(lm.x*w,lm.y*h,4,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.7)';ctx.fill();
  });
}

function updateUI(lms,conf){
  const shl=lms[11],shr=lms[12],hpl=lms[23],hpr=lms[24],nose=lms[0];
  const mhip={x:(hpl.x+hpr.x)/2,y:(hpl.y+hpr.y)/2};
  const shW=dist(shl,shr),hpW=dist(hpl,hpr),bodyH=dist(nose,mhip)||1;
  const sr=shW/bodyH;
  buf.push(sr);if(buf.length>20) buf.shift();
  const avg=buf.reduce((a,b)=>a+b,0)/buf.length;
  const sz=classify(avg);
  const rt=hpW>0?(shW/hpW).toFixed(2):'—';

  lastMeasures={sh:(shW*100).toFixed(1)+' u',hp:(hpW*100).toFixed(1)+' u',rt,size:sz.letter,name:sz.name};

  document.getElementById('sLetter').textContent=sz.letter;
  document.getElementById('sName').textContent=sz.name;
  document.getElementById('mSh').textContent=lastMeasures.sh;
  document.getElementById('mHp').textContent=lastMeasures.hp;
  document.getElementById('mRt').textContent=rt;
  const cp=Math.round(conf*100);
  document.getElementById('confPct').textContent=cp+'%';
  document.getElementById('confFill').style.width=cp+'%';
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.s===sz.letter));
  statusBadge.textContent='LIVE';statusBadge.className='status-badge live';
}

function doFlash(){
  flashOv.style.transition='none';flashOv.style.opacity='1';
  setTimeout(()=>{flashOv.style.transition='opacity 0.3s';flashOv.style.opacity='0';},60);
}

function captureSnap(){
  const idx=snapCount%3;
  const sc=document.createElement('canvas');
  sc.width=cvs.width||640;sc.height=cvs.height||480;
  const sctx=sc.getContext('2d');
  sctx.filter='contrast(1.1)';
  sctx.save();sctx.scale(-1,1);sctx.drawImage(vid,-sc.width,0,sc.width,sc.height);sctx.restore();
  sctx.filter='none';sctx.drawImage(cvs,0,0);

  snapData[idx]={canvas:sc,measures:{...lastMeasures}};

  const slot=document.getElementById('sl'+idx);
  slot.innerHTML='';
  const mini=document.createElement('canvas');
  mini.width=160;mini.height=120;
  mini.getContext('2d').drawImage(sc,0,0,160,120);
  slot.appendChild(mini);
  const tag=document.createElement('div');
  tag.className='snap-tag';tag.textContent='#'+(snapCount+1)+' · '+lastMeasures.size;
  slot.appendChild(tag);
  slot.onclick=()=>openModal(idx);

  snapCount++;
  doFlash();
}

function openModal(idx){
  const d=snapData[idx];if(!d) return;
  const wrap=document.getElementById('modalImgWrap');wrap.innerHTML='';
  const mc=document.createElement('canvas');mc.width=240;mc.height=180;
  mc.getContext('2d').drawImage(d.canvas,0,0,240,180);
  wrap.appendChild(mc);
  document.getElementById('modalSize').textContent=d.measures.size;
  document.getElementById('modalSub').textContent=d.measures.name;
  const statsEl=document.getElementById('modalStats');
  statsEl.innerHTML=[
    ['lebar bahu',d.measures.sh],
    ['lebar pinggul',d.measures.hp],
    ['rasio s/h',d.measures.rt]
  ].map(([k,v])=>`<div class="modal-row"><span class="modal-k">${k}</span><span class="modal-v">${v}</span></div>`).join('');
  document.getElementById('modal').classList.add('open');
}

document.getElementById('modalClose').onclick=()=>document.getElementById('modal').classList.remove('open');
document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal')) document.getElementById('modal').classList.remove('open');});

function countdown(n,cb){
  if(n<=0){cdNum.style.opacity='0';cb();return;}
  cdNum.textContent=n;cdNum.style.opacity='1';
  setTimeout(()=>{cdNum.style.opacity='0';setTimeout(()=>countdown(n-1,cb),200);},700);
}

async function startCam(){
  try{
    statusBadge.textContent='LOADING...';
    pose=new Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`});
    pose.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
    pose.onResults(res=>{
      if(!running) return;
      cvs.width=vid.videoWidth||640;cvs.height=vid.videoHeight||480;
      if(res.poseLandmarks){
        const vis=res.poseLandmarks.slice(11,25);
        const conf=vis.reduce((s,l)=>s+(l.visibility||0),0)/vis.length;
        drawSkel(res.poseLandmarks);
        if(conf>0.45) updateUI(res.poseLandmarks,conf);
      } else {ctx.clearRect(0,0,cvs.width,cvs.height);statusBadge.textContent='CARI...';}
    });
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:640,height:480}});
    vid.srcObject=stream;vid.style.display='block';cvs.style.display='block';camPh.style.display='none';
    await vid.play();
    cam=new Camera(vid,{onFrame:async()=>{if(pose&&running) await pose.send({image:vid});},width:640,height:480});
    await cam.start();
    running=true;
    btn.innerHTML='<i class="ti ti-camera" aria-hidden="true"></i> Foto!';
    btn.onclick=triggerShot;
  } catch(e){
    statusBadge.textContent='ERROR';
    camPh.innerHTML='<i class="ti ti-alert-circle" style="font-size:28px;opacity:0.3;"></i><span>Izin kamera ditolak.<br>Cek pengaturan browser.</span>';
  }
}

function triggerShot(){
  if(shooting) return;
  shooting=true;
  btn.disabled=true;
  countdown(selectedSec,()=>{
    captureSnap();
    shooting=false;
    btn.disabled=false;
  });
}

btn.addEventListener('click',()=>{if(!running) startCam();});

