// Fails the build if the site is not in a shippable state. No dependencies.
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
const fail = (m) => { console.error('CHECK FAILED: ' + m); process.exit(1); };
const html = await readFile('site/index.html', 'utf8');
if (html.includes('MutationObserver')) fail('MutationObserver found in index.html');
if (/NAIJA|Body Transformation/.test(html)) fail('old cookbook branding found');
for (const m of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)) { try { new vm.Script(m[1]); } catch (e) { fail('inline script syntax: ' + e.message); } }
for (const f of ['site/assets/plan-engine.js', 'site/assets/plan-data.js', 'site/assets/auth-sync.bundle.js', 'site/assets/my-recipes.js', 'site/assets/photo-credits.js']) { try { new vm.Script(await readFile(f, 'utf8')); } catch (e) { fail(f + ': ' + e.message); } }
const ctx = { window: {} }; vm.runInNewContext(await readFile('site/assets/plan-data.js', 'utf8'), ctx);
const D = ctx.window.SABI_PLAN_DATA;
if (!D || D.defaultPlan.length !== 14) fail('plan data missing or default plan is not 14 days');
const start = html.indexOf('window.RECIPES = ') + 'window.RECIPES = '.length;
let depth = 0, end = start; for (; end < html.length; end++) { const c = html[end]; if (c === '[') depth++; else if (c === ']' && --depth === 0) break; }
let recipes; try { recipes = JSON.parse(html.slice(start, end + 1)); } catch { fail('could not read embedded recipes'); }
if (recipes.length !== 100) fail('expected 100 recipes, found ' + recipes.length);
for (const r of recipes) {
  if (!D.ing[r.id]) fail('no ingredient master for ' + r.id);
  if (!r.methods?.length) fail('no method for ' + r.id);
  try { await access('site/' + r.image.replace(/^\.\//, '').split('?')[0]); } catch { fail('missing image for ' + r.id + ': ' + r.image); }
}
for (const day of D.defaultPlan) for (const id of day) if (!D.ing[id]) fail('default plan uses unknown recipe ' + id);
for (const [k, list] of Object.entries(D.map)) for (const [item] of list) if (!D.items[item]) fail('shop map ' + k + ' -> missing item ' + item);
for (const f of ['site/assets/plan.css', 'site/assets/hero-wide.jpg', 'site/assets/cookbook-cover.jpg']) { try { await access(f); } catch { fail('missing ' + f); } }
console.log('Site check passed: 100 recipes, plan data, images and scripts are in place.');
