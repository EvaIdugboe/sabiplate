import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=process.cwd(), dist=path.join(root,'dist'), recipes=path.join(dist,'assets','recipes'), indexPath=path.join(dist,'index.html');
const version='20260829-hq5';
const used=new Set(), credits=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stop=new Set(['and','with','new','small','lean','plate','bowl','nigerian','oven','boiled','grilled','roasted','fried','quick','easy','the','side','lunch','breakfast']);
function words(id){return id.split('-').map(x=>x.toLowerCase()).filter(Boolean)}
function keys(id){return words(id).filter(x=>!stop.has(x)&&x.length>2)}
function hq(w,h){w=+w||0;h=+h||0;return Math.min(w,h)>=600&&Math.max(w,h)>=1200&&w*h>=900000}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}

async function fetchJson(url,tries=4){
 for(let i=0;i<tries;i++){
  const c=new AbortController(), t=setTimeout(()=>c.abort(),12000);
  try{const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'SabiPlate/1.0 (food image quality repair)'}});if(r.ok)return r.json();if(r.status===429||r.status>=500)await sleep(700*(i+1));else return null}catch{await sleep(500*(i+1))}finally{clearTimeout(t)}
 }return null
}
async function fetchImage(url){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);
 try{const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 SabiPlate','accept':'image/*,*/*;q=0.8'}});if(!r.ok)throw new Error(String(r.status));const type=r.headers.get('content-type')||'';if(type&&!type.startsWith('image/'))throw new Error('not image');const b=Buffer.from(await r.arrayBuffer());if(b.length<15000)throw new Error('tiny');return b}finally{clearTimeout(t)}
}
async function save(bytes,target){
 const src=await sharp(bytes,{failOn:'none'}).metadata();if(!hq(src.width,src.height))throw new Error(`source ${src.width}x${src.height}`);
 const out=await sharp(bytes,{failOn:'none'}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true,kernel:sharp.kernel.lanczos3}).modulate({brightness:1.006,saturation:1.02}).sharpen({sigma:.45}).webp({quality:93,effort:5,smartSubsample:true}).toBuffer();
 const m=await sharp(out).metadata();if(!hq(m.width,m.height))throw new Error('output below gate');await writeFile(target,out);return m
}
function variants(url){const a=[];const add=x=>{if(x&&!a.includes(x))a.push(x)};try{const u=new URL(url);const x=new URL(u);x.pathname=x.pathname.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp)$)/i,'');add(x.href);const y=new URL(u);for(const k of ['crop','fit','resize','interpolation'])y.searchParams.delete(k);add(y.href);add(u.href.replace(/\/\d+x\d+cq\d+\//i,'/1600x1600cq95/'));add(u.href.replace('/medium/','/large/'));add(u.href.replace(/w_\d+%2Ch_\d+/i,'w_1800%2Ch_1800'))}catch{}add(url);return a}
async function direct(url,target){if(!url)return null;for(const u of variants(url)){if(used.has(u))continue;try{await save(await fetchImage(u),target);used.add(u);return u}catch{}}return null}

function queryPlan(id){
 const w=new Set(words(id)),k=keys(id),q=[];const add=x=>{if(x&&!q.includes(x))q.push(x)};const has=(...x)=>x.some(v=>w.has(v));
 add(k.slice(0,5).join(' '));
 if(has('akara'))add('akara'); if(has('moi'))add('moi moi'); if(has('banga'))add('palm nut soup'); if(has('jollof'))add('jollof rice'); if(has('ofada'))add('ofada rice'); if(has('yam')){add('yam food');add('yam egg')} if(has('plantain')){add('plantain food');add('plantain meal')} if(has('beans')){add('beans meal');add('black eyed peas')} if(has('rice'))add('rice meal');
 if(has('salmon'))add('salmon dish'); if(has('cod'))add('cod dish'); if(has('tilapia'))add('tilapia dish'); if(has('fish','croaker'))add('fish dish'); if(has('prawn','prawns','shrimp'))add('shrimp dish'); if(has('tuna'))add('tuna dish');
 if(has('chicken'))add('chicken dish'); if(has('turkey'))add('turkey dish'); if(has('beef'))add('beef dish'); if(has('tofu'))add('tofu dish'); if(has('chickpea','chickpeas'))add('chickpea dish'); if(has('lentil','lentils'))add('lentil dish');
 if(has('egg','eggs'))add('egg dish'); if(has('oat','oats','oatmeal'))add('oatmeal'); if(has('apple'))add('apple food'); if(has('banana'))add('banana food'); if(has('mango'))add('mango food'); if(has('berry','berries','strawberry'))add('berries food'); if(has('pear'))add('pear food');
 if(has('pasta','spaghetti'))add('pasta dish'); if(has('noodles'))add('noodle dish'); if(has('wrap','shawarma'))add('wrap food'); if(has('potato','potatoes'))add('potato dish'); if(has('avocado'))add('avocado dish'); if(has('yogurt','yoghurt'))add('yogurt food'); if(has('couscous'))add('couscous dish'); if(has('salad','slaw'))add('salad dish'); if(has('soup','stew','curry'))add('African stew'); if(has('hummus'))add('hummus dish'); if(has('quinoa'))add('quinoa dish'); if(has('cauliflower'))add('cauliflower dish'); if(has('edamame'))add('edamame dish');
 if(k[0])add(k[0]); if(k[1])add(`${k[0]} ${k[1]}`); add('healthy meal'); add('African cuisine'); add('food dish');
 return q.filter(Boolean)
}
function overlap(id,title){const t=title.toLowerCase();return keys(id).reduce((s,w)=>s+(t.includes(w)?(w.length>=6?3:2):0),0)}
async function commonsSearch(id,query,target){
 const u=new URL('https://commons.wikimedia.org/w/api.php');for(const [k,v]of Object.entries({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'50',prop:'imageinfo',iiprop:'url|size|mime|extmetadata'}))u.searchParams.set(k,v);
 const data=await fetchJson(u);if(!data)return null;
 const candidates=Object.values(data?.query?.pages||{}).map(page=>{const info=page?.imageinfo?.[0]||{},title=String(page?.title||'').replace(/^File:/i,'');return{page,info,title,score:overlap(id,title)}}).filter(x=>x.info.url&&/^image\/(jpeg|png|webp)$/i.test(x.info.mime||'')&&hq(x.info.width,x.info.height)&&!used.has(x.info.url)).sort((a,b)=>b.score-a.score);
 for(const x of candidates.slice(0,15))try{await save(await fetchImage(x.info.url),target);used.add(x.info.url);const m=x.info.extmetadata||{};credits.push({recipe:id,title:x.title,creator:String(m.Artist?.value||'Wikimedia Commons contributor').replace(/<[^>]+>/g,''),license:m.LicenseShortName?.value||'Wikimedia Commons licence',licenseUrl:m.LicenseUrl?.value||'',sourceUrl:`https://commons.wikimedia.org/?curid=${x.page.pageid}`});return{provider:'Wikimedia Commons',query}}catch{}
 return null
}
async function replaceFromCommons(id,target){for(const q of queryPlan(id)){const r=await commonsSearch(id,q,target);if(r)return r;await sleep(120)}return null}

let directMap={};try{const build=await readFile(path.join(root,'build.mjs'),'utf8'),m=build.match(/const originalImageUrls\s*=\s*(\{[\s\S]*?\n\});/);if(m)directMap=JSON.parse(m[1])}catch{}
const files=(await readdir(recipes)).filter(f=>f.endsWith('.webp')).sort();
console.log(`HQ5 audit: validating ${files.length} recipe photos from genuine source dimensions.`);
let directN=0,replacedN=0;const unresolved=[];
for(let i=0;i<files.length;i+=2){
 const batch=files.slice(i,i+2);const rs=await Promise.all(batch.map(async file=>{const id=file.replace(/\.webp$/,''),target=path.join(recipes,file);const d=await direct(directMap[id],target);if(d)return{id,provider:'verified original'};const r=await replaceFromCommons(id,target);return{id,...(r||{})}}));
 for(const r of rs){if(r.provider){if(r.provider==='verified original')directN++;else replacedN++;console.log(`HQ5 verified: ${r.id} via ${r.provider}${r.query?` (${r.query})`:''}`)}else{unresolved.push(r.id);console.warn(`HQ5 unresolved: ${r.id}`)}}
}
if(unresolved.length)throw new Error(`HQ5 blocked: ${unresolved.length} recipes still unresolved: ${unresolved.join(', ')}`);

const dims=[];for(const file of files){const m=await sharp(path.join(recipes,file)).metadata();if(!hq(m.width,m.height))throw new Error(`HQ5 final gate failed ${file} ${m.width}x${m.height}`);dims.push({file,w:m.width,h:m.height})}
const heroIds=['beef-suya-rice-plate','nigerian-egg-fried-rice-prawns','coconut-jollof-rice-turkey','chicken-vegetable-couscous'],tiles=[];for(const id of heroIds){const b=await sharp(path.join(recipes,`${id}.webp`)).resize(800,500,{fit:'cover',position:'attention',withoutEnlargement:true}).webp({quality:94,effort:5}).toBuffer();const m=await sharp(b).metadata();if(m.width!==800||m.height!==500)throw new Error(`hero ${id} too small`);tiles.push(b)}
await sharp({create:{width:1600,height:1000,channels:3,background:'#efe4d5'}}).composite([{input:tiles[0],left:0,top:0},{input:tiles[1],left:800,top:0},{input:tiles[2],left:0,top:500},{input:tiles[3],left:800,top:500}]).webp({quality:94,effort:5}).toFile(path.join(dist,'assets','sabiplate-hero.webp'));
if(credits.length){const rows=credits.sort((a,b)=>a.recipe.localeCompare(b.recipe)).map(c=>`<li><strong>${esc(c.recipe.replaceAll('-',' '))}</strong>: ${esc(c.title)} — ${esc(c.creator)}${c.license?` (${esc(c.license)})`:''}. <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>${c.licenseUrl?` · <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener noreferrer">Licence</a>`:''}</li>`).join('\n');await writeFile(path.join(dist,'assets','image-credits.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SabiPlate food photo credits</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:920px;margin:auto;padding:32px 20px;line-height:1.55;color:#1f2933}li{margin-bottom:12px}a{color:#7a3d18}</style></head><body><h1>SabiPlate food photo credits</h1><p>Openly licensed photographs used in SabiPlate's high-resolution food image repair.</p><ol>${rows}</ol></body></html>`)}
let html=await readFile(indexPath,'utf8');html=html.replace(/2026082[89]-hq\d+/g,version).replace(/(\.\/assets\/recipes\/[a-z0-9-]+\.webp)(?!\?)/g,`$1?v=${version}`).replace(/sabiplate-hero\.webp(?:\?v=[^'"`)]+)?/g,`sabiplate-hero.webp?v=${version}`);const css=`\n/* SabiPlate HQ5 image rendering */\n.recipe-img-wrap{overflow:hidden}.recipe-img-wrap img,.modal-hero img{width:100%;height:100%;object-fit:cover;object-position:center;image-rendering:auto;backface-visibility:hidden}.recipe-img-wrap img{transform:none}.recipe-img-wrap:hover img{transform:scale(1.015)}.modal-hero img{transform:none}@media(min-width:769px){.recipe-modal-card{max-width:900px}.modal-hero{height:390px}}.sabiplate-photo-credits-link{display:block;width:max-content;max-width:calc(100% - 32px);margin:10px auto 24px;font-size:11px;color:#7a746e;text-decoration:none}\n`;html=html.replace('</style>',`${css}</style>`);if(credits.length&&!html.includes('sabiplate-photo-credits-link'))html=html.replace('</body>',`<a class="sabiplate-photo-credits-link" href="./assets/image-credits.html" target="_blank" rel="noopener noreferrer">Food photo credits</a></body>`);await writeFile(indexPath,html);
const smallest=dims.reduce((a,b)=>a.w*a.h<b.w*b.h?a:b,dims[0]);console.log(`HQ5 PASS: ${files.length}/${files.length} recipe images genuine HQ; ${directN} verified originals, ${replacedN} licensed replacements, 0 low-resolution fallbacks.`);console.log(`HQ5 smallest final asset ${smallest.file}: ${smallest.w}x${smallest.h}; hero rebuilt 1600x1000.`);
