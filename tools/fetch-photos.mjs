// Finds real, reusable photographs for each dish on Wikimedia Commons (and Openverse as a
// second source), and builds numbered contact sheets so a person can pick by eye.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const UA = 'SabiPlatePhotoPicker/1.0 (https://sabiplate.vercel.app; github.com/EvaIdugboe/sabiplate)';
const queries = JSON.parse(await readFile('tools/photo-queries.json', 'utf8'));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const PER_DISH = Number(process.env.PER_DISH || 6), TW = 240, TH = 180, LABEL = 22;
const okLicence = (s) => /^(cc0|public domain|pd|pdm|cc[ -]by([ -]sa)?)( |$|-\d)/i.test(String(s || '').trim()) && !/nc|nd/i.test(String(s));
const strip = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
      return null;
    } catch { await sleep(1000 * (attempt + 1)); }
  }
  return null;
}
async function getBuffer(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      return null;
    } catch { await sleep(1000 * (attempt + 1)); }
  }
  return null;
}
async function commons(q) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch='
    + encodeURIComponent(q + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=500&iiextmetadatafilter=LicenseShortName|Artist';
  const j = await getJson(u);
  const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.map((p) => {
    const ii = p.imageinfo?.[0]; if (!ii) return null;
    return { source: 'commons', title: p.title, page: ii.descriptionurl, thumb: ii.thumburl, full: ii.url, w: ii.width, h: ii.height, mime: ii.mime,
      licence: strip(ii.extmetadata?.LicenseShortName?.value), artist: strip(ii.extmetadata?.Artist?.value) };
  }).filter(Boolean);
}
async function openverse(q) {
  const u = 'https://api.openverse.org/v1/images/?page_size=12&license=by,by-sa,cc0,pdm&q=' + encodeURIComponent(q);
  const j = await getJson(u);
  return (j?.results || []).map((r) => ({ source: 'openverse:' + r.source, title: strip(r.title), page: r.foreign_landing_url, thumb: r.thumbnail || r.url, full: r.url,
    w: r.width || 0, h: r.height || 0, mime: 'image/jpeg', licence: ('cc-' + r.license + ' ' + (r.license_version || '')).replace('cc-cc0', 'cc0').replace('cc-pdm', 'pdm').trim(), artist: strip(r.creator) }));
}
const usable = (c) => c && /jpe?g/i.test(c.mime) && c.w >= Number(process.env.MIN_W || 1000) && c.h >= Number(process.env.MIN_H || 650) && c.w / c.h >= 0.95 && c.w / c.h <= 2.1 && okLicence(c.licence) && c.thumb;

await mkdir('candidates', { recursive: true });
const result = {};
const rows = [];
async function doDish(id, qs) {
  const picked = [], seen = new Set();
  const add = (list) => { for (const c of list) { if (picked.length >= PER_DISH) break; if (!usable(c) || seen.has(c.full)) continue; seen.add(c.full); picked.push(c); } };
  try {
    for (const q of qs) { if (picked.length >= PER_DISH) break; add(await commons(q)); await sleep(150); }
    if (picked.length < PER_DISH) { for (const q of qs.slice(0, Number(process.env.OV_QUERIES || 2))) { if (picked.length >= PER_DISH) break; add(await openverse(q)); await sleep(400); } }
  } catch (e) { console.log('search failed', id, String(e)); }
  const tiles = [];
  for (const c of picked) {
    const buf = await getBuffer(c.thumb);
    let tile = null;
    if (buf) { try { tile = await sharp(buf).resize(TW, TH, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer(); } catch { tile = null; } }
    if (!tile) c.thumbFailed = true;
    tiles.push(tile);
    await sleep(80);
  }
  result[id] = picked.map((c, i) => ({ n: i + 1, ...c }));
  rowById[id] = { id, tiles };
  console.log(id, picked.length, picked.map((c) => c.source[0]).join(''));
}
const rowById = {};
const todo = Object.entries(queries).filter(([id]) => !only || only.has(id));
let cursor = 0;
await Promise.all([0, 1, 2].map(async () => { while (cursor < todo.length) { const [id, qs] = todo[cursor++]; try { await doDish(id, qs); } catch (e) { console.log('dish failed', id, String(e)); rowById[id] = { id, tiles: [] }; result[id] = result[id] || []; } } }));
for (const [id] of todo) rows.push(rowById[id] || { id, tiles: [] });
const perSheet = 10;
for (let s = 0; s * perSheet < rows.length; s++) {
  const chunk = rows.slice(s * perSheet, (s + 1) * perSheet);
  const comp = [];
  chunk.forEach((row, r) => {
    const y = r * (TH + LABEL);
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PER_DISH * TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#154d35"/><text x="6" y="16" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#fff">${row.id}</text></svg>`);
    comp.push({ input: label, left: 0, top: y });
    row.tiles.forEach((t, i) => { if (t) comp.push({ input: t, left: i * TW, top: y + LABEL }); });
  });
  await sharp({ create: { width: PER_DISH * TW, height: chunk.length * (TH + LABEL), channels: 3, background: '#dddddd' } })
    .composite(comp).jpeg({ quality: 72 }).toFile(`candidates/sheet-${String(s + 1).padStart(2, '0')}.jpg`);
}
let existing = {};
try { existing = JSON.parse(await readFile('candidates/candidates.json', 'utf8')); } catch {}
await writeFile('candidates/candidates.json', JSON.stringify({ ...existing, ...result }, null, 1));
console.log('dishes', rows.length, 'with >=1 candidate', rows.filter((r) => r.tiles.some(Boolean)).length);
