// Pulls the public, read-only recipe master from Supabase into data/.
import { mkdir, writeFile } from 'node:fs/promises';
const URL_BASE = 'https://qmjioypfwvhccdfcarhy.supabase.co/rest/v1/';
const KEY = 'sb_publishable_8EGzwhEgb1syMgbQNUksAQ_wZDL8PNR'; // publishable browser key
async function table(pathAndQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(URL_BASE + pathAndQuery, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    if (!res.ok) throw new Error(pathAndQuery + ' -> ' + res.status + ' ' + (await res.text()).slice(0, 300));
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
await mkdir('data', { recursive: true });
const ing = await table('recipe_ingredients?select=recipe_id,ingredient_no,ingredient_text,food_key,grams,kcal,protein_g,carbs_g,fat_g,weight_basis&order=recipe_id.asc,ingredient_no.asc');
const rec = await table('recipes?select=id,title,category,cuisine,prep_min,serving_weight_g,kcal,protein_g,carbs_g,fat_g,method,tags,ingredients_json&order=id.asc');
await writeFile('data/recipe_ingredients.json', JSON.stringify(ing));
await writeFile('data/recipes.json', JSON.stringify(rec));
console.log('recipe_ingredients', ing.length, 'recipes', rec.length);
