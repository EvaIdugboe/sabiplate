import { mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';

const root = process.cwd();
const dist = path.join(root, 'dist');
const archivePath = path.join(root, 'source', 'site-source.tar.gz');
const archiveUrl = process.env.SABIPLATE_SOURCE_URL || 'https://raw.githubusercontent.com/EvaIdugboe/sabiplate/main/source/site-source.tar.gz';
const imageVersion = '20260828-hq1';

const originalImageUrls = {
  "chicken-stew-basmati-rice": "https://www.beryl.nyc/wp-content/uploads/2024/10/Chicken-Rice.00_12_45_23.Still067-2.jpg",
  "turkey-stew-boiled-yam": "https://img-global.cpcdn.com/steps/f2eedb977917506c/400x400cq80/photo.jpg",
  "beef-suya-rice-plate": "https://obalendefoods.com/cdn/shop/files/Dr_Ronke_SUYA_beef-48.jpg?v=1733528718&width=3840",
  "chicken-suya-roasted-sweet-potato": "https://blessinglicious.ca/wp-content/uploads/2022/02/website-picture-1.jpeg",
  "nigerian-tomato-spaghetti-grilled-chicken": "https://res.cloudinary.com/joemires/image/upload/v1747854185/lunchpark/uploads/19/01JVT3MMAF360897J002KG2CT7.jpg",
  "nigerian-egg-fried-rice-prawns": "https://simshomekitchen.com/wp-content/uploads/2020/11/Nigerian-fried-rice-in-a-white-oval-plate-with-a-silver-spoon-topped-with-herbs.jpg",
  "efo-riro-grilled-fish-small-swallow": "https://i0.wp.com/ounjealadun.com/wp-content/uploads/2015/02/20200429_182309.jpg?resize=1108%2C1410&ssl=1",
  "oha-soup-turkey-small-swallow": "https://i0.wp.com/1qfoodplatter.com/wp-content/uploads/2015/11/Efere-Nkpa-4-1024x6801.jpg?fit=1024%2C680&ssl=1",
  "ogbono-lean-beef-small-swallow": "https://foreignfork.com/wp-content/uploads/2020/07/Ogbono-soup-Draw-Soup-blog-2.jpg",
  "okra-soup-fish-small-swallow": "https://img-global.cpcdn.com/recipes/0157409560667f1e/680x781cq80/okra-soup-recipe-main-photo.jpg",
  "banga-soup-grilled-fish-rice": "https://www.nairaland.com/attachments/5583303_bangasoupservedwithboiledrice_jpegb8cd35d5cd37b59a0291369e20d39be4",
  "chicken-nsala-soup-boiled-yam": "https://i.ytimg.com/vi/jFvBQjXP25c/maxresdefault.jpg",
  "edikang-ikong-grilled-chicken": "https://chefsbase.com/wp-content/uploads/2024/05/nigerian-vegetable-soup-recipe.jpg",
  "afang-soup-fish-small-swallow": "https://i.pinimg.com/originals/f9/a5/80/f9a5804951067102415001456b91d5ed.jpg",
  "moi-moi-grilled-chicken-slaw": "https://img-global.cpcdn.com/recipes/b825b100dcc6b29c/680x781cq80/moi-moi-wrapped-in-banana-leaves-recipe-main-photo.jpg",
  "akara-egg-breakfast-wrap": "https://static.wixstatic.com/media/b98b0a_fb9a82db5af44e3e9869b71e7dea2eb0~mv2.jpg/v1/fill/w_980%2Ch_1307%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/b98b0a_fb9a82db5af44e3e9869b71e7dea2eb0~mv2.jpg",
  "adalu-grilled-fish": "https://miro.medium.com/v2/resize%3Afit%3A1400/1%2AS2eb3eTKeY9SBGGyb8cGLA.jpeg",
  "yam-porridge-egg-spinach": "https://assets.tmecosys.com/video/upload/t_web_rdp_recipe_584x480/videos/UK/Nigerian%20Collection/yam_pottage_.jpg",
  "plantain-porridge-turkey": "https://img-global.cpcdn.com/recipes/5abedb3d16dd14c4/680x781cq80/plantain-porridge-recipe-main-photo.jpg",
  "white-rice-nigerian-chicken-curry": "https://i0.wp.com/www.1qfoodplatter.com/wp-content/uploads/2015/11/chicken-sauce-with-boiled-white-rice.jpg?ssl=1",
  "rice-beans-tomato-stew-grilled-fish": "https://chowdeck.com/store/_next/image?q=75&url=https%3A%2F%2Ffiles.chowdeck.com%2Ffit-in%2F1200x675%2Fimages%2F2026%2F2026-01-08%2F4mppjoa3ImytMkaEnWUtD.png&w=3840",
  "coconut-jollof-rice-turkey": "https://www.ayokaadedelicacies.ca/wp-content/uploads/2023/09/Jollof_Rice_and_Turkeyjpg-1024x1003.png",
  "ofada-rice-lean-beef-ayamase": "https://niyis.co.uk/cdn/shop/articles/Who_wants_this_____This_is_So_Yum_Yum_Yummy_aa309bd1-34c5-4f42-9530-88afaa01ac93.jpg?v=1742859037",
  "grilled-croaker-oven-yam-wedges-pepper-sauce": "https://www.nimahhub.com/Fish.jpg",
  "tilapia-pepper-stew-boiled-potatoes": "https://images.squarespace-cdn.com/content/521d01afe4b091b0c32c703c/1588198720012-HWA0WM69BH7CFFDDAFFQ/Snapseed%2B2.jpg?content-type=image%2Fjpeg&format=1500w",
  "sardine-tomato-pasta": "https://recipe.r10s.jp/recipe-space/d/strg/ctrl/3/95a3984e5c3e5fca09f8ddcf316d2b49e32433a4.47.2.3.2.jpg?crop=600%3A600%3B%2A%2C%2A&fit=around%7C600%3A600&interpolation=lanczos-none",
  "chicken-shawarma-rice-bowl-new": "https://miaspice.com/wp-content/uploads/2025/07/Chicken_Shawarma_Bowl_Recipe_1.webp",
  "beef-shawarma-wrap-new": "https://images.deliveryhero.io/image/talabat/MenuItems/9DCC9D6C8DFD5989EEDA8A34BE0F519E",
  "grilled-chicken-wrap-cabbage-slaw": "https://image3.mouthshut.com/images/Restaurant/Photo/-68920_236815.png",
  "tuna-sweetcorn-pasta": "https://files.theinteriorsaddict.com/uploads/2022/07/IMG_1472.jpeg",
  "baked-potato-chicken-sweetcorn": "https://v.cdn.ww.com/media/system/wine/60bf6e005d54390024529c90/c7157fd1-7191-4e0d-a393-73d47fc91080/ihemgu3vubpwl73z99oy.jpg",
  "chicken-curry-basmati-rice": "https://sweetpeasandsaffron.com/wp-content/uploads/2018/12/chicken-curry-3.jpg",
  "beef-stir-fry-noodles": "https://cookingwithcasey.com/assets/images/1744330835127-szdtl2kb.webp",
  "prawn-fried-rice": "https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/prawn_fried_rice.jpg",
  "nigerian-chicken-fajita-wrap": "https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/chicken_fajita_wrap.jpg",
  "turkey-burger-oven-potato-wedges": "https://img.hellofresh.com/f_auto%2Cfl_lossy%2Ch_640%2Cq_auto%2Cw_1200/hellofresh_s3/image/HF_Y25_R09_W33_IE_IEXCT18823-2_MAIN_high-d33209e8.jpg",
  "lean-beef-spaghetti-bolognese": "https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/spaghetti_with_lean_beef.jpg",
  "chicken-vegetable-couscous": "https://tmbidigitalassetsazure.blob.core.windows.net/rms3-prod/attachments/37/1200x1200/Chicken---Vegetable-Curry-Couscous_EXPS_OPBZ18_143569_E06_27_3b.jpg"
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

let compressed;
try {
  compressed = await readFile(archivePath);
  console.log('Using SabiPlate source archive from repository.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  console.log('Local source archive not present; fetching it from GitHub.');
  const response = await fetch(archiveUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Could not fetch SabiPlate source archive: ${response.status} ${response.statusText}`);
  compressed = Buffer.from(await response.arrayBuffer());
}

const archive = gunzipSync(compressed);
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
  if (!relative || relative.startsWith('/') || relative.split('/').includes('..')) throw new Error(`Unsafe archive path: ${relative}`);
  const dataStart = offset + 512;
  const dataEnd = dataStart + size;
  if (shouldExtract) {
    const target = path.join(dist, relative);
    if (type === '5') await mkdir(target, { recursive: true });
    else if (type === '0' || type === '\0') {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, archive.subarray(dataStart, dataEnd));
      extracted += 1;
    }
  }
  offset = dataStart + Math.ceil(size / 512) * 512;
}
if (!extracted) throw new Error('No SabiPlate files were extracted.');
console.log(`SabiPlate base build ready: ${extracted} files extracted.`);

const recipesDir = path.join(dist, 'assets', 'recipes');
const recipeFiles = (await readdir(recipesDir)).filter((f) => f.endsWith('.webp'));

async function improveLocalImage(file) {
  const full = path.join(recipesDir, file);
  const input = await readFile(full);
  const improved = await sharp(input)
    .resize(1440, 1080, { fit: 'cover', kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
    .modulate({ brightness: 1.015, saturation: 1.045 })
    .sharpen({ sigma: 1.15, m1: 1.0, m2: 1.8, x1: 2.0, y2: 10, y3: 20 })
    .webp({ quality: 91, effort: 5, smartSubsample: true })
    .toBuffer();
  await writeFile(full, improved);
}

console.log(`Enhancing ${recipeFiles.length} recipe images for large screens...`);
for (let i = 0; i < recipeFiles.length; i += 6) {
  await Promise.all(recipeFiles.slice(i, i + 6).map(improveLocalImage));
}

async function fetchOriginal(recipeId, url) {
  const target = path.join(recipesDir, `${recipeId}.webp`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    const response = await fetch(url, {
      redirect: 'follow', signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 SabiPlate image refresh', 'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 9000) throw new Error('source image too small');
    const meta = await sharp(bytes, { failOn: 'none' }).metadata();
    if ((meta.width || 0) < 580 && (meta.height || 0) < 580) throw new Error(`source only ${meta.width}x${meta.height}`);
    const output = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize(1600, 1200, { fit: 'cover', position: 'attention', kernel: sharp.kernel.lanczos3 })
      .modulate({ brightness: 1.01, saturation: 1.035 })
      .sharpen({ sigma: 0.7 })
      .webp({ quality: 92, effort: 5, smartSubsample: true })
      .toBuffer();
    await writeFile(target, output);
    return true;
  } catch (error) {
    console.warn(`Original image unavailable for ${recipeId}: ${error.message}. Keeping enhanced local copy.`);
    return false;
  }
}

let restoredOriginals = 0;
const originals = Object.entries(originalImageUrls);
for (let i = 0; i < originals.length; i += 5) {
  const results = await Promise.all(originals.slice(i, i + 5).map(([id, url]) => fetchOriginal(id, url)));
  restoredOriginals += results.filter(Boolean).length;
}
console.log(`Restored ${restoredOriginals} higher-resolution original recipe images; remaining recipes use enhanced local copies.`);

const heroChoices = [
  'nigerian-egg-fried-rice-prawns.webp',
  'efo-riro-grilled-fish-small-swallow.webp',
  'coconut-jollof-rice-turkey.webp',
  'chicken-vegetable-couscous.webp'
];
const heroTiles = [];
for (const file of heroChoices) {
  const tile = await sharp(path.join(recipesDir, file))
    .resize(800, 500, { fit: 'cover', position: 'attention' })
    .webp({ quality: 92 })
    .toBuffer();
  heroTiles.push(tile);
}
const heroPath = path.join(dist, 'assets', 'sabiplate-hero.webp');
await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#efe4d5' } })
  .composite([
    { input: heroTiles[0], left: 0, top: 0 }, { input: heroTiles[1], left: 800, top: 0 },
    { input: heroTiles[2], left: 0, top: 500 }, { input: heroTiles[3], left: 800, top: 500 }
  ])
  .webp({ quality: 92, effort: 5 })
  .toFile(heroPath);

const indexPath = path.join(dist, 'index.html');
let html = await readFile(indexPath, 'utf8');
const oldHero = "background-image:url('${esc('./assets/sabiplate-brand-reference.jpg')}')";
const newHero = "background-image:url('${esc('./assets/sabiplate-hero.webp?v=" + imageVersion + "')}')";
html = html.replace(oldHero, newHero);
html = html.replace(/(\.\/assets\/recipes\/[a-z0-9-]+\.webp)(?!\?)/g, `$1?v=${imageVersion}`);
const qualityCss = `\n/* SabiPlate HQ image pass */\n.recipe-img-wrap img,.modal-hero img{image-rendering:auto;backface-visibility:hidden}\n@media (min-width:769px){.recipe-modal-card{max-width:900px}.modal-hero{height:390px}}\n`;
html = html.replace('</style>', qualityCss + '</style>');
await writeFile(indexPath, html);
console.log('Homepage hero replaced, recipe cache-busting enabled, and HQ image styling applied.');
