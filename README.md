# Signal at Blackwater

A cooperative lighthouse mystery for 2–4 players. Investigators share a case room, discover evidence together, discuss theories in live team chat, reveal a limited pool of hints, and solve four linked puzzles to guide a cutter into safe water.

## Run locally

Requires Node.js 20 or newer. Run `npm start` and open `http://localhost:3001`.

Open the same case link in separate browser profiles or on separate devices. Each player needs their own browser storage so they receive a separate investigator seat. At least two players are required to begin the investigation.

## Deploy on Vercel

Import this repository into Vercel with the **Other** framework preset. The root `vercel.json` routes `/api/*` requests to the Node function in `api/index.mjs`; the HTML, CSS, and browser JavaScript are served as static files.

Room state currently lives in server memory. This is suitable for local play and a first deployment preview, but serverless instances can restart or split players across instances. A persistent shared store is needed before relying on Vercel for long-running games.

## How to play

1. Create a case and share the six-character invite code or link.
2. Two to four players join. The case opens when the second investigator arrives.
3. In each location, examine both evidence cards. Discoveries appear on every teammate’s board.
4. Discuss the evidence in Team Notes, then submit the shared answer to unlock the next location.
5. The team shares eight insight points. Reveal up to three hints per puzzle, spending one point per hint.
6. Combine the radio channel, safe bearing, and fuse order in the Lantern Gallery to win.

Room data is held in memory for local play. Stopping or restarting the server ends active cases.

