import assert from 'node:assert/strict';
import { createGameHandler } from '../lib/netlify-handler.mjs';

class MemoryBlobs {
  entries = new Map();

  async getWithMetadata(key) {
    const entry = this.entries.get(key);
    return entry ? { data: structuredClone(entry.data), etag: entry.etag, metadata: {} } : null;
  }

  async setJSON(key, value, options = {}) {
    const current = this.entries.get(key);
    if (options.onlyIfNew && current) return { modified: false };
    if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = `"${(Number(current?.etag?.replace(/\D/g, '')) || 0) + 1}"`;
    this.entries.set(key, { data: structuredClone(value), etag });
    return { modified: true, etag };
  }
}

const store = new MemoryBlobs();
const handler = createGameHandler(store);
const code = 'TEST99';
const ada = 'player-ada';
const noor = 'player-noor';

async function post(playerId, action, fields = {}) {
  const request = new Request('https://local.test/.netlify/functions/game', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, playerId, action, ...fields })
  });
  const response = await handler(request);
  const data = await response.json();
  assert.ok(response.ok, `${action} failed (${response.status}): ${data.error || data.message || ''}`);
  return data;
}

async function inspectPair(stage, firstClue, secondClue) {
  const results = await Promise.all([
    post(ada, 'inspect', { stage, clue: firstClue }),
    post(noor, 'inspect', { stage, clue: secondClue })
  ]);
  assert.ok(results.every((result) => result.room));
}

await post(ada, 'join', { name: 'Ada', create: true });
const joined = await post(noor, 'join', { name: 'Noor', create: false });
assert.equal(joined.room.status, 'investigating', 'second player opens the case');
assert.equal(joined.room.players.length, 2);

const rounds = [
  { stage: 'radio', clues: ['morse', 'decoder'], answer: 'SEVEN' },
  { stage: 'chart', clues: ['bearing', 'atlas'], answer: 'EAST' },
  { stage: 'engine', clues: ['fuses', 'loadnote'], answer: '2358' }
];

for (const [index, round] of rounds.entries()) {
  await inspectPair(round.stage, round.clues[0], round.clues[1]);
  await post(index % 2 ? noor : ada, 'chat', { message: `Round ${index + 1}: clues are shared.` });
  const solved = await post(index % 2 ? ada : noor, 'solve', { stage: round.stage, answer: round.answer });
  assert.equal(solved.correct, true, `${round.stage} should solve`);
  assert.equal(solved.room.roundsCompleted, index + 1);
  assert.equal(solved.room.score, (index + 1) * 100);
}

const afterRounds = await (async () => {
  const response = await handler(new Request(`https://local.test/.netlify/functions/game?code=${code}&playerId=${ada}`));
  assert.ok(response.ok);
  return (await response.json()).room;
})();
assert.equal(afterRounds.roundsCompleted, 3, 'all three rounds should be recorded');
assert.equal(afterRounds.score, 300, 'three round wins should award 300 team points');
assert.equal(afterRounds.status, 'investigating', 'final sequence is a separate finale');

await inspectPair('lantern', 'finalmessage', 'lensplate');
const finale = await post(noor, 'solve', { stage: 'lantern', answer: 'EAST-SEVEN-2358' });
assert.equal(finale.correct, true);
assert.equal(finale.room.status, 'won');
assert.equal(finale.room.winner, 'The Blackwater Crew');
assert.equal(finale.room.score, 300, 'the finale does not alter the three-round score');
assert.deepEqual(finale.room.solved, ['radio', 'chart', 'engine', 'lantern']);

console.log('PASS: two players completed all three scored rounds and the lighthouse finale.');
console.log(`Rounds: ${finale.room.roundsCompleted}/3 | Team score: ${finale.room.score} | Winner: ${finale.room.winner}`);
