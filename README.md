# SabiPlate

SabiPlate is a responsive Nigerian-aware meal-planning app with recipe discovery, personalised planning, a 14-day couple plan, shopping calculations, meal-prep guidance, and Supabase account/cloud-sync support.

## Deployment

The validated repaired production source is stored in `source/site-source.tar.gz`. Vercel runs `npm run build`, and `build.mjs` extracts the production `index.html` and `assets/` folder into `dist/`.

This packaging keeps all 100 recipe images, the homepage hero image and authentication bundle together without relying on private or temporary image URLs.

## Production

Intended production URL: https://sabiplate.vercel.app
