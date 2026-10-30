export const stages = [
  { id: 'radio', name: 'Radio shack', clues: ['morse', 'decoder'], answer: 'SEVEN', hints: ['Read each group of dots and dashes as one Morse letter.', 'The first group, ... , is S. The final groups spell V-E-N.', 'Say the decoded word aloud: S-E-V-E-N. Enter SEVEN.'] },
  { id: 'chart', name: 'Chart room', clues: ['bearing', 'atlas'], answer: 'EAST', hints: ['The four numbers each stand for a letter.', 'Use the atlas key A=1, B=2, and so on.', '5=E, 1=A, 19=S, 20=T. Enter EAST.'] },
  { id: 'engine', name: 'Engine room', clues: ['fuses', 'loadnote'], answer: '2358', hints: ['The fuse values are out of order. Sort them.', 'Arrange the four values from smallest to largest.', 'The order is 2, 3, 5, 8. Enter 2358.'] },
  { id: 'lantern', name: 'Lantern gallery', clues: ['finalmessage', 'lensplate'], answer: 'EASTSEVEN2358', hints: ['The cutter needs three settings, in the order on the brass plate.', 'Combine your solved bearing, radio channel, and fuse order.', 'Bearing EAST, channel SEVEN, fuse order 2358. Enter EAST-SEVEN-2358.'] }
];

export const evidence = {
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
const roleColors = ['#ee7559', '#4cb5a0', '#dfbd59', '#8c7ccd'];

export function makeRoom(code) {
  return {
    code,
    players: [],
    status: 'waiting',
    unlocked: ['radio'],
    found: [],
    solved: [],
    hintsUsed: Object.fromEntries(stages.map((stage) => [stage.id, 0])),
    hintsLeft: 8,
    attempts: Object.fromEntries(stages.map((stage) => [stage.id, 0])),
    roundsCompleted: 0,
    score: 0,
    winner: null,
    chat: [],
    activity: [],
    updatedAt: Date.now()
  };
}

function log(room, text, type) {
  room.activity.unshift({ id: crypto.randomUUID(), text, type, at: Date.now() });
  room.activity = room.activity.slice(0, 40);
}

export function snapshot(room, now = Date.now()) {
  return {
    code: room.code,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
      color: player.color,
      online: now - player.lastSeen < 12000
    })),
    status: room.status,
    unlocked: room.unlocked,
    found: room.found,
    solved: room.solved,
    hintsUsed: room.hintsUsed,
    hintsLeft: room.hintsLeft,
    attempts: room.attempts,
    roundsCompleted: room.roundsCompleted,
    score: room.score,
    winner: room.winner,
    revealedHints: Object.fromEntries(stages.map((stage) => [stage.id, stage.hints.slice(0, room.hintsUsed[stage.id])])),
    chat: room.chat,
    activity: room.activity,
    updatedAt: room.updatedAt
  };
}

export function cleanAnswer(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function applyAction(room, body, now = Date.now()) {
  const { action } = body;
  const playerId = String(body.playerId || '').slice(0, 80);
  const name = String(body.name || 'Guest').trim().slice(0, 20) || 'Guest';

  if (action === 'join') {
    let player = room.players.find((item) => item.id === playerId);
    if (!player && room.players.length >= 4) return { status: 409, error: 'This investigation is full. A case supports up to four players.' };
    if (!player) {
      const seat = roleNames.findIndex((role) => !room.players.some((item) => item.role === role));
      player = { id: playerId, name, role: roleNames[seat], color: roleColors[seat], lastSeen: now };
      room.players.push(player);
      log(room, name + ' joined the investigation.', 'arrival');
    } else {
      player.name = name;
      player.lastSeen = now;
    }
    if (room.players.length >= 2 && room.status === 'waiting') {
      room.status = 'investigating';
      log(room, 'The storm closes in. The case is open.', 'milestone');
    }
    room.updatedAt = now;
    return { status: 200, body: { playerId, room: snapshot(room, now) } };
  }

  const player = room.players.find((item) => item.id === playerId);
  if (!player) return { status: 403, error: 'You are not part of this investigation. Rejoin with your saved player name.' };
  player.lastSeen = now;

  if (action === 'ping') {
    room.updatedAt = now;
    return { status: 200, body: { ok: true, room: snapshot(room, now) } };
  }
  if (action === 'leave') {
    room.players = room.players.filter((item) => item.id !== player.id);
    log(room, player.name + ' left the investigation.', 'departure');
    if (room.players.length < 2 && room.status !== 'won') room.status = 'waiting';
    room.updatedAt = now;
    return { status: 200, body: { ok: true, room: snapshot(room, now) } };
  }
  if (room.status === 'waiting') return { status: 409, error: 'Invite at least one teammate before opening the case.' };
  if (room.status === 'won') return { status: 409, error: 'The case is solved. Start a new case to play again.' };

  if (action === 'inspect') {
    const stage = stages.find((item) => item.id === body.stage);
    if (!stage || !room.unlocked.includes(stage.id)) return { status: 409, error: 'That location is still locked.' };
    if (!stage.clues.includes(body.clue) || !evidence[body.clue]) return { status: 400, error: 'That evidence is not at this location.' };
    if (!room.found.includes(body.clue)) {
      room.found.push(body.clue);
      log(room, player.name + ' uncovered “' + evidence[body.clue].title + '”.', 'discovery');
    }
    room.updatedAt = now;
    return { status: 200, body: { room: snapshot(room, now) } };
  }

  if (action === 'solve') {
    const stageIndex = stages.findIndex((item) => item.id === body.stage);
    const stage = stages[stageIndex];
    if (!stage || !room.unlocked.includes(stage.id)) return { status: 409, error: 'That location is still locked.' };
    if (!stage.clues.every((id) => room.found.includes(id))) return { status: 409, error: 'Inspect every piece of evidence here before submitting an answer.' };
    if (cleanAnswer(body.answer) !== stage.answer) {
      room.attempts[stage.id] += 1;
      log(room, player.name + ' tried an answer at ' + stage.name + '.', 'attempt');
      room.updatedAt = now;
      return { status: 200, body: { correct: false, message: 'Not quite. Compare the evidence and try another answer.', room: snapshot(room, now) } };
    }
    if (!room.solved.includes(stage.id)) {
      room.solved.push(stage.id);
      log(room, player.name + ' solved ' + stage.name + '.', 'solve');
      if (stageIndex < 3) {
        room.roundsCompleted = Math.min(3, room.roundsCompleted + 1);
        room.score += 100;
      }
      const next = stages[stageIndex + 1];
      if (next) {
        room.unlocked.push(next.id);
        log(room, next.name + ' is now accessible.', 'unlock');
      } else {
        room.status = 'won';
        room.winner = 'The Blackwater Crew';
        log(room, 'The lighthouse beam sweeps across the eastern water. The cutter is safe.', 'victory');
      }
    }
    room.updatedAt = now;
    return { status: 200, body: { correct: true, room: snapshot(room, now) } };
  }

  if (action === 'hint') {
    const stage = stages.find((item) => item.id === body.stage);
    if (!stage || !room.unlocked.includes(stage.id)) return { status: 409, error: 'That location is still locked.' };
    if (room.hintsUsed[stage.id] >= stage.hints.length) return { status: 409, error: 'All hints for this puzzle have been revealed.' };
    if (room.hintsLeft <= 0) return { status: 409, error: 'The team is out of insight. Discuss the evidence and compare notes.' };
    room.hintsUsed[stage.id] += 1;
    room.hintsLeft -= 1;
    log(room, player.name + ' revealed hint ' + room.hintsUsed[stage.id] + ' for ' + stage.name + '.', 'hint');
    room.updatedAt = now;
    return { status: 200, body: { room: snapshot(room, now) } };
  }

  if (action === 'chat') {
    const message = String(body.message || '').trim().slice(0, 300);
    if (!message) return { status: 400, error: 'Write a message first.' };
    room.chat.push({ id: crypto.randomUUID(), playerId: player.id, name: player.name, text: message, at: now });
    room.chat = room.chat.slice(-60);
    room.updatedAt = now;
    return { status: 200, body: { room: snapshot(room, now) } };
  }

  return { status: 404, error: 'That action is not available.' };
}
