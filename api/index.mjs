import storyServer from '../story-server.js';

export default function handler(req, res) {
  // vercel.json sends every /api/* request to this function and preserves the
  // original route in __route. Restore it so the local HTTP handler can route
  // room actions and EventSource connections exactly as it does on localhost.
  const incoming = new URL(req.url || '/', 'http://localhost');
  const route = incoming.searchParams.get('__route');
  if (route) {
    incoming.searchParams.delete('__route');
    req.url = `/api/${route}${incoming.search}`;
  }

  storyServer.handler(req, res);
}
