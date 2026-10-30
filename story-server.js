const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3001);
const ROOT = __dirname;
const rooms = new Map();
const streams = new Map();
const stages = [
  { id: 'radio', name: 'Radio shack', clues: ['morse', 'decoder'], answer: 'SEVEN', hints: ['Read each group of dots and dashes as one Morse letter.', 'The first group, ... , is S. The final groups spell V-E-N.', 'Say the decoded word aloud: S-E-V-E-N. Enter SEVEN.'] },
  { id: 'chart', name: 'Chart room', clues: ['bearing', 'atlas'], answer: 'EAST', hints: ['The four numbers each stand for a letter.', 'Use the atlas key A=1, B=2, and so on.', '5=E, 1=A, 19=S, 20=T. Enter EAST.'] },
  { id: 'engine', name: 'Engine room', clues: ['fuses', 'loadnote'], answer: '2358', hints: ['The fuse values are out of order. Sort them.', 'Arrange the four values from smallest to largest.', 'The order is 2, 3, 5, 8. Enter 2358.'] },
  { id: 'lantern', name: 'Lantern gallery', clues: ['finalmessage', 'lensplate'], answer: 'EASTSEVEN2358', hints: ['The cutter needs three settings, in the order on the brass plate.', 'Combine your solved bearing, radio channel, and fuse order.', 'Bearing EAST, channel SEVEN, fuse order 2358. Enter EAST-SEVEN-2358.'] }
];
const evidence = {
  morse: { title: 'A call in the static', kind: 'TRANSMISSION', text: 'A strip of recorder tape reads: “... / . / ...- / . / -.” The groups have a short pause between each.' },
  decoder: { title: 'The signal card', kind: 'REFERENCE', text: 'Mara’s pocket card: ... = S   · = E   ...- = V   -. = N. A longer pause means the next letter.' },
  bearing: { title: 'Numbers in the margin', kind: 'CHART MARK', text: 'A grease-pencil note on the eastern coast: 5 — 1 — 19 — 20. “The cutter must know where the safe water is.”' },
  atlas: { title: 'The old atlas key', kind: 'REFERENCE', text: 'Inside the cover: “For the beacon charts, A is 1, B is 2, and each letter follows in order.”' },
  fuses: { title: 'Spare fuse tin', kind: 'INVENTORY', text: 'Four fuses were found, stamped 8, 2, 5, and 3. A chalk arrow says “load low to high.”' },
  loadnote: { title: 'Generator maintenance note', kind: 'ENGINEER’S NOTE', text: '“For an emergency restart, place backup fuses in ascending order. Enter the four values together; no spaces.”' },
  finalmessage: { title: 'Mara’s final transmission', kind: 'RECOVERED AUDIO', text: '“The cutter is close. Aim for the safe bearing. Call on the channel I sent. I left the fuse order beside the lens. Bring all three together and light the east water.”' },
  lensplate: { title: 'The lens controls', kind: 'FINAL CONTROL', text: 'Three brass slots are engraved: BEARING — CHANNEL — FUSE ORDER. The lighthouse will not turn until the complete sequence is entered.' }
};
const roleNames = ['Signal reader', 'Chart keeper', 'Mechanic', 'Case archivist'];

function makeRoom(code) {
  return { code, players: [], status: 'waiting', unlocked: ['radio'], found: [], solved: [], hintsUsed: Object.fromEntries(stages.map((s) => [s.id, 0])), hintsLeft: 8, attempts: Object.fromEntries(stages.map((s) => [s.id, 0])), chat: [], activity: [], updatedAt: Date.now() };
}
function log(room, text, type) {
  room.activity.unshift({ id: crypto.randomUUID(), text, type, at: Date.now() });
  room.activity = room.activity.slice(0, 40);
}
function snapshot(room) {
  return { code: room.code, players: room.players.map((p) => ({ id: p.id, name: p.name, role: p.role, color: p.color, online: Date.now() - p.lastSeen < 12000 })), status: room.status, unlocked: room.unlocked, found: room.found, solved: room.solved, hintsUsed: room.hintsUsed, hintsLeft: room.hintsLeft, attempts: room.attempts, revealedHints: Object.fromEntries(stages.map((s) => [s.id, s.hints.slice(0, room.hintsUsed[s.id])])), chat: room.chat, activity: room.activity, updatedAt: room.updatedAt };
}
function broadcast(room) {
  room.updatedAt = Date.now();
  const frame = 'data: ' + JSON.stringify(snapshot(room)) + '\n\n';
  for (const response of streams.get(room.code) || []) response.write(frame);
}
function send(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', (part) => { raw += part; if (raw.length > 8000) { reject(new Error('Request too large')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function cleanAnswer(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  if (url.pathname.startsWith('/api/')) {
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})(?:\/(events|leave))?$/i);
    if (!match) return send(res, 404, { error: 'Room not found.' });
    const code = match[1].toUpperCase(), endpoint = match[2];
    if (endpoint === 'events' && req.method === 'GET') {
      const room = rooms.get(code);
      if (!room) return send(res, 404, { error: 'That case has expired or does not exist.' });
      const player = room.players.find((p) => p.id === url.searchParams.get('player'));
      if (player) player.lastSeen = Date.now();
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('data: ' + JSON.stringify(snapshot(room)) + '\n\n');
      if (!streams.has(code)) streams.set(code, new Set());
      streams.get(code).add(res);
      const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20000);
      req.on('close', () => { clearInterval(heartbeat); streams.get(code)?.delete(res); });
      return;
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST for this action.' });
    let body;
    try { body = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    if (!endpoint && body.action === 'join') {
      const id = String(body.playerId || crypto.randomUUID()).slice(0, 80), name = String(body.name || 'Guest').trim().slice(0, 20) || 'Guest';
      let room = rooms.get(code);
      if (room && body.create) return send(res, 409, { error: 'That case code is already in use. Start a new case.' });
      if (!room && !body.create) return send(res, 404, { error: 'Case not found. Check the code and try again.' });
      if (!room) { room = makeRoom(code); rooms.set(code, room); }
      let player = room.players.find((p) => p.id === id);
      if (!player && room.players.length >= 4) return send(res, 409, { error: 'This investigation is full. A case supports up to four players.' });
      if (!player) {
        const seat = roleNames.findIndex((role) => !room.players.some((p) => p.role === role));
        player = { id, name, role: roleNames[seat], color: ['#ee7559', '#4cb5a0', '#dfbd59', '#8c7ccd'][seat], lastSeen: Date.now() };
        room.players.push(player); log(room, name + ' joined the investigation.', 'arrival');
      } else { player.name = name; player.lastSeen = Date.now(); }
      if (room.players.length >= 2 && room.status === 'waiting') { room.status = 'investigating'; log(room, 'The storm closes in. The case is open.', 'milestone'); }
      broadcast(room); return send(res, 200, { playerId: id, room: snapshot(room) });
    }
    const room = rooms.get(code);
    if (!room) return send(res, 404, { error: 'That case has expired or does not exist.' });
    const player = room.players.find((p) => p.id === body.playerId);
    if (!player) return send(res, 403, { error: 'You are not part of this investigation. Rejoin with your saved player name.' });
    player.lastSeen = Date.now();
    if (body.action === 'ping') { broadcast(room); return send(res, 200, { ok: true }); }
    if (endpoint === 'leave') {
      room.players = room.players.filter((p) => p.id !== player.id); log(room, player.name + ' left the investigation.', 'departure');
      if (!room.players.length) { rooms.delete(code); for (const stream of streams.get(code) || []) stream.end(); streams.delete(code); }
      else { if (room.players.length < 2 && room.status !== 'won') room.status = 'waiting'; broadcast(room); }
      return send(res, 200, { ok: true });
    }
    if (room.status === 'waiting') return send(res, 409, { error: 'Invite at least one teammate before opening the case.' });
    if (room.status === 'won') return send(res, 409, { error: 'The case is solved. Start a new case to play again.' });
    if (body.action === 'inspect') {
      const stage = stages.find((s) => s.id === body.stage);
      if (!stage || !room.unlocked.includes(stage.id)) return send(res, 409, { error: 'That location is still locked.' });
      if (!stage.clues.includes(body.clue) || !evidence[body.clue]) return send(res, 400, { error: 'That evidence is not at this location.' });
      if (!room.found.includes(body.clue)) { room.found.push(body.clue); log(room, player.name + ' uncovered “' + evidence[body.clue].title + '”.', 'discovery'); }
      broadcast(room); return send(res, 200, { room: snapshot(room) });
    }
    if (body.action === 'solve') {
      const stage = stages.find((s) => s.id === body.stage);
      if (!stage || !room.unlocked.includes(stage.id)) return send(res, 409, { error: 'That location is still locked.' });
      if (!stage.clues.every((id) => room.found.includes(id))) return send(res, 409, { error: 'Inspect every piece of evidence here before submitting an answer.' });
      if (cleanAnswer(body.answer) === stage.answer) {
        if (!room.solved.includes(stage.id)) {
          room.solved.push(stage.id); log(room, player.name + ' solved ' + stage.name + '.', 'solve');
          const next = stages[stages.findIndex((s) => s.id === stage.id) + 1];
          if (next) { room.unlocked.push(next.id); log(room, next.name + ' is now accessible.', 'unlock'); }
          else { room.status = 'won'; log(room, 'The lighthouse beam sweeps across the eastern water. The cutter is safe.', 'victory'); }
        }
        broadcast(room); return send(res, 200, { correct: true, room: snapshot(room) });
      }
      room.attempts[stage.id] += 1; log(room, player.name + ' tried an answer at ' + stage.name + '.', 'attempt'); broadcast(room);
      return send(res, 200, { correct: false, message: 'Not quite. Compare the evidence and try another answer.', room: snapshot(room) });
    }
    if (body.action === 'hint') {
      const stage = stages.find((s) => s.id === body.stage);
      if (!stage || !room.unlocked.includes(stage.id)) return send(res, 409, { error: 'That location is still locked.' });
      if (room.hintsUsed[stage.id] >= stage.hints.length) return send(res, 409, { error: 'All hints for this puzzle have been revealed.' });
      if (room.hintsLeft <= 0) return send(res, 409, { error: 'The team is out of insight. Discuss the evidence and compare notes.' });
      room.hintsUsed[stage.id] += 1; room.hintsLeft -= 1; log(room, player.name + ' revealed hint ' + room.hintsUsed[stage.id] + ' for ' + stage.name + '.', 'hint');
      broadcast(room); return send(res, 200, { room: snapshot(room) });
    }
    if (body.action === 'chat') {
      const message = String(body.message || '').trim().slice(0, 300);
      if (!message) return send(res, 400, { error: 'Write a message first.' });
      room.chat.push({ id: crypto.randomUUID(), playerId: player.id, name: player.name, text: message, at: Date.now() });
      room.chat = room.chat.slice(-60); broadcast(room); return send(res, 200, { room: snapshot(room) });
    }
    return send(res, 404, { error: 'That action is not available.' });
  }
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(ROOT, '.' + pathname);
  if (!target.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'Forbidden.' });
  fs.readFile(target, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' })[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(data);
  });
});
function handler(req, res) {
  server.emit('request', req, res);
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log('Signal at Blackwater running on port ' + PORT));
}

module.exports = { handler };
