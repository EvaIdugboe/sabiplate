# SabiPlate

Know your food. Own your goals. A meal-planning app for households that eat the same food with different goals.

Live: https://sabiplate.vercel.app

## Layout

- `site/` is the whole deployed app. Plain HTML, CSS and JavaScript; no framework and no build step.
  - `index.html` holds the base app (recipes, Build My Day, cookbook, profile, fridge search).
  - `assets/plan-engine.js` is the household plan: 14-day plan state, per-person portions, fortnight shop, prep plan.
  - `assets/plan-data.js` is generated; do not edit by hand.
  - `assets/my-recipes.js` is My Recipes: add a recipe or paste a post's caption; ingredients are read with simple rules in the browser (no AI service), matched to the food table, reviewed, then saved under `sabiplate-my-recipes-v1` (synced with the account).
  - `assets/plan.css`, `assets/recipes/*.webp`, cover art, and the bundled Supabase auth script.
- `data/` is the recipe master pulled from Supabase (`recipes`, `recipe_ingredients`) plus the food table and the starter plan.
- `tools/`
  - `build-plan-data.mjs` rebuilds `site/assets/plan-data.js` from `data/` and the shop tables.
  - `shop-items.txt`, `shop-map.json` map foods to things you buy (pack size, price estimate, storage).
  - `check-site.mjs` is the pre-deploy check. Vercel runs it as the build command, so a broken site cannot ship.
  - `photos/` holds the hand-picked real-photo choices and their licences (not yet downloaded into the site).
- `src/auth-sync.js` is the source of the auth bundle; `supabase/migrations/` is the database history.

## Working on it

```bash
node tools/build-plan-data.mjs   # after changing data/ or the shop tables
node tools/check-site.mjs        # before pushing
cd site && python3 -m http.server 4173
```

Pushing to `main` deploys to production.

## How portions work

Every ingredient is a protein food, a carbohydrate food, a fat, or vegetables/other. For each person and day the engine finds one multiplier per group so the shared dishes land on that person's calories, protein and fat. Everyone eats from the same pot; the plates differ.
