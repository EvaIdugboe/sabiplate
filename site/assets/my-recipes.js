/* SabiPlate "My Recipes": add your own recipes, or import one by pasting a post's caption.
   Everything runs in the browser. Ingredients are read with simple rules (no AI service),
   matched to SabiPlate's food table, and shown for review before saving.
   Saved recipes behave like built-in ones: library, recipe view, 14-day plan, shop and prep. */
(() => {
'use strict';
const D = window.SABI_PLAN_DATA, dbg = window.SABI_DEBUG;
if (!D || !dbg) return;
const KEY = 'sabiplate-my-recipes-v1';
const recipes = dbg.recipes;
const esc = s => String(s ?? '').replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m]));
const toast = m => { try { dbg.toast?.(m); } catch {} };
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const persist = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); window.dispatchEvent(new CustomEvent('sabiplate:changed')); return true; } catch { toast('Could not save: this device is out of space. Try a smaller photo.'); return false; } };
const CATS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const CUISINES = ['Nigerian', 'Nigerian-inspired', 'Global', 'Familiar international'];

/* ---------- Food names for the review screen ---------- */
const NAMES = { dry_basmati_rice: 'Basmati rice (uncooked)', dry_white_rice: 'Rice (uncooked)', dry_brown_rice: 'Brown rice (uncooked)', basmati_rice: 'Basmati rice (cooked)', white_rice: 'Rice (cooked)', brown_rice: 'Brown rice (cooked)', dry_pasta: 'Pasta / spaghetti (uncooked)', dry_wholewheat_pasta: 'Wholewheat pasta (uncooked)', pasta: 'Pasta (cooked)', wholewheat_pasta: 'Wholewheat pasta (cooked)', dry_couscous: 'Couscous (uncooked)', couscous: 'Couscous (cooked)', black_eyed_peas_dry: 'Beans / black-eyed peas (dry)', black_eyed_peas_cooked: 'Beans / black-eyed peas (cooked)', chicken: 'Chicken', turkey_breast: 'Turkey', turkey_mince: 'Turkey mince', lean_beef: 'Beef / goat meat', white_fish: 'Fish (white or mackerel)', tuna_canned: 'Tinned tuna', tuna_steak: 'Tuna steak', egg: 'Egg', egg_white: 'Egg white', greek_yogurt: 'Greek yoghurt', yogurt: 'Natural yoghurt', bell_pepper: 'Peppers (tatashe / bell)', tomato_pepper_sauce: 'Tomato-pepper stew base', passata: 'Tomato paste / tinned tomatoes', mixed_veg: 'Mixed vegetables / mushrooms', leafy_greens: 'Leafy greens (ugu, efo, ugwu)', coconut_milk_light: 'Coconut milk', olive_oil: 'Cooking oil', wrap: 'Wrap / tortilla', pita: 'Pitta', burger_bun: 'Burger bun', wholegrain_bread: 'Bread', eba: 'Eba / garri (made)', wheat_swallow: 'Swallow (semo, wheat, amala)', ogbono_seed: 'Ogbono (ground)', palm_fruit: 'Palm fruit concentrate', protein_powder: 'Protein powder', seasoning: 'Seasoning / spice / water (no calories)', egg_combo_2_1: 'Eggs and egg whites', beans: 'Green beans', dark_chocolate: 'Chocolate', maple: 'Maple syrup', chia: 'Chia seeds' };
const foodName = k => NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1).replaceAll('_', ' '));
const FOOD_KEYS = Object.keys(D.foods).filter(k => k !== 'egg_combo_2_1').sort((a, b) => foodName(a).localeCompare(foodName(b)));

/* ---------- Ingredient reading ---------- */
// First match wins, so longer, more specific phrases come first.
const ALIASES = [
  [/\b(stock|broth|bouillon)\b/, 'seasoning'],
  [/egg whites?/, 'egg_white'], [/greek[- ]?(style )?yog(h)?urt/, 'greek_yogurt'], [/yog(h)?urt/, 'yogurt'], [/cottage cheese/, 'cottage_cheese'], [/ricotta/, 'ricotta'], [/cream cheese|philadelphia/, 'cream_cheese_light'], [/parmesan|cheddar|mozzarella|feta|cheese/, 'parmesan'],
  [/coconut milk/, 'coconut_milk_light'], [/coconut oil/, 'coconut_oil'], [/desiccated coconut|coconut flakes/, 'coconut_flakes'], [/palm oil/, 'palm_oil'], [/palm (fruit|nut)|banga/, 'palm_fruit'], [/sesame oil/, 'sesame_oil'], [/peanut butter|groundnut paste/, 'peanut_butter'],
  [/\b(olive|vegetable|sunflower|groundnut|rapeseed|canola|cooking) oil\b|^oil\b|\boil\b|butter|margarine/, 'olive_oil'],
  [/turkey mince|minced turkey|ground turkey/, 'turkey_mince'], [/turkey/, 'turkey_breast'], [/chicken/, 'chicken'],
  [/minced beef|beef mince|ground beef|beef|steak|goat( meat)?|assorted meat|lamb|shaki|ponmo/, 'lean_beef'],
  [/smoked salmon|salmon/, 'salmon'], [/tuna steak/, 'tuna_steak'], [/tuna/, 'tuna_canned'], [/\bcod\b/, 'cod'], [/tilapia/, 'tilapia'], [/croaker/, 'croaker'], [/sardine/, 'sardines'],
  [/mackerel|titus|catfish|hake|haddock|stockfish|dry fish|\bfish\b/, 'white_fish'], [/prawn|shrimp/, 'prawns'], [/crayfish|stock ?cube|bouillon|maggi|knorr|seasoning cube/, 'seasoning'],
  [/\beggs?\b/, 'egg'], [/protein powder|whey/, 'protein_powder'], [/tofu/, 'tofu'], [/edamame/, 'edamame'],
  [/coconut rice|jollof|basmati/, 'RICE_BASMATI'], [/brown rice/, 'RICE_BROWN'], [/\brice\b/, 'RICE'],
  [/whole ?wheat (pasta|spaghetti|penne)/, 'PASTA_WW'], [/spaghetti|pasta|penne|macaroni|fusilli|noodles?|indomie/, 'PASTA'], [/couscous/, 'COUSCOUS'], [/quinoa/, 'quinoa'], [/bulgur/, 'bulgur'],
  [/oats|porridge oats|oatmeal/, 'oats'], [/granola/, 'granola'], [/tortilla|\bwraps?\b/, 'wrap'], [/pitt?a/, 'pita'], [/\bbuns?\b/, 'burger_bun'], [/bread|toast|agege/, 'wholegrain_bread'], [/crackers?/, 'cracker'],
  [/black[- ]?eyed|\bewa\b|honey beans|oloyin|brown beans/, 'BEANS'], [/kidney beans?/, 'kidney_beans'], [/black beans?/, 'black_beans'], [/green beans?|string beans?/, 'beans'], [/chick ?peas?|garbanzo/, 'chickpeas'], [/lentils?/, 'lentils'], [/\bbeans\b/, 'BEANS'],
  [/sweet ?potato/, 'sweet_potato'], [/cocoyam|ede\b/, 'cocoyam'], [/\byams?\b/, 'yam'], [/potato/, 'potato'], [/plantain|dodo/, 'plantain'],
  [/garri|gari|\beba\b/, 'eba'], [/semo|semovita|wheat meal|amala|pounded yam|fufu|poundo|swallow/, 'wheat_swallow'], [/ogbono/, 'ogbono_seed'],
  [/okra|okro/, 'okra'], [/spinach|efo|\bugu\b|ugwu|kale|bitter ?leaf|water ?leaf|afang|oha|ukazi|okazi|scent leaf|tete|greens/, 'leafy_greens'],
  [/tomato paste|tomato puree|passata|chopped tomatoes|tinned tomato|canned tomato/, 'passata'], [/tomato/, 'tomato'],
  [/black pepper|white pepper|scotch bonnet|ata rodo|rodo|chill?i|cayenne|pepper flakes|paprika/, 'seasoning'],
  [/bell pepper|tatashe|red pepper|green pepper|yellow pepper|shombo|\bpeppers?\b/, 'bell_pepper'],
  [/spring onion|scallion|onion|shallot/, 'onion'],
  [/carrot/, 'carrot'], [/cabbage/, 'cabbage'], [/lettuce/, 'lettuce'], [/cucumber/, 'cucumber'], [/broccoli/, 'broccoli'], [/cauliflower/, 'cauliflower'], [/courgette|zucchini/, 'courgette'], [/aubergine|eggplant|garden egg/, 'aubergine'], [/asparagus/, 'asparagus'], [/sweet ?corn|\bcorn\b/, 'sweetcorn'], [/\bpeas\b/, 'peas'], [/mixed veg|vegetables|mushroom/, 'mixed_veg'],
  [/avocado/, 'avocado'], [/banana/, 'banana'], [/\bapples?\b/, 'apple'], [/berr(y|ies)|strawberr|blueberr|raspberr/, 'berries'], [/mango/, 'mango'], [/pineapple/, 'pineapple'], [/\bpears?\b/, 'pear'],
  [/honey|sugar|syrup(?!.*maple)/, 'honey'], [/maple/, 'maple'], [/peanuts?|groundnuts?/, 'peanuts'], [/almonds?/, 'almonds'], [/walnuts?/, 'walnuts'], [/pecans?/, 'pecans'], [/chia/, 'chia'], [/flax/, 'flaxseed'], [/pumpkin seeds?/, 'pumpkin_seeds'], [/tahini/, 'tahini'], [/sesame/, 'sesame_seeds'], [/hummus/, 'hummus'], [/pesto/, 'pesto'], [/chocolate|cocoa/, 'dark_chocolate'], [/popcorn/, 'popcorn'], [/\bmilk\b/, 'milk'],
  [/garlic|ginger|salt|curry|thyme|cumin|turmeric|spice|seasoning|herbs?|bay lea|nutmeg|cinnamon|vanilla|lemon|lime|soy sauce|vinegar|water|ice\b|mustard|ketchup|mayo|parsley|coriander|cilantro|basil|oregano|rosemary|baking|yeast|suya spice|yaji|uziza|uda|iru|locust/, 'seasoning']
];
const FRACT = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const UNIT_G = { kg: 1000, g: 1, gram: 1, grams: 1, mg: 0.001, l: 1000, litre: 1000, liter: 1000, ml: 1, cl: 10, oz: 28.35, lb: 453.6, lbs: 453.6, tbsp: 15, tablespoon: 15, tablespoons: 15, tbs: 15, tsp: 5, teaspoon: 5, teaspoons: 5, pinch: 0.5, dash: 0.5, handful: 30, handfuls: 30, can: 400, cans: 400, tin: 400, tins: 400, clove: 4, cloves: 4, slice: 35, slices: 35, knob: 10, bunch: 100, pack: 400, packet: 400, sachet: 10, cube: 4, cubes: 4, wrap: 60, wraps: 60, scoop: 30, scoops: 30, mug: 250, glass: 250, fillet: 130, fillets: 130, breast: 150, breasts: 150, thigh: 110, thighs: 110, drumstick: 90, drumsticks: 90 };
const CUP_G = { dry_white_rice: 185, dry_basmati_rice: 185, dry_brown_rice: 185, white_rice: 160, basmati_rice: 160, brown_rice: 160, oats: 90, black_eyed_peas_dry: 180, black_eyed_peas_cooked: 170, milk: 245, yogurt: 245, greek_yogurt: 245, leafy_greens: 30, spinach: 30, eba: 150, wheat_swallow: 150, dry_couscous: 175, couscous: 160, quinoa: 185, berries: 150, olive_oil: 218, honey: 340, mixed_veg: 130, passata: 245, coconut_milk_light: 245, granola: 120 };
const EACH_G = { egg: 50, onion: 150, bell_pepper: 150, tomato: 120, plantain: 220, sweet_potato: 200, potato: 170, apple: 180, banana: 120, avocado: 150, carrot: 70, cucumber: 300, chicken: 150, white_fish: 130, salmon: 130, tilapia: 300, croaker: 300, cod: 130, wrap: 60, pita: 60, burger_bun: 60, wholegrain_bread: 35, courgette: 200, aubergine: 250, pear: 170, mango: 200, tuna_canned: 110, sardines: 90, yam: 120, lean_beef: 120, turkey_breast: 120, prawns: 15, broccoli: 300, cauliflower: 500, lettuce: 300, cabbage: 700, seasoning: 3 };
function num(s) {
  if (!s) return null;
  s = s.trim().replace(',', '.');
  for (const [f, v] of Object.entries(FRACT)) if (s.includes(f)) { const whole = parseFloat(s.replace(f, '')) || 0; return whole + v; }
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3];
  m = s.match(/^(\d+)\/(\d+)$/); if (m) return m[1] / m[2];
  const v = parseFloat(s); return isNaN(v) ? null : v;
}
function matchFood(t) {
  for (const [re, key] of ALIASES) if (re.test(t)) return key;
  return null;
}
function resolveFood(tag, t, unit) {
  const cooked = /cooked|boiled|leftover|steamed/.test(t), dry = /uncooked|raw|dry|dried/.test(t);
  if (tag === 'RICE') return cooked && !dry ? 'white_rice' : 'dry_white_rice';
  if (tag === 'RICE_BASMATI') return cooked && !dry ? 'basmati_rice' : 'dry_basmati_rice';
  if (tag === 'RICE_BROWN') return cooked && !dry ? 'brown_rice' : 'dry_brown_rice';
  if (tag === 'PASTA') return cooked && !dry ? 'pasta' : 'dry_pasta';
  if (tag === 'PASTA_WW') return cooked && !dry ? 'wholewheat_pasta' : 'dry_wholewheat_pasta';
  if (tag === 'COUSCOUS') return cooked && !dry ? 'couscous' : 'dry_couscous';
  if (tag === 'BEANS') return (cooked || /tin|can/.test(t + ' ' + (unit || ''))) && !dry ? 'black_eyed_peas_cooked' : 'black_eyed_peas_dry';
  return tag;
}
function parseIngredient(line) {
  const raw = line.trim();
  const t = raw.toLowerCase().replace(/[–—]/g, '-');
  let qty = null, unit = null, flag = false;
  // A weight or volume anywhere in the line: "chicken 500g", "(400g tin)"
  const wm = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|grams?|ml|l|litres?|liters?|cl|oz|lbs?)\b/);
  const lead = t.match(/^(?:[-*•]\s*)?((?:\d+\s+)?\d+\/\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])(?:\s*(?:-|to)\s*(\d+(?:[.,]\d+)?))?\s*(?:x\s*)?([a-z]+)?/);
  let key = matchFood(t);
  if (wm) { qty = num(wm[1]); unit = wm[2]; }
  else if (lead) {
    qty = num(lead[1]); if (lead[2]) qty = (qty + num(lead[2])) / 2;
    const u = (lead[3] || '').replace(/\.$/, '');
    if (u === 'cup' || u === 'cups') unit = 'cup';
    else if (UNIT_G[u] !== undefined) unit = u;
    else if (u === 'large') unit = 'large'; else if (u === 'small') unit = 'small'; else if (u === 'medium') unit = 'each';
    else unit = 'each';
  }
  if (key) key = resolveFood(key, t, unit);
  let grams;
  if (!key) { key = null; grams = qty && unit && UNIT_G[unit] ? qty * UNIT_G[unit] : 100; flag = true; }
  else if (qty === null) { grams = key === 'seasoning' ? 2 : (EACH_G[key] || 100); flag = key !== 'seasoning'; }
  else if (unit === 'cup') grams = qty * (CUP_G[key] || 150);
  else if (unit === 'each' || unit === 'large' || unit === 'small') { const e = EACH_G[key] || 100; grams = qty * e * (unit === 'large' ? 1.3 : unit === 'small' ? 0.7 : 1); if (!EACH_G[key]) flag = true; }
  else if (UNIT_G[unit] !== undefined) { grams = qty * UNIT_G[unit]; if (/tbsp|tablespoon|tbs/.test(unit) && key === 'olive_oil') grams = qty * 13.5; if (/can|tin/.test(unit) && /beans|chickpea|tuna|sardine|sweetcorn/.test(t)) grams = qty * 240; }
  else { grams = 100; flag = true; }
  if (key === 'seasoning') grams = Math.min(grams, 30);
  return { text: raw, key, grams: Math.round(grams), flag };
}
const STEP_HEAD = /^(method|instructions?|directions?|steps?|how to (make|cook)( it)?|preparation|procedure|to make|cooking)\b[:\s]*$/i;
const ING_HEAD = /^(ingredients?|what you( wi|')ll need|you( wi|')ll need|for the [a-z ]+)\b[:\s]*/i;
function cleanLine(l) {
  return l.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ').replace(/^\s*(?:[-*•▪◦·>✓✔]|\d+[.)]\s(?=\D))\s*/, m => /\d/.test(m) ? m : '').replace(/\s+/g, ' ').trim();
}
function parseCaption(text) {
  const lines = String(text || '').split(/\r?\n|(?<=\.)\s+(?=\d+[.)]\s)/).map(cleanLine).filter(l => l && !/^#\w/.test(l) && !/^@\w+$/.test(l));
  const ingredients = [], steps = [];
  let mode = null, title = '';
  for (const l of lines) {
    if (ING_HEAD.test(l) && l.length < 40) { mode = 'ing'; const rest = l.replace(ING_HEAD, '').trim(); if (rest && /\d|\b(a|an|some)\b/.test(rest)) ingredients.push(parseIngredient(rest)); continue; }
    if (STEP_HEAD.test(l)) { mode = 'step'; continue; }
    const numbered = /^(step\s*)?\d+[.):-]\s+/i.test(l);
    const looksIng = l.length <= 70 && (/^((\d+\s+)?\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾⅓⅔⅛])/.test(l) || /\d+\s*(g|kg|ml|cups?|tbsp|tsp)\b/i.test(l)) && !!matchFood(l.toLowerCase());
    if (mode === 'step' || (numbered && !looksIng) || (!looksIng && l.length > 70)) { steps.push(l.replace(/^(step\s*)?\d+[.):-]\s+/i, '')); continue; }
    if (mode === 'ing' || looksIng) { ingredients.push(parseIngredient(l)); continue; }
    if (!title && l.length < 80 && !ingredients.length) { title = l.replace(/\(?\s*(serves|for)\s*\d+\s*(people|persons?)?\s*\)?/i, '').replace(/[:!.\s-]+$/, '').trim(); continue; }
    if (matchFood(l.toLowerCase()) && l.length <= 60) ingredients.push(parseIngredient(l));
    else steps.push(l);
  }
  return { title, ingredients, steps };
}
function nutrition(ings, servings) {
  const t = [0, 0, 0, 0];
  for (const i of ings) { const f = D.foods[i.key]; if (!f) continue; for (let j = 0; j < 4; j++) t[j] += f[j] * i.grams / 100; }
  const s = Math.max(1, servings);
  return [Math.round(t[0] / s), Math.round(t[1] / s * 10) / 10, Math.round(t[2] / s * 10) / 10, Math.round(t[3] / s * 10) / 10];
}

/* ---------- Placeholder image and photo upload ---------- */
function placeholder() {
  // A plain plate, so the recipe name is not printed twice over the header.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720"><rect width="960" height="720" fill="#efe2cf"/><circle cx="480" cy="330" r="210" fill="#fffaf3" stroke="#dcc6a8" stroke-width="6"/><circle cx="480" cy="330" r="150" fill="none" stroke="#e8d7bf" stroke-width="4"/><g stroke="#c76845" stroke-width="10" stroke-linecap="round"><line x1="215" y1="200" x2="215" y2="460"/><line x1="195" y1="200" x2="195" y2="270"/><line x1="235" y1="200" x2="235" y2="270"/><line x1="745" y1="200" x2="745" y2="460"/></g><path d="M745 200 q40 60 0 140" fill="#c76845"/></svg>';
return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const W = 800, H = 600, c = document.createElement('canvas'); c.width = W; c.height = H;
      const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#f4eadc'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
    img.src = url;
  });
}

/* ---------- Turning a saved record into an app recipe ---------- */
function sourceLabel(u) { try { const h = new URL(u).hostname.replace(/^www\./, ''); return /instagram/.test(h) ? 'Instagram' : /tiktok/.test(h) ? 'TikTok' : /youtu/.test(h) ? 'YouTube' : h; } catch { return ''; } }
function toRecipe(m) {
  const serv = Math.max(1, Number(m.servings) || 1);
  const ings = m.ingredients.filter(i => i.key && i.grams > 0);
  const n = nutrition(ings, serv);
  return {
    id: m.id, title: m.title, category: m.category, cuisine: m.cuisine, calories: n[0], protein: n[1], carbs: n[2], fat: n[3], prep: Number(m.prep) || 30,
    image: m.photo || placeholder(m.title, m.category), ingredients: m.ingredients.map(i => i.text), methods: m.steps.length ? m.steps : ['Add your method by editing this recipe.'],
    tags: ['My recipe', m.category, m.cuisine, sourceLabel(m.sourceUrl)].filter(Boolean), nutritionNote: 'Worked out from the ingredients you entered.',
    exactIngredients: m.ingredients.map(i => ({ text: i.text, foodKey: i.key, grams: Math.round(i.grams / serv), unit: 'g' })), mine: true, sourceUrl: m.sourceUrl || ''
  };
}
function register() {
  for (let i = recipes.length - 1; i >= 0; i--) if (recipes[i].mine) recipes.splice(i, 1);
  for (const id of Object.keys(D.ing)) if (id.startsWith('my-')) { delete D.ing[id]; delete D.nutrition[id]; }
  for (const m of load()) {
    if (!m || !m.id || !CATS.includes(m.category)) continue;
    const r = toRecipe(m), serv = Math.max(1, Number(m.servings) || 1);
    const ing = m.ingredients.filter(i => i.key && D.foods[i.key] && i.grams > 0).map(i => [i.key, Math.round(i.grams / serv * 10) / 10, i.text]);
    if (!ing.length) continue;
    recipes.unshift(r); D.ing[r.id] = ing; D.nutrition[r.id] = [r.calories, r.protein, r.carbs, r.fat];
  }
  window.SABI_PLAN?.refreshRecipes?.();
}
register();

/* ---------- Recipe view: link back to the original post ---------- */
window.SABI_SOURCE_BLOCK = r => {
  if (!r?.mine) return '';
  const label = sourceLabel(r.sourceUrl);
  return `<div class="mr-source no-print">${r.sourceUrl ? `<a class="ghost-btn" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">View the original${label ? ' on ' + esc(label) : ''}</a>` : ''}<button type="button" class="ghost-btn" data-mr-edit="${esc(r.id)}">Edit my recipe</button><small class="muted">Your own recipe. Calories are worked out from the ingredients you entered.</small></div>`;
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-mr-edit]'); if (!b) return;
  document.querySelector('#recipeModal [data-close-modal]')?.click();
  openEditor(load().find(m => m.id === b.dataset.mrEdit));
});

/* ---------- Editor ---------- */
let modal = null;
function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div'); modal.className = 'modal'; modal.id = 'mrModal'; modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = '<div class="modal-backdrop" data-mr-close></div><article class="chooser-card" role="dialog" aria-modal="true" aria-labelledby="mrTitle"><button type="button" class="modal-close" data-mr-close aria-label="Close">×</button><div id="mrBody"></div></article>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target.closest('[data-mr-close]')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
  return modal;
}
function closeModal() { modal?.classList.remove('open'); modal?.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
let draft = null;
function blank() { return { id: '', title: '', category: 'Dinner', cuisine: 'Nigerian', servings: 2, prep: 30, sourceUrl: '', caption: '', photo: '', ingredients: [], steps: [] }; }
function openEditor(existing) {
  draft = existing ? JSON.parse(JSON.stringify(existing)) : blank();
  ensureModal(); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
  drawEditor(); modal.querySelector('.chooser-card').scrollTop = 0;
}
const foodOptions = sel => `<option value="" ${sel ? '' : 'selected'}>Choose a food…</option>` + FOOD_KEYS.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(foodName(k))}</option>`).join('');
function ingRows() {
  if (!draft.ingredients.length) return '<p class="muted">No ingredients yet. Paste the recipe above and press “Read the recipe”, or add them one by one.</p>';
  return draft.ingredients.map((i, n) => { const f = D.foods[i.key]; const kcal = f ? Math.round(f[0] * i.grams / 100) : 0; return `<div class="mr-ing ${!i.key || i.flag ? 'check' : ''}" data-row="${n}"><input class="mr-text" data-f="text" value="${esc(i.text)}" aria-label="Ingredient as written"><select data-f="key" aria-label="Matched food">${foodOptions(i.key)}</select><label class="mr-grams"><input data-f="grams" type="number" inputmode="decimal" min="0" step="5" value="${i.grams}" aria-label="Grams for the whole recipe"><span>g</span></label><span class="mr-kcal">${kcal} kcal</span><button type="button" class="mr-x" data-del="${n}" aria-label="Remove ingredient">×</button>${!i.key ? '<small class="mr-warn">Pick the closest food so calories can be worked out.</small>' : i.flag ? '<small class="mr-warn">Check the weight: no amount was given, so this is a guess.</small>' : ''}</div>`; }).join('');
}
function summary() {
  const n = nutrition(draft.ingredients.filter(i => i.key), draft.servings);
  return `<b>Per serving:</b> ${n[0]} kcal · ${n[1]}g protein · ${n[2]}g carbs · ${n[3]}g fat <span class="muted">(${draft.servings} serving${draft.servings == 1 ? '' : 's'})</span>`;
}
function drawEditor() {
  const body = modal.querySelector('#mrBody');
  body.innerHTML = `<span class="eyebrow">My Recipes</span><h2 id="mrTitle" style="font-family:Georgia,serif;color:var(--green);margin:4px 0 6px">${draft.id ? 'Edit your recipe' : 'Add a recipe'}</h2>
  <p class="muted" style="margin-top:0">Saw a recipe on Instagram, TikTok or a website? Paste the link, then copy the caption into the box. SabiPlate reads the ingredients and works out the calories. You check everything before saving.</p>
  <label class="mr-label">Link to the post (optional)<input id="mrUrl" type="url" inputmode="url" placeholder="https://www.instagram.com/p/…" value="${esc(draft.sourceUrl)}"></label>
  <label class="mr-label">Recipe text or caption<textarea id="mrCaption" rows="7" placeholder="Paste the caption here. In Instagram, tap the caption, then … → Copy, or press and hold the text.">${esc(draft.caption)}</textarea></label>
  <button type="button" class="secondary-btn" id="mrRead">Read the recipe</button>
  <div class="mr-grid"><label class="mr-label">Recipe name<input id="mrName" value="${esc(draft.title)}" maxlength="70" placeholder="e.g. Chicken suya rice bowl"></label>
  <label class="mr-label">Meal<select id="mrCat">${CATS.map(c => `<option ${draft.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
  <label class="mr-label">Cuisine<select id="mrCuisine">${CUISINES.map(c => `<option ${draft.cuisine === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
  <label class="mr-label">Servings it makes<input id="mrServ" type="number" inputmode="numeric" min="1" max="20" value="${draft.servings}"></label>
  <label class="mr-label">Minutes to make<input id="mrPrep" type="number" inputmode="numeric" min="1" max="600" value="${draft.prep}"></label></div>
  <h3 class="sp-cat">Ingredients <small class="muted" style="font-family:inherit;font-size:13px">amounts for the whole recipe</small></h3>
  <div id="mrIngs">${ingRows()}</div><button type="button" class="ghost-btn" id="mrAddIng">+ Add an ingredient</button>
  <div class="v15-note" id="mrSummary">${summary()}</div>
  <label class="mr-label">Method <small class="muted">one step per line</small><textarea id="mrSteps" rows="6" placeholder="Season the chicken…">${esc(draft.steps.join('\n'))}</textarea></label>
  <div class="mr-photo"><img id="mrPhotoImg" src="${esc(draft.photo || placeholder(draft.title, draft.category))}" alt=""><div><b>Photo</b><p class="muted" style="margin:4px 0 8px">Use your own photo of the dish. For posts from other people, the recipe links back to the original post instead of copying their photo.</p><label class="ghost-btn mr-upload">Choose a photo<input id="mrPhoto" type="file" accept="image/*" hidden></label>${draft.photo ? ' <button type="button" class="ghost-btn" id="mrNoPhoto">Remove photo</button>' : ''}</div></div>
  <div class="mr-actions"><button type="button" class="primary-btn" id="mrSave">Save to My Recipes</button>${draft.id ? '<button type="button" class="ghost-btn mr-danger" id="mrDelete">Delete recipe</button>' : ''}</div>`;
  bindEditor(body);
}
function syncFields(body) {
  draft.sourceUrl = body.querySelector('#mrUrl').value.trim();
  draft.caption = body.querySelector('#mrCaption').value;
  draft.title = body.querySelector('#mrName').value.trim();
  draft.category = body.querySelector('#mrCat').value;
  draft.cuisine = body.querySelector('#mrCuisine').value;
  draft.servings = Math.min(20, Math.max(1, Math.round(Number(body.querySelector('#mrServ').value) || 1)));
  draft.prep = Math.min(600, Math.max(1, Math.round(Number(body.querySelector('#mrPrep').value) || 30)));
  draft.steps = body.querySelector('#mrSteps').value.split(/\n+/).map(s => s.trim()).filter(Boolean);
}
function bindEditor(body) {
  const refresh = () => { body.querySelector('#mrIngs').innerHTML = ingRows(); body.querySelector('#mrSummary').innerHTML = summary(); };
  body.querySelector('#mrRead').onclick = () => {
    syncFields(body);
    if (!draft.caption.trim()) { toast('Paste the recipe text first'); return; }
    const p = parseCaption(draft.caption);
    if (!p.ingredients.length) { toast('No ingredients found. Add them below, one per line works best.'); return; }
    draft.ingredients = p.ingredients; if (p.steps.length) draft.steps = p.steps; if (!draft.title && p.title) draft.title = p.title;
    const s = draft.caption.match(/serves\s*(\d+)|(\d+)\s*(servings|portions|people)/i); if (s) draft.servings = Math.min(20, Number(s[1] || s[2]));
    drawEditor();
    const unsure = draft.ingredients.filter(i => !i.key || i.flag).length;
    toast(`Found ${draft.ingredients.length} ingredients${unsure ? `; ${unsure} to check` : ''}`);
  };
  body.querySelector('#mrIngs').addEventListener('input', e => {
    const row = e.target.closest('[data-row]'); if (!row) return; const i = draft.ingredients[+row.dataset.row], f = e.target.dataset.f;
    if (f === 'text') i.text = e.target.value;
    if (f === 'grams') { i.grams = Math.max(0, Number(e.target.value) || 0); i.flag = false; }
    if (f === 'key') { i.key = e.target.value || null; i.flag = false; }
    if (f !== 'text') { const fd = D.foods[i.key]; row.querySelector('.mr-kcal').textContent = (fd ? Math.round(fd[0] * i.grams / 100) : 0) + ' kcal'; body.querySelector('#mrSummary').innerHTML = summary(); }
    if (f === 'key') { row.classList.toggle('check', !i.key); row.querySelector('.mr-warn')?.remove(); }
  });
  body.querySelector('#mrIngs').addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (!d) return; draft.ingredients.splice(+d.dataset.del, 1); refresh(); });
  body.querySelector('#mrAddIng').onclick = () => { draft.ingredients.push({ text: '', key: null, grams: 100, flag: false }); refresh(); body.querySelector('#mrIngs [data-row]:last-child .mr-text')?.focus(); };
  body.querySelector('#mrServ').oninput = () => { draft.servings = Math.max(1, Number(body.querySelector('#mrServ').value) || 1); body.querySelector('#mrSummary').innerHTML = summary(); };
  body.querySelector('#mrPhoto').onchange = async e => { const f = e.target.files?.[0]; if (!f) return; syncFields(body); try { draft.photo = await shrinkPhoto(f); drawEditor(); } catch (err) { toast(err.message); } };
  body.querySelector('#mrNoPhoto')?.addEventListener('click', () => { syncFields(body); draft.photo = ''; drawEditor(); });
  body.querySelector('#mrSave').onclick = () => {
    syncFields(body);
    if (!draft.title) { toast('Give the recipe a name'); body.querySelector('#mrName').focus(); return; }
    const usable = draft.ingredients.filter(i => i.key && i.grams > 0);
    if (!usable.length) { toast('Add at least one ingredient with a food and weight'); return; }
    if (draft.sourceUrl && !/^https?:\/\//i.test(draft.sourceUrl)) draft.sourceUrl = 'https://' + draft.sourceUrl;
    const list = load(), isNew = !draft.id;
    if (isNew) draft.id = 'my-' + Date.now().toString(36);
    draft.ingredients = draft.ingredients.filter(i => i.text.trim() || i.key);
    const idx = list.findIndex(m => m.id === draft.id);
    const rec = { ...draft, updated: new Date().toISOString() };
    if (idx >= 0) list[idx] = rec; else list.unshift(rec);
    if (!persist(list)) return;
    register(); closeModal(); refreshViews();
    toast(isNew ? `${draft.title} saved to My Recipes` : 'Recipe updated');
  };
  body.querySelector('#mrDelete')?.addEventListener('click', () => {
    if (!confirm(`Delete “${draft.title}”? It will also be removed from your plan.`)) return;
    persist(load().filter(m => m.id !== draft.id)); register(); closeModal(); refreshViews();
    const p = window.SABI_PLAN; if (p?.getPlan) p.setPlan(p.getPlan());
    toast('Recipe deleted');
  });
}

/* ---------- Recipes page panel ---------- */
function panelHtml() {
  const mine = load();
  return `<section class="v15-card mr-panel"><div class="mr-head"><div><span class="eyebrow">My Recipes</span><h2 style="font-family:Georgia,serif;color:var(--green);margin:4px 0">Add the meals you already love</h2><p class="muted" style="margin:0">Paste a recipe from Instagram, TikTok or anywhere. It joins your plan, shop and prep like any SabiPlate recipe.</p></div><button type="button" class="primary-btn" id="mrNew">+ Add a recipe</button></div>${mine.length ? `<div class="mr-list">${mine.map(m => { const r = recipes.find(x => x.id === m.id); return r ? `<div class="mr-item"><img src="${esc(r.image)}" alt=""><div><b>${esc(r.title)}</b><small>${esc(r.category)} · ${r.calories} kcal · ${Math.round(r.protein)}g protein</small></div><div class="mr-item-actions"><button type="button" class="ghost-btn" data-mr-open="${esc(r.id)}">Open</button><button type="button" class="ghost-btn" data-mr-plan="${esc(r.id)}">+ Plan</button><button type="button" class="ghost-btn" data-mr-edit="${esc(r.id)}">Edit</button></div></div>` : ''; }).join('')}</div>` : ''}</section>`;
}
function injectPanel() {
  const v = document.querySelector('#view-recipes'); if (!v) return;
  v.querySelector('.mr-panel')?.remove();
  const wrap = document.createElement('div'); wrap.innerHTML = panelHtml(); const panel = wrap.firstElementChild;
  const head = v.querySelector('.page-head'); head ? head.after(panel) : v.prepend(panel);
  panel.querySelector('#mrNew').onclick = () => openEditor(null);
  panel.addEventListener('click', e => {
    const o = e.target.closest('[data-mr-open]'), p = e.target.closest('[data-mr-plan]');
    if (o) dbg.openRecipe(o.dataset.mrOpen);
    if (p) window.SABI_PLAN?.addRecipe(p.dataset.mrPlan);
  });
}
function refreshViews() {
  const active = document.querySelector('.view.active')?.id?.replace('view-', '');
  if (active) dbg.nav(active);
}
window.addEventListener('sabiplate:view-rendered', e => { if (e.detail?.name === 'recipes') injectPanel(); });
// Another device may have synced new recipes into this browser.
window.addEventListener('storage', e => { if (e.key === KEY) { register(); refreshViews(); } });
window.SABI_MY_RECIPES = { open: openEditor, parseCaption, parseIngredient, list: load, register };
if (document.querySelector('#view-recipes.active')) injectPanel();
})();
