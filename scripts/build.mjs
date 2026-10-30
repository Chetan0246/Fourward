import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('../dist/', import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css']) {
  await cp(new URL(file, root), new URL(file, output));
}
console.log('Production frontend built in dist/. Netlify packages netlify/functions/game.ts separately.');
