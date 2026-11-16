// Build order: unpack the archived app, then apply the current release patch.
// Release files are checked against known hashes so a damaged upload can never ship.
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BASE = 'https://raw.githubusercontent.com/EvaIdugboe/sabiplate/a101cf17139c644b963e03413635f514a22afaf3/';
const expected = {
  'release/engine.js': '6c53c87caa81bd5916aced6d6481621111a6b941c68684ec934e5ebe417291a0',
  'release/patch-release.mjs': 'd65e69bcc9870eb2b7ff3c0348855995b0083d1732cca79c58ab023932b7e0e3',
  'release/cookbook.js': 'e802f30ef069a21f00910512a740cddefbe921ebd04444837feda4d0035792a8',
  'release/household.css': '6e35262d74d2628abd3c9e45ebe838107da96a8e7fac3d7d0ad050e74e476e5d',
  'build.mjs': '4ec3f5394e5062a30c3d5c838f848eccf32f8d9a45e32cf058236390a9a9938f'
};
const NL = String.fromCharCode(10), CR = String.fromCharCode(13), DQ = String.fromCharCode(34);
const norm = (text) => text.split(CR).join('').split(NL).map((l) => l.trimEnd()).join(NL).trim();
const hash = (text) => createHash('sha256').update(norm(text)).digest('hex');
const exists = async (f) => { try { await access(f); return true; } catch { return false; } };

if (!(await exists('build.mjs'))) {
  const res = await fetch(BASE + 'build.mjs');
  if (!res.ok) throw new Error('Could not fetch build.mjs: ' + res.status);
  await writeFile('build.mjs', await res.text());
}
// Direct uploads carry release files as .txt with ~ standing in for double quotes.
for (const file of Object.keys(expected)) {
  if (await exists(file + '.txt')) await writeFile(file, (await readFile(file + '.txt', 'utf8')).split('~').join(DQ));
}
for (const [file, want] of Object.entries(expected)) {
  const got = hash(await readFile(file, 'utf8'));
  if (got !== want) {
    const lines = norm(await readFile(file, 'utf8')).split(NL).map((l, i) => (i + 1) + ':' + createHash('sha256').update(l).digest('hex').slice(0, 5));
    throw new Error('Integrity check failed for ' + file + ': ' + got + ' lines ' + lines.join(' '));
  }
}
await import('./build.mjs');
await import('./release/patch-release.mjs');
console.log('SabiPlate build complete.');
