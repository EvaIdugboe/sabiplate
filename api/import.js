// SabiPlate recipe import: turns a link into recipe text the browser can read.
// No AI, no paid services. Reads public data only:
//  - recipe websites: the schema.org "Recipe" data most food sites publish
//  - TikTok: the public oEmbed caption
//  - YouTube: the video description
//  - Instagram / anything else: the page's public description, when shared
// It never returns or stores the creator's photos or method text; the app links back instead.

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 9000;
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UA_PREVIEW = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function badHost(host) {
  const h = host.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return true; // no raw IPs
  return false;
}

async function get(url, ua = UA_BROWSER) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': ua, 'accept-language': 'en-GB,en;q=0.9', accept: 'text/html,application/json;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: ctrl.signal });
    const finalHost = new URL(res.url).hostname;
    if (badHost(finalHost)) throw new Error('blocked redirect');
    const reader = res.body.getReader(); const chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { ctrl.abort(); break; } chunks.push(value); }
    return { status: res.status, url: res.url, text: Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8') };
  } finally { clearTimeout(t); }
}

const decode = s => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = s => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const meta = (html, prop) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i')); return m ? decode(m[1]) : ''; };

function isoMinutes(d) { const m = String(d || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i); if (!m) return null; const n = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0); return n || null; }

function findRecipe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
  const t = node['@type']; if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  for (const k of ['@graph', 'mainEntity', 'itemListElement']) { const r = findRecipe(node[k]); if (r) return r; }
  return null;
}

function fromJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const b of blocks) {
    let data; try { data = JSON.parse(b.trim()); } catch { try { data = JSON.parse(b.trim().replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    const r = findRecipe(data); if (!r) continue;
    const ingredients = (r.recipeIngredient || r.ingredients || []).map(strip).filter(Boolean);
    if (!ingredients.length) continue;
    const y = Array.isArray(r.recipeYield) ? r.recipeYield.join(' ') : String(r.recipeYield || '');
    const serves = (y.match(/\d+/) || [])[0];
    return { title: strip(r.name), ingredients, servings: serves ? Number(serves) : null, minutes: isoMinutes(r.totalTime) || isoMinutes(r.cookTime) || null, hasMethod: !!r.recipeInstructions };
  }
  return null;
}

// Social captions often run everything on one line; give the reader one item per line.
function socialToLines(t) {
  return String(t || '')
    .replace(/\s*\b(ingredients?|what you need|method|steps?|directions?|instructions?)\b\s*[:：-]\s*/gi, '\n$1\n')
    .replace(/\s*[•▪●◦✅✔☑🔸🔹👉➡️➖]+\s*/gu, '\n')
    .split('\n').flatMap(l => l.split(/,\s*(?=\d|½|¼|¾|⅓|⅔|a |an |one |two |three )/i)).map(l => l.trim()).filter(Boolean).join('\n');
}

function platform(host) {
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
  return 'web';
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const send = (code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
  let target;
  try { target = new URL(String((req.query && req.query.url) || new URL(req.url, 'http://x').searchParams.get('url') || '').trim()); } catch { return send(400, { ok: false, message: 'That doesn’t look like a link. Copy the full address, starting with https://' }); }
  if (!/^https?:$/.test(target.protocol) || badHost(target.hostname)) return send(400, { ok: false, message: 'That link can’t be read. Try a recipe website, TikTok or YouTube link.' });
  const kind = platform(target.hostname.toLowerCase());

  try {
    if (kind === 'tiktok') {
      const r = await get('https://www.tiktok.com/oembed?url=' + encodeURIComponent(target.href));
      if (r.status === 200) { const j = JSON.parse(r.text); if (j.title) return send(200, { ok: true, kind, text: socialToLines(j.title), author: j.author_name || '', note: 'Read from the TikTok caption.' }); }
      return send(200, { ok: false, kind, message: 'TikTok didn’t share this post’s caption. Open the post, copy the caption and paste it below.' });
    }
    if (kind === 'youtube') {
      const r = await get(target.href);
      const m = r.text.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
      const title = meta(r.text, 'og:title');
      if (m) { const desc = JSON.parse('"' + m[1] + '"'); if (desc.trim()) return send(200, { ok: true, kind, title, text: (title ? title + '\n' : '') + socialToLines(desc), note: 'Read from the video description.' }); }
      return send(200, { ok: false, kind, message: 'This video has no recipe in its description. If the ingredients are only spoken, type or paste them below.' });
    }
    if (kind === 'instagram') {
      const r = await get(target.href, UA_PREVIEW);
      let d = meta(r.text, 'og:description') || meta(r.text, 'description');
      const m = d.match(/:\s*["“]([\s\S]+)["”]\s*\.?$/); if (m) d = m[1];
      if (d && d.length > 40 && !/log in|sign up/i.test(d.slice(0, 60))) return send(200, { ok: true, kind, text: socialToLines(d), note: 'Read from the Instagram caption. Instagram sometimes shortens long captions, so check the ingredients.' });
      return send(200, { ok: false, kind, message: 'Instagram didn’t share this caption. In the app, tap the caption, copy it, and paste it below.' });
    }
    const r = await get(target.href);
    if (r.status >= 400) return send(200, { ok: false, kind, message: `That page didn’t open (error ${r.status}). Check the link, or paste the ingredients below.` });
    const rec = fromJsonLd(r.text);
    if (rec) {
      const lines = [rec.title, rec.servings ? `Serves ${rec.servings}` : '', 'Ingredients', ...rec.ingredients].filter(Boolean);
      return send(200, { ok: true, kind, title: rec.title, servings: rec.servings, minutes: rec.minutes, text: lines.join('\n'), methodAtSource: rec.hasMethod, note: 'Ingredients read from the recipe page. The method stays on the original site; write your own steps or follow the link.' });
    }
    const d = meta(r.text, 'og:description') || meta(r.text, 'description');
    return send(200, { ok: false, kind, title: meta(r.text, 'og:title'), message: 'No recipe details found on that page. Paste the ingredients below instead.' + (d ? '' : '') });
  } catch (e) {
    return send(200, { ok: false, kind, message: 'That link took too long or couldn’t be opened. Paste the ingredients below instead.' });
  }
};
