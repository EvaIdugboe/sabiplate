/* SabiPlate household plan engine.
   One shared 14-day plan; every person gets their own portions of the same dishes.
   Planner, fortnight shop and prep plan are all derived from the plan state. */
(() => {
'use strict';
const D = window.SABI_PLAN_DATA, dbg = window.SABI_DEBUG;
if (!D || !dbg) return;
const recipes = dbg.recipes;
const rmap = Object.fromEntries(recipes.map(r => [r.id, r]));
const esc = s => String(s ?? '').replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m]));
const money = n => '£' + Number(n || 0).toFixed(2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toast = msg => { try { dbg.toast?.(msg); } catch {} };
const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new CustomEvent('sabiplate:changed')); } catch {} }
};
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayLabel = di => `Week ${Math.floor(di / 7) + 1} ${DAY_NAMES[di % 7]}`;
const GOALS = { loss: 'Fat loss', maintain: 'Maintenance', gain: 'Muscle gain', custom: 'Custom target' };
const GOAL_KCAL = { loss: 1750, maintain: 2200, gain: 2800 };
const MIN_KCAL = 1200, MAX_KCAL = 4500, MAX_MEMBERS = 6;

// Recipe cards show the same nutrition the planner uses.
for (const r of recipes) { const n = D.nutrition[r.id]; if (n) { r.calories = n[0]; r.protein = n[1]; r.carbs = n[2]; r.fat = n[3]; } }

/* ---------- People ---------- */
function autoMacros(kcal) {
  const protein = clamp(Math.round(140 + (kcal - 1750) / 30), 80, 230);
  const fat = Math.round(kcal * 0.27 / 9);
  return { protein, fat };
}
function cleanMembers(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.slice(0, MAX_MEMBERS).map((m, i) => {
    const kcal = clamp(Math.round(Number(m.kcal) || 2000), MIN_KCAL, MAX_KCAL);
    const auto = m.auto !== false;
    const a = autoMacros(kcal);
    let protein = auto ? a.protein : clamp(Math.round(Number(m.protein) || a.protein), 40, 350);
    let fat = auto ? a.fat : clamp(Math.round(Number(m.fat) || a.fat), 20, 220);
    // Leave room for at least 40g of carbohydrate.
    const room = kcal - 160;
    if (4 * protein + 9 * fat > room) { fat = Math.max(20, Math.floor((room - 4 * protein) / 9)); if (4 * protein + 9 * fat > room) protein = Math.max(40, Math.floor((room - 9 * fat) / 4)); }
    return { id: String(m.id || ('m' + i)), name: String(m.name || '').trim().slice(0, 24) || ('Person ' + (i + 1)), goal: GOALS[m.goal] ? m.goal : 'custom', kcal, auto, protein, fat };
  });
}
function defaultMembers() {
  const a = store.get('sabiplate-v15-female-name', 'Female'), b = store.get('sabiplate-v15-male-name', 'Male');
  return cleanMembers([{ id: 'm0', name: a === 'Female' ? 'Person 1' : a, goal: 'loss', kcal: 1750 }, { id: 'm1', name: b === 'Male' ? 'Person 2' : b, goal: 'gain', kcal: 2800 }]);
}
const targetOf = m => ({ kcal: m.kcal, protein: m.protein, fat: m.fat, carbs: Math.max(0, Math.round((m.kcal - 4 * m.protein - 9 * m.fat) / 4)) });
let members = cleanMembers(store.get('sabiplate-household-v1', null)) || defaultMembers();

/* ---------- Plan state ---------- */
const validId = id => !!(id && D.ing[id] && rmap[id]);
function defaultPlan() { return { v: 2, days: D.defaultPlan.map(row => Object.fromEntries(SLOTS.map((s, i) => [s, validId(row[i]) ? { id: row[i], lock: false } : null]))) }; }
function cleanPlan(p) {
  if (!p || !Array.isArray(p.days) || p.days.length !== 14) return null;
  return { v: 2, days: p.days.map(d => Object.fromEntries(SLOTS.map(s => [s, d && d[s] && validId(d[s].id) ? { id: d[s].id, lock: !!d[s].lock } : null]))) };
}
let plan = cleanPlan(store.get('sabiplate-plan14-v2', null)) || defaultPlan();
let undoPlan = null;
let week = store.get('sabiplate-v15-week', '1');
let have = new Set(store.get('sabiplate-v15-have', []));
let priceOverrides = store.get('sabiplate-v15-price-overrides', {});
let model = null;
function commitPlan(next, message) {
  undoPlan = JSON.stringify(plan);
  plan = cleanPlan(next) || defaultPlan();
  store.set('sabiplate-plan14-v2', plan);
  model = null;
  renderAll();
  if (message) toast(message);
}
const clonePlan = () => JSON.parse(JSON.stringify(plan));
const slotType = s => (s === 'Breakfast' || s === 'Snack') ? s : 'Main';
const recipeType = r => (r.category === 'Breakfast' || r.category === 'Snack') ? r.category : 'Main';
const countMeals = () => plan.days.reduce((n, d) => n + SLOTS.filter(s => d[s]).length, 0);
function occurrences(id) { const out = []; plan.days.forEach((d, di) => SLOTS.forEach(s => { if (d[s]?.id === id) out.push([di, s]); })); return out; }

/* ---------- Portion engine ----------
   Ingredients fall into four groups: protein foods, carbohydrate foods, fats, and
   vegetables/everything else. For each person and day the engine finds one multiplier
   per group so the day's shared dishes land on that person's calories, protein and fat.
   Same pot, different plates. */
const GROUP_OVERRIDE = { egg: 'p', egg_combo_2_1: 'p', edamame: 'p', salmon: 'p', granola: 'c', tomato_pepper_sauce: 'v', mixed_veg: 'v', seasoning: 'x' };
function groupOf(k) {
  if (GROUP_OVERRIDE[k]) return GROUP_OVERRIDE[k];
  const f = D.foods[k]; if (!f || f[0] <= 0) return 'v';
  const ps = 4 * f[1] / f[0], cs = 4 * f[2] / f[0], fs = 9 * f[3] / f[0];
  if (ps >= 0.45) return 'p';
  if (fs >= 0.6) return 'f';
  if (cs >= 0.55 && f[0] >= 45) return 'c';
  return 'v';
}
const GROUP = Object.fromEntries(Object.keys(D.foods).map(k => [k, groupOf(k)]));
const LO = 0.35, HI = 3.2;
function solveDay(ids, T) {
  const G = { p: [0, 0, 0], c: [0, 0, 0], f: [0, 0, 0], v: [0, 0, 0] };
  for (const id of ids) for (const [k, g] of D.ing[id]) {
    const f = D.foods[k], gr = GROUP[k] || 'v'; if (!f || gr === 'x') continue;
    G[gr][0] += f[0] * g / 100; G[gr][1] += f[1] * g / 100; G[gr][2] += f[3] * g / 100;
  }
  const baseK = G.p[0] + G.c[0] + G.f[0] + G.v[0];
  if (baseK <= 0) return null;
  const v = clamp(Math.sqrt(T.kcal / 2000), 0.85, 1.25);
  const start = clamp(T.kcal / baseK, LO, HI);
  const x = { p: start, c: start, f: start };
  const t = [T.kcal, T.protein, T.fat], W = [6, 2, 1];
  for (let it = 0; it < 60; it++) {
    for (const g of ['p', 'c', 'f']) {
      let num = 0, den = 0;
      for (let j = 0; j < 3; j++) {
        const a = G[g][j] / t[j];
        const rest = (x.p * G.p[j] + x.c * G.c[j] + x.f * G.f[j] + v * G.v[j] - x[g] * G[g][j] - t[j]) / t[j];
        num += W[j] * rest * a; den += W[j] * a * a;
      }
      if (den > 0) x[g] = clamp(-num / den, LO, HI);
    }
  }
  return { p: x.p, c: x.c, f: x.f, v, x: 1 };
}
function plateFor(id, x) {
  const out = { kcal: 0, protein: 0, carbs: 0, fat: 0, ingredients: [] };
  for (const [k, g] of D.ing[id]) {
    const gr = GROUP[k] || 'v'; if (gr === 'x') continue;
    const grams = g * x[gr], f = D.foods[k];
    if (grams < 0.5) continue;
    out.ingredients.push({ k, g: grams });
    if (f) { out.kcal += f[0] * grams / 100; out.protein += f[1] * grams / 100; out.carbs += f[2] * grams / 100; out.fat += f[3] * grams / 100; }
  }
  return out;
}
const baseGrams = (id, key) => D.ing[id].reduce((s, [k, g]) => s + (k === key ? g : 0), 0);
function itemsFor(k, id) {
  if (k === 'tomato') return [[baseGrams(id, 'tomato') >= 90 ? 'tinned_tomatoes' : 'fresh_tomatoes', 1]];
  if (D.map[k]) return D.map[k];
  return D.items[k] ? [[k, 1]] : [];
}
function buildModel() {
  if (model) return model;
  const T = members.map(targetOf);
  const need = {}, byWeekRecipe = [{}, {}], avg = members.map(() => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 }));
  let plannedDays = 0;
  const days = plan.days.map((day, di) => {
    const slots = SLOTS.filter(s => day[s]);
    const ids = slots.map(s => day[s].id);
    const totals = members.map(() => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 }));
    const meals = {};
    if (ids.length) plannedDays++;
    const xs = T.map(t => ids.length ? solveDay(ids, t) : null);
    for (const s of slots) {
      const id = day[s].id;
      const plates = xs.map(x => plateFor(id, x));
      meals[s] = { id, lock: day[s].lock, plates };
      const wk = byWeekRecipe[Math.floor(di / 7)];
      const agg = (wk[id] ??= {});
      plates.forEach((p, i) => {
        for (const key of ['kcal', 'protein', 'carbs', 'fat']) totals[i][key] += p[key];
        for (const ing of p.ingredients) {
          agg[ing.k] = (agg[ing.k] || 0) + ing.g;
          for (const [item, factor] of itemsFor(ing.k, id)) need[item] = (need[item] || 0) + ing.g * factor;
        }
      });
    }
    totals.forEach((t, i) => { for (const key in t) avg[i][key] += t[key]; });
    return { di, meals, totals };
  });
  avg.forEach(a => { for (const key in a) a[key] = plannedDays ? a[key] / plannedDays : 0; });
  model = { T, days, avg, need, byWeekRecipe, plannedDays };
  return model;
}

/* ---------- Shop ---------- */
const CAT_ORDER = ['Produce', 'Protein', 'Dairy', 'Frozen', 'Bakery', 'Pantry', 'World foods'];
function fmtNeed(n, unit) { if (unit === 'count') return String(Math.ceil(n - 1e-9)); const big = unit === 'ml' ? ' L' : ' kg'; return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + big : Math.round(n) + ' ' + unit; }
function shopRows() {
  const mo = buildModel();
  const rows = [];
  for (const [key, needed] of Object.entries(mo.need)) {
    const it = D.items[key]; if (!it || needed <= 0.01) continue;
    const p1 = Math.max(1, Math.ceil(needed / it.pack - 1e-9));
    const left = p1 * it.pack - needed;
    const p2 = Math.max(0, Math.ceil((needed - left) / it.pack - 1e-9));
    rows.push({ key, name: it.name, category: it.cat, storage: it.storage, unit: it.unit, pack_size: it.pack, unit_price: it.price, needed, needed_display: fmtNeed(needed, it.unit), packs_first_shop: p1, packs_second_shop: p2 });
  }
  rows.sort((a, b) => (CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category)) || a.name.localeCompare(b.name));
  return rows;
}
function currentCosts() {
  let first = 0, second = 0;
  for (const row of shopRows()) { if (have.has(row.key)) continue; const p = priceOverrides[row.key] ?? row.unit_price; first += row.packs_first_shop * p; second += row.packs_second_shop * p; }
  return { first, second, month: first + second, ppd: (first + second) / (28 * members.length) };
}

/* ---------- Prep ---------- */
function prepModel() {
  const mo = buildModel();
  const weeks = [0, 1].map(w => {
    const occ = {};
    for (let d = 0; d < 7; d++) { const day = plan.days[w * 7 + d]; for (const s of SLOTS) if (day[s]) (occ[day[s].id] ??= []).push([d, s]); }
    const sessions = { sun: [], wed: [] }, quick = [];
    for (const [id, list] of Object.entries(occ)) {
      const r = rmap[id]; if (!r) continue;
      const grams = mo.byWeekRecipe[w][id] || {};
      const ingredients = Object.entries(grams).map(([k, g]) => ({ k, g })).sort((a, b) => b.g - a.g);
      if (recipeType(r) !== 'Main') { quick.push({ id, title: r.title, times: list.length, kind: r.category, ingredients, prep: r.prep }); continue; }
      const first = list[0][0];
      const cookDay = first <= 2 ? -1 : 2; // Sunday before the week, or Wednesday evening
      const rice = ingredients.some(i => /rice/.test(i.k));
      const fridge = list.filter(([d]) => d - cookDay <= (rice ? 1 : 3)).length;
      (cookDay === -1 ? sessions.sun : sessions.wed).push({ id, title: r.title, occ: list, plates: list.length * members.length, rice, fridge: fridge * members.length, freeze: (list.length - fridge) * members.length, ingredients, prep: r.prep });
    }
    const chopFor = batches => {
      const sum = {}, uses = {};
      for (const b of batches) for (const i of b.ingredients) if ((GROUP[i.k] || 'v') === 'v' && D.foods[i.k]) { sum[i.k] = (sum[i.k] || 0) + i.g; uses[i.k] = (uses[i.k] || 0) + 1; }
      return Object.entries(sum).filter(([k, g]) => g >= 40).map(([k, g]) => ({ k, g, uses: uses[k] })).sort((a, b) => b.g - a.g);
    };
    return { w, sessions: [{ key: 'sun', label: `Week ${w + 1} · Sunday`, batches: sessions.sun, chop: chopFor(sessions.sun) }, { key: 'wed', label: `Week ${w + 1} · Wednesday top-up`, batches: sessions.wed, chop: chopFor(sessions.wed) }].filter(s => s.batches.length), quick };
  });
  return weeks;
}

/* ---------- Formatting ---------- */
const FRIENDLY = { dry_basmati_rice: 'basmati rice (uncooked)', dry_white_rice: 'rice (uncooked)', dry_brown_rice: 'brown rice (uncooked)', dry_wholewheat_pasta: 'wholewheat pasta (uncooked)', dry_pasta: 'pasta (uncooked)', dry_couscous: 'couscous (uncooked)', chicken: 'chicken breast', turkey_breast: 'turkey', white_fish: 'white fish', black_eyed_peas_dry: 'black-eyed beans (dried)', black_eyed_peas_cooked: 'cooked black-eyed beans', basmati_rice: 'cooked basmati rice', white_rice: 'cooked rice', brown_rice: 'cooked brown rice', pasta: 'cooked pasta', wholewheat_pasta: 'cooked wholewheat pasta', greek_yogurt: 'Greek yoghurt', yogurt: 'natural yoghurt', bell_pepper: 'peppers', tomato_pepper_sauce: 'tomato-pepper sauce', mixed_veg: 'mixed vegetables', coconut_milk_light: 'light coconut milk', wrap: 'wholewheat wrap', tuna_canned: 'tinned tuna', egg_combo_2_1: 'egg', eba: 'eba', wheat_swallow: 'wheat swallow', leafy_greens: 'leafy greens', beans: 'green beans', pita: 'pitta', maple: 'maple syrup', chia: 'chia seeds' };
const foodName = k => FRIENDLY[k] || k.replaceAll('_', ' ');
function fmtg(g, k) {
  g = Number(g);
  if (k === 'egg' || k === 'egg_combo_2_1') { const n = Math.max(1, Math.round(g / 50)); return n + ' egg' + (n === 1 ? '' : 's'); }
  if (k === 'wrap' || k === 'pita' || k === 'burger_bun') { const n = Math.max(1, Math.ceil(g / 60 - 0.25)); return n + (k === 'wrap' ? ' wrap' : k === 'pita' ? ' pitta' : ' bun') + (n === 1 ? '' : 's'); }
  if (g >= 1000) return (g / 1000).toFixed(1).replace(/\.0$/, '') + ' kg';
  return (g >= 30 ? Math.round(g / 5) * 5 : Math.round(g)) + 'g';
}
const fmtFood = (g, k) => (k === 'egg' || k === 'egg_combo_2_1' || k === 'wrap' || k === 'pita' || k === 'burger_bun') ? fmtg(g, k) : fmtg(g, k) + ' ' + foodName(k);
function keyPortion(p) {
  const main = p.ingredients.filter(i => ['p', 'c'].includes(GROUP[i.k])).sort((a, b) => b.g - a.g).slice(0, 3);
  const list = main.length >= 2 ? main : p.ingredients.slice().sort((a, b) => b.g - a.g).slice(0, 3);
  return list.map(i => fmtFood(i.g, i.k)).join(' + ');
}
const exactList = p => p.ingredients.map(i => `<li>${esc(fmtFood(i.g, i.k))}</li>`).join('');
const tone = i => i % 2 ? 'male' : 'female';
const namesList = () => members.length === 1 ? members[0].name : members.slice(0, -1).map(m => m.name).join(', ') + ' and ' + members[members.length - 1].name;
const headline = () => members.length > 1 ? 'Same food. Different goals.' : 'Your plan, your portions.';
const planWord = () => members.length > 1 ? 'Household plan' : 'Your plan';
const img = id => rmap[id]?.image || '';

/* ---------- Planner view ---------- */
function targetCards() {
  const mo = buildModel();
  return `<div class="v15-targets">${members.map((m, i) => { const t = mo.T[i], a = mo.avg[i]; return `<div class="v15-target ${tone(i)}"><b>${esc(m.name)} · ${esc(GOALS[m.goal].toLowerCase())}</b><strong>${m.kcal.toLocaleString('en-GB')} kcal a day</strong><small>Aim: ${t.protein}g protein · ${t.carbs}g carbs · ${t.fat}g fat a day</small>${(() => { const diff = Math.round(a.kcal - m.kcal), on = Math.abs(diff) <= m.kcal * 0.05; return `<span class="sp-chip ${on ? 'on' : 'off'}">${on ? `On target · averages ${Math.round(a.kcal).toLocaleString('en-GB')} kcal` : `Averages ${Math.round(a.kcal).toLocaleString('en-GB')} kcal (${Math.abs(diff)} ${diff < 0 ? 'under' : 'over'})`}</span>`; })()}</div>`; }).join('')}</div>`;
}
function mealCard(di, slot, entry) {
  const r = rmap[entry.id], key = `${di}|${slot}`;
  return `<div class="v15-meal"><button type="button" class="v15-meal-img" data-sp-view="${esc(entry.id)}"><img src="${esc(img(entry.id))}" alt="${esc(r.title)}" loading="lazy"><em>${slot}</em></button><div class="v15-meal-body"><div class="v15-meal-title"><button type="button" class="sp-title" data-sp-view="${esc(entry.id)}">${esc(r.title)}</button>${entry.lock ? '<span class="sp-lock">Locked</span>' : ''}</div><div class="sp-actions no-print"><button type="button" data-sp-swap="${key}">Swap</button><button type="button" data-sp-lock="${key}" aria-pressed="${entry.lock}">${entry.lock ? 'Unlock' : 'Lock'}</button><button type="button" class="sp-remove" data-sp-remove="${key}">Remove</button></div><div class="v15-plates">${entry.plates.map((p, i) => `<div class="v15-plate ${tone(i)}"><span class="label">${members[i].name === 'Me' ? 'My' : esc(members[i].name) + '\'s'} portion</span><strong>${Math.round(p.kcal)} kcal</strong><small>${p.protein.toFixed(0)}g protein · ${p.carbs.toFixed(0)}g carbs · ${p.fat.toFixed(0)}g fat</small><div class="v15-keyportion">${esc(keyPortion(p))}</div><details><summary>Full ingredient list</summary><ul>${exactList(p)}</ul></details></div>`).join('')}</div></div></div>`;
}
function dayTotalsHtml(x) {
  const mo = buildModel();
  return x.totals.map((t, i) => {
    const diff = Math.round(t.kcal - mo.T[i].kcal), off = Math.abs(diff) > mo.T[i].kcal * 0.07;
    return `<div class="${i % 2 ? 'm' : 'f'}"><b>${esc(members[i].name)}:</b> ${Math.round(t.kcal).toLocaleString('en-GB')} kcal · ${t.protein.toFixed(0)}g protein${off ? ` <em class="sp-off">${Math.abs(diff)} kcal ${diff < 0 ? 'under' : 'over'}</em>` : ''}</div>`;
  }).join('');
}
let dayPick = null;
function pickedDay(visible) {
  const ids = visible.map(x => x.di);
  if (dayPick !== null && ids.includes(dayPick)) return dayPick;
  const t = todayIndex();
  return ids.includes(t) ? t : ids[0];
}
function dayTabs(visible) {
  const cur = pickedDay(visible);
  return `<div class="v15-day-tabs no-print" role="tablist" aria-label="Choose a day">${visible.map(x => `<button type="button" role="tab" aria-selected="${x.di === cur}" class="${x.di === cur ? 'active' : ''}" data-sp-day="${x.di}"><b>${DAY_NAMES[x.di % 7]}</b><small>${x.di === todayIndex() ? 'Today' : 'Day ' + (x.di + 1)}</small></button>`).join('')}</div>`;
}
function plannerHtml() {
  const mo = buildModel(), c = currentCosts(), prep = prepModel();
  const mainCount = {};
  plan.days.forEach(d => ['Lunch', 'Dinner'].forEach(s => { if (d[s]) mainCount[d[s].id] = (mainCount[d[s].id] || 0) + 1; }));
  const mains = Object.entries(mainCount).sort((a, b) => b[1] - a[1]);
  const sessions = prep.reduce((n, w) => n + w.sessions.length, 0);
  const visible = mo.days.filter(x => week === 'all' || String(Math.floor(x.di / 7) + 1) === String(week));
  return `<section class="v15-card v15-hero"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><span class="eyebrow">${planWord()} · 2 weeks</span><h2>${headline()} One shop.</h2></div><div class="sp-toolbar no-print"><button type="button" id="spEditHouse" class="ghost-btn">Edit household</button><button type="button" id="spShuffle" class="ghost-btn" title="New meals everywhere except the ones you've locked">Shuffle meals</button><button type="button" id="spReset" class="ghost-btn">Reset plan</button>${undoPlan ? '<button type="button" id="spUndo" class="ghost-btn">Undo</button>' : ''}</div></div>${targetCards()}<p class="v15-sumline">${mains.length} main dishes · ${sessions} cooking sessions · ${countMeals()} meals · about ${money(c.first)} for this shop</p>${mains.length > 8 ? `<div class="v15-note"><b>That is ${mains.length} different main dishes.</b> Fewer dishes means less cooking. Swap a few so the same batch covers more meals.</div>` : ''}<h3 style="font-family:Georgia,serif;color:var(--green)">What you'll cook</h3><div class="v15-gallery">${mains.map(([id, n]) => `<button type="button" data-sp-view="${esc(id)}"><img src="${esc(img(id))}" alt="${esc(rmap[id].title)}" loading="lazy"><span><small>${n} meal${n === 1 ? '' : 's'}</small><b>${esc(rmap[id].title)}</b></span></button>`).join('')}</div><div class="v15-week-tabs no-print"><button type="button" data-sp-week="1" class="${week === '1' ? 'active' : ''}">Week 1</button><button type="button" data-sp-week="2" class="${week === '2' ? 'active' : ''}">Week 2</button><button type="button" data-sp-week="all" class="${week === 'all' ? 'active' : ''}">All 14 days</button></div>${dayTabs(visible)}<div class="v15-days">${visible.map(x => `<article class="v15-day ${x.di === pickedDay(visible) ? 'picked' : ''}" id="spDay${x.di}"><div class="v15-day-head"><div><small>Week ${Math.floor(x.di / 7) + 1}</small><h3>${DAY_NAMES[x.di % 7]} · Day ${x.di + 1}</h3></div><div class="v15-day-totals">${Object.keys(x.meals).length ? dayTotalsHtml(x) : '<div>No meals planned</div>'}</div></div>${SLOTS.map(s => x.meals[s] ? mealCard(x.di, s, x.meals[s]) : `<button type="button" class="sp-empty no-print" data-sp-add="${x.di}|${s}">+ Add ${s.toLowerCase()}</button>`).join('')}</article>`).join('')}</div><div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button type="button" class="primary-btn" id="spGoShop">See shopping list</button><button type="button" class="secondary-btn" id="spGoPrep">See meal prep</button><button type="button" class="ghost-btn" id="spPrint">Print plan</button></div></section>`;
}

/* ---------- Shop view ---------- */
const STORES = {
  tesco: { name: 'Tesco', url: q => 'https://www.tesco.com/groceries/en-GB/search?query=' + encodeURIComponent(q) },
  sainsburys: { name: "Sainsbury's", url: q => 'https://www.sainsburys.co.uk/gol-ui/SearchResults/' + encodeURIComponent(q) },
  asda: { name: 'Asda', url: q => 'https://www.asda.com/groceries/search/' + encodeURIComponent(q) },
  morrisons: { name: 'Morrisons', url: q => 'https://groceries.morrisons.com/search?q=' + encodeURIComponent(q) },
  waitrose: { name: 'Waitrose', url: q => 'https://www.waitrose.com/ecom/shop/search?searchTerm=' + encodeURIComponent(q) },
  ocado: { name: 'Ocado', url: q => 'https://www.ocado.com/search?entry=' + encodeURIComponent(q) }
};
let shopAt = shopAt0();
function storeChoice(k) { if (STORES[k]) { shopAt = k; store.set('sabiplate-preferred-store', k); } }
function shopAt0() { const v = (() => { try { return JSON.parse(localStorage.getItem('sabiplate-preferred-store') || '"tesco"'); } catch { return 'tesco'; } })(); return STORES[v] ? v : 'tesco'; }
const searchTerm = name => name.replace(/\(.*?\)/g, '').split(/\s*\/\s*/)[0].replace(/\b(frozen recommended|for swallow|for eba)\b/gi, '').replace(/\s+/g, ' ').trim();
function listText(rows) {
  let cat = '', out = 'SabiPlate shopping list\n';
  for (const r of rows) { if (have.has(r.key)) continue; if (r.category !== cat) { cat = r.category; out += `\n${cat}\n`; } out += `- ${r.name}: ${r.packs_first_shop} × ${fmtNeed(r.pack_size, r.unit)} (need ${r.needed_display})\n`; }
  const extra = (dbg.state?.customShop || []).filter(x => !x.done);
  if (extra.length) out += `\n\nAlso buy\n${extra.map(x => '- ' + x.text).join('\n')}`;
  return out.trim();
}
async function copyList() {
  const text = listText(shopRows());
  try { await navigator.clipboard.writeText(text); toast('Shopping list copied'); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Shopping list copied'); } catch { toast('Could not copy on this device'); } t.remove(); }
}
async function shareList() {
  const text = listText(shopRows());
  if (navigator.share) { try { await navigator.share({ title: 'SabiPlate shopping list', text }); } catch {} } else copyList();
}

let editPrices = false;
function extrasHtml() {
  const list = dbg.state?.customShop || [];
  return `<section class="sp-extras no-print-hide"><h3 class="sp-cat">Your extra items</h3>${list.length ? `<div class="v15-shop-list">${list.map(x => `<div class="sp-extra-row ${x.done ? 'have' : ''}"><input type="checkbox" data-sp-extra-done="${esc(x.id)}" ${x.done ? 'checked' : ''} aria-label="Got ${esc(x.text)}"><span>${esc(x.text)}</span><button type="button" class="sp-remove" data-sp-extra-del="${esc(x.id)}" aria-label="Remove ${esc(x.text)}">Remove</button></div>`).join('')}</div>` : '<p class="muted" style="margin:4px 0 8px">Anything else you need, like foil or plantain.</p>'}<div class="sp-extra-add no-print"><input id="spExtraInput" placeholder="Add something else, e.g. foil, plantain" aria-label="Add an extra item" autocomplete="off"><button type="button" class="ghost-btn" id="spExtraAdd">Add</button></div></section>`;
}
function shoppingHtml() {
  const c = currentCosts(), rows = shopRows();
  if (!rows.length) return `<section class="v15-card"><span class="eyebrow">Shopping</span><h2 style="font-family:Georgia,serif;color:var(--green);margin:5px 0">Your shopping list is empty.</h2><p class="muted">Add meals to your plan and the list fills itself in.</p></section>`;
  let cat = '';
  return `<section class="v15-card"><span class="eyebrow">Shopping</span><h1 class="v15-h1">Your shopping list</h1><p class="muted">One big shop now and a smaller top-up in two weeks. It covers every plate for ${esc(namesList())} and updates when the plan changes.</p><div class="v15-cost-grid"><div><strong>${money(c.first)}</strong><span>This shop</span></div><div><strong>${money(c.second)}</strong><span>Top-up in 2 weeks</span></div><div><strong>${money(c.month)}</strong><span>4 weeks in total</span></div><div><strong>${money(c.ppd)}</strong><span>Per person, per day</span></div></div><div class="sp-store no-print"><label>Shop at <select id="spStore">${Object.entries(STORES).map(([k, v]) => `<option value="${k}" ${k === shopAt ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label><button type="button" class="ghost-btn" id="spCopy">Copy list</button><button type="button" class="ghost-btn" id="spShare">Share list</button></div><p class="muted sp-store-note no-print">“Find at ${esc(STORES[shopAt].name)}” opens their website search so you can add the item to your basket.</p><div class="v15-shop-controls"><b>${rows.length} items</b><small class="muted"> · tick anything you already have</small><span class="v15-shop-btns"><button type="button" id="spEditPrices" class="ghost-btn" aria-pressed="${editPrices}">${editPrices ? 'Done editing prices' : 'Edit prices'}</button><button type="button" id="spClearHave" class="ghost-btn">Untick all</button></span></div><div class="v15-shop-list ${editPrices ? 'edit-prices' : ''}">${rows.map(row => {
    const p = priceOverrides[row.key] ?? row.unit_price, line = row.packs_first_shop * p;
    const head = row.category !== cat ? `<h3 class="sp-cat">${esc(cat = row.category)}</h3>` : '';
    return `${head}<div class="v15-shop-row ${have.has(row.key) ? 'have' : ''}"><input type="checkbox" data-sp-have="${row.key}" ${have.has(row.key) ? 'checked' : ''} aria-label="Already have ${esc(row.name)}"><span><b>${esc(row.name)}</b><small>You need ${esc(row.needed_display)} in total</small><small>${esc(row.storage)}</small></span><span class="v15-buy"><b>Buy ${row.packs_first_shop} × ${esc(fmtNeed(row.pack_size, row.unit))}</b><small>${row.packs_second_shop ? `Top-up: ${row.packs_second_shop} more` : 'No top-up needed'}</small></span><span class="v15-linecost"><b>${money(line)}</b><small>this shop</small></span><a class="sp-find no-print" href="${esc(STORES[shopAt].url(searchTerm(row.name)))}" target="_blank" rel="noopener">Find at ${esc(STORES[shopAt].name)}</a><span class="v15-price"><small>Price per pack (£)</small><input type="number" min="0" step=".01" value="${Number(p).toFixed(2)}" data-sp-price="${row.key}" aria-label="Price per pack for ${esc(row.name)}"></span></div>`;
  }).join('')}</div>${extrasHtml()}<p class="shop-footnote">Ticked items come off the total. Prices are estimates and vary by shop; use “Edit prices” to put in what you pay. Spices, stock and seasonings aren't listed, so check your cupboard.</p></section>`;
}

/* ---------- Prep view ---------- */
function storageLine(b) {
  const parts = [];
  if (b.fridge) parts.push(`${b.fridge} portion${b.fridge === 1 ? '' : 's'} in the fridge (eat within ${b.rice ? '1 day' : '3 days'})`);
  if (b.freeze) parts.push(`${b.freeze} portion${b.freeze === 1 ? '' : 's'} in the freezer; move to the fridge the night before`);
  return parts.join(' · ') + (b.rice ? '. Rice: cool within an hour, keep in the fridge no more than 1 day, and reheat only once' : '');
}
function prepHtml() {
  const weeks = prepModel();
  if (!countMeals()) return `<section class="v15-card"><h2 style="font-family:Georgia,serif;color:var(--green);margin:5px 0">Nothing to cook yet.</h2><p class="muted">Add meals to your plan and your prep plan appears here.</p></section>`;
  const sessions = weeks.reduce((n, w) => n + w.sessions.length, 0);
  const qty = i => `<li><b>${esc(fmtg(i.g, i.k))}</b> ${['egg', 'egg_combo_2_1', 'wrap', 'pita', 'burger_bun'].includes(i.k) ? '' : esc(foodName(i.k))}</li>`;
  return `<section class="v15-card"><h2 style="font-family:Georgia,serif;color:var(--green);margin:5px 0">${sessions} cooking session${sessions === 1 ? '' : 's'} cover the 2 weeks.</h2><p class="muted">Sunday covers Monday to Wednesday; a shorter Wednesday session covers the rest. Amounts are for everyone: ${esc(namesList())}.</p>${weeks.map(w => `${w.sessions.map(s => `<h3 class="sp-cat">${esc(s.label)}</h3>${s.chop.length ? `<div class="v15-note"><b>Chop these first, all at once:</b> ${s.chop.slice(0, 8).map(i => `${esc(fmtg(i.g, i.k))} ${esc(foodName(i.k))}`).join(', ')}.</div>` : ''}<div class="v15-batches">${s.batches.map(b => `<article class="v15-batch"><span class="session">${b.plates} portions · ${b.occ.length} meal${b.occ.length === 1 ? '' : 's'} · about ${b.prep} min</span><h3><button type="button" class="sp-link" data-sp-view="${esc(b.id)}">${esc(b.title)}</button></h3><small class="muted">${b.occ.map(([d, sl]) => DAY_NAMES[d] + ' ' + sl.toLowerCase()).join(' · ')}</small><ul>${b.ingredients.slice(0, 12).map(qty).join('')}</ul><div class="v15-note"><b>Store:</b> ${esc(storageLine(b))}. Cool quickly, label each portion, and reheat until steaming hot all the way through.</div></article>`).join('')}</div>`).join('')}${w.quick.length ? `<h3 class="sp-cat">Week ${w.w + 1} · breakfasts and snacks</h3><div class="v15-batches">${w.quick.map(q => `<article class="v15-batch"><span class="session">${esc(q.kind)} · ${q.times} time${q.times === 1 ? '' : 's'} · about ${q.prep} min each</span><h3><button type="button" class="sp-link" data-sp-view="${esc(q.id)}">${esc(q.title)}</button></h3><ul>${q.ingredients.slice(0, 8).map(qty).join('')}</ul><small class="muted">Amounts for the whole week. Make fresh, or the night before.</small></article>`).join('')}</div>` : ''}`).join('')}</section>`;
}

/* ---------- Profile view ---------- */
function profileHtml() {
  const mo = buildModel();
  return `<section class="v15-card"><span class="eyebrow">Household</span><h1 class="v15-h1">Who's eating?</h1><p class="muted">Everyone eats the same meals in different portions. Add each person's name and daily calories, then save. The plan, shopping list and prep all update.</p><div class="v15-profile-grid">${members.map((m, i) => { const t = mo.T[i]; return `<div class="v15-profile-person ${tone(i)}" data-member="${i}"><label>Name<input data-hh="name" value="${esc(m.name)}" maxlength="24" autocomplete="off"></label><label>Goal<select data-hh="goal">${Object.entries(GOALS).map(([k, v]) => `<option value="${k}" ${m.goal === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Daily calories<input data-hh="kcal" type="number" inputmode="numeric" min="${MIN_KCAL}" max="${MAX_KCAL}" step="50" value="${m.kcal}"></label><label>Protein, carbs and fat<select data-hh="auto"><option value="1" ${m.auto ? 'selected' : ''}>Work them out for me</option><option value="0" ${m.auto ? '' : 'selected'}>I will set protein and fat</option></select></label><div class="sp-macros"><label>Protein (g)<input data-hh="protein" type="number" inputmode="numeric" min="40" max="350" step="5" value="${t.protein}" ${m.auto ? 'disabled' : ''}></label><label>Fat (g)<input data-hh="fat" type="number" inputmode="numeric" min="20" max="220" step="1" value="${t.fat}" ${m.auto ? 'disabled' : ''}></label><label>Carbs (g)<input data-hh="carbs" type="number" value="${t.carbs}" disabled aria-describedby="spCarbNote"></label></div><p>Plan average: ${Math.round(mo.avg[i].kcal)} kcal · ${Math.round(mo.avg[i].protein)}g protein · ${Math.round(mo.avg[i].carbs)}g carbs · ${Math.round(mo.avg[i].fat)}g fat</p>${members.length > 1 ? `<button type="button" class="ghost-btn" data-hh-remove="${i}">Remove ${esc(m.name)}</button>` : ''}</div>`; }).join('')}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" id="spSaveHouse" class="primary-btn">Save household</button>${members.length < MAX_MEMBERS ? '<button type="button" id="spAddMember" class="ghost-btn">Add a person</button>' : ''}</div><div class="v15-note" id="spCarbNote"><b>How targets work:</b> calories come first. Set protein and fat yourself if you want to; carbs are whatever calories are left. Calories can be ${MIN_KCAL.toLocaleString('en-GB')} to ${MAX_KCAL.toLocaleString('en-GB')}. This is a planning aid, not medical advice.</div></section>`;
}
function readMembers(block) {
  return [...block.querySelectorAll('[data-member]')].map((el, i) => {
    const val = n => el.querySelector(`[data-hh="${n}"]`).value;
    return { id: members[i]?.id || ('m' + Date.now() + i), name: val('name'), goal: val('goal'), kcal: val('kcal'), auto: val('auto') === '1', protein: val('protein'), fat: val('fat') };
  });
}
function saveMembers(list, message) { members = cleanMembers(list) || defaultMembers(); store.set('sabiplate-household-v1', members); model = null; renderAll(); if (message) toast(message); }

/* ---------- Modal ---------- */
let modal = null, lastFocus = null;
function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'modal'; modal.id = 'spModal'; modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = '<div class="modal-backdrop" data-sp-close></div><article class="chooser-card" role="dialog" aria-modal="true" aria-labelledby="spModalTitle"><button type="button" class="modal-close" data-sp-close aria-label="Close">×</button><div id="spModalBody"></div></article>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target.closest('[data-sp-close]')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
  return modal;
}
function openModal(html) {
  ensureModal(); lastFocus = document.activeElement;
  modal.querySelector('#spModalBody').innerHTML = html;
  modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
  modal.querySelector('.chooser-card').scrollTop = 0;
  return modal.querySelector('#spModalBody');
}
function closeModal() { if (!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; lastFocus?.focus?.(); }

function chooserList(type, exclude, q) {
  const inPlan = new Set(plan.days.flatMap(d => SLOTS.map(s => d[s]?.id).filter(Boolean)));
  const favs = dbg.state?.favourites || new Set();
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return recipes.filter(r => recipeType(r) === type && r.id !== exclude && validId(r.id) && words.every(w => (r.title + ' ' + r.cuisine + ' ' + (r.ingredients || []).join(' ')).toLowerCase().includes(w)))
    .map(r => ({ r, score: (inPlan.has(r.id) ? 2 : 0) + (favs.has?.(r.id) ? 1 : 0), inPlan: inPlan.has(r.id), fav: !!favs.has?.(r.id) }))
    .sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title));
}
const chooserItems = list => list.length ? list.map(({ r, inPlan, fav }) => `<div class="chooser-item"><img src="${esc(r.image)}" alt="" loading="lazy"><div><b>${esc(r.title)}</b><small>${Math.round(r.calories)} kcal · ${Math.round(r.protein)}g protein · ${r.prep} min${inPlan ? ' · in your plan' : ''}${fav ? ' · favourite' : ''}</small></div><button type="button" class="secondary-btn" data-sp-pick="${esc(r.id)}">Choose</button></div>`).join('') : '<p class="muted">No recipes match that search.</p>';
function openSwap(di, slot) {
  const cur = plan.days[di][slot], type = slotType(slot);
  const others = cur ? occurrences(cur.id).filter(([d, s]) => !(d === di && s === slot) && !plan.days[d][s].lock) : [];
  const body = openModal(`<div class="chooser-head"><div><span class="eyebrow">${esc(dayLabel(di))} · ${slot}</span><h2 id="spModalTitle">${cur ? 'Swap ' + esc(rmap[cur.id].title) : 'Add ' + slot.toLowerCase()}</h2></div><input type="search" id="spSearch" placeholder="Search recipes" autocomplete="off" aria-label="Search recipes"></div>${others.length ? `<label class="sp-check"><input type="checkbox" id="spAll" checked> Swap it everywhere it appears (${others.length + 1} meals) so you still cook one batch</label>` : ''}<div class="chooser-list" id="spList"></div>`);
  const list = body.querySelector('#spList'), search = body.querySelector('#spSearch');
  const draw = () => { list.innerHTML = chooserItems(chooserList(type, cur?.id, search.value)); };
  draw(); search.oninput = draw;
  list.onclick = e => {
    const b = e.target.closest('[data-sp-pick]'); if (!b) return;
    const id = b.dataset.spPick, next = clonePlan();
    next.days[di][slot] = { id, lock: false };
    let n = 1;
    if (body.querySelector('#spAll')?.checked) for (const [d, s] of others) { next.days[d][s] = { id, lock: false }; n++; }
    closeModal();
    commitPlan(next, cur ? `Swapped ${n} meal${n === 1 ? '' : 's'} to ${rmap[id].title}` : `Added ${rmap[id].title}`);
  };
}
function addRecipe(id) {
  const r = rmap[id]; if (!r || !validId(id)) { toast('That recipe cannot be planned yet'); return; }
  const type = recipeType(r);
  let slot = type === 'Main' ? (r.category === 'Dinner' ? 'Dinner' : 'Lunch') : type;
  const chosen = new Set();
  const body = openModal('');
  const draw = () => {
    body.innerHTML = `<div class="chooser-head"><div><span class="eyebrow">Add to your meal plan</span><h2 id="spModalTitle">${esc(r.title)}</h2></div></div>${type === 'Main' ? `<div class="picker-slots">${['Lunch', 'Dinner'].map(s => `<button type="button" class="${slot === s ? 'active' : ''}" data-sp-slot="${s}">${s}</button>`).join('')}</div>` : `<p class="muted">This goes in ${slot.toLowerCase()}.</p>`}<p class="muted">Pick one or more days. Cook it once and eat it on every day you pick.</p>${[0, 1].map(w => `<h3 class="sp-cat">Week ${w + 1}</h3><div class="sp-daygrid">${DAY_NAMES.map((n, d) => { const di = w * 7 + d, cur = plan.days[di][slot]; return `<button type="button" data-sp-day="${di}" class="${chosen.has(di) ? 'active' : ''}" ${cur?.lock ? 'disabled' : ''}><b>${n}</b><small>${cur ? (cur.lock ? 'Locked: ' : 'Replaces ') + esc(rmap[cur.id].title) : 'Empty'}</small></button>`; }).join('')}</div>`).join('')}<button type="button" class="primary-btn full" id="spAddGo" ${chosen.size ? '' : 'disabled'}>${chosen.size ? `Add to ${chosen.size} day${chosen.size === 1 ? '' : 's'}` : 'Pick at least one day'}</button>`;
  };
  draw();
  body.onclick = e => {
    const s = e.target.closest('[data-sp-slot]'), d = e.target.closest('[data-sp-day]');
    if (s) { slot = s.dataset.spSlot; chosen.clear(); draw(); return; }
    if (d && !d.disabled) { const di = Number(d.dataset.spDay); chosen.has(di) ? chosen.delete(di) : chosen.add(di); draw(); return; }
    if (e.target.closest('#spAddGo') && chosen.size) {
      const next = clonePlan(); for (const di of chosen) next.days[di][slot] = { id, lock: false };
      const n = chosen.size; body.onclick = null; closeModal();
      commitPlan(next, `Added ${r.title} to ${n} day${n === 1 ? '' : 's'}`);
    }
  };
}
function addDay(ids) {
  const body = openModal(`<div class="chooser-head"><div><span class="eyebrow">Add this day to the plan</span><h2 id="spModalTitle">Which day should it replace?</h2></div></div><p class="muted">Locked meals on that day are kept.</p>${[0, 1].map(w => `<h3 class="sp-cat">Week ${w + 1}</h3><div class="sp-daygrid">${DAY_NAMES.map((n, d) => `<button type="button" data-sp-day="${w * 7 + d}"><b>${n}</b><small>Day ${w * 7 + d + 1}</small></button>`).join('')}</div>`).join('')}`);
  body.onclick = e => {
    const d = e.target.closest('[data-sp-day]'); if (!d) return;
    const di = Number(d.dataset.spDay), next = clonePlan();
    for (const s of SLOTS) if (validId(ids[s]) && !next.days[di][s]?.lock) next.days[di][s] = { id: ids[s], lock: false };
    body.onclick = null; closeModal();
    commitPlan(next, `${dayLabel(di)} updated`);
  };
}
function shuffle() {
  const favs = dbg.state?.favourites || new Set();
  const next = clonePlan(), lockedIds = new Set(), unlocked = {};
  next.days.forEach(d => SLOTS.forEach(s => { if (!d[s]) return; if (d[s].lock) lockedIds.add(d[s].id); else (unlocked[d[s].id] ??= slotType(s)); }));
  const used = new Set(lockedIds), swap = {};
  for (const [id, type] of Object.entries(unlocked)) {
    if (lockedIds.has(id)) { swap[id] = id; continue; }
    const pool = recipes.filter(r => recipeType(r) === type && validId(r.id) && !used.has(r.id));
    if (!pool.length) { swap[id] = id; continue; }
    const weighted = pool.flatMap(r => favs.has?.(r.id) ? [r, r, r] : [r]);
    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    swap[id] = pick.id; used.add(pick.id);
  }
  next.days.forEach(d => SLOTS.forEach(s => { if (d[s] && !d[s].lock) d[s] = { id: swap[d[s].id] || d[s].id, lock: false }; }));
  commitPlan(next, 'Shuffled. Locked meals were kept.');
}

/* ---------- Mounting ---------- */
function mount(viewId, blockId, html, place) {
  const v = document.querySelector(viewId); if (!v) return null;
  v.querySelector('#' + blockId)?.remove();
  const block = document.createElement('div'); block.id = blockId; block.innerHTML = html;
  place(v, block);
  block.addEventListener('click', e => { const b = e.target.closest('[data-sp-view]'); if (b) dbg.openRecipe?.(b.dataset.spView); });
  return block;
}
function injectPlanner() {
  const block = mount('#view-planner', 'spPlanner', plannerHtml(), (v, b) => v.appendChild(b)); if (!block) return;
  block.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const split = v => { const [d, s] = v.split('|'); return [Number(d), s]; };
    if (t.dataset.spDay) { dayPick = Number(t.dataset.spDay); injectPlanner(); const tab = document.querySelector(`[data-sp-day="${dayPick}"]`); tab?.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    else if (t.dataset.spWeek) { week = t.dataset.spWeek; store.set('sabiplate-v15-week', week); injectPlanner(); }
    else if (t.dataset.spSwap) openSwap(...split(t.dataset.spSwap));
    else if (t.dataset.spAdd) openSwap(...split(t.dataset.spAdd));
    else if (t.dataset.spLock) { const [d, s] = split(t.dataset.spLock), next = clonePlan(); next.days[d][s].lock = !next.days[d][s].lock; commitPlan(next, next.days[d][s].lock ? 'Locked. Shuffle will keep this meal.' : 'Unlocked'); }
    else if (t.dataset.spRemove) { const [d, s] = split(t.dataset.spRemove), next = clonePlan(), title = rmap[next.days[d][s].id].title; next.days[d][s] = null; commitPlan(next, `Removed ${title}`); }
    else if (t.id === 'spEditHouse') dbg.nav('profile');
    else if (t.id === 'spShuffle') shuffle();
    else if (t.id === 'spReset') { if (confirm('Go back to the SabiPlate starter plan? Your swaps and locks will be replaced.')) commitPlan(defaultPlan(), 'Starter plan restored'); }
    else if (t.id === 'spUndo' && undoPlan) { const prev = JSON.parse(undoPlan); commitPlan(prev, 'Undone'); undoPlan = null; injectPlanner(); }
    else if (t.id === 'spGoShop') dbg.nav('shopping');
    else if (t.id === 'spGoPrep') dbg.nav('prep');
    else if (t.id === 'spPrint') window.print();
  });
}
function injectShopping() {
  const v = document.querySelector('#view-shopping'); if (!v) return;
  v.querySelectorAll('#fortnightShopBlock,.shopping-layout').forEach(x => x.classList.add('v15-hidden'));
  const block = mount('#view-shopping', 'spShopping', shoppingHtml(), (view, b) => view.prepend(b)); if (!block) return;
  block.querySelectorAll('[data-sp-have]').forEach(x => x.onchange = () => { x.checked ? have.add(x.dataset.spHave) : have.delete(x.dataset.spHave); store.set('sabiplate-v15-have', [...have]); injectShopping(); injectHome(true); });
  block.querySelectorAll('[data-sp-price]').forEach(x => x.onchange = () => { priceOverrides[x.dataset.spPrice] = Math.max(0, Number(x.value) || 0); store.set('sabiplate-v15-price-overrides', priceOverrides); injectShopping(); });
  block.querySelector('#spEditPrices')?.addEventListener('click', () => { editPrices = !editPrices; injectShopping(); });
  block.querySelector('#spClearHave')?.addEventListener('click', () => { have.clear(); store.set('sabiplate-v15-have', []); injectShopping(); });
  block.querySelector('#spStore')?.addEventListener('change', e => { storeChoice(e.target.value); injectShopping(); });
  const saveExtras = () => { dbg.save?.(); injectShopping(); };
  const addExtra = () => { const i = block.querySelector('#spExtraInput'), t = i?.value.trim(); if (!t) return; dbg.state.customShop.push({ id: `c-${Date.now()}`, text: t }); saveExtras(); document.querySelector('#spExtraInput')?.focus(); };
  block.querySelector('#spExtraAdd')?.addEventListener('click', addExtra);
  block.querySelector('#spExtraInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') addExtra(); });
  block.querySelectorAll('[data-sp-extra-del]').forEach(b => b.onclick = () => { dbg.state.customShop = dbg.state.customShop.filter(x => x.id !== b.dataset.spExtraDel); saveExtras(); });
  block.querySelectorAll('[data-sp-extra-done]').forEach(c => c.onchange = () => { const it = dbg.state.customShop.find(x => x.id === c.dataset.spExtraDone); if (it) it.done = c.checked; saveExtras(); });
  block.querySelector('#spCopy')?.addEventListener('click', copyList);
  block.querySelector('#spShare')?.addEventListener('click', shareList);
}
function injectPrep() {
  const v = document.querySelector('#view-prep'); if (!v) return;
  v.querySelectorAll('#couplePrepBlock,.prep-columns,#resetPrep').forEach(x => x.classList.add('v15-hidden'));
  mount('#view-prep', 'spPrep', prepHtml(), (view, b) => { const head = view.querySelector('.page-head'); head ? head.after(b) : view.prepend(b); });
}
function injectProfile() {
  const v = document.querySelector('#view-profile'); if (!v) return;
  v.querySelector('#coupleSetupBlock')?.classList.add('v15-hidden');
  const block = mount('#view-profile', 'spProfile', profileHtml(), (view, b) => view.prepend(b)); if (!block) return;
  const person = el => el.closest('[data-member]');
  const refresh = el => {
    const p = person(el), q = n => p.querySelector(`[data-hh="${n}"]`), auto = q('auto').value === '1';
    const kcal = clamp(Number(q('kcal').value) || 2000, MIN_KCAL, MAX_KCAL);
    q('protein').disabled = q('fat').disabled = auto;
    if (auto) { const a = autoMacros(kcal); q('protein').value = a.protein; q('fat').value = a.fat; }
    q('carbs').value = Math.max(0, Math.round((kcal - 4 * (Number(q('protein').value) || 0) - 9 * (Number(q('fat').value) || 0)) / 4));
  };
  block.querySelectorAll('[data-hh="goal"]').forEach(sel => sel.onchange = () => { const k = GOAL_KCAL[sel.value]; if (k) person(sel).querySelector('[data-hh="kcal"]').value = k; refresh(sel); });
  block.querySelectorAll('[data-hh="kcal"]').forEach(inp => inp.oninput = () => { const sel = person(inp).querySelector('[data-hh="goal"]'); if (GOAL_KCAL[sel.value] !== Number(inp.value)) sel.value = 'custom'; refresh(inp); });
  block.querySelectorAll('[data-hh="auto"],[data-hh="protein"],[data-hh="fat"]').forEach(el => el.oninput = el.onchange = () => refresh(el));
  block.querySelector('#spSaveHouse')?.addEventListener('click', () => saveMembers(readMembers(block), 'Household saved. Plates, shop and prep updated.'));
  block.querySelector('#spAddMember')?.addEventListener('click', () => saveMembers([...readMembers(block), { id: 'm' + Date.now(), name: 'Person ' + (members.length + 1), goal: 'maintain', kcal: GOAL_KCAL.maintain }], 'Person added'));
  block.querySelectorAll('[data-hh-remove]').forEach(b => b.onclick = () => { const list = readMembers(block); list.splice(Number(b.dataset.hhRemove), 1); saveMembers(list, 'Person removed'); });
}
function todayIndex(d = new Date()) {
  const dow = (d.getDay() + 6) % 7;
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 3 - dow);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - y) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
  return (week % 2) * 7 + dow;
}
function injectHome(force) {
  const v = document.querySelector('#view-home'); if (!v) return;
  if (v.querySelector('#spHome') && !force) return;
  v.querySelector('#spHome')?.remove();
  const c = currentCosts(), di = todayIndex(), day = plan.days[di] || {};
  const unnamed = members.some(m => /^Person \d+$/.test(m.name));
  const who = members.map(m => `${esc(m.name)} ${m.kcal.toLocaleString('en-GB')} kcal`).join(' · ') + (unnamed ? ` · <button type="button" class="ht-names" data-ht-go="profile">Add names</button>` : '');
  const meals = SLOTS.map(s => {
    const e = day[s], r = e && rmap[e.id];
    if (!r) return `<button type="button" class="ht-meal ht-empty" data-ht-add="${s}"><span class="ht-img"></span><span class="ht-txt"><em>${s}</em><b>Add a meal</b></span></button>`;
    return `<button type="button" class="ht-meal" data-sp-view="${esc(e.id)}"><span class="ht-img"><img src="${esc(r.image)}" alt="" loading="lazy"></span><span class="ht-txt"><em>${s}</em><b>${esc(r.title)}</b></span></button>`;
  }).join('');
  const card = document.createElement('section'); card.id = 'spHome'; card.className = 'home-today';
  card.innerHTML = `<div class="ht-head"><div><span class="eyebrow">Today · ${dayLabel(di)}</span><h2>Today's meals</h2><p>${who}</p></div><button type="button" class="ghost-btn" data-ht-go="planner">See full plan</button></div>
    <div class="ht-meals">${meals}</div>
    <div class="ht-links">
      <button type="button" data-ht-go="planner"><b>14-day plan</b><span>${countMeals()} meals · portions for ${members.length === 1 ? 'you' : members.length + ' people'}</span></button>
      <button type="button" data-ht-go="shopping"><b>Shopping list</b><span>About ${money(c.first)} for the first shop</span></button>
      <button type="button" data-ht-go="prep"><b>Meal prep</b><span>Batch-cook plan for the fortnight</span></button>
    </div>`;
  const slot = v.querySelector('#homeToday');
  if (slot) slot.replaceWith(card); else v.querySelector('.hero')?.after(card);
  card.addEventListener('click', e => {
    const view = e.target.closest('[data-sp-view]'); if (view) { dbg.openRecipe?.(view.dataset.spView); return; }
    const go = e.target.closest('[data-ht-go],[data-ht-add]'); if (go) dbg.nav(go.dataset.htGo || 'planner');
  });
}
function renderAll() {
  const active = document.querySelector('.view.active')?.id;
  injectHome(true);
  if (active === 'view-planner') injectPlanner();
  if (active === 'view-shopping') injectShopping();
  if (active === 'view-prep') injectPrep();
  if (active === 'view-profile') injectProfile();
}
function onView(name) {
  if (name === 'home') injectHome(true);
  if (name === 'planner') injectPlanner();
  if (name === 'shopping') injectShopping();
  if (name === 'prep') injectPrep();
  if (name === 'profile') injectProfile();
}
window.addEventListener('sabiplate:view-rendered', event => onView(event.detail?.name));
/* ---------- First-visit welcome ---------- */
function welcomeRow(i, m) {
  return `<div class="welcome-person" data-wp="${i}"><label>Name<input data-w="name" value="${esc(m?.name && !/^Person \d+$/.test(m.name) ? m.name : '')}" placeholder="${i === 0 ? 'Your name' : 'Name'}" maxlength="24" autocomplete="off"></label><label>Goal<select data-w="goal">${['loss', 'maintain', 'gain'].map(k => `<option value="${k}" ${(m?.goal || 'maintain') === k ? 'selected' : ''}>${{ loss: 'Lose fat', maintain: 'Stay the same', gain: 'Build muscle' }[k]}</option>`).join('')}</select></label><label>Calories a day<input data-w="kcal" type="number" inputmode="numeric" min="${MIN_KCAL}" max="${MAX_KCAL}" step="50" value="${m?.kcal || GOAL_KCAL.maintain}"></label></div>`;
}
function openWelcome() {
  let count = Math.min(4, Math.max(1, members.length));
  const draw = body => {
    const rows = body.querySelector('#wRows'), cur = [...rows.querySelectorAll('[data-wp]')].map(r => ({ name: r.querySelector('[data-w="name"]').value, goal: r.querySelector('[data-w="goal"]').value, kcal: Number(r.querySelector('[data-w="kcal"]').value) }));
    rows.innerHTML = Array.from({ length: count }, (_, i) => welcomeRow(i, cur[i] || members[i])).join('');
    body.querySelectorAll('[data-wcount]').forEach(b => { b.classList.toggle('active', Number(b.dataset.wcount) === count); b.setAttribute('aria-pressed', Number(b.dataset.wcount) === count); });
    rows.querySelectorAll('[data-w="goal"]').forEach(sel => sel.onchange = () => { sel.closest('[data-wp]').querySelector('[data-w="kcal"]').value = GOAL_KCAL[sel.value]; });
  };
  const body = openModal(`<div class="chooser-head"><div><span class="eyebrow">Welcome to SabiPlate</span><h2 id="spModalTitle">Who's eating?</h2></div></div><div class="welcome-form"><p class="muted" style="margin:0">Everyone eats the same meals. SabiPlate portions each plate to the person's daily calories, then builds one shopping list and prep plan.</p><div><b style="display:block;margin-bottom:6px;color:var(--green)">How many people?</b><div class="welcome-count">${[1, 2, 3, 4].map(n => `<button type="button" data-wcount="${n}">${n}</button>`).join('')}</div></div><div id="wRows" style="display:grid;gap:8px"></div><p class="welcome-note">Not sure of your calories? Pick a goal and we'll fill in a typical number; you can change it any time in Household. This is a planning aid, not medical advice.</p><div class="welcome-actions"><button type="button" class="ghost-btn" id="wSkip">Skip for now</button><button type="button" class="primary-btn" id="wSave">Build my plan</button></div></div>`);
  draw(body);
  body.querySelectorAll('[data-wcount]').forEach(b => b.onclick = () => { count = Number(b.dataset.wcount); draw(body); });
  const done = () => { store.set('sabiplate-welcomed', true); closeModal(); };
  body.querySelector('#wSkip').onclick = done;
  body.querySelector('#wSave').onclick = () => {
    const list = [...body.querySelectorAll('[data-wp]')].map((r, i) => {
      const goal = r.querySelector('[data-w="goal"]').value;
      return { id: members[i]?.id || 'm' + Date.now() + i, name: r.querySelector('[data-w="name"]').value.trim() || (i === 0 ? 'Me' : 'Person ' + (i + 1)), goal, kcal: clamp(Number(r.querySelector('[data-w="kcal"]').value) || GOAL_KCAL[goal], MIN_KCAL, MAX_KCAL) };
    });
    saveMembers(list, 'Your plan is ready.');
    done();
  };
}
function maybeWelcome() {
  if (store.get('sabiplate-welcomed', false)) return;
  if (store.get('sabiplate-household-v1', null)) { store.set('sabiplate-welcomed', true); return; }
  setTimeout(openWelcome, 400);
}

window.SABI_PLAN = {
  addRecipe, addDay, count: countMeals, shuffle,
  refreshRecipes: () => { for (const k of Object.keys(rmap)) delete rmap[k]; for (const r of recipes) rmap[r.id] = r; plan = cleanPlan(plan) || defaultPlan(); model = null; },
  getPlan: () => clonePlan(), setPlan: p => commitPlan(p), resetPlan: () => commitPlan(defaultPlan()),
  getMembers: () => JSON.parse(JSON.stringify(members)), setMembers: list => saveMembers(list),
  model: () => buildModel(), openWelcome, occurrences, shopRows, currentCosts, prepModel, solveDay, GROUP
};
const firstView = document.querySelector('.view.active')?.id?.replace('view-', '');
if (firstView === 'home') { try { dbg.renderHome?.(); } catch {} }
onView(firstView);
maybeWelcome();
})();
