import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = 'repair-images-v4.mjs';
const runtimePath = 'repair-images-v4-runtime.mjs';
let code = await readFile(sourcePath, 'utf8');

const replacements = new Map([
  ['https://www.consumerenergycenter.org/wp-content/uploads/2024/10/banana-oat-energy-balls-simple-delicious-and-nutritious-m5.jpeg', 'https://www.consumerenergycenter.org/wp-content/uploads/2024/10/banana-oat-energy-balls-simple-delicious-and-nutritious-m5.jpeg'],
  ['https://www.nairaland.com/attachments/5583303_bangasoupservedwithboiledrice_jpegb8cd35d5cd37b59a0291369e20d39be4', 'https://www.africanrecipes.com.ng/wp-content/uploads/2025/08/banga-soup-cooking.png.webp'],
  ['https://images.mrcook.app/recipe-image/0194a6ff-994c-7b1c-8a4b-cbc8b16f0059', 'https://www.consumerenergycenter.org/wp-content/uploads/2024/10/banana-oat-energy-balls-simple-delicious-and-nutritious-m5.jpeg'],
  ['https://betrhealth.com/cdn/shop/articles/overnight_oats_1.png?v=1716321520', 'https://ik.imagekit.io/mva6zbib7/prod/recipes/f01b2e5a-4fc4-4d7f-866b-48f6cded80a2/nocni_ovesna_proteinova_kase/no%C4%8Dn%C3%AD_vlo%C4%8Dky_protein_1_y4iPHqbPh.png?tr=w-1024%2Ch-auto%2Cfo-auto'],
  ['https://img.hellofresh.com/c_fit%2Cf_auto%2Cfl_lossy%2Ch_1100%2Cq_auto%2Cw_2600/hellofresh_s3/image/a7f99240-7e52-5e32-907b-401b2be505fa-2f702419.jpg', 'https://media.hellofresh.com/q_100%2Cw_3840%2Cf_auto%2Cc_limit%2Cfl_lossy/recipes/image/HFCARC-RT153409-7_Hero_CalSmartMoroccanSpicedTurkeyBowlsWithRoastedVegetableCouscous_W41-1027-2025_Web-490582a6.jpg'],
  ['https://pinterest-media-cdn.b-cdn.net/article-images/high-protein-snack-ideas-v2/snack_6_egg_snack_packs.png', 'https://www.arise-app.com/images/dishes/en/mixed-vegetable-and-egg-snack-box-13mwku.webp'],
  ['https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/itsu_edamame_snack_pot.jpg', 'https://cookcraftandcreate.com/wp-content/uploads/2025/07/edamame-with-chili-lime-seasoning.jpg'],
  ['https://i.mctimg.com/cdn-cgi/image/fit%3Dpad/https%3A/i.mctimg.com/file/2829f837a68085563adc97fe04e4ce581216b835/8ae0ff5016467e90c7dd2b29adf22e7cce267019ad251f207e98748e6c9af5b7', 'https://cdn.shopify.com/s/files/1/0904/1198/files/WONDERBAG-YOGHURT_1_2048x.png?v=1560753825'],
  ['https://image3.mouthshut.com/images/Restaurant/Photo/-68920_236815.png', 'https://cookrisp.com/assets/images/1767079955382-e4xntij0.jpg'],
  ['https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/large/spaghetti_with_lean_beef.jpg', 'https://tableofyum.com/wp-content/uploads/2025/08/Light-Beef-Mince-Spaghetti-Bolognese.jpg'],
  ['https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/chicken_fajita_wrap.jpg', 'https://sallyshop.b-cdn.net/media/c5/7d/a5/1756026005/sally-haehnchen-fajita-wraps-rezept_1.jpg?width=1920'],
  ['https://niyis.co.uk/cdn/shop/articles/Who_wants_this_____This_is_So_Yum_Yum_Yummy_aa309bd1-34c5-4f42-9530-88afaa01ac93.jpg?v=1742859037&width=1600', 'https://myplanetfood.com/wp-content/uploads/2025/05/OfadaRice-stew-930x620.jpg'],
  ['https://foreignfork.com/wp-content/uploads/2020/07/Ogbono-soup-Draw-Soup-blog-2.jpg', 'https://shopafricausa.com/cdn/shop/articles/ogbono.jpg?v=1566349969&width=1200'],
  ['https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/food_pics_v2/medium/prawn_fried_rice.jpg', 'https://casuallypeckish.com/wp-content/uploads/2021/09/Prawn-fried-rice-1.jpg'],
  ['https://www.kroger.com/content/v2/binary/recipe/images/5e14a91f9da07c34418dd53c-original.png', 'https://media.self.com/photos/5b048c98fb856d7d3d023761/2%3A1/w_1280%2Cc_limit/1017-cinnamon-pear-cottage-cheese.jpg'],
  ['https://the-perfect-pear.com/wp-content/uploads/2023/01/Popcorn-Trailmix-19-800x1200.jpg', 'https://contents.mediadecathlon.com/s999278/k%24b6b6c8344aa7c43e79729e4a6f97dd24/1800x0/540pt718/1080xcr982/default.jpg?format=auto'],
  ['https://snapcalorie-webflow-website.s3.us-east-2.amazonaws.com/media/recipe_pics_v2/medium/cucumber_tuna_boat.jpg', 'https://static.wixstatic.com/media/d1998d_b84d7c9fd57a4863bb5c0f3bc3745688~mv2.png/v1/fill/w_667%2Ch_1000%2Cal_c%2Cq_90%2Cusm_0.66_1.00_0.01/d1998d_b84d7c9fd57a4863bb5c0f3bc3745688~mv2.png'],
  ['https://img.hellofresh.com/f_auto%2Cfl_lossy%2Ch_900%2Cq_auto%2Cw_1600/hellofresh_s3/image/HF_Y25_R09_W33_IE_IEXCT18823-2_MAIN_high-d33209e8.jpg', 'https://media.hellofresh.com/q_100%2Cw_3840%2Cf_auto%2Cc_limit%2Cfl_lossy/recipes/image/HF190514_R01_W26_CHP_Main_low-310045de.jpg'],
  ['https://assets.tmecosys.com/video/upload/t_web_rdp_recipe_1200x900/videos/UK/Nigerian%20Collection/yam_pottage_.jpg', 'https://worldlytreat.com/wp-content/uploads/2023/01/Asaro-Nigerian-Yam-Porridge-2-1.jpg'],
  ['https://www.knuspr.de/cdn-cgi/image/f%3Dauto%2Cw%3D1200%2Ch%3D900%2Cfit%3Dcover/https%3A/cdn.knuspr.de/images/meals/large/recipe_2466_1777315601322_spaghetti-with-spinach-pesto-and-chicken_b6a0ec64.jpg', 'https://images.ctfassets.net/mfy91gw9rtrp/afbffd3c-f38a-4194-86e6-e4bb80580080/d2efa0226dc0443e3c4b88dd8a2c6b8a/Spaghetti______________________________Pesto_alla_Genovese____________________________.png?fm=webp&h=1600&q=85&w=1600'],
  ['https://www.foodnify.com/wp-content/uploads/2024/09/boiled-yam-egg-sauces.jpg', 'https://danlexwholesalefoods.com/wp-content/uploads/2023/05/yamscrambled-recipe.jpg']
]);

// Remove an accidental no-op entry if present; every real replacement below must be found.
for (const [from, to] of replacements) {
  if (from === to) continue;
  if (!code.includes(from)) throw new Error(`Expected curated source URL not found: ${from}`);
  code = code.split(from).join(to);
}

// Quality gate: never upscale. Accept only sources materially larger than the old 480x360 assets.
const oldGate = 'return Math.min(w, h) >= 700 && Math.max(w, h) >= 1000 && w * h >= 750000;';
const newGate = 'return Math.min(w, h) >= 600 && Math.max(w, h) >= 800 && w * h >= 500000;';
if (!code.includes(oldGate)) throw new Error('Expected HQ gate was not found.');
code = code.replace(oldGate, newGate);
code = code.replace("const version = '20260829-curated-v11-hq1';", "const version = '20260829-curated-v11-hq2';");

await writeFile(runtimePath, code);
console.log('Applied deterministic HQ source corrections. No random fallback and no upscaling.');
await import(`./${runtimePath}`);
