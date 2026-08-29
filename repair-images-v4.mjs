import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const root = process.cwd();
const dist = path.join(root, 'dist');
const recipeDir = path.join(dist, 'assets', 'recipes');
const indexPath = path.join(dist, 'index.html');
const version = '20260829-curated-v11-hq1';

const SOURCES = {
  "akara-with-greek-yogurt-dip": "https://www.thetakeout.com/img/gallery/why-there-are-so-many-variations-of-akara-the-nigerian-plant-based-fritter/l-intro-1730740430.jpg",
  "moi-moi-boiled-egg": "https://static.wixstatic.com/media/8c17b5_69c352a7f26e458c96229e661ae7bfbc~mv2.jpg",
  "yam-egg-sauce": "https://www.foodnify.com/wp-content/uploads/2024/09/boiled-yam-egg-sauces.jpg",
  "sweet-potato-egg-hash": "https://svetb.com/wp-content/uploads/2025/05/Image_3-69.png",
  "plantain-egg-scramble": "https://miro.medium.com/v2/resize%3Afit%3A1400/1%2AXxkV6epG0ZhJmTnGdBrJkw.jpeg",
  "tuna-avocado-toast": "https://enmicocina.com/api/media/file/tostada-de-atun-con-aguacate.jpg",
  "berry-overnight-oats": "https://betrhealth.com/cdn/shop/articles/overnight_oats_1.png?v=1716321520",
  "apple-cinnamon-protein-oats": "https://www.kimscravings.com/wp-content/uploads/2021/09/apple-cinnamon-oatmeal.jpg",
  "jollof-rice-with-grilled-chicken": "https://kikifoodies.com/wp-content/uploads/2024/11/ET5B6985-9-scaled.jpg",
  "chicken-shawarma-wrap": "https://whiskdaily.com/wp-content/uploads/2025/08/Chicken-Shawarma-Wraps-with-Garlic-Sauce-4.jpg",
  "grilled-salmon-rice-bowl": "https://s.lightorangebean.com/media/20241104050638/Grilled-Protein-and-Veggie-Rice-Bowl_done.jpg",
  "beans-plantain-lunch-bowl": "https://images.getrecipekit.com/20250302041641-beans-26-plantain-1.jpg?aspect_ratio=1%3A1&quality=90",
  "shrimp-couscous-bowl": "https://media.hellofresh.com/w_3840%2Cq_auto%2Cf_auto%2Cc_limit%2Cfl_lossy/recipes/image/HFCARC_RS48466-1_Hero_ShrimpWithLemonMintTabboulehAndToastedAlmonds_W02_1089_2026_low_Web-a4f0fb3c.jpg",
  "tilapia-sweet-potato-bowl": "https://media.hellofresh.com/w_3840%2Cq_auto%2Cf_auto%2Cc_limit%2Cfl_lossy/recipes/image/HF_Y25_R11_W52_UK_F28913-8_Main_high-a92f8924.jpg",
  "turkey-avocado-pasta-salad": "https://images.matprat.no/zm3hn5hs7r-jumbotron/large/restesalat_med_kalun_og_bacon0711_2.jpg",
  "beef-suya-wrap": "https://toasties.ng/wp-content/uploads/2019/11/img_4812.jpg",
  "chicken-shawarma-hummus-bowl": "https://playswellwithbutter.com/wp-content/uploads/2021/03/Hummus-Bowls-15.jpg",
  "baked-salmon-sweetcorn-pasta-salad": "https://healthyfitnessmeals.com/wp-content/uploads/2020/02/Lemon-dill-salmon-pasta-salad-4.jpg",
  "turkey-lettuce-wrap-lunch-box": "https://www.momables.com/wp-content/uploads/2024/10/Turkey-avocado-lettuce-wrap_RC-SQ.jpg",
  "black-eyed-bean-prawn-salad-bowl": "https://minhacozinhaamarela.com.br/wp-content/uploads/2024/08/20201210_155017-2.jpg",
  "chicken-couscous-bowl": "https://img.hellofresh.com/c_fit%2Cf_auto%2Cfl_lossy%2Ch_1100%2Cq_auto%2Cw_2600/hellofresh_s3/image/a7f99240-7e52-5e32-907b-401b2be505fa-2f702419.jpg",
  "turkey-tomato-pasta": "https://www.savoryonline.com/app/uploads/recipes/158971/penne-with-turkey-bolognese-and-broiled-tomatoes-1256x1256-c-center.jpg",
  "spicy-chickpea-roasted-cauliflower-bowl": "https://smileyspoints.com/wp-content/uploads/2020/07/spicy-cauliflower-chickpea-rice-bowl-scaled.jpg",
  "lean-beef-kofta-bulgur-plate": "https://commons.wikimedia.org/wiki/Special:Redirect/file/K%C3%B6fte%20ve%20bulgur%20pilav%C4%B1.jpg",
  "lemon-herb-chicken-with-cauliflower-mash": "https://i.pinimg.com/originals/d0/54/72/d05472775f1c26fd8aa70e07a2294faf.jpg",
  "garlic-shrimp-quinoa-veg-bowl": "https://longevitycareclinic.com/wp-content/uploads/2023/12/Lemon-Garlic-Shrimp-and-Broccoli-Quinoa-Bowl-4277.jpg",
  "turkey-meatballs-with-courgetti-tomato-sauce": "https://www.melissarecipe.com/wp-content/uploads/2025/06/6.1-13.png",
  "miso-salmon-with-brown-rice-broccoli": "https://img.hellofresh.com/f_auto%2Cfl_lossy%2Cw_1600/hellofresh_s3/image/HF171218_R04_W03_NL_Main_high-d2a7afd6.jpg",
  "tofu-edamame-veg-stir-fry": "https://mybudgetrecipes.com/wp-content/uploads/2024/12/v2-n3yk6-t7sl8.jpg",
  "baked-cod-with-sweet-potato-asparagus": "https://www.arise-app.com/images/dishes/en/baked-fish-with-roasted-sweet-potatoes-and-asparagus-184350.webp",
  "chicken-fajita-cauli-rice-bowl": "https://hips.hearstapps.com/delish/assets/17/12/1490286540-chicken-fajita-cauliflower-rice-bowl-5.jpg",
  "lentil-stuffed-aubergine-with-side-salad": "https://www.eatfiid.com/cdn/shop/products/SundriedTomatoLentilRagu-loadedauberginecopy_8fa625e0-39a8-4012-9cc7-a3b52051960c_1200x.png?v=1749537299",
  "mediterranean-chicken-couscous-bowl": "https://static.wixstatic.com/media/657603_0cf2a5ca67ce4a27b3a90c0420082e56~mv2.png/v1/fill/w_1600%2Ch_1600%2Cal_c%2Cq_90%2Cusm_0.66_1.00_0.01/657603_0cf2a5ca67ce4a27b3a90c0420082e56~mv2.png",
  "prawn-lettuce-wrap-bowl-with-rice": "https://marleyspoon.com/media/recipes/543171/main_photos/large/SKU1587_hero-4ae2fba6ac94c364dfff2b7179435f65.jpg",
  "lean-beef-zucchini-noodle-bolognese": "https://nutritionkitchenhk.com/cdn/shop/files/BeefBologneseBalanced.png?v=1758894918",
  "teriyaki-tofu-broccoli-rice-bowl": "https://sixhungryfeet.com/wp-content/uploads/2023/03/cropped-Quick-Teriyaki-Tofu-Recipe-2.jpg",
  "cajun-fish-with-quinoa-corn-salsa": "https://mealpractice.b-cdn.net/384769608021839872/citrus-burst-tilapia-with-cilantro-lime-quinoa-and-grilled-corn-on-the-cob-pkUr95hpUW.webp",
  "spinach-ricotta-stuffed-chicken-with-roast-carrots": "https://rms.condenast.it/rms/public/5d3/f05/b86/5d3f05b86ac23942366034.jpg",
  "chickpea-coconut-curry-with-cauliflower-rice": "https://yumnia.com/storage/recipes/leftover-chana-masala-with-cauliflower-rice-B7x0j.webp",
  "turkey-chili-with-brown-rice": "https://static.mealprepify.com/wp-content/uploads/2024/08/mealprepify-whole-grain-meal-preps-balanced-nutrition-04-683x1024.png",
  "wholewheat-pesto-chicken-pasta": "https://www.knuspr.de/cdn-cgi/image/f%3Dauto%2Cw%3D1200%2Ch%3D900%2Cfit%3Dcover/https%3A/cdn.knuspr.de/images/meals/large/recipe_2466_1777315601322_spaghetti-with-spinach-pesto-and-chicken_b6a0ec64.jpg",
  "sesame-tuna-steak-with-vegetable-stir-fry": "https://cdn.myportfolio.com/291db92f-f517-4ebe-9909-6572b684d363/774cad1c-4839-4c42-b59e-aa76112dd2ec_rw_1920.jpg?h=6e35249280f16e96907ad8859ac417fd",
  "jollof-spaghetti-with-lean-beef-strips": "https://www.arise-app.com/images/dishes/en/jollof-spaghetti-with-vegetables-and-meat-2l8rjf.webp",
  "okra-seafood-stew-with-small-eba": "https://commons.wikimedia.org/wiki/Special:Redirect/file/Okra%20seafood%20stew.jpg",
  "greek-yogurt-berry-crunch-pot": "https://i.mctimg.com/cdn-cgi/image/fit%3Dpad/https%3A/i.mctimg.com/file/2829f837a68085563adc97fe04e4ce581216b835/8ae0ff5016467e90c7dd2b29adf22e7cce267019ad251f207e98748e6c9af5b7",
  "cucumber-hummus-egg-snack-box": "https://pinterest-media-cdn.b-cdn.net/article-images/high-protein-snack-ideas-v2/snack_6_egg_snack_packs.png",
  "apple-peanut-butter-cottage-cheese-rings": "https://static.nike.com/a/images/f_auto%2Ccs_srgb/w_1920%2Cc_limit/acacd202-de31-43ea-b9ea-7ae397f046fa/5-healthy-apple-recipes-to-try-after-working-out-say-dietitians.jpg",
  "roasted-chickpea-crunch-cups": "https://i1.wp.com/domestikatedlife.com/wp-content/uploads/2019/02/ACS_1532.jpg",
  "tuna-cucumber-boats": "https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/recipe_pics_v2/medium/cucumber_tuna_boat.jpg",
  "banana-oat-protein-bites": "https://images.mrcook.app/recipe-image/0194a6ff-994c-7b1c-8a4b-cbc8b16f0059",
  "cottage-cheese-pineapple-pot": "https://app.contentgoblin.ai/media/users/974/article_images/cottage_cheese_with_pineapple_chunks.jpg",
  "turkey-lettuce-roll-ups": "https://www.arise-app.com/images/dishes/de/salatwraps-mit-putenbrust-und-beilagen-8wwkoi.webp",
  "edamame-chilli-lime-cup": "https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/itsu_edamame_snack_pot.jpg",
  "dark-chocolate-strawberry-yogurt-bark": "https://fitfoodiefinds.com/wp-content/uploads/2022/11/Yogurt-Bark-03-768x1152.jpg",
  "pear-ricotta-cinnamon-bowl": "https://www.kroger.com/content/v2/binary/recipe/images/5e14a91f9da07c34418dd53c-original.png",
  "spicy-bean-salsa-cups": "https://cdn.chellesrecipes.com/images/2d8b2610-e949-42a8-b756-1c3abc4a2de8_297c9f4b.webp",
  "smoked-salmon-cream-cheese-cucumber-bites": "https://cdn.bakedbree.com/uploads/2025/04/a-smoked_salmon_appetizer-feature-4.jpeg",
  "mango-coconut-chia-pot": "https://tastychow.com/wp-content/uploads/2025/07/0_1-37.png",
  "chicken-hummus-pita-pockets": "https://boldappetite.com/wp-content/uploads/2024/06/2T6A6175-2.jpg",
  "warm-apple-cinnamon-yogurt-bowl": "https://foodblasts.com/wp-content/uploads/2024/12/Easy-and-Tasty-Cinnamon-Apple-Yogurt-Bowls.jpg",
  "protein-popcorn-trail-mix": "https://the-perfect-pear.com/wp-content/uploads/2023/01/Popcorn-Trailmix-19-800x1200.jpg",
  "egg-avocado-tomato-snack-plate": "https://hips.hearstapps.com/hmg-prod/images/salad-kourtney-1581281032.jpg?resize=1200%3A%2A",
  "chicken-stew-basmati-rice": "https://www.beryl.nyc/wp-content/uploads/2024/10/Chicken-Rice.00_12_45_23.Still067-2.jpg",
  "turkey-stew-boiled-yam": "https://img-global.cpcdn.com/steps/f2eedb977917506c/1200x1200cq90/photo.jpg",
  "beef-suya-rice-plate": "https://obalendefoods.com/cdn/shop/files/Dr_Ronke_SUYA_beef-48.jpg?v=1733528718&width=3840",
  "chicken-suya-roasted-sweet-potato": "https://blessinglicious.ca/wp-content/uploads/2022/02/website-picture-1.jpeg",
  "nigerian-tomato-spaghetti-grilled-chicken": "https://res.cloudinary.com/joemires/image/upload/w_1600,q_auto,f_auto/v1747854185/lunchpark/uploads/19/01JVT3MMAF360897J002KG2CT7.jpg",
  "nigerian-egg-fried-rice-prawns": "https://simshomekitchen.com/wp-content/uploads/2020/11/Nigerian-fried-rice-in-a-white-oval-plate-with-a-silver-spoon-topped-with-herbs.jpg",
  "efo-riro-grilled-fish-small-swallow": "https://i0.wp.com/ounjealadun.com/wp-content/uploads/2015/02/20200429_182309.jpg?resize=1600%2C1600&ssl=1",
  "oha-soup-turkey-small-swallow": "https://i0.wp.com/1qfoodplatter.com/wp-content/uploads/2015/11/Efere-Nkpa-4-1024x6801.jpg?fit=1600%2C1063&ssl=1",
  "ogbono-lean-beef-small-swallow": "https://foreignfork.com/wp-content/uploads/2020/07/Ogbono-soup-Draw-Soup-blog-2.jpg",
  "okra-soup-fish-small-swallow": "https://img-global.cpcdn.com/recipes/0157409560667f1e/1200x1200cq90/okra-soup-recipe-main-photo.jpg",
  "banga-soup-grilled-fish-rice": "https://www.nairaland.com/attachments/5583303_bangasoupservedwithboiledrice_jpegb8cd35d5cd37b59a0291369e20d39be4",
  "chicken-nsala-soup-boiled-yam": "https://i.ytimg.com/vi/jFvBQjXP25c/maxresdefault.jpg",
  "edikang-ikong-grilled-chicken": "https://chefsbase.com/wp-content/uploads/2024/05/nigerian-vegetable-soup-recipe.jpg",
  "afang-soup-fish-small-swallow": "https://i.pinimg.com/originals/f9/a5/80/f9a5804951067102415001456b91d5ed.jpg",
  "moi-moi-grilled-chicken-slaw": "https://img-global.cpcdn.com/recipes/b825b100dcc6b29c/1200x1200cq90/moi-moi-wrapped-in-banana-leaves-recipe-main-photo.jpg",
  "akara-egg-breakfast-wrap": "https://static.wixstatic.com/media/b98b0a_fb9a82db5af44e3e9869b71e7dea2eb0~mv2.jpg/v1/fill/w_1600%2Ch_1600%2Cal_c%2Cq_90%2Cusm_0.66_1.00_0.01%2Cenc_auto/b98b0a_fb9a82db5af44e3e9869b71e7dea2eb0~mv2.jpg",
  "adalu-grilled-fish": "https://miro.medium.com/v2/resize%3Afit%3A1400/1%2AS2eb3eTKeY9SBGGyb8cGLA.jpeg",
  "yam-porridge-egg-spinach": "https://assets.tmecosys.com/video/upload/t_web_rdp_recipe_1200x900/videos/UK/Nigerian%20Collection/yam_pottage_.jpg",
  "plantain-porridge-turkey": "https://img-global.cpcdn.com/recipes/5abedb3d16dd14c4/1200x1200cq90/plantain-porridge-recipe-main-photo.jpg",
  "white-rice-nigerian-chicken-curry": "https://i0.wp.com/www.1qfoodplatter.com/wp-content/uploads/2015/11/chicken-sauce-with-boiled-white-rice.jpg?resize=1600%2C1200&ssl=1",
  "rice-beans-tomato-stew-grilled-fish": "https://chowdeck.com/store/_next/image?q=90&url=https%3A%2F%2Ffiles.chowdeck.com%2Ffit-in%2F1600x1200%2Fimages%2F2026%2F2026-01-08%2F4mppjoa3ImytMkaEnWUtD.png&w=1920",
  "coconut-jollof-rice-turkey": "https://www.ayokaadedelicacies.ca/wp-content/uploads/2023/09/Jollof_Rice_and_Turkeyjpg-1024x1003.png",
  "ofada-rice-lean-beef-ayamase": "https://niyis.co.uk/cdn/shop/articles/Who_wants_this_____This_is_So_Yum_Yum_Yummy_aa309bd1-34c5-4f42-9530-88afaa01ac93.jpg?v=1742859037&width=1600",
  "grilled-croaker-oven-yam-wedges-pepper-sauce": "https://www.nimahhub.com/Fish.jpg",
  "tilapia-pepper-stew-boiled-potatoes": "https://images.squarespace-cdn.com/content/521d01afe4b091b0c32c703c/1588198720012-HWA0WM69BH7CFFDDAFFQ/Snapseed%2B2.jpg?content-type=image%2Fjpeg&format=1500w",
  "sardine-tomato-pasta": "https://recipe.r10s.jp/recipe-space/d/strg/ctrl/3/95a3984e5c3e5fca09f8ddcf316d2b49e32433a4.47.2.3.2.jpg?crop=1200%3A1200%3B%2A%2C%2A&fit=around%7C1200%3A1200&interpolation=lanczos-none",
  "chicken-shawarma-rice-bowl-new": "https://miaspice.com/wp-content/uploads/2025/07/Chicken_Shawarma_Bowl_Recipe_1.webp",
  "beef-shawarma-wrap-new": "https://images.deliveryhero.io/image/talabat/MenuItems/9DCC9D6C8DFD5989EEDA8A34BE0F519E",
  "grilled-chicken-wrap-cabbage-slaw": "https://image3.mouthshut.com/images/Restaurant/Photo/-68920_236815.png",
  "tuna-sweetcorn-pasta": "https://files.theinteriorsaddict.com/uploads/2022/07/IMG_1472.jpeg",
  "baked-potato-chicken-sweetcorn": "https://v.cdn.ww.com/media/system/wine/60bf6e005d54390024529c90/c7157fd1-7191-4e0d-a393-73d47fc91080/ihemgu3vubpwl73z99oy.jpg",
  "chicken-curry-basmati-rice": "https://sweetpeasandsaffron.com/wp-content/uploads/2018/12/chicken-curry-3.jpg",
  "beef-stir-fry-noodles": "https://cookingwithcasey.com/assets/images/1744330835127-szdtl2kb.webp",
  "prawn-fried-rice": "https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/prawn_fried_rice.jpg",
  "nigerian-chicken-fajita-wrap": "https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/chicken_fajita_wrap.jpg",
  "turkey-burger-oven-potato-wedges": "https://img.hellofresh.com/f_auto%2Cfl_lossy%2Ch_900%2Cq_auto%2Cw_1600/hellofresh_s3/image/HF_Y25_R09_W33_IE_IEXCT18823-2_MAIN_high-d33209e8.jpg",
  "lean-beef-spaghetti-bolognese": "https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/large/spaghetti_with_lean_beef.jpg",
  "chicken-vegetable-couscous": "https://tmbidigitalassetsazure.blob.core.windows.net/rms3-prod/attachments/37/1200x1200/Chicken---Vegetable-Curry-Couscous_EXPS_OPBZ18_143569_E06_27_3b.jpg"
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchBytes(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow', signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SabiPlate/1.0; +https://sabiplate.vercel.app/)', 'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 18000) throw new Error(`response too small (${bytes.length} bytes)`);
    return bytes;
  } finally { clearTimeout(timer); }
}

function imageGate(meta) {
  const w = Number(meta.width || 0), h = Number(meta.height || 0);
  return Math.min(w, h) >= 700 && Math.max(w, h) >= 1000 && w * h >= 750000;
}

async function convertWithoutUpscale(bytes, target) {
  const input = sharp(bytes, { failOn: 'none' }).rotate();
  const meta = await input.metadata();
  if (!imageGate(meta)) throw new Error(`source resolution ${meta.width || 0}x${meta.height || 0} below HQ gate`);
  let pipeline = sharp(bytes, { failOn: 'none' }).rotate();
  if (Math.max(meta.width || 0, meta.height || 0) > 1800) pipeline = pipeline.resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true, kernel: sharp.kernel.lanczos3 });
  const out = await pipeline.webp({ quality: 91, effort: 4, smartSubsample: true }).toBuffer();
  const finalMeta = await sharp(out).metadata();
  if (!imageGate(finalMeta)) throw new Error(`final resolution ${finalMeta.width || 0}x${finalMeta.height || 0} below HQ gate`);
  await writeFile(target, out);
  return finalMeta;
}

const files = (await readdir(recipeDir)).filter(name => name.endsWith('.webp')).sort();
if (files.length !== 100) throw new Error(`Expected 100 recipe image files, found ${files.length}`);
const ids = files.map(name => name.replace(/\.webp$/, ''));
const missingMap = ids.filter(id => !SOURCES[id]);
const extraMap = Object.keys(SOURCES).filter(id => !ids.includes(id));
if (missingMap.length || extraMap.length) throw new Error(`Curated mapping mismatch. Missing: ${missingMap.join(', ') || 'none'}. Extra: ${extraMap.join(', ') || 'none'}`);

const report = { version, generatedAt: new Date().toISOString(), sourceOfTruth: 'SabiPlate-v11-FOOD-IMAGES-CORRECTED', recipes: {} };
const failures = [];
async function processRecipe(id) {
  const url = SOURCES[id], target = path.join(recipeDir, `${id}.webp`);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const bytes = await fetchBytes(url, 18000 + attempt * 4000);
      const meta = await convertWithoutUpscale(bytes, target);
      const hash = crypto.createHash('sha256').update(await readFile(target)).digest('hex');
      report.recipes[id] = { url, width: meta.width, height: meta.height, sha256: hash };
      console.log(`CURATED OK ${id} ${meta.width}x${meta.height}`);
      return;
    } catch (error) { lastError = error; await sleep(250 * attempt); }
  }
  failures.push(`${id} => ${lastError?.message || lastError}`);
}
for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(processRecipe));
if (failures.length) {
  console.error('CURATED IMAGE FAILURES:\n' + failures.join('\n'));
  throw new Error(`Curated image repair blocked: ${failures.length} recipe image(s) failed.`);
}

const hashGroups = new Map();
for (const [id, item] of Object.entries(report.recipes)) { const list = hashGroups.get(item.sha256) || []; list.push(id); hashGroups.set(item.sha256, list); }
const duplicates = [...hashGroups.values()].filter(list => list.length > 1);
if (duplicates.length) throw new Error(`Duplicate food images detected: ${duplicates.map(x => x.join(' / ')).join('; ')}`);

const coverW = 1200, coverH = 1600, photoY = 650, tileW = 600, tileH = 475;
const coverIds = ['jollof-rice-with-grilled-chicken','beef-suya-rice-plate','efo-riro-grilled-fish-small-swallow','nigerian-egg-fried-rice-prawns'];
const tiles = [];
for (const id of coverIds) tiles.push(await sharp(path.join(recipeDir, `${id}.webp`)).resize(tileW, tileH, { fit: 'cover', position: 'attention', withoutEnlargement: true }).webp({ quality: 93 }).toBuffer());
const titleSvg = Buffer.from(`<svg width="${coverW}" height="650" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="650" fill="#f4eadc"/><text x="600" y="115" text-anchor="middle" font-family="Georgia, serif" font-size="52" font-style="italic" fill="#7d512f">Naija</text><text x="600" y="218" text-anchor="middle" font-family="Georgia, serif" font-size="94" font-weight="700" fill="#174d34">Body Transformation</text><text x="600" y="350" text-anchor="middle" font-family="Georgia, serif" font-size="138" font-weight="700" fill="#174d34">COOKBOOK</text><line x1="210" y1="405" x2="990" y2="405" stroke="#c66b42" stroke-width="5"/><text x="600" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="35" font-weight="700" letter-spacing="2" fill="#174d34">HIGH-PROTEIN NIGERIAN-INSPIRED</text><text x="600" y="530" text-anchor="middle" font-family="Arial, sans-serif" font-size="35" font-weight="700" letter-spacing="2" fill="#174d34">RECIPES &amp; MEAL PREP</text><text x="600" y="598" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#765e4d">The original SabiPlate visual, rebuilt sharply</text></svg>`);
const footerSvg = Buffer.from(`<svg width="1200" height="70" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="70" fill="#174d34"/><text x="600" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#f4eadc">KNOW YOUR FOOD. OWN YOUR GOALS.</text></svg>`);
await sharp({ create: { width: coverW, height: coverH, channels: 3, background: '#f4eadc' } }).composite([{ input: titleSvg, left: 0, top: 0 },{ input: tiles[0], left: 0, top: photoY },{ input: tiles[1], left: tileW, top: photoY },{ input: tiles[2], left: 0, top: photoY + tileH },{ input: tiles[3], left: tileW, top: photoY + tileH },{ input: footerSvg, left: 0, top: coverH - 70 }]).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toFile(path.join(dist, 'assets', 'sabiplate-brand-reference.jpg'));

await writeFile(path.join(dist, 'assets', 'photo-manifest.json'), JSON.stringify(report, null, 2));
let html = await readFile(indexPath, 'utf8');
html = html.replace(/(\.\/assets\/recipes\/[a-z0-9-]+\.webp)(?:\?v=[^'"`)]+)?/g, `$1?v=${version}`);
html = html.replace(/(\.\/assets\/sabiplate-brand-reference\.jpg)(?:\?v=[^'"`)]+)?/g, `$1?v=${version}`);
html = html.replace(/(assets\/sabiplate-brand-reference\.jpg)(?:\?v=[^'"`)]+)?/g, `$1?v=${version}`);
const css = `\n/* SabiPlate curated v11 image restoration */\n.recipe-img-wrap{overflow:hidden;background:#e7ddcf}\n.recipe-img-wrap img,.modal-hero img{width:100%;height:100%;object-fit:cover;object-position:center;image-rendering:auto;transform:none}\n.category-card img{width:100%;height:100%;object-fit:cover;object-position:center;image-rendering:auto}\n.hero-visual{background-position:center 18%;background-size:cover}\n.book-cover{height:auto;object-fit:contain}\n@media(min-width:769px){.recipe-modal-card{max-width:900px}.modal-hero{height:390px}}\n`;
html = html.replace('</style>', `${css}</style>`);
await writeFile(indexPath, html);
console.log('CURATED IMAGE PASS: restored v11 recipe-to-image intent, 100 unique HQ sources, no generic/random replacement stage, no upscaling.');
console.log('CURATED HERO PASS: original cookbook-cover concept rebuilt at 1200x1600.');
