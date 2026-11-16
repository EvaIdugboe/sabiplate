;
const dbg=window.SABI_DEBUG;if(!dbg)return;
const recipes=dbg.recipes;const rmap=Object.fromEntries(recipes.map(r=>[r.id,r]));
const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const money=n=>'£'+Number(n||0).toFixed(2);
const store={get(k,f){try{let v=localStorage.getItem(k);return v===null?f:JSON.parse(v)}catch{return f}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));window.dispatchEvent(new CustomEvent('sabiplate:changed'))}catch{}}};
const BASE_A=DATA.metadata.female_target.kcal,BASE_B=DATA.metadata.male_target.kcal;
const GOALS={loss:'Fat loss',maintain:'Maintenance',gain:'Muscle gain',custom:'Custom target'};
const GOAL_KCAL={loss:1750,maintain:2200,gain:2800};
const MIN_KCAL=1200,MAX_KCAL=4500,MAX_MEMBERS=6;
const SLOTS=['Breakfast','Lunch','Dinner','Snack'];
function cleanMembers(list){
  if(!Array.isArray(list)||!list.length)return null;
  return list.slice(0,MAX_MEMBERS).map((m,i)=>({id:String(m.id||('m'+i)),name:String(m.name||'').trim().slice(0,24)||('Person '+(i+1)),goal:GOALS[m.goal]?m.goal:'custom',kcal:Math.min(MAX_KCAL,Math.max(MIN_KCAL,Math.round(Number(m.kcal)||2000)))}));
}
function defaultMembers(){
  const a=store.get('sabiplate-v15-female-name','Female'),b=store.get('sabiplate-v15-male-name','Male');
  return [{id:'m0',name:a==='Female'?'Person 1':a,goal:'loss',kcal:BASE_A},{id:'m1',name:b==='Male'?'Person 2':b,goal:'gain',kcal:BASE_B}];
}
let members=cleanMembers(store.get('sabiplate-household-v1',null))||defaultMembers();
let active=store.get('sabiplate-v15-plan-active',false);
let week=store.get('sabiplate-v15-week','1');
let have=new Set(store.get('sabiplate-v15-have',[]));
let priceOverrides=store.get('sabiplate-v15-price-overrides',{});
for(const r of recipes){const n=DATA.recipe_nutrition[r.id];if(n){r.calories=n.kcal;r.protein=n.protein;r.carbs=n.carbs;r.fat=n.fat}}
const friendly={
dry_basmati_rice:'dry basmati rice',dry_white_rice:'dry rice',dry_wholewheat_pasta:'dry wholewheat pasta',dry_pasta:'dry pasta',
chicken:'chicken breast',turkey_breast:'turkey',lean_beef:'lean beef',prawns:'prawns',white_fish:'fish',sardines:'sardines',
black_eyed_peas_dry:'dry black-eyed peas',black_eyed_peas_cooked:'cooked black-eyed beans',basmati_rice:'cooked rice',egg:'egg',
greek_yogurt:'Greek yoghurt',cottage_cheese:'cottage cheese',oats:'oats',berries:'berries',apple:'apple',bell_pepper:'pepper',onion:'onion',
tomato:'tomato',tomato_pepper_sauce:'tomato-pepper sauce',mixed_veg:'mixed vegetables',coconut_milk_light:'light coconut milk',
olive_oil:'olive oil',palm_oil:'palm oil',wrap:'wholewheat wrap',protein_powder:'protein powder',peanut_butter:'peanut butter',
dark_chocolate:'dark chocolate',spinach:'spinach',carrot:'carrot',milk:'milk',honey:'honey',chia:'chia seeds',almonds:'almonds',peanuts:'peanuts',flaxseed:'flaxseed'
};
const fmtg=(g,key)=>{g=Number(g);if(key==='egg')return Math.max(1,Math.round(g/50))+' egg'+(Math.round(g/50)===1?'':'s');if(key==='wrap')return (g/60).toFixed(1).replace('.0','')+' wrap(s)';return g>=1000?(g/1000).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')+'kg':Math.round(g)+'g'};
const important=new Set(['chicken','turkey_breast','lean_beef','prawns','white_fish','sardines','egg','dry_basmati_rice','dry_white_rice','basmati_rice','dry_wholewheat_pasta','black_eyed_peas_dry','black_eyed_peas_cooked','wrap','oats','greek_yogurt','cottage_cheese','apple','berries','olive_oil']);

/* ---- Portion engine -------------------------------------------------------
   Every planned meal carries two calibrated plates (a lighter and a larger one).
   A member's plate is a blend of the two, chosen so their day lands on their
   own calorie target. Below the lighter plate or above the larger one the
   nearest plate is scaled instead. Same pot, different portions. */
function blend(kcal){
  if(kcal<=BASE_A)return{a:kcal/BASE_A,b:0};
  if(kcal>=BASE_B)return{a:0,b:kcal/BASE_B};
  const t=(kcal-BASE_A)/(BASE_B-BASE_A);return{a:1-t,b:t};
}
function plateFor(meal,w){
  const f=meal.female,m=meal.male,map=new Map();
  for(const x of f.ingredients)map.set(x.food_key,{food_key:x.food_key,grams:w.a*x.grams,adjusted:false});
  for(const x of m.ingredients){const e=map.get(x.food_key);if(e)e.grams+=w.b*x.grams;else map.set(x.food_key,{food_key:x.food_key,grams:w.b*x.grams,adjusted:false})}
  const mixv=k=>w.a*f[k]+w.b*m[k];
  return{kcal:mixv('kcal'),protein:mixv('protein'),carbs:mixv('carbs'),fat:mixv('fat'),ingredients:[...map.values()].filter(x=>x.grams>=0.5)};
}
let model=null;
function sumInto(t,plate,rid){for(const i of plate.ingredients){t.all[i.food_key]=(t.all[i.food_key]||0)+i.grams;const r=(t.byRecipe[rid]??={});r[i.food_key]=(r[i.food_key]||0)+i.grams}}
function buildModel(){
  const weights=members.map(m=>blend(m.kcal));
  const house={all:{},byRecipe:{}},base={all:{},byRecipe:{}};
  const avg=members.map(()=>({kcal:0,protein:0,carbs:0,fat:0}));
  const days=DATA.days.map(d=>{
    const totals=members.map(()=>({kcal:0,protein:0,carbs:0,fat:0}));const meals={};
    for(const s of SLOTS){const meal=d.meals[s];if(!meal)continue;
      const plates=weights.map(w=>plateFor(meal,w));meals[s]={meal,plates};
      plates.forEach((p,i)=>{for(const k of ['kcal','protein','carbs','fat'])totals[i][k]+=p[k];sumInto(house,p,meal.recipe_id)});
      sumInto(base,meal.female,meal.recipe_id);sumInto(base,meal.male,meal.recipe_id);
    }
    totals.forEach((t,i)=>{for(const k in t)avg[i][k]+=t[k]/DATA.days.length});
    return{d,meals,totals};
  });
  const houseKcal=members.reduce((s,m)=>s+m.kcal,0),fallback=houseKcal/(BASE_A+BASE_B);
  model={days,avg,house,base,fallback};
  return model;
}
const SHOP_SOURCES={dry_basmati_rice:['dry_basmati_rice','basmati_rice'],black_eyed_peas_dry:['black_eyed_peas_dry','black_eyed_peas_cooked'],bell_pepper:['bell_pepper','tomato_pepper_sauce'],onion:['onion','tomato_pepper_sauce'],olive_oil:['olive_oil','tomato_pepper_sauce'],palm_oil:['palm_oil','tomato_pepper_sauce'],tinned_tomatoes:['tomato','tomato_pepper_sauce'],fresh_tomatoes:['tomato','tomato_pepper_sauce'],eggs:['egg'],wraps:['wrap']};
function ratioFor(keys,h,b,fallback){let hs=0,bs=0;for(const k of keys){hs+=h[k]||0;bs+=b[k]||0}return bs>0?hs/bs:fallback}
function fmtNeed(n,unit){if(unit==='count')return String(Math.ceil(n-1e-9));const big=unit==='ml'?' L':' kg';return n>=1000?(n/1000).toFixed(2)+big:Math.round(n)+' '+unit}
function shopRows(){
  const mo=model||buildModel();
  return DATA.shopping.map(row=>{
    const ratio=ratioFor(SHOP_SOURCES[row.key]||[row.key],mo.house.all,mo.base.all,mo.fallback);
    if(Math.abs(ratio-1)<1e-6)return{...row,ratio:1};
    const needed=row.needed*ratio;
    const p1=needed>0?Math.max(1,Math.ceil(needed/row.pack_size-1e-9)):0;
    const left=p1*row.pack_size-needed;
    const p2=Math.max(0,Math.ceil((needed-left)/row.pack_size-1e-9));
    return{...row,ratio,needed,needed_display:fmtNeed(needed,row.unit),packs_first_shop:p1,packs_second_shop:p2};
  });
}
function currentCosts(){let first=0,second=0;for(const row of shopRows()){if(have.has(row.key))continue;const p=priceOverrides[row.key]??row.unit_price;first+=row.packs_first_shop*p;second+=row.packs_second_shop*p}return{first,second,month:first+second,ppd:(first+second)/(28*members.length)}}
function batchRows(){
  const mo=model||buildModel();
  return DATA.batches.map(b=>({...b,plates:b.meal_occurrences*members.length,ingredients:b.ingredients.map(i=>({...i,qty:i.qty*ratioFor([i.key],mo.house.byRecipe[b.recipe_id]||{},mo.base.byRecipe[b.recipe_id]||{},mo.fallback)}))}));
}
const tone=i=>i%2?'male':'female';
const namesList=()=>members.length===1?members[0].name:members.slice(0,-1).map(m=>m.name).join(', ')+' and '+members[members.length-1].name;
const headline=()=>members.length>1?'Same food. Different goals.':'Your plan, your portions.';
function keyPortion(p){let arr=p.ingredients.filter(x=>important.has(x.food_key)).sort((a,b)=>b.grams-a.grams);if(arr.length<2)arr=p.ingredients.slice().sort((a,b)=>b.grams-a.grams);return arr.slice(0,3).map(x=>fmtg(x.grams,x.food_key)+' '+(friendly[x.food_key]||x.food_key.replaceAll('_',' '))).join(' + ')}
function exactList(p){return p.ingredients.map(x=>`<li>${fmtg(x.grams,x.food_key)} ${esc(friendly[x.food_key]||x.food_key.replaceAll('_',' '))}</li>`).join('')}
function recipeImg(id){return rmap[id]?.image||''}
function openRecipe(id){dbg.openRecipe?.(id)}
function targetCards(showAvg){const mo=model||buildModel();return `<div class="v15-targets">${members.map((m,i)=>`<div class="v15-target ${tone(i)}"><b>${esc(m.name)} · ${esc(GOALS[m.goal].toLowerCase())}</b><strong>${m.kcal.toLocaleString('en-GB')} kcal/day</strong><small>${showAvg?`Plan average: ${Math.round(mo.avg[i].kcal)} kcal · `:''}${Math.round(mo.avg[i].protein)}g protein · ${Math.round(mo.avg[i].carbs)}g carbs · ${Math.round(mo.avg[i].fat)}g fat</small></div>`).join('')}</div>`}
function mealCard(entry,slot){const meal=entry.meal;return `<div class="v15-meal"><button class="v15-meal-img" data-v15-open="${meal.recipe_id}"><img src="${esc(recipeImg(meal.recipe_id))}" alt="${esc(meal.title)}" loading="lazy"><em>${slot}</em></button><div class="v15-meal-body"><div class="v15-meal-title"><b>${esc(meal.title)}</b><button data-v15-open="${meal.recipe_id}">View recipe</button></div><div class="v15-plates">${entry.plates.map((p,i)=>`<div class="v15-plate ${tone(i)}"><span class="label">${esc(members[i].name)}'s plate</span><strong>${Math.round(p.kcal)} kcal</strong><small>${p.protein.toFixed(0)}P · ${p.carbs.toFixed(0)}C · ${p.fat.toFixed(0)}F</small><div class="v15-keyportion">${esc(keyPortion(p))}</div><details><summary>Exact grams</summary><ul>${exactList(p)}</ul></details></div>`).join('')}</div></div></div>`}
function plannerHtml(){
 const mo=buildModel();
 if(!active)return `<section class="v15-card v15-hero"><span class="eyebrow">${members.length>1?'Household plan':'Your plan'} · 14 days</span><h2>One fortnight. One prep system. ${members.length>1?'Everyone’s own goal.':'Your own goal.'}</h2><p>The same six batch dishes feed ${esc(namesList())}. SabiPlate works out each plate ingredient by ingredient, then totals the batch quantities into one 14-day shop.</p>${targetCards(false)}<div class="v15-note"><b>Designed for busy schedules:</b> shop once for 14 days. Cook two mains on Sunday, one short top-up on Wednesday, then repeat the same structure in week 2. Breakfasts stay 5–10 minutes or prep-ahead.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="v15Build" class="primary-btn">Build ${members.length>1?'our':'my'} 14-day plan</button><button id="v15EditHouse" class="ghost-btn">Change people or targets</button></div></section>`;
 const mains=DATA.main_recipe_ids.map(id=>rmap[id]).filter(Boolean);
 const visible=mo.days.filter(x=>week==='all'||String(x.d.week)===String(week));
 const c=currentCosts();
 return `<section class="v15-card v15-hero"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><span class="eyebrow">${members.length>1?'Household plan':'Your plan'} · 14 days</span><h2>${headline()} One shop.</h2></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="v15EditHouse" class="ghost-btn">Change people or targets</button><button id="v15Reset" class="ghost-btn">Close plan</button></div></div>${targetCards(true)}<div class="v15-summary"><div><b>${mains.length}</b><small>main dishes</small></div><div><b>4</b><small>cooking sessions</small></div><div><b>14</b><small>days from one shop</small></div><div><b>${money(c.first)}</b><small>first basket estimate</small></div></div><h3 style="font-family:Georgia,serif;color:var(--green)">Your batch menu</h3><div class="v15-gallery">${mains.map((r,i)=>`<button data-v15-open="${r.id}"><img src="${esc(r.image)}" alt="${esc(r.title)}" loading="lazy"><span><small>${i%3<2?'Weekend batch':'Wednesday top-up'}</small><b>${esc(r.title)}</b></span></button>`).join('')}</div><div class="v15-week-tabs"><button data-v15-week="1" class="${week==='1'?'active':''}">Week 1</button><button data-v15-week="2" class="${week==='2'?'active':''}">Week 2</button><button data-v15-week="all" class="${week==='all'?'active':''}">All 14 days</button></div><div class="v15-days">${visible.map(x=>`<article class="v15-day"><div class="v15-day-head"><div><small>Week ${x.d.week}</small><h3>${esc(x.d.day)} · Day ${x.d.day_number}</h3></div><div class="v15-day-totals">${x.totals.map((t,i)=>`<div class="${i%2?'m':'f'}"><b>${esc(members[i].name)}:</b> ${Math.round(t.kcal)} kcal · ${t.protein.toFixed(0)}P · ${t.carbs.toFixed(0)}C · ${t.fat.toFixed(0)}F</div>`).join('')}</div></div>${SLOTS.filter(s=>x.meals[s]).map(s=>mealCard(x.meals[s],s)).join('')}</article>`).join('')}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="primary-btn" id="v15GoShop">See fortnight shop + cost</button><button class="secondary-btn" id="v15GoPrep">See batch-cook quantities</button></div></section>`;
}
function shoppingHtml(){buildModel();const c=currentCosts(),rows=shopRows();return `<section class="v15-card"><span class="eyebrow">Fortnight shop</span><h2 style="font-family:Georgia,serif;color:var(--green);margin:5px 0">Shop twice a month, not every week.</h2><p class="muted">Quantities below combine the portions for ${esc(namesList())} across all 14 days. Pantry leftovers are carried into the second fortnight instead of pretending you rebuy a full pack.</p><div class="v15-cost-grid"><div><strong>${money(c.first)}</strong><span>Fortnight shop 1</span></div><div><strong>${money(c.second)}</strong><span>Fortnight shop 2 restock</span></div><div><strong>${money(c.month)}</strong><span>28-day monthly estimate</span></div><div><strong>${money(c.ppd)}</strong><span>per person per day</span></div></div><div class="v15-note"><b>No compulsory Week 2 shop:</b> proteins are portioned and frozen, berries/spinach/mixed veg are bought frozen, cooked-sauce tomatoes are bought as tins/passata, and peppers for week 2 can be chopped and frozen. Dairy dates still need checking when you shop.</div><div class="v15-shop-controls"><b>${rows.length} combined ingredients</b><button id="v15ClearHave" class="ghost-btn">Clear “already have”</button></div><div class="v15-shop-list">${rows.map(row=>{const p=priceOverrides[row.key]??row.unit_price;const line=row.packs_first_shop*p;return `<div class="v15-shop-row ${have.has(row.key)?'have':''}"><input type="checkbox" data-v15-have="${row.key}" ${have.has(row.key)?'checked':''} title="Already have enough" aria-label="Already have ${esc(row.name)}"><span><b>${esc(row.name)}</b><small>Need ${esc(row.needed_display)} · ${esc(row.category)}</small><small>${esc(row.storage)}</small></span><span class="v15-buy"><b>${row.packs_first_shop} pack${row.packs_first_shop===1?'':'s'}</b><small>shop 1 · ${row.packs_second_shop} pack${row.packs_second_shop===1?'':'s'} shop 2</small></span><span class="v15-linecost"><b>${money(line)}</b><small>shop 1</small></span><span class="v15-price"><small>£ / pack</small><input type="number" min="0" step=".01" value="${p.toFixed(2)}" data-v15-price="${row.key}" aria-label="Price per pack for ${esc(row.name)}"></span><span class="v15-source">${row.source.startsWith('http')?`<a href="${esc(row.source)}" target="_blank" rel="noopener">price reference</a>`:'editable planning estimate'}</span></div>`}).join('')}</div><p class="shop-footnote">Costs are planning estimates, not a live checkout total. Prices vary by shop, promotion, butcher and African grocery, so every price is editable.</p></section>`}
function prepHtml(){buildModel();return `<section class="v15-card"><span class="eyebrow">Batch-cook plan</span><h2 style="font-family:Georgia,serif;color:var(--green);margin:5px 0">Four cooking sessions cover the fortnight.</h2><p class="muted">Sunday does the heavy lifting. Wednesday is the short top-up. Quantities already combine every plate for ${esc(namesList())}, so you do not calculate anything while cooking.</p><div class="v15-batches">${batchRows().map(b=>`<article class="v15-batch"><span class="session">Week ${b.week} · ${b.session}</span><h3>${esc(b.title)}</h3><p><b>${b.plates} plated servings</b> · ${b.meal_occurrences} shared meal occasions</p><small class="muted">${b.occurrences.map(x=>x[0]+' '+x[1]).join(' · ')}</small><ul>${b.ingredients.slice(0,12).map(i=>`<li><b>${i.qty>=1000?(i.qty/1000).toFixed(2)+(i.unit.startsWith('g')?'kg':' L'):Math.round(i.qty)+(i.unit.startsWith('g')?'g':' '+i.unit)}</b> ${esc(i.label)}</li>`).join('')}</ul><div class="v15-note"><b>Storage:</b> portion the later servings as soon as the food cools. Refrigerate near-term portions and freeze the later-week portions. Defrost in the fridge and reheat thoroughly.</div></article>`).join('')}</div></section>`}
function profileHtml(){const mo=buildModel();return `<section class="v15-card"><span class="eyebrow">Your household</span><h2 style="font-family:Georgia,serif;color:var(--green);margin:5px 0">Who is eating, and what is each person aiming for?</h2><p class="muted">Everyone shares the same meals. Change a calorie target and every plate, the shop and the batch quantities are recalculated.</p><div class="v15-profile-grid">${members.map((m,i)=>`<div class="v15-profile-person ${tone(i)}" data-member="${i}"><label>Name<input data-hh="name" value="${esc(m.name)}" maxlength="24" autocomplete="off"></label><label>Goal<select data-hh="goal">${Object.entries(GOALS).map(([k,v])=>`<option value="${k}" ${m.goal===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Daily calories<input data-hh="kcal" type="number" inputmode="numeric" min="${MIN_KCAL}" max="${MAX_KCAL}" step="50" value="${m.kcal}"></label><p>On this plan: about ${Math.round(mo.avg[i].protein)}g protein · ${Math.round(mo.avg[i].carbs)}g carbs · ${Math.round(mo.avg[i].fat)}g fat a day</p>${members.length>1?`<button type="button" class="ghost-btn" data-hh-remove="${i}">Remove ${esc(m.name)}</button>`:''}</div>`).join('')}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button id="v15SaveHouse" class="primary-btn">Save household</button>${members.length<MAX_MEMBERS?'<button id="v15AddMember" class="ghost-btn">Add a person</button>':''}</div><div class="v15-note"><b>How portions work:</b> protein, carbs and fat follow from each person’s calorie target. Calories can be set between ${MIN_KCAL.toLocaleString('en-GB')} and ${MAX_KCAL.toLocaleString('en-GB')}. This is a planning aid, not medical advice.</div></section>`}
function readMembers(block){return [...block.querySelectorAll('[data-member]')].map((el,i)=>({id:members[i]?.id||('m'+Date.now()+i),name:el.querySelector('[data-hh="name"]').value,goal:el.querySelector('[data-hh="goal"]').value,kcal:el.querySelector('[data-hh="kcal"]').value}))}
function saveMembers(list){members=cleanMembers(list)||defaultMembers();store.set('sabiplate-household-v1',members);injectAll(true)}
function injectPlanner(force=false){
  const v=document.querySelector('#view-planner');
  if(!v)return;
  const existing=v.querySelector('#v15Planner');
  if(existing&&!force)return;
  existing?.remove();
  const block=document.createElement('div');
  block.id='v15Planner';
  block.innerHTML=plannerHtml();
  const head=v.querySelector('.page-head');
  (head||v.firstChild)?.after?.(block);
  if(!head)v.prepend(block);
  v.querySelectorAll('.effort-card,.planner-controls,.week-grid,.plan-summary,#soloPlannerNote,#coupleFortnightBlock,#plannerModeSwitch').forEach(x=>x.classList.add('v15-hidden'));
  bindCommon(block);
  block.querySelector('#v15Build')?.addEventListener('click',()=>{active=true;store.set('sabiplate-v15-plan-active',true);injectPlanner(true)});
  block.querySelector('#v15Reset')?.addEventListener('click',()=>{active=false;store.set('sabiplate-v15-plan-active',false);injectPlanner(true)});
  block.querySelectorAll('#v15EditHouse').forEach(b=>b.addEventListener('click',()=>dbg.nav('profile')));
  block.querySelectorAll('[data-v15-week]').forEach(b=>b.onclick=()=>{week=b.dataset.v15Week;store.set('sabiplate-v15-week',week);injectPlanner(true)});
  block.querySelector('#v15GoShop')?.addEventListener('click',()=>dbg.nav('shopping'));
  block.querySelector('#v15GoPrep')?.addEventListener('click',()=>dbg.nav('prep'));
}
function injectShopping(force=false){
  const v=document.querySelector('#view-shopping');
  if(!v)return;
  const existing=v.querySelector('#v15Shopping');
  if(existing&&!force)return;
  existing?.remove();
  v.querySelector('#fortnightShopBlock')?.classList.add('v15-hidden');
  v.querySelector('.shopping-layout')?.classList.add('v15-hidden');
  const block=document.createElement('div');
  block.id='v15Shopping';
  block.innerHTML=shoppingHtml();
  v.prepend(block);
  block.querySelectorAll('[data-v15-have]').forEach(x=>x.onchange=()=>{x.checked?have.add(x.dataset.v15Have):have.delete(x.dataset.v15Have);store.set('sabiplate-v15-have',[...have]);injectShopping(true)});
  block.querySelectorAll('[data-v15-price]').forEach(x=>x.onchange=()=>{priceOverrides[x.dataset.v15Price]=Math.max(0,Number(x.value)||0);store.set('sabiplate-v15-price-overrides',priceOverrides);injectShopping(true)});
  block.querySelector('#v15ClearHave')?.addEventListener('click',()=>{have.clear();store.set('sabiplate-v15-have',[]);injectShopping(true)});
}
function injectPrep(force=false){
  const v=document.querySelector('#view-prep');
  if(!v)return;
  const existing=v.querySelector('#v15Prep');
  if(existing&&!force)return;
  existing?.remove();
  v.querySelector('#couplePrepBlock')?.classList.add('v15-hidden');
  const block=document.createElement('div');
  block.id='v15Prep';
  block.innerHTML=prepHtml();
  v.prepend(block);
}
function injectProfile(force=false){
  const v=document.querySelector('#view-profile');
  if(!v)return;
  const existing=v.querySelector('#v15Profile');
  if(existing&&!force)return;
  existing?.remove();
  v.querySelector('#coupleSetupBlock')?.classList.add('v15-hidden');
  const block=document.createElement('div');
  block.id='v15Profile';
  block.innerHTML=profileHtml();
  v.prepend(block);
  block.querySelectorAll('[data-hh="goal"]').forEach(sel=>sel.onchange=()=>{const k=GOAL_KCAL[sel.value];if(k)sel.closest('[data-member]').querySelector('[data-hh="kcal"]').value=k});
  block.querySelectorAll('[data-hh="kcal"]').forEach(inp=>inp.oninput=()=>{const sel=inp.closest('[data-member]').querySelector('[data-hh="goal"]');if(GOAL_KCAL[sel.value]!==Number(inp.value))sel.value='custom'});
  block.querySelector('#v15SaveHouse')?.addEventListener('click',()=>saveMembers(readMembers(block)));
  block.querySelector('#v15AddMember')?.addEventListener('click',()=>saveMembers([...readMembers(block),{id:'m'+Date.now(),name:'Person '+(members.length+1),goal:'maintain',kcal:GOAL_KCAL.maintain}]));
  block.querySelectorAll('[data-hh-remove]').forEach(b=>b.onclick=()=>{const list=readMembers(block);list.splice(Number(b.dataset.hhRemove),1);saveMembers(list)});
}
function injectHome(){const v=document.querySelector('#view-home');if(!v||v.querySelector('#v15Home'))return;const card=document.createElement('section');card.id='v15Home';card.className='v15-card v15-hero';card.innerHTML=`<span class="eyebrow">${members.length>1?'Household plan':'Your plan'} · 14 days</span><h2>${headline()} One shop every two weeks.</h2><p>${members.map(m=>`${esc(m.name)} ${m.kcal.toLocaleString('en-GB')} kcal`).join(' · ')}. ${members.length>1?'The recipes stay shared, and every plate has its own gram quantities.':'Every plate is portioned to your own target.'}</p><button id="v15HomeGo" class="primary-btn">Open ${members.length>1?'our':'my'} 14-day plan</button>`;v.querySelector('.hero')?.after(card);card.querySelector('#v15HomeGo').onclick=()=>{active=true;store.set('sabiplate-v15-plan-active',true);dbg.nav('planner')}}
function bindCommon(root){root.querySelectorAll('[data-v15-open]').forEach(b=>b.onclick=()=>openRecipe(b.dataset.v15Open))}
function injectAll(force=false){
  if(force)document.querySelector('#v15Home')?.remove();
  injectHome();
  injectPlanner(force);
  injectShopping(force);
  injectPrep(force);
  injectProfile(force);
}
window.addEventListener('sabiplate:view-rendered',event=>{
  const name=event.detail?.name;
  if(name==='home')injectHome();
  if(name==='planner')injectPlanner();
  if(name==='shopping')injectShopping();
  if(name==='prep')injectPrep();
  if(name==='profile')injectProfile();
});
setTimeout(injectAll,80);
window.SABI_V15={data:DATA,currentCosts,shopRows,batchRows,buildModel,getMembers:()=>members,setMembers:saveMembers,activate:()=>{active=true;store.set('sabiplate-v15-plan-active',true);injectPlanner(true)}};
})();
