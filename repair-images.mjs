import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const dist = path.join(root, 'dist');
const recipesDir = path.join(dist, 'assets', 'recipes');
const indexPath = path.join(dist, 'index.html');
const imageVersion = '20260828-hq3';

const trustedCurrentIds = new Set([
  'chicken-stew-basmati-rice',
  'beef-suya-rice-plate',
  'chicken-suya-roasted-sweet-potato',
  'nigerian-tomato-spaghetti-grilled-chicken',
  'nigerian-egg-fried-rice-prawns',
  'efo-riro-grilled-fish-small-swallow',
  'oha-soup-turkey-small-swallow',
  'ogbono-lean-beef-small-swallow',
  'okra-soup-fish-small-swallow',
  'chicken-nsala-soup-boiled-yam',
  'edikang-ikong-grilled-chicken',
  'afang-soup-fish-small-swallow',
  'moi-moi-grilled-chicken-slaw',
  'akara-egg-breakfast-wrap',
  'adalu-grilled-fish',
  'yam-porridge-egg-spinach',
  'plantain-porridge-turkey',
  'white-rice-nigerian-chicken-curry',
  'rice-beans-tomato-stew-grilled-fish',
  'coconut-jollof-rice-turkey',
  'ofada-rice-lean-beef-ayamase',
  'grilled-croaker-oven-yam-wedges-pepper-sauce',
  'tilapia-pepper-stew-boiled-potatoes',
  'sardine-tomato-pasta',
  'chicken-shawarma-rice-bowl-new',
  'beef-shawarma-wrap-new',
  'grilled-chicken-wrap-cabbage-slaw',
  'tuna-sweetcorn-pasta',
  'baked-potato-chicken-sweetcorn',
  'chicken-curry-basmati-rice',
  'beef-stir-fry-noodles',
  'turkey-burger-oven-potato-wedges',
  'chicken-vegetable-couscous'
]);

const stopWords = new Set([
  'and', 'with', 'new', 'small', 'lean', 'plate', 'bowl', 'nigerian',
  'oven', 'boiled', 'grilled', 'roasted', 'fried', 'quick', 'easy'
]);
const allowedOpenverseLicenses = new Set(['cc0', 'pdm', 'by', 'by-sa']);
const usedUrls = new Set();
const credits = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function wordsFor(id) {
  return id.split('-').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

function meaningfulWords(id) {
  return wordsFor(id).filter((word) => !stopWords.has(word) && word.length > 2);
}

function queriesFor(id) {
  const all = wordsFor(id);
  const meaningful = meaningfulWords(id);
  const withoutNew = all.filter((word) => word !== 'new');
  const queries = [
    withoutNew.join(' '),
    meaningful.join(' '),
    `African ${meaningful.join(' ')}`,
    meaningful.slice(0, 4).join(' '),
    meaningful.slice(-4).join(' ')
  ].map((q) => q.replace(/\s+/g, ' ').trim()).filter((q) => q.length >= 3);
  return [...new Set(queries)];
}

function isHighResolution(width, height) {
  width = Number(width || 0);
  height = Number(height || 0);
  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);
  return minSide >= 720 && maxSide >= 1200 && width * height >= 1_000_000;
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'SabiPlate/1.0 image-quality-repair' }
    });
    if (response.status === 429) {
      const retryAfter = Math.min(5, Math.max(1, Number(response.headers.get('retry-after') || 2)));
      await sleep(retryAfter * 1000);
      throw new Error('rate limited');
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImage(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 SabiPlate image-quality-repair',
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (type && !type.startsWith('image/')) throw new Error(`not an image (${type})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 15000) throw new Error('image payload too small');
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

async function writeVerified(bytes, target) {
  const source = await sharp(bytes, { failOn: 'none' }).metadata();
  if (!isHighResolution(source.width, source.height)) {
    throw new Error(`source only ${source.width || '?'}x${source.height || '?'}`);
  }

  const processed = await sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize({
      width: 1800,
      height: 1800,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3
    })
    .modulate({ brightness: 1.008, saturation: 1.025 })
    .sharpen({ sigma: 0.5 })
    .webp({ quality: 93, effort: 5, smartSubsample: true })
    .toBuffer();

  const output = await sharp(processed).metadata();
  if (!isHighResolution(output.width, output.height)) {
    throw new Error(`processed image only ${output.width || '?'}x${output.height || '?'}`);
  }
  await writeFile(target, processed);
  return output;
}

function itemText(item) {
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => tag?.name || '').join(' ') : '';
  return `${item.title || ''} ${tags}`.toLowerCase();
}

function relevance(id, item) {
  const text = itemText(item);
  const wanted = meaningfulWords(id);
  let score = 0;
  for (const word of wanted) {
    if (text.includes(word)) score += word.length >= 6 ? 3 : 2;
  }
  if ((item.width || 0) >= 1600) score += 1;
  if ((item.height || 0) >= 1000) score += 1;
  if ((item.source || '').toLowerCase() === 'wikimedia') score += 0.5;
  return score;
}

async function openverseCandidates(id, query) {
  const endpoint = new URL('https://api.openverse.org/v1/images/');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('page_size', '30');
  endpoint.searchParams.set('filter_dead', 'true');
  endpoint.searchParams.set('mature', 'false');

  let data;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      data = await fetchJson(endpoint);
      break;
    } catch (error) {
      if (attempt === 1) return [];
      await sleep(700);
    }
  }

  return (data?.results || [])
    .filter((item) => item?.url && !item.mature)
    .filter((item) => allowedOpenverseLicenses.has(String(item.license || '').toLowerCase()))
    .filter((item) => !usedUrls.has(item.url))
    .filter((item) => !item.width || !item.height || isHighResolution(item.width, item.height))
    .map((item) => ({ ...item, _score: relevance(id, item) }))
    .filter((item) => item._score >= 2)
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);
}

async function tryOpenverse(id, target) {
  for (const query of queriesFor(id)) {
    const candidates = await openverseCandidates(id, query);
    for (const item of candidates) {
      try {
        const bytes = await fetchImage(item.url, 10000);
        await writeVerified(bytes, target);
        usedUrls.add(item.url);
        credits.push({
          recipe: id,
          title: item.title || id.replaceAll('-', ' '),
          creator: item.creator || 'Unknown',
          license: [item.license, item.license_version].filter(Boolean).join(' ').toUpperCase(),
          licenseUrl: item.license_url || '',
          sourceUrl: item.foreign_landing_url || item.url
        });
        return { ok: true, provider: 'Openverse', query };
      } catch {}
    }
  }
  return { ok: false };
}

async function commonsCandidates(id, query) {
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');
  endpoint.searchParams.set('generator', 'search');
  endpoint.searchParams.set('gsrsearch', query);
  endpoint.searchParams.set('gsrnamespace', '6');
  endpoint.searchParams.set('gsrlimit', '20');
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url|size|mime|extmetadata');

  let data;
  try {
    data = await fetchJson(endpoint);
  } catch {
    return [];
  }

  const wanted = meaningfulWords(id);
  return Object.values(data?.query?.pages || {})
    .map((page) => {
      const info = page?.imageinfo?.[0] || {};
      const title = String(page?.title || '').replace(/^File:/i, '');
      const text = title.toLowerCase();
      const score = wanted.reduce((sum, word) => sum + (text.includes(word) ? (word.length >= 6 ? 3 : 2) : 0), 0);
      return { page, info, title, score };
    })
    .filter(({ info }) => info.url && /^image\/(jpeg|png|webp)$/i.test(info.mime || ''))
    .filter(({ info }) => isHighResolution(info.width, info.height))
    .filter(({ info }) => !usedUrls.has(info.url))
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

async function tryCommons(id, target) {
  for (const query of queriesFor(id)) {
    const candidates = await commonsCandidates(id, query);
    for (const { page, info, title } of candidates) {
      try {
        const bytes = await fetchImage(info.url, 10000);
        await writeVerified(bytes, target);
        usedUrls.add(info.url);
        const metadata = info.extmetadata || {};
        credits.push({
          recipe: id,
          title,
          creator: String(metadata.Artist?.value || 'Wikimedia Commons contributor').replace(/<[^>]+>/g, ''),
          license: metadata.LicenseShortName?.value || 'Wikimedia Commons licence',
          licenseUrl: metadata.LicenseUrl?.value || '',
          sourceUrl: `https://commons.wikimedia.org/?curid=${page.pageid}`
        });
        return { ok: true, provider: 'Wikimedia Commons', query };
      } catch {}
    }
  }
  return { ok: false };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const recipeFiles = (await readdir(recipesDir)).filter((file) => file.endsWith('.webp')).sort();
const idsToRepair = recipeFiles
  .map((file) => file.replace(/\.webp$/i, ''))
  .filter((id) => !trustedCurrentIds.has(id));

console.log(`True-resolution repair pass: ${idsToRepair.length} recipe images require replacement; ${trustedCurrentIds.size} verified direct-source images are preserved.`);

let repaired = 0;
const unresolved = [];

for (let i = 0; i < idsToRepair.length; i += 3) {
  const batch = idsToRepair.slice(i, i + 3);
  const results = await Promise.all(batch.map(async (id) => {
    const target = path.join(recipesDir, `${id}.webp`);
    let result = await tryOpenverse(id, target);
    if (!result.ok) result = await tryCommons(id, target);
    return { id, ...result };
  }));

  for (const result of results) {
    if (result.ok) {
      repaired += 1;
      console.log(`HQ replacement ${repaired}/${idsToRepair.length}: ${result.id} via ${result.provider} (${result.query})`);
    } else {
      unresolved.push(result.id);
      console.warn(`No sufficiently relevant HQ source found for ${result.id}.`);
    }
  }
  if (i + 3 < idsToRepair.length) await sleep(250);
}

if (unresolved.length) {
  throw new Error(`Image-quality repair blocked deployment because ${unresolved.length} low-resolution recipe images still need true HQ sources: ${unresolved.join(', ')}`);
}

const dimensions = [];
for (const file of recipeFiles) {
  const meta = await sharp(path.join(recipesDir, file)).metadata();
  dimensions.push({ file, width: meta.width || 0, height: meta.height || 0 });
  if (!isHighResolution(meta.width, meta.height)) {
    throw new Error(`Image-quality gate failed for ${file}: ${meta.width || '?'}x${meta.height || '?'}`);
  }
}

if (credits.length) {
  const rows = credits
    .sort((a, b) => a.recipe.localeCompare(b.recipe))
    .map((credit) => `<li><strong>${escapeHtml(credit.recipe.replaceAll('-', ' '))}</strong>: ${escapeHtml(credit.title)} — ${escapeHtml(credit.creator)}${credit.license ? ` (${escapeHtml(credit.license)})` : ''}. <a href="${escapeHtml(credit.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>${credit.licenseUrl ? ` · <a href="${escapeHtml(credit.licenseUrl)}" target="_blank" rel="noopener noreferrer">Licence</a>` : ''}</li>`)
    .join('\n');

  const creditsHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SabiPlate food photo credits</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:920px;margin:0 auto;padding:32px 20px;line-height:1.55;color:#1f2933}h1{font-size:28px}li{margin:0 0 12px}a{color:#7a3d18}</style></head><body><h1>SabiPlate food photo credits</h1><p>Open-licensed photographs used in SabiPlate's high-resolution food image repair.</p><ol>${rows}</ol></body></html>`;
  await writeFile(path.join(dist, 'assets', 'image-credits.html'), creditsHtml);
}

let html = await readFile(indexPath, 'utf8');
html = html.replaceAll('20260828-hq1', imageVersion);
html = html.replaceAll('20260828-hq2', imageVersion);
html = html.replace(/(\.\/assets\/recipes\/[a-z0-9-]+\.webp)(?!\?)/g, `$1?v=${imageVersion}`);

const css = `
/* SabiPlate true-resolution image repair */
.recipe-img-wrap{overflow:hidden}
.recipe-img-wrap img,.modal-hero img{
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:center;
  image-rendering:auto;
  backface-visibility:hidden;
}
.recipe-img-wrap img{transform:none}
.recipe-img-wrap:hover img{transform:scale(1.015)}
.modal-hero img{transform:none}
@media (min-width:769px){.recipe-modal-card{max-width:900px}.modal-hero{height:390px}}
.sabiplate-photo-credits-link{
  display:block;width:max-content;max-width:calc(100% - 32px);margin:10px auto 24px;
  font-size:11px;line-height:1.4;color:#7a746e;text-decoration:none
}
.sabiplate-photo-credits-link:hover{text-decoration:underline}
`;
html = html.replace('</style>', `${css}</style>`);

if (credits.length && !html.includes('sabiplate-photo-credits-link')) {
  html = html.replace('</body>', `<a class="sabiplate-photo-credits-link" href="./assets/image-credits.html" target="_blank" rel="noopener noreferrer">Food photo credits</a></body>`);
}
await writeFile(indexPath, html);

const minPixels = dimensions.reduce((best, item) => (item.width * item.height < best.width * best.height ? item : best), dimensions[0]);
console.log(`True-resolution quality gate passed for all ${recipeFiles.length} recipe images.`);
console.log(`Replaced ${repaired} formerly upscaled local images with unique real HQ sources; preserved ${trustedCurrentIds.size} verified direct-source images.`);
console.log(`Smallest final recipe asset: ${minPixels.file} at ${minPixels.width}x${minPixels.height}. No low-resolution fallback is permitted to deploy.`);
