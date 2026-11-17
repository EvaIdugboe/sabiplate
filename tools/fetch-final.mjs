// Downloads the hand-picked photographs, crops them to 4:3 without enlarging, and records credits.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const UA = 'SabiPlatePhotoPicker/1.0 (https://sabiplate.vercel.app; github.com/EvaIdugboe/sabiplate)';
const cands = JSON.parse(await readFile('candidates/candidates.json', 'utf8'));
const picks = JSON.parse(await readFile('tools/photo-picks.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, json) {
  for (let a = 0; a < 5; a++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return json ? await res.json() : Buffer.from(await res.arrayBuffer());
      if (res.status === 429 || res.status >= 500) { await sleep(2500 * (a + 1)); continue; }
      console.log('http', res.status, url.slice(0, 100)); return null;
    } catch { await sleep(1500 * (a + 1)); }
  }
  return null;
}
await mkdir('final/recipes', { recursive: true });
const credits = [];
for (const [id, pick] of Object.entries(picks)) {
  const c = (cands[pick.from || id] || [])[pick.n - 1];
  if (!c) { console.log('missing candidate', id); continue; }
  let url = c.full;
  if (c.source === 'commons') {
    const j = await get('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&iiurlwidth=1280&titles=' + encodeURIComponent(c.title), true);
    const ii = Object.values(j?.query?.pages || {})[0]?.imageinfo?.[0];
    if (ii?.thumburl) url = ii.thumburl;
  }
  const buf = await get(url, false);
  if (!buf) { console.log('download failed', id); continue; }
  try {
    const meta = await sharp(buf).rotate().metadata();
    const w = Math.min(960, meta.width || 960), h = Math.round(w * 3 / 4);
    await sharp(buf).rotate().resize(w, h, { fit: 'cover', position: pick.pos || 'attention', withoutEnlargement: true }).webp({ quality: 80 }).toFile(`final/recipes/${id}.webp`);
    credits.push({ id, title: c.title.replace(/^File:/, ''), artist: c.artist || 'Unknown', licence: c.licence, page: c.page, source: c.source.split(':')[0], width: w, height: h });
    console.log('ok', id, w + 'x' + h);
  } catch (e) { console.log('image failed', id, String(e)); }
  await sleep(250);
}
await writeFile('final/credits.json', JSON.stringify(credits, null, 1));
console.log('photos', credits.length, 'of', Object.keys(picks).length);
