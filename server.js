const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const WORDS = ["rocket", "pineapple", "volcano", "skateboard", "jellyfish", "castle", "telescope", "popcorn", "dragon", "waterfall", "spaceship", "cactus", "rainbow", "guitar", "penguin", "crown"];
const QUESTIONS = [
  { q: "Which planet is known as the Red Planet?", a: ["Venus", "Mars", "Jupiter", "Mercury"], correct: 1 },
  { q: "How many sides does a hexagon have?", a: ["5", "6", "7", "8"], correct: 1 },
  { q: "What is the largest ocean on Earth?", a: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3 },
  { q: "Which animal is the tallest?", a: ["Elephant", "Giraffe", "Ostrich", "Camel"], correct: 1 },
  { q: "What do bees make?", a: ["Milk", "Silk", "Honey", "Wax only"], correct: 2 },
  { q: "How many colours are traditionally in a rainbow?", a: ["5", "6", "7", "8"], correct: 2 },
  { q: "Which gas do plants absorb?", a: ["Oxygen", "Carbon dioxide", "Hydrogen", "Helium"], correct: 1 },
  { q: "What is the smallest prime number?", a: ["0", "1", "2", "3"], correct: 2 },
  { q: "Which instrument has keys, pedals and strings?", a: ["Flute", "Piano", "Drum", "Trumpet"], correct: 1 },
  { q: "What is a baby frog called?", a: ["Cub", "Calf", "Tadpole", "Hatchling"], correct: 2 }
];

const cleanName = s => String(s || "Player").trim().slice(0, 18) || "Player";
const cleanRoom = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const publicPlayers = room => room.players.map(p => ({ id: p.id, name: p.name, score: p.score, host: p.id === room.hostId }));
function sendState(room) {
  for (const p of room.players) {
    const isDrawer = room.current?.type === "scribble" && room.current.drawerId === p.id;
    io.to(p.id).emit("room-state", {
      code: room.code, players: publicPlayers(room), hostId: room.hostId,
      started: room.started, round: room.round, totalRounds: room.totalRounds,
      phase: room.phase, gameType: room.current?.type || null,
      drawerId: room.current?.drawerId || null, drawerName: room.current?.drawerName || null,
      word: isDrawer ? room.current.word : null,
      question: room.current?.type === "quiz" ? room.current.question : null,
      endsAt: room.endsAt || null, message: room.message || ""
    });
  }
}
function announce(room, message) {
  room.message = message;
  sendState(room);
}
function stopTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}
function finishRound(room, message) {
  if (!room || !room.started || room.phase !== "playing") return;
  stopTimer(room);
  room.phase = "between";
  room.message = message;
  io.to(room.code).emit("round-ended", { message, scores: publicPlayers(room) });
  sendState(room);
  room.timer = setTimeout(() => nextRound(room), 3500);
}
function nextRound(room) {
  if (!rooms.has(room.code) || room.players.length < 1) return;
  stopTimer(room);
  room.round += 1;
  if (room.round > room.totalRounds) {
    room.started = false;
    room.phase = "finished";
    const winner = [...room.players].sort((a,b) => b.score-a.score)[0];
    announce(room, `Game over! ${winner ? winner.name + " wins" : "Thanks for playing"}!`);
    io.to(room.code).emit("game-finished", { players: publicPlayers(room) });
    return;
  }
  const type = room.mode === "both" ? (room.round % 2 ? "scribble" : "quiz") : room.mode;
  room.phase = "playing";
  room.endsAt = Date.now() + (type === "scribble" ? 65000 : 22000);
  room.message = type === "scribble" ? "Guess the drawing!" : "Choose the correct answer!";
  if (type === "scribble") {
    const drawer = room.players[(room.round - 1) % room.players.length];
    room.current = { type, drawerId: drawer.id, drawerName: drawer.name, word: WORDS[Math.floor(Math.random()*WORDS.length)] };
    io.to(room.code).emit("clear-canvas");
    io.to(room.code).emit("round-start", { type, drawerId: drawer.id, drawerName: drawer.name, duration: 65 });
  } else {
    const q = QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)];
    room.current = { type, question: { q: q.q, a: q.a }, correct: q.correct, answered: new Set() };
    io.to(room.code).emit("round-start", { type, duration: 22 });
  }
  sendState(room);
  room.timer = setTimeout(() => finishRound(room, type === "scribble" ? "Time's up! The word was " + room.current.word + "." : "Time's up!"), type === "scribble" ? 65000 : 22000);
}
function makeRoom(socket, name, mode) {
  let code;
  do { code = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(code));
  const room = { code, hostId: socket.id, players: [{ id: socket.id, name, score: 0 }], mode, started: false, phase: "lobby", round: 0, totalRounds: 8, timer: null, current: null, message: "Waiting for players…" };
  rooms.set(code, room);
  socket.join(code);
  socket.data.room = code;
  sendState(room);
  return room;
}
io.on("connection", socket => {
  socket.on("create-room", ({ name, mode }) => {
    makeRoom(socket, cleanName(name), ["both","scribble","quiz"].includes(mode) ? mode : "both");
  });
  socket.on("join-room", ({ name, code }) => {
    const room = rooms.get(cleanRoom(code));
    if (!room) return socket.emit("join-error", "Room not found. Check the code and try again.");
    if (room.started) return socket.emit("join-error", "That game has already started.");
    if (room.players.length >= 12) return socket.emit("join-error", "This room is full (12 players max).");
    if (room.players.some(p => p.id === socket.id)) return;
    room.players.push({ id: socket.id, name: cleanName(name), score: 0 });
    socket.join(room.code); socket.data.room = room.code;
    announce(room, `${cleanName(name)} joined the party!`);
  });
  socket.on("start-game", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id || room.started || room.players.length < 2) return;
    room.started = true; room.round = 0;
    room.players.forEach(p => p.score = 0);
    nextRound(room);
  });
  socket.on("draw", data => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "playing" || room.current?.type !== "scribble" || room.current.drawerId !== socket.id) return;
    const points = Array.isArray(data?.points) ? data.points.slice(0, 80).map(p => ({ x: Math.max(0,Math.min(1,Number(p.x)||0)), y: Math.max(0,Math.min(1,Number(p.y)||0)) })) : [];
    if (points.length) socket.to(room.code).emit("draw", { points, color: String(data.color || "#00f5ff").slice(0,20), width: Math.max(1,Math.min(18,Number(data.width)||4)), clear: !!data.clear });
  });
  socket.on("clear-drawing", () => {
    const room = rooms.get(socket.data.room);
    if (room?.phase === "playing" && room.current?.type === "scribble" && room.current.drawerId === socket.id) io.to(room.code).emit("clear-canvas");
  });
  socket.on("chat-message", raw => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "playing" || room.current?.type !== "scribble") return;
    const player = room.players.find(p => p.id === socket.id);
    const message = String(raw || "").trim().slice(0,100);
    if (!player || !message) return;
    if (room.current.drawerId !== socket.id && norm(message) === norm(room.current.word)) {
      player.score += 100;
      const drawer = room.players.find(p => p.id === room.current.drawerId);
      if (drawer) drawer.score += 50;
      io.to(room.code).emit("chat-line", { name: "SYSTEM", text: `${player.name} guessed it! The word was ${room.current.word}.`, system: true });
      finishRound(room, `${player.name} guessed it! +100 points`);
    } else {
      io.to(room.code).emit("chat-line", { name: player.name, text: message });
    }
  });
  socket.on("quiz-answer", index => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== "playing" || room.current?.type !== "quiz" || room.current.answered.has(socket.id)) return;
    room.current.answered.add(socket.id);
    const player = room.players.find(p => p.id === socket.id);
    if (Number(index) === room.current.correct && player) {
      player.score += 100;
      socket.emit("quiz-result", { correct: true, message: "Correct! +100 points" });
    } else socket.emit("quiz-result", { correct: false, message: "Not quite — next time!" });
    if (room.current.answered.size >= room.players.length) finishRound(room, "Everyone has answered!");
    else sendState(room);
  });
  socket.on("leave-room", () => leave(socket));
  socket.on("disconnect", () => leave(socket));
});
function leave(socket) {
  const code = socket.data.room;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.room = null;
  if (!room) return;
  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(code);
  if (!room.players.length) {
    stopTimer(room); rooms.delete(code); return;
  }
  if (room.hostId === socket.id) room.hostId = room.players[0].id;
  if (room.current?.drawerId === socket.id && room.phase === "playing") finishRound(room, "The drawer left. Moving on…");
  else announce(room, "A player left the room.");
}
server.listen(PORT, () => console.log(`Neon Party running on port ${PORT}`));
