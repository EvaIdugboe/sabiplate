import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
const version = '20260829-hero-hq2';
const imageIds = [
  'jollof-rice-with-grilled-chicken',
  'beans-plantain-lunch-bowl',
  'efo-riro-grilled-fish-small-swallow',
  'nigerian-egg-fried-rice-prawns'
];

const dataUris = [];
for (const id of imageIds) {
  const file = path.join(dist, 'assets', 'recipes', `${id}.webp`);
  const bytes = await readFile(file);
  dataUris.push(`data:image/webp;base64,${bytes.toString('base64')}`);
}

const esc = s => s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs>
    <clipPath id="p1"><rect x="55" y="675" width="530" height="365" rx="28"/></clipPath>
    <clipPath id="p2"><rect x="615" y="675" width="530" height="365" rx="28"/></clipPath>
    <clipPath id="p3"><rect x="55" y="1070" width="530" height="365" rx="28"/></clipPath>
    <clipPath id="p4"><rect x="615" y="1070" width="530" height="365" rx="28"/></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-opacity="0.16"/></filter>
  </defs>
  <rect width="1200" height="1600" fill="#f4eadc"/>
  <rect x="28" y="28" width="1144" height="1544" rx="34" fill="#fffaf3" stroke="#d7c3aa" stroke-width="3"/>
  <g text-anchor="middle">
    <text x="600" y="120" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-style="italic" fill="#b15d3c">Naija</text>
    <text x="600" y="210" font-family="Georgia, 'Times New Roman', serif" font-size="102" font-weight="700" letter-spacing="2" fill="#154d35">NAIJA</text>
    <text x="600" y="283" font-family="Georgia, 'Times New Roman', serif" font-size="55" font-style="italic" fill="#8a6a4d">Body Transformation</text>
    <text x="600" y="405" font-family="Georgia, 'Times New Roman', serif" font-size="130" font-weight="700" letter-spacing="3" fill="#154d35">COOKBOOK</text>
    <line x1="230" y1="457" x2="970" y2="457" stroke="#c76845" stroke-width="5"/>
    <text x="600" y="520" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="700" letter-spacing="2" fill="#154d35">HIGH-PROTEIN NIGERIAN-INSPIRED</text>
    <text x="600" y="566" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="700" letter-spacing="2" fill="#154d35">RECIPES &amp; MEAL PREP</text>
    <text x="600" y="620" font-family="Arial, Helvetica, sans-serif" font-size="23" fill="#7b6654">The original SabiPlate cookbook look, rebuilt for a sharp display</text>
  </g>
  <g filter="url(#shadow)">
    <image href="${esc(dataUris[0])}" x="55" y="675" width="530" height="365" preserveAspectRatio="xMidYMid slice" clip-path="url(#p1)"/>
    <image href="${esc(dataUris[1])}" x="615" y="675" width="530" height="365" preserveAspectRatio="xMidYMid slice" clip-path="url(#p2)"/>
    <image href="${esc(dataUris[2])}" x="55" y="1070" width="530" height="365" preserveAspectRatio="xMidYMid slice" clip-path="url(#p3)"/>
    <image href="${esc(dataUris[3])}" x="615" y="1070" width="530" height="365" preserveAspectRatio="xMidYMid slice" clip-path="url(#p4)"/>
  </g>
  <circle cx="600" cy="1055" r="145" fill="#fffaf3" stroke="#d7c3aa" stroke-width="10" filter="url(#shadow)"/>
  <text x="600" y="1037" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="44" font-weight="700" fill="#154d35">SabiPlate</text>
  <text x="600" y="1090" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="25" font-style="italic" fill="#c76845">Know your food.</text>
  <text x="600" y="1124" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="25" font-style="italic" fill="#c76845">Own your goals.</text>
  <rect x="28" y="1490" width="1144" height="82" fill="#154d35"/>
  <text x="600" y="1543" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="#f8efe4">NIGERIAN + GLOBAL FOOD • SMARTER PLANNING</text>
</svg>`;

await writeFile(path.join(dist, 'assets', 'hero-cover-hq.svg'), svg);

const indexPath = path.join(dist, 'index.html');
let html = await readFile(indexPath, 'utf8');
const oldAsset = './assets/sabiplate-brand-reference.jpg';
const newAsset = `./assets/hero-cover-hq.svg?v=${version}`;
const count = html.split(oldAsset).length - 1;
if (count !== 2) throw new Error(`Expected exactly 2 stable brand-image references, found ${count}`);
html = html.split(oldAsset).join(newAsset);
html = html.replace('.hero-visual{min-height:430px;background:center/cover no-repeat;position:relative}', '.hero-visual{min-height:430px;background:center 24%/cover no-repeat;position:relative}');
await writeFile(indexPath, html);
console.log(`Hero-only preview ready: ${version}. Original cookbook concept preserved; recipe image mapping unchanged.`);
