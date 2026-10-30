import { applyAction, makeRoom, snapshot } from './game-engine.mjs';

const codePattern = /^[A-Z0-9]{6}$/;
const roomKey = (code) => `room:${code}`;
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

async function readRoom(store, code) {
  return store.getWithMetadata(roomKey(code), { type: 'json', consistency: 'strong' });
}

async function updateRoom(store, code, operation, allowCreate = false) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const entry = await readRoom(store, code);
    if (!entry) {
      if (!allowCreate) return { status: 404, error: 'Case not found. Check the code and try again.' };
      const initial = makeRoom(code);
      const outcome = operation(initial, true);
      if (!outcome.changed) return outcome;
      const write = await store.setJSON(roomKey(code), initial, { onlyIfNew: true });
      if (write.modified) return outcome;
      continue;
    }

    const room = structuredClone(entry.data);
    const outcome = operation(room, false);
    if (!outcome.changed) return outcome;
    const write = await store.setJSON(roomKey(code), room, { onlyIfMatch: entry.etag });
    if (write.modified) return outcome;
  }
  return { status: 503, error: 'The case changed at the same time. Please try that action again.' };
}

function invalidCode(code) {
  return typeof code !== 'string' || !codePattern.test(code);
}

export function createGameHandler(store) {
  return async function handleGameRequest(request) {
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const code = (url.searchParams.get('code') || '').toUpperCase();
        const playerId = url.searchParams.get('playerId') || '';
        if (invalidCode(code)) return response({ error: 'Enter the six-letter case code.' }, 400);
        const entry = await readRoom(store, code);
        if (!entry) return response({ error: 'Case not found. Check the code and try again.' }, 404);
        if (!entry.data.players.some((player) => player.id === playerId)) {
          return response({ error: 'You are not part of this investigation. Rejoin with your saved player name.' }, 403);
        }
        return response({ room: snapshot(entry.data) });
      }

      if (request.method !== 'POST') return response({ error: 'Use GET or POST for this action.' }, 405);
      const body = await request.json();
      const code = String(body.code || '').toUpperCase();
      if (invalidCode(code)) return response({ error: 'Enter the six-letter case code.' }, 400);
      const create = body.action === 'join' && body.create === true;
      const outcome = await updateRoom(store, code, (room, isNew) => {
        if (create && !isNew) return { changed: false, status: 409, error: 'That case code is already in use. Start a new case.' };
        const result = applyAction(room, body);
        return { ...result, changed: result.status === 200 };
      }, create);
      const { changed, ...result } = outcome;
      return response(result.body || { error: result.error }, result.status || 500);
    } catch (error) {
      console.error('Game function failed:', error);
      return response({ error: 'The case service is temporarily unavailable. Please try again.' }, 500);
    }
  };
}
