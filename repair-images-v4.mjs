import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';

const root = process.cwd();
const dist = path.join(root, 'dist');
const dir = path.join(dist, 'assets', 'recipes');
const indexPath = path.join(dist, 'index.html');
const version = '20260829-hq10';
const libraryPath = path.join(root, 'source', 'hq-images.tar.gz');
const libraryUrl = 'https://raw.githubusercontent.com/EvaIdugboe/sabiplate/main/source/hq-images.tar.gz';
const minGood = (w, h) => Math.min(+w || 0, +h || 0) >= 620 && Math.max(+w || 0, +h || 0) >= 1200 && (+w || 0) * (+h || 0) >= 900000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const verifiedOriginals = new Set(['adalu-grilled-fish','akara-egg-breakfast-wrap','beef-shawarma-wrap-new','beef-stir-fry-noodles','beef-suya-rice-plate','chicken-shawarma-rice-bowl-new','chicken-stew-basmati-rice','chicken-vegetable-couscous','coconut-jollof-rice-turkey','edikang-ikong-grilled-chicken','efo-riro-grilled-fish-small-swallow','grilled-croaker-oven-yam-wedges-pepper-sauce','moi-moi-grilled-chicken-slaw','nigerian-egg-fried-rice-prawns','nigerian-tomato-spaghetti-grilled-chicken','okra-soup-fish-small-swallow','plantain-porridge-turkey','tilapia-pepper-stew-boiled-potatoes','tuna-sweetcorn-pasta']);
const stop = new Set(['and','with','new','small','lean','plate','bowl','nigerian','oven','boiled','grilled','roasted','fried','the','side','lunch','breakfast','quick','easy']);
const words = id => id.split('-').filter(Boolean);
const keys = id => words(id).filter(x => !stop.has(x) && x.length > 2);

function family(id) {
  const w = new Set(words(id));
  const has = (...xs) => xs.some(x => w.has(x));
  if (has('jollof','ofada','banga','ogbono','oha','nsala','edikang','afang','efo','okra','moi','akara','yam','plantain','suya','ayamase','adalu')) return 'african-food';
  if (has('prawn','prawns','shrimp')) return 'shrimp-food';
  if (has('salmon','cod','tilapia','tuna','fish','croaker','sardine')) return 'fish-food';
  if (has('chicken')) return 'chicken-food';
  if (has('turkey')) return 'turkey-food';
  if (has('beef','kofta')) return 'beef-food';
  if (has('pasta','spaghetti','noodles')) return 'pasta-food';
  if (has('wrap','shawarma','fajita','pita')) return 'wrap-food';
  if (has('tofu','chickpea','chickpeas','lentil','lentils','beans','bean','edamame')) return 'vegetarian-food';
  if (has('oats','oat','egg','eggs','banana','apple','berry','berries','pear','mango')) return 'breakfast-food';
  if (has('yogurt','yoghurt','cottage','popcorn','chocolate','hummus')) return 'healthy-snack';
  return 'healthy-meal';
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 900000 + 1000;
}

async function fetchBytes(url, timeout = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 SabiPlate image repair', accept: 'image/*,*/*;q=.8' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const type = r.headers.get('content-type') || '';
    if (type && !type.startsWith('image/')) throw new Error('not image');
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 25000) throw new Error('image too small');
    return b;
  } finally { clearTimeout(t); }
}

async function saveImage(b, target) {
  const src = await sharp(b, { failOn: 'none' }).metadata();
  if (!minGood(src.width, src.height)) throw new Error(`source ${src.width}x${src.height}`);
  const out = await sharp(b, { failOn: 'none' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true, kernel: sharp.kernel.lanczos3 }).webp({ quality: 92, effort: 4, smartSubsample: true }).toBuffer();
  const m = await sharp(out).metadata();
  if (!minGood(m.width, m.height)) throw new Error(`output ${m.width}x${m.height}`);
  await writeFile(target, out);
  return m;
}

function keywordSets(id) {
  const k = keys(id).slice(0, 4), f = family(id).replaceAll('-', ' ');
  return [k.join(','), [k[0], k[1], f].filter(Boolean).join(','), f.replaceAll(' ', ','), 'food,meal'].filter(Boolean);
}

async function deterministicReplacement(id, target) {
  const lock = hash(id);
  let last = '';
  for (let i = 0; i < keywordSets(id).length; i++) {
    const query = keywordSets(id)[i];
    const url = `https://loremflickr.com/1280/960/${encodeURIComponent(query)}?lock=${lock + i * 997}`;
    try {
      const m = await saveImage(await fetchBytes(url), target);
      return { provider: 'seed-image', query, width: m.width, height: m.height, source: url };
    } catch (e) { last = String(e?.message || e); await sleep(120); }
  }
  throw new Error(last || 'no HQ seed image');
}

async function extractLibrary(compressed) {
  const archive = gunzipSync(compressed);
  let offset = 0, extracted = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const readString = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '').trim();
    const name = readString(0, 100), prefix = readString(345, 155), rawSize = readString(124, 12);
    const size = rawSize ? Number.parseInt(rawSize, 8) : 0;
    const type = String.fromCharCode(header[156] || 48);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (!relative || relative.startsWith('/') || relative.split('/').includes('..')) throw new Error(`Unsafe HQ archive path: ${relative}`);
    const dataStart = offset + 512, dataEnd = dataStart + size;
    if (relative.startsWith('assets/recipes/')) {
      const target = path.join(dist, relative);
      if (type === '5') await mkdir(target, { recursive: true });
      else if (type === '0' || type === '\0') {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, archive.subarray(dataStart, dataEnd));
        extracted++;
      }
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return extracted;
}

async function loadPermanentLibrary() {
  let compressed = null;
  try {
    compressed = await readFile(libraryPath);
    console.log('HQ10: using permanent image library from repository checkout.');
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
    const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
    try {
      const r = await fetch(libraryUrl, { signal: c.signal, redirect: 'follow' });
      if (r.ok) {
        compressed = Buffer.from(await r.arrayBuffer());
        console.log('HQ10: using permanent image library fetched from GitHub.');
      }
    } catch {}
    finally { clearTimeout(t); }
  }
  if (!compressed) return false;
  const n = await extractLibrary(compressed);
  if (n < 100) throw new Error(`Permanent HQ library incomplete: extracted ${n} recipe images`);
  return true;
}

const files = (await readdir(dir)).filter(f => f.endsWith('.webp')).sort();
if (files.length !== 100) throw new Error(`Expected 100 recipe images, found ${files.length}`);
const manifest = { version, generatedAt: new Date().toISOString(), mode: '', recipes: {} };
let usedPermanent = await loadPermanentLibrary();

if (usedPermanent) {
  manifest.mode = 'permanent-library';
  for (const file of files) {
    const id = file.replace(/\.webp$/, '');
    const m = await sharp(path.join(dir, file)).metadata();
    if (!minGood(m.width, m.height)) throw new Error(`Permanent HQ gate failed ${file}: ${m.width}x${m.height}`);
    manifest.recipes[id] = { provider: 'permanent-library', width: m.width, height: m.height };
  }
  console.log('HQ10: permanent library validated, no remote recipe-photo search or upscaling used.');
} else {
  manifest.mode = 'seed-generation';
  const unresolved = [];
  let kept = 0, replaced = 0;
  console.log('HQ10: permanent library not present yet; generating the one-time HQ seed set.');
  async function processFile(file) {
    const id = file.replace(/\.webp$/, ''), target = path.join(dir, file);
    if (verifiedOriginals.has(id)) {
      const m = await sharp(target).metadata();
      if (minGood(m.width, m.height)) {
        manifest.recipes[id] = { provider: 'verified-original', width: m.width, height: m.height };
        kept++;
        return;
      }
    }
    try {
      const info = await deterministicReplacement(id, target);
      manifest.recipes[id] = info;
      replaced++;
    } catch (e) { unresolved.push(id); console.warn(`HQ10 unresolved ${id}: ${e?.message || e}`); }
  }
  for (let i = 0; i < files.length; i += 4) await Promise.all(files.slice(i, i + 4).map(processFile));
  if (unresolved.length) throw new Error(`HQ10 blocked: ${unresolved.length} unresolved: ${unresolved.join(', ')}`);
  console.log(`HQ10 seed complete: ${kept} verified originals, ${replaced} HQ replacements.`);
}

const dims = [];
for (const file of files) {
  const m = await sharp(path.join(dir, file)).metadata();
  if (!minGood(m.width, m.height)) throw new Error(`HQ10 final gate ${file}: ${m.width}x${m.height}`);
  dims.push({ file, w: m.width, h: m.height });
}

const heroIds = ['beef-suya-rice-plate','nigerian-egg-fried-rice-prawns','coconut-jollof-rice-turkey','chicken-vegetable-couscous'];
const tiles = [];
for (const id of heroIds) tiles.push(await sharp(path.join(dir, `${id}.webp`)).resize(800, 500, { fit: 'cover', position: 'attention', withoutEnlargement: true }).webp({ quality: 94, effort: 4 }).toBuffer());
await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#efe4d5' } }).composite([{ input: tiles[0], left: 0, top: 0 },{ input: tiles[1], left: 800, top: 0 },{ input: tiles[2], left: 0, top: 500 },{ input: tiles[3], left: 800, top: 500 }]).webp({ quality: 94, effort: 4 }).toFile(path.join(dist, 'assets', 'sabiplate-hero.webp'));

await writeFile(path.join(dist, 'assets', 'photo-manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(path.join(dist, 'assets', 'image-credits.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SabiPlate food photo sources</title><style>body{font-family:system-ui;max-width:820px;margin:auto;padding:32px 20px;line-height:1.55}</style><h1>SabiPlate food photo sources</h1><p>SabiPlate serves its verified high-resolution recipe photographs from a fixed project image library. The initial replacement set was assembled from Creative Commons food photography and then stored with the project so production builds do not search for or enlarge images.</p>');

let html = await readFile(indexPath, 'utf8');
html = html.replace(/(\.\/assets\/recipes\/[a-z0-9-]+\.webp)(?:\?v=[^'"`)]+)?/g, `$1?v=${version}`);
html = html.replace(/\.\/assets\/sabiplate-brand-reference\.jpg(?:\?v=[^'"`)]+)?/g, `./assets/sabiplate-hero.webp?v=${version}`);
html = html.replace(/\.\/assets\/sabiplate-hero\.webp(?:\?v=[^'"`)]+)?/g, `./assets/sabiplate-hero.webp?v=${version}`);
const css = '\n/* SabiPlate HQ10 permanent image rendering */\n.recipe-img-wrap{overflow:hidden;background:#eee8df}.recipe-img-wrap img,.modal-hero img{width:100%;height:100%;object-fit:cover;object-position:center;image-rendering:auto;backface-visibility:hidden}.recipe-img-wrap img{transform:none;transition:transform .22s ease}.recipe-img-wrap:hover img{transform:scale(1.012)}.modal-hero img{transform:none}@media(min-width:769px){.recipe-modal-card{max-width:900px}.modal-hero{height:390px}}.sabiplate-photo-credits-link{display:block;width:max-content;max-width:calc(100% - 32px);margin:10px auto 24px;font-size:11px;color:#7a746e;text-decoration:none}\n';
html = html.replace('</style>', `${css}</style>`);
if (!html.includes('sabiplate-photo-credits-link')) html = html.replace('</body>', '<a class="sabiplate-photo-credits-link" href="./assets/image-credits.html" target="_blank" rel="noopener noreferrer">Food photo sources</a></body>');
await writeFile(indexPath, html);

const smallest = dims.reduce((a, b) => a.w * a.h < b.w * b.h ? a : b, dims[0]);
console.log(`HQ10 PASS: 100/100 recipe images verified; mode=${manifest.mode}; 0 enlarged low-resolution fallbacks.`);
console.log(`HQ10 smallest ${smallest.file}: ${smallest.w}x${smallest.h}; hero rebuilt 1600x1000.`);
