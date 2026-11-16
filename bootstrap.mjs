// Build order: unpack the archived app, then apply the current release patch.
// Release files are checked against known hashes so a damaged upload can never ship.
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BASE = 'https://raw.githubusercontent.com/EvaIdugboe/sabiplate/a101cf17139c644b963e03413635f514a22afaf3/';
const expected = {
  "build.mjs": "4ec3f5394e5062a30c3d5c838f848eccf32f8d9a45e32cf058236390a9a9938f",
  "release/engine.js": "2489cb595fb3fdd68bc737eb5e1378c622ca2b78a56ba2ecbf8df9daec885012",
  "release/patch-release.mjs": "1c49f5fbfb790835a0a0c09a115dfb1c2a7846abb6f87192c5e80741e3e2c6c8",
  "release/cookbook.js": "e802f30ef069a21f00910512a740cddefbe921ebd04444837feda4d0035792a8",
  "release/household.css": "6e35262d74d2628abd3c9e45ebe838107da96a8e7fac3d7d0ad050e74e476e5d"
};
const norm = (text) => text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim();
const hash = (text) => createHash('sha256').update(norm(text)).digest('hex');

try { await access('build.mjs'); } catch {
  const res = await fetch(BASE + 'build.mjs');
  if (!res.ok) throw new Error('Could not fetch build.mjs: ' + res.status);
  await writeFile('build.mjs', await res.text());
}
for (const [file, want] of Object.entries(expected)) {
  const got = hash(await readFile(file, 'utf8'));
  if (got !== want) throw new Error('Integrity check failed for ' + file + ': ' + got);
}
await import('./build.mjs');
await import('./release/patch-release.mjs');
console.log('SabiPlate build complete.');
