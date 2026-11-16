// Release 2026-11-17: household engine, SabiPlate cover art, cookbook copy.
// Applied to dist/ after build.mjs has unpacked the archived source.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const dist = path.join(root, 'dist');
const version = '20261117-r1';
const indexPath = path.join(dist, 'index.html');
let html = await readFile(indexPath, 'utf8');

function replaceOnce(label, from, to) {
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly 1 match, found ${count}`);
  html = html.replace(from, () => to);
}

// 1. Household engine replaces the fixed two-person code that follows the plan data.
const engine = await readFile(path.join(root, 'release', 'engine.js'), 'utf8');
const scriptStart = html.indexOf('<script id="sabiplate-v15-engine">');
const codeStart = html.indexOf('const dbg=window.SABI_DEBUG;if(!dbg)return;', scriptStart);
const scriptEnd = html.indexOf('</script>', scriptStart);
if (scriptStart < 0 || codeStart < 0 || scriptEnd < 0) throw new Error('Could not locate the plan engine block.');
html = html.slice(0, codeStart) + engine.trim().replace(/^;/, '') + html.slice(scriptEnd);

// 2. Cover art. Tiles are used at native size, never enlarged.
const tileIds = ['jollof-rice-with-grilled-chicken', 'grilled-salmon-rice-bowl', 'moi-moi-boiled-egg', 'chicken-shawarma-wrap'];
const tiles = [];
for (const id of tileIds) {
  const input = await readFile(path.join(dist, 'assets', 'recipes', `${id}.webp`));
  tiles.push(await sharp(input).resize({ width: 480, height: 360, fit: 'cover', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer());
}
await sharp({ create: { width: 960, height: 720, channels: 3, background: '#f4eadc' } })
  .composite([{ input: tiles[0], left: 0, top: 0 }, { input: tiles[1], left: 480, top: 0 }, { input: tiles[2], left: 0, top: 360 }, { input: tiles[3], left: 480, top: 360 }])
  .jpeg({ quality: 90 }).toFile(path.join(dist, 'assets', 'hero-wide.jpg'));

const coverSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">
  <rect width="1200" height="1600" fill="#f4eadc"/>
  <rect x="28" y="28" width="1144" height="1544" rx="36" fill="#fffaf3" stroke="#d7c3aa" stroke-width="3"/>
  <g text-anchor="middle">
    <text x="600" y="250" font-family="Georgia, serif" font-size="150" font-weight="700" fill="#154d35">SabiPlate</text>
    <text x="600" y="345" font-family="Georgia, serif" font-size="54" font-style="italic" fill="#c76845">Know your food. Own your goals.</text>
    <line x1="220" y1="410" x2="980" y2="410" stroke="#c76845" stroke-width="5"/>
    <text x="600" y="485" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#154d35">NIGERIAN + GLOBAL RECIPES</text>
    <text x="600" y="532" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#154d35">MEAL PLANS &amp; MEAL PREP</text>
  </g>
  <rect x="28" y="1490" width="1144" height="82" fill="#154d35"/>
  <text x="600" y="1542" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="2" fill="#f8efe4">SAME FOOD. DIFFERENT GOALS.</text>
</svg>`);
await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#f4eadc' } })
  .composite([{ input: coverSvg, left: 0, top: 0 }, { input: tiles[0], left: 95, top: 640 }, { input: tiles[1], left: 625, top: 640 }, { input: tiles[2], left: 95, top: 1040 }, { input: tiles[3], left: 625, top: 1040 }])
  .jpeg({ quality: 92 }).toFile(path.join(dist, 'assets', 'cookbook-cover.jpg'));

const oldCover = './assets/sabiplate-brand-reference.jpg';
const coverParts = html.split(oldCover);
if (coverParts.length !== 3) throw new Error(`Expected 2 cover references, found ${coverParts.length - 1}`);
html = coverParts[0] + `./assets/hero-wide.jpg?v=${version}` + coverParts[1] + `./assets/cookbook-cover.jpg?v=${version}` + coverParts[2];

// 3. Cookbook page: collections instead of internal product notes.
const cbStart = html.indexOf('function renderCookbook(){');
const cbEnd = html.indexOf('</div></div></div>`}', cbStart);
if (cbStart < 0 || cbEnd < 0) throw new Error('Could not locate renderCookbook.');
const cookbook = (await readFile(path.join(root, 'release', 'cookbook.js'), 'utf8')).trim().replace('__VERSION__', version);
html = html.slice(0, cbStart) + cookbook + html.slice(cbEnd + '</div></div></div>`}'.length);

// 3b. Household form styling.
replaceOnce('household css', '<style id="sabiplate-v15-styles">', '<style id="sabiplate-v15-styles">' + (await readFile(path.join(root, 'release', 'household.css'), 'utf8')).trim());

// 4. Plain-language nutrition note in the recipe view.
replaceOnce('nutrition label', '<b>Nutrition-calibrated prototype:</b>', '<b>Nutrition per serving (estimate):</b>');
replaceOnce('nutrition tail', ' per standardised serving. Exact gram weights are shown beside ingredients. Final commercial verification against an authoritative food-composition database is still required.', '. Worked out from the gram weights shown beside each ingredient.');

await writeFile(indexPath, html);
console.log(`Release ${version} applied: household engine, SabiPlate cover art, cookbook collections.`);
