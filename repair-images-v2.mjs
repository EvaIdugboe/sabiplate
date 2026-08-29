import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const dist = path.join(root, 'dist');
const recipesDir = path.join(dist, 'assets', 'recipes');
const indexPath = path.join(dist, 'index.html');
const version = '20260829-hq4';
const usedUrls = new Set();
const credits = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const stop = new Set(['and','with','new','small','lean','plate','bowl','nigerian','oven','boiled','grilled','roasted','fried','quick','easy','the']);
const allowedLicenses = new Set(['cc0','pdm','by','by-sa']);

function words(id){ return id.split('-').map(x=>x.toLowerCase()).filter(Boolean); }
function meaningful(id){ return words(id).filter(x=>!stop.has(x) && x.length>2); }
function esc(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function highRes(w,h){ w=Number(w||0); h=Number(h||0); return Math.min(w,h)>=720 && Math.max(w,h)>=1200 && w*h>=1_000_000; }

function familyQueries(id){
  const w = new Set(words(id));
  const q=[]; const add=x=>{ if(x && !q.includes(x)) q.push(x); };
  const has=(...xs)=>xs.some(x=>w.has(x));

  if(has('akara')) { add('akara bean fritters'); add('West African bean fritters'); }
  if(has('banga')) { add('palm nut soup'); add('West African palm soup'); }
  if(has('jollof')) add('jollof rice');
  if(has('ofada')) { add('ofada rice stew'); add('African rice stew'); }
  if(has('yam')) { add('African yam meal'); add('yam and egg'); add('yam stew'); }
  if(has('plantain')) { add('African plantain meal'); add('plantain beans'); add('plantain food'); }
  if(has('beans')) { add('African beans meal'); add('black eyed peas meal'); add('beans bowl'); }
  if(has('rice')) { add('African rice meal'); add('rice meal'); }
  if(has('salmon')) { add('salmon meal'); add('salmon pasta'); }
  if(has('cod')) { add('baked cod'); add('white fish meal'); }
  if(has('tilapia')) { add('tilapia meal'); add('grilled tilapia'); }
  if(has('croaker')) { add('grilled fish meal'); add('whole grilled fish'); }
  if(has('fish')) { add('African fish meal'); add('grilled fish meal'); add('fish stew'); }
  if(has('prawn','prawns','shrimp')) { add('prawn meal'); add('shrimp rice'); }
  if(has('chicken')) { add('chicken meal'); add('African chicken meal'); }
  if(has('turkey')) { add('turkey meal'); add('roast turkey meal'); }
  if(has('beef')) { add('beef meal'); add('African beef meal'); }
  if(has('egg','eggs')) { add('egg breakfast'); add('eggs meal'); }
  if(has('oat','oats','oatmeal')) { add('oatmeal fruit'); add('oat porridge'); }
  if(has('banana')) { add('banana oat snack'); add('banana snack'); }
  if(has('apple')) { add('apple breakfast'); add('apple cinnamon food'); }
  if(has('pasta','spaghetti')) { add('pasta meal'); add('spaghetti meal'); }
  if(has('noodles')) { add('noodle stir fry'); add('noodle meal'); }
  if(has('wrap','shawarma')) { add('food wrap'); add('chicken wrap'); add('beef wrap'); }
  if(has('potato','potatoes')) { add('potato meal'); add('sweet potato meal'); }
  if(has('avocado')) { add('avocado bowl'); add('avocado breakfast'); }
  if(has('yogurt','yoghurt')) { add('Greek yogurt food'); add('yogurt bowl'); }
  if(has('cottage','cheese')) add('cottage cheese food');
  if(has('couscous')) add('couscous meal');
  if(has('burger')) add('burger meal');
  if(has('salad','slaw')) add('salad meal');
  if(has('soup','stew','curry')) add('African stew meal');

  const m=meaningful(id);
  add(m.slice(0,5).join(' '));
  add(m.slice(0,3).join(' '));
  if(m[0]) add(`${m[0]} food`);
  add('African food meal');
  return q.filter(x=>x.length>=3);
}

async function fetchJson(url, timeout=10000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':'SabiPlate/1.0 image-repair'}});
    if(r.status===429){ await sleep(1200); throw new Error('rate limited'); }
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } finally { clearTimeout(t); }
}

async function fetchImage(url, timeout=10000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 SabiPlate image-repair','accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const type=r.headers.get('content-type')||'';
    if(type && !type.startsWith('image/')) throw new Error(`not image ${type}`);
    const b=Buffer.from(await r.arrayBuffer());
    if(b.length<15000) throw new Error('tiny payload');
    return b;
  } finally { clearTimeout(t); }
}

async function saveHQ(bytes,target){
  const src=await sharp(bytes,{failOn:'none'}).metadata();
  if(!highRes(src.width,src.height)) throw new Error(`source ${src.width||'?'}x${src.height||'?'}`);
  const out=await sharp(bytes,{failOn:'none'}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true,kernel:sharp.kernel.lanczos3}).modulate({brightness:1.008,saturation:1.025}).sharpen({sigma:0.5}).webp({quality:93,effort:5,smartSubsample:true}).toBuffer();
  const meta=await sharp(out).metadata();
  if(!highRes(meta.width,meta.height)) throw new Error(`output ${meta.width||'?'}x${meta.height||'?'}`);
  await writeFile(target,out);
  return meta;
}

function sourceVariants(url){
  const out=[]; const add=x=>{ if(x&&!out.includes(x)) out.push(x); };
  try{
    const u=new URL(url);
    const a=new URL(u); a.pathname=a.pathname.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp)$)/i,''); if(a.href!==u.href)add(a.href);
    const b=new URL(u); for(const k of ['crop','fit','resize','interpolation']) b.searchParams.delete(k); if(b.href!==u.href)add(b.href);
    add(u.href.replace(/\/\d+x\d+cq\d+\//i,'/1600x1600cq95/'));
    add(u.href.replace('/medium/','/large/'));
    add(u.href.replace(/w_\d+%2Ch_\d+/i,'w_1800%2Ch_1800'));
  }catch{}
  add(url); return out;
}

async function tryDirect(id,url,target){
  if(!url) return null;
  for(const candidate of sourceVariants(url)){
    if(usedUrls.has(candidate)) continue;
    try{
      const bytes=await fetchImage(candidate,12000);
      await saveHQ(bytes,target); usedUrls.add(candidate);
      return {provider:'verified direct source',query:'original recipe source'};
    }catch{}
  }
  return null;
}

function textFor(item){ const tags=Array.isArray(item.tags)?item.tags.map(t=>t?.name||'').join(' '):''; return `${item.title||''} ${tags}`.toLowerCase(); }
function score(id,item){
  const text=textFor(item); let s=0;
  for(const w of meaningful(id)) if(text.includes(w)) s += w.length>=6?3:2;
  if((item.width||0)>=1600)s++; if((item.height||0)>=1000)s++;
  return s;
}

async function openverse(id,query,target,exact=false){
  const u=new URL('https://api.openverse.org/v1/images/');
  u.searchParams.set('q',query); u.searchParams.set('page_size','30'); u.searchParams.set('filter_dead','true'); u.searchParams.set('mature','false');
  let data; try{ data=await fetchJson(u); }catch{return null;}
  let items=(data?.results||[]).filter(x=>x?.url&&!x.mature&&!usedUrls.has(x.url)).filter(x=>allowedLicenses.has(String(x.license||'').toLowerCase())).filter(x=>!x.width||!x.height||highRes(x.width,x.height)).map(x=>({...x,_score:score(id,x)}));
  if(exact) items=items.filter(x=>x._score>=2);
  items.sort((a,b)=>b._score-a._score);
  for(const item of items.slice(0,10)){
    try{
      const bytes=await fetchImage(item.url); await saveHQ(bytes,target); usedUrls.add(item.url);
      credits.push({recipe:id,title:item.title||query,creator:item.creator||'Unknown',license:[item.license,item.license_version].filter(Boolean).join(' ').toUpperCase(),licenseUrl:item.license_url||'',sourceUrl:item.foreign_landing_url||item.url});
      return {provider:exact?'Openverse exact':'Openverse family',query};
    }catch{}
  }
  return null;
}

async function commons(id,query,target,exact=false){
  const u=new URL('https://commons.wikimedia.org/w/api.php');
  for(const [k,v] of Object.entries({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'25',prop:'imageinfo',iiprop:'url|size|mime|extmetadata'}))u.searchParams.set(k,v);
  let data; try{data=await fetchJson(u);}catch{return null;}
  let items=Object.values(data?.query?.pages||{}).map(page=>{const info=page?.imageinfo?.[0]||{};const title=String(page?.title||'').replace(/^File:/i,'');const txt=title.toLowerCase();let sc=0;for(const w of meaningful(id))if(txt.includes(w))sc+=w.length>=6?3:2;return{page,info,title,score:sc};}).filter(x=>x.info.url&&/^image\/(jpeg|png|webp)$/i.test(x.info.mime||'')).filter(x=>highRes(x.info.width,x.info.height)).filter(x=>!usedUrls.has(x.info.url));
  if(exact) items=items.filter(x=>x.score>=2);
  items.sort((a,b)=>b.score-a.score);
  for(const x of items.slice(0,10)){
    try{
      const bytes=await fetchImage(x.info.url); await saveHQ(bytes,target); usedUrls.add(x.info.url);
      const m=x.info.extmetadata||{};
      credits.push({recipe:id,title:x.title,creator:String(m.Artist?.value||'Wikimedia Commons contributor').replace(/<[^>]+>/g,''),license:m.LicenseShortName?.value||'Wikimedia Commons licence',licenseUrl:m.LicenseUrl?.value||'',sourceUrl:`https://commons.wikimedia.org/?curid=${x.page.pageid}`});
      return {provider:exact?'Wikimedia exact':'Wikimedia family',query};
    }catch{}
  }
  return null;
}

async function searchHQ(id,target){
  const exact=[meaningful(id).join(' '),words(id).filter(x=>x!=='new').join(' ')].filter(Boolean);
  for(const q of [...new Set(exact)]){
    let r=await openverse(id,q,target,true); if(r)return r;
    r=await commons(id,q,target,true); if(r)return r;
  }
  for(const q of familyQueries(id)){
    let r=await openverse(id,q,target,false); if(r)return r;
    r=await commons(id,q,target,false); if(r)return r;
  }
  return null;
}

let directMap={};
try{
  const build=await readFile(path.join(root,'build.mjs'),'utf8');
  const match=build.match(/const originalImageUrls\s*=\s*(\{[\s\S]*?\n\});/);
  if(match) directMap=JSON.parse(match[1]);
}catch{}

const files=(await readdir(recipesDir)).filter(f=>f.endsWith('.webp')).sort();
console.log(`HQ4 image audit: validating true source quality for all ${files.length} recipe images.`);
let directCount=0, searchCount=0; const unresolved=[];

for(let i=0;i<files.length;i+=3){
  const batch=files.slice(i,i+3);
  const results=await Promise.all(batch.map(async file=>{
    const id=file.replace(/\.webp$/i,''); const target=path.join(recipesDir,file);
    let r=await tryDirect(id,directMap[id],target);
    if(r){directCount++; return {id,...r};}
    r=await searchHQ(id,target);
    if(r){searchCount++; return {id,...r};}
    return {id};
  }));
  for(const r of results){ if(r.provider) console.log(`HQ verified: ${r.id} via ${r.provider} (${r.query})`); else {unresolved.push(r.id);console.warn(`HQ unresolved: ${r.id}`);} }
  if(i+3<files.length) await sleep(150);
}

if(unresolved.length) throw new Error(`HQ4 blocked deployment: ${unresolved.length} recipes still lack genuine high-resolution sources: ${unresolved.join(', ')}`);

const dims=[];
for(const file of files){ const m=await sharp(path.join(recipesDir,file)).metadata(); if(!highRes(m.width,m.height)) throw new Error(`Final image below HQ gate: ${file} ${m.width||'?'}x${m.height||'?'}`); dims.push({file,width:m.width,height:m.height}); }

const heroIds=['beef-suya-rice-plate','nigerian-egg-fried-rice-prawns','coconut-jollof-rice-turkey','chicken-vegetable-couscous'];
const tiles=[];
for(const id of heroIds){ const f=path.join(recipesDir,`${id}.webp`); const b=await sharp(f).resize(800,500,{fit:'cover',position:'attention',withoutEnlargement:true}).webp({quality:94,effort:5}).toBuffer(); const m=await sharp(b).metadata(); if(m.width!==800||m.height!==500) throw new Error(`Hero source too small: ${id}`); tiles.push(b); }
await sharp({create:{width:1600,height:1000,channels:3,background:'#efe4d5'}}).composite([{input:tiles[0],left:0,top:0},{input:tiles[1],left:800,top:0},{input:tiles[2],left:0,top:500},{input:tiles[3],left:800,top:500}]).webp({quality:94,effort:5,smartSubsample:true}).toFile(path.join(dist,'assets','sabiplate-hero.webp'));

if(credits.length){
  const rows=credits.sort((a,b)=>a.recipe.localeCompare(b.recipe)).map(c=>`<li><strong>${esc(c.recipe.replaceAll('-',' '))}</strong>: ${esc(c.title)} — ${esc(c.creator)}${c.license?` (${esc(c.license)})`:''}. <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>${c.licenseUrl?` · <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener noreferrer">Licence</a>`:''}</li>`).join('\n');
  await writeFile(path.join(dist,'assets','image-credits.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SabiPlate food photo credits</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:920px;margin:auto;padding:32px 20px;line-height:1.55;color:#1f2933}li{margin-bottom:12px}a{color:#7a3d18}</style></head><body><h1>SabiPlate food photo credits</h1><p>Open-licensed photographs used in SabiPlate's high-resolution food image repair.</p><ol>${rows}</ol></body></html>`);
}

let html=await readFile(indexPath,'utf8');
html=html.replace(/2026082[89]-hq\d+/g,version).replace(/(\.\/assets\/recipes\/[a-z0-9-]+\.webp)(?!\?)/g,`$1?v=${version}`);
html=html.replace(/sabiplate-hero\.webp(?:\?v=[^'"`)]+)?/g,`sabiplate-hero.webp?v=${version}`);
const css=`\n/* SabiPlate true-resolution HQ4 */\n.recipe-img-wrap{overflow:hidden}.recipe-img-wrap img,.modal-hero img{width:100%;height:100%;object-fit:cover;object-position:center;image-rendering:auto;backface-visibility:hidden}.recipe-img-wrap img{transform:none}.recipe-img-wrap:hover img{transform:scale(1.015)}.modal-hero img{transform:none}@media(min-width:769px){.recipe-modal-card{max-width:900px}.modal-hero{height:390px}}.sabiplate-photo-credits-link{display:block;width:max-content;max-width:calc(100% - 32px);margin:10px auto 24px;font-size:11px;line-height:1.4;color:#7a746e;text-decoration:none}\n`;
html=html.replace('</style>',`${css}</style>`);
if(credits.length&&!html.includes('sabiplate-photo-credits-link')) html=html.replace('</body>',`<a class="sabiplate-photo-credits-link" href="./assets/image-credits.html" target="_blank" rel="noopener noreferrer">Food photo credits</a></body>`);
await writeFile(indexPath,html);

const smallest=dims.reduce((a,b)=>(a.width*a.height<b.width*b.height?a:b),dims[0]);
console.log(`HQ4 PASS: ${files.length}/${files.length} recipe images validated from true high-resolution sources.`);
console.log(`HQ4 sources: ${directCount} verified direct originals, ${searchCount} high-resolution licensed replacements, 0 upscaled low-resolution fallbacks.`);
console.log(`Smallest final asset: ${smallest.file} ${smallest.width}x${smallest.height}. Hero rebuilt at 1600x1000 from verified HQ food images.`);
