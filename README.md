# Signal at Blackwater

A cooperative lighthouse mystery for 2–4 players. Investigators share a case room, discover evidence together, discuss theories in live team chat, reveal a limited pool of hints, and solve four linked puzzles to guide a cutter into safe water.

## Publish on Netlify

1. Extract `netlify-ready-game.zip` on your computer.
2. Sign in to Netlify and open the manual deploy page at [app.netlify.com/drop](https://app.netlify.com/drop).
3. Drag the extracted project folder (the one containing `netlify.toml` and `package.json`) onto the page.
4. Netlify installs the listed dependency, builds the frontend, and deploys the `game` Function. Netlify Blobs creates the shared case store automatically; no database or API key setup is needed.

Share the published site URL with your team. Create a case and share its six-character invite code or link. Each player needs their own browser storage to receive a separate investigator seat. The case opens when the second investigator arrives.

## Local development

Requires Node.js 20 or newer. Install the project dependencies and use the Netlify CLI to run the site locally, so the `/.netlify/functions/game` endpoint and Blobs integration are available. The deployed application uses the same direct function URL.

## How to play

1. Create a case and share the six-character invite code or link.
2. Two to four players join. The case opens when the second investigator arrives.
3. In each location, examine both evidence cards. Discoveries appear on every teammate’s board.
4. Discuss the evidence in Team Notes, then submit the shared answer to unlock the next location.
5. The team shares eight insight points. Reveal up to three hints per puzzle, spending one point per hint.
6. The first three puzzles score 100 team points each. Combine the radio channel, safe bearing, and fuse order in the Lantern Gallery to win.
