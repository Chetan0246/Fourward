import { getStore } from '@netlify/blobs';
import { createGameHandler } from '../../lib/netlify-handler.mjs';

export default async function game(request: Request): Promise<Response> {
  const store = getStore({ name: 'blackwater-cases', consistency: 'strong' });
  return createGameHandler(store)(request);
}
