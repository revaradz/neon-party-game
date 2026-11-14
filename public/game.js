const socket = io();
const $ = id => document.getElementById(id);
let state = null, isDrawer = false, drawing = false, last = null, timerTick = null, answered = false;
const canvas = $("board"), ctx = canvas.getContext("2d");
ctx.lineCap = "round"; ctx.lineJoin = "round";
function show(id) { ["home","lobby","game","finished"].forEach(x => $(x).classList.toggle("hidden", x !== id)); }
function addChat(name, text, system=false) {
  const line = document.createElement("p"); line.className = "chat-line" + (system ? " system" : "");
  const strong = document.createElement("strong"); strong.textContent = name + ": ";
  line.append(strong, document.createTextNode(text)); $("chat").append(line); $("chat").scrollTop = $("chat").scrollHeight;
}
function renderPlayers(players) {
  $("players").innerHTML = ""; $("scores").innerHTML = "";
  players.forEach(p => {
    const chip = document.createElement("div"); chip.className = "player-chip" + (p.host ? " host" : "");
    chip.textContent = p.name + (p.host ? " ✦" : ""); $("players").append(chip);
    const row = document.createElement("div"); row.className = "score-row";
    const name = document.createElement("span"); name.textContent = p.name;
    const score = document.createElement("b"); score.textContent = p.score + " pts";
    row.append(name, score); $("scores").append(row);
  });
  $("playerCount").textContent = players.length + "/12";
}
function clearCanvas(){ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);}
clearCanvas();
socket.on("connect", () => { $("connection").textContent="● ONLINE"; $("connection").classList.add("online"); });
socket.on("disconnect", () => { $("connection").textContent="● RECONNECTING"; $("connection").classList.remove("online"); });
socket.on("join-error", msg => alert(msg));
socket.on("room-state", s => {
  state=s; renderPlayers(s.players);
  if (!s.started && s.phase !== "finished") {
    show("lobby"); $("roomCodeDisplay").textContent=s.code;
    $("lobbyMessage").textContent=s.message;
    const host=s.hostId===socket.id;
    $("startBtn").disabled=!host || s.players.length<2;
    $("startBtn").textContent=host ? (s.players.length<2?"START GAME — NEED 2 PLAYERS":"START GAME ✦") : "WAITING FOR HOST…";
  } else if (s.started) {
    show("game");
    $("roundType").textContent=`ROUND ${s.round} / ${s.totalRounds} • ${s.gameType?.toUpperCase()||""}`;
    $("gameMessage").textContent=s.message;
    isDrawer=s.drawerId===socket.id;
    if (s.gameType==="scribble") {
      $("gameTitle").innerHTML='SCRIBBLE <span>TIME</span>';
      $("drawTools").classList.toggle("hidden",!isDrawer);
      $("quizArea").classList.add("hidden"); canvas.classList.remove("hidden");
      $("chatForm").classList.remove("hidden"); $("chatInput").placeholder=isDrawer?"Cheer on the guessers…":"Type your guess…";
      $("spectatorHint").textContent=isDrawer?"Draw the word without using letters or numbers!":"Watch the drawing and type your guess below.";
      $("drawerPrompt").textContent="YOUR WORD: "+(s.word||"HIDDEN");
    } else if (s.gameType==="quiz") {
      $("gameTitle").innerHTML='QUICK <span>QUIZ</span>';
      $("drawTools").classList.add("hidden"); canvas.classList.add("hidden"); $("quizArea").classList.remove("hidden");
      $("chatForm").classList.add("hidden"); $("spectatorHint").textContent=""; $("question").textContent=s.question?.q||"Loading question…";
      if ($("answers").children.length===0) renderAnswers(s.question?.a||[]);
    }
  } else if (s.phase==="finished") show("finished");
});
function renderAnswers(answers){
  $("answers").innerHTML=""; answered=false; $("quizFeedback").textContent="";
  answers.forEach((a,i)=>{const b=document.createElement("button");b.className="answer";b.textContent=a;b.onclick=()=>{if(answered)return;answered=true;[...$("answers").children].forEach(x=>x.disabled=true);socket.emit("quiz-answer",i);};$("answers").append(b);});
}
socket.on("round-start", info => {
  $("gameMessage").textContent=info.type==="scribble"?"Make it count!":"Think fast!";
  $("timer").textContent=info.duration; clearInterval(timerTick); let left=info.duration;
  timerTick=setInterval(()=>{left--; $("timer").textContent=Math.max(0,left);if(left<=0)clearInterval(timerTick);},1000);
  if(info.type==="scribble"){clearCanvas();$("chat").innerHTML="";}
  else {renderAnswers(state?.question?.a||[]);}
});
socket.on("clear-canvas",clearCanvas);
socket.on("draw", data => drawRemote(data));
socket.on("chat-line", d => addChat(d.name,d.text,d.system));
socket.on("quiz-result", d => {$("quizFeedback").textContent=d.message;$("quizFeedback").style.color=d.correct?"#15803d":"#a21caf";});
socket.on("round-ended", d => {$("gameMessage").textContent=d.message;renderPlayers(d.scores);});
socket.on("game-finished", d => {
  clearInterval(timerTick);show("finished");$("finalScores").innerHTML="";
  [...d.players].sort((a,b)=>b.score-a.score).forEach((p,i)=>{const row=document.createElement("div");row.className="final-row";row.textContent=`${i+1}. ${p.name} — ${p.score} points`; $("finalScores").append(row);});
});
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
function drawSegment(a,b,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x*canvas.width,a.y*canvas.height);ctx.lineTo(b.x*canvas.width,b.y*canvas.height);ctx.stroke();}
function drawRemote(d){if(d.clear)clearCanvas();if(d.points.length>1)for(let i=1;i<d.points.length;i++)drawSegment(d.points[i-1],d.points[i],d.color,d.width*canvas.width/canvas.getBoundingClientRect().width);}
canvas.addEventListener("pointerdown",e=>{if(!isDrawer||state?.gameType!=="scribble")return;drawing=true;last=pos(e);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener("pointermove",e=>{if(!drawing||!last)return;const next=pos(e),color=$("ink").value,width=Number($("brush").value);drawSegment(last,next,color,width*canvas.width/canvas.getBoundingClientRect().width);socket.emit("draw",{points:[last,next],color,width});last=next;});
function stopDraw(){drawing=false;last=null;} canvas.addEventListener("pointerup",stopDraw);canvas.addEventListener("pointercancel",stopDraw);canvas.addEventListener("pointerleave",stopDraw);
$("clearBtn").onclick=()=>{clearCanvas();socket.emit("clear-drawing");};
$("createBtn").onclick=()=>socket.emit("create-room",{name:$("createName").value,mode:$("mode").value});
$("joinBtn").onclick=()=>socket.emit("join-room",{name:$("joinName").value,code:$("roomCode").value});
$("startBtn").onclick=()=>socket.emit("start-game");
$("leaveLobby").onclick=()=>{socket.emit("leave-room");show("home");};
$("copyCode").onclick=()=>{navigator.clipboard?.writeText(state?.code||"");$("copyCode").textContent="COPIED!";setTimeout(()=>$("copyCode").textContent="COPY CODE",1200);};
$("chatForm").onsubmit=e=>{e.preventDefault();const v=$("chatInput").value.trim();if(v){socket.emit("chat-message",v);$("chatInput").value="";}};
$("backHome").onclick=()=>{socket.emit("leave-room");state=null;show("home");};
