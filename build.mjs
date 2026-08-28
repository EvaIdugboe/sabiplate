import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = process.cwd();
const dist = path.join(root, 'dist');
const archivePath = path.join(root, 'source', 'site-source.tar.gz');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const archive = gunzipSync(await readFile(archivePath));
let offset = 0;
let extracted = 0;

while (offset + 512 <= archive.length) {
  const header = archive.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) break;

  const readString = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '').trim();
  const name = readString(0, 100);
  const prefix = readString(345, 155);
  const rawSize = readString(124, 12);
  const size = rawSize ? Number.parseInt(rawSize, 8) : 0;
  const type = String.fromCharCode(header[156] || 48);
  const relative = prefix ? `${prefix}/${name}` : name;
  const shouldExtract = relative === 'index.html' || relative.startsWith('assets/');

  if (!relative || relative.startsWith('/') || relative.split('/').includes('..')) {
    throw new Error(`Unsafe archive path: ${relative}`);
  }

  const dataStart = offset + 512;
  const dataEnd = dataStart + size;

  if (shouldExtract) {
    const target = path.join(dist, relative);
    if (type === '5') {
      await mkdir(target, { recursive: true });
    } else if (type === '0' || type === '\0') {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, archive.subarray(dataStart, dataEnd));
      extracted += 1;
    }
  }

  offset = dataStart + Math.ceil(size / 512) * 512;
}

if (!extracted) throw new Error('No SabiPlate files were extracted.');
console.log(`SabiPlate build ready: ${extracted} files extracted to dist/`);
