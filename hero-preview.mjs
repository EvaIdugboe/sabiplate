import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const dist = path.join(process.cwd(), 'dist');
const version = '20260829-hero-hq3';
const imageIds = [
  'jollof-rice-with-grilled-chicken',
  'beans-plantain-lunch-bowl',
  'efo-riro-grilled-fish-small-swallow',
  'nigerian-egg-fried-rice-prawns'
];

const tiles = [];
for (const id of imageIds) {
  const file = path.join(dist, 'assets', 'recipes', `${id}.webp`);
  const input = await readFile(file);
  const meta = await sharp(input).metadata();
  if ((meta.width || 0) < 400 || (meta.height || 0) < 300) {
    throw new Error(`Hero source ${id} is unexpectedly small: ${meta.width || 0}x${meta.height || 0}`);
  }
  tiles.push(await sharp(input)
    .resize({ width: 480, height: 360, fit: 'cover', position: 'attention', withoutEnlargement: true })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer());
}

const baseSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">
  <rect width="1200" height="1600" fill="#f4eadc"/>
  <rect x="28" y="28" width="1144" height="1544" rx="36" fill="#fffaf3" stroke="#d7c3aa" stroke-width="3"/>
  <g text-anchor="middle">
    <text x="600" y="165" font-family="Georgia, serif" font-size="108" font-weight="700" fill="#154d35">NAIJA</text>
    <text x="600" y="255" font-family="Georgia, serif" font-size="57" font-style="italic" fill="#8a6a4d">Body Transformation</text>
    <text x="600" y="405" font-family="Georgia, serif" font-size="128" font-weight="700" fill="#154d35">COOKBOOK</text>
    <line x1="220" y1="455" x2="980" y2="455" stroke="#c76845" stroke-width="5"/>
    <text x="600" y="520" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#154d35">HIGH-PROTEIN NIGERIAN-INSPIRED</text>
    <text x="600" y="565" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#154d35">RECIPES &amp; MEAL PREP</text>
  </g>
  <rect x="28" y="1490" width="1144" height="82" fill="#154d35"/>
  <text x="600" y="1542" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="2" fill="#f8efe4">NIGERIAN + GLOBAL FOOD • SMARTER PLANNING</text>
</svg>`);

const medallionSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="310" height="310">
  <circle cx="155" cy="155" r="145" fill="#fffaf3" stroke="#d7c3aa" stroke-width="10"/>
  <text x="155" y="135" text-anchor="middle" font-family="Georgia, serif" font-size="45" font-weight="700" fill="#154d35">SabiPlate</text>
  <text x="155" y="188" text-anchor="middle" font-family="Georgia, serif" font-size="25" font-style="italic" fill="#c76845">Know your food.</text>
  <text x="155" y="225" text-anchor="middle" font-family="Georgia, serif" font-size="25" font-style="italic" fill="#c76845">Own your goals.</text>
</svg>`);

const heroPath = path.join(dist, 'assets', 'hero-cover-hq.jpg');
await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#f4eadc' } })
  .composite([
    { input: baseSvg, left: 0, top: 0 },
    { input: tiles[0], left: 95, top: 650 },
    { input: tiles[1], left: 625, top: 650 },
    { input: tiles[2], left: 95, top: 1040 },
    { input: tiles[3], left: 625, top: 1040 },
    { input: medallionSvg, left: 445, top: 900 }
  ])
  .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
  .toFile(heroPath);

const indexPath = path.join(dist, 'index.html');
let html = await readFile(indexPath, 'utf8');
const oldAsset = './assets/sabiplate-brand-reference.jpg';
const newAsset = `./assets/hero-cover-hq.jpg?v=${version}`;
const count = html.split(oldAsset).length - 1;
if (count !== 2) throw new Error(`Expected exactly 2 stable brand-image references, found ${count}`);
html = html.split(oldAsset).join(newAsset);
html = html.replace('.hero-visual{min-height:430px;background:center/cover no-repeat;position:relative}', '.hero-visual{min-height:430px;background:center 24%/cover no-repeat;position:relative}');
await writeFile(indexPath, html);
console.log(`Hero-only preview ready: ${version}. Original cookbook concept preserved; recipe image mapping unchanged.`);
