// market.js
import { guardMarket, guardHorsePurchase } from './feature-guards.js';

// after userData is loaded:
guardMarket(userData);
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, push, runTransaction } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour } from './time.js'; // centralized clock
import { logHorseEvent, logTransfer, logStoreBirthIfMissing } from './horse-history-log.js';


const $ = (id) => document.getElementById(id);

// 12-hour store rotation (in-game)
function currentStorePeriod() { return Math.floor(currentGameHour() / 12); }

// ---------- state ----------
let uid = null;
let userData = null;
let myHorses = [];
let storeHorses = [];

// ---------- pricing data ----------
const FEED_PACKS = [
  {id:'ado_basic',   label:'Adolescent Basic (1000 lbs)',    lbs:1000, price: 50,  minM:12,  maxM:29,  bonus:0},
  {id:'ado_premium', label:'Adolescent Premium (1000 lbs)',  lbs:1000, price: 75,  minM:12,  maxM:29,  bonus:5},
  {id:'adult_basic', label:'Adult Basic (1500 lbs)',         lbs:1500, price: 75,  minM:29,  maxM:300, bonus:0},
  {id:'adult_prem',  label:'Adult Premium (1500 lbs)',       lbs:1500, price:125,  minM:29,  maxM:300, bonus:5},
  {id:'adult_elite', label:'Adult Elite (2500 lbs)',         lbs:2500, price:200,  minM:29,  maxM:300, bonus:10},
  {id:'senior',      label:'Senior (1000 lbs)',              lbs:1000, price: 40,  minM:300, maxM:1200, bonus:20}
];

const TREAT_PACKS = [
  {id:'car_125',  kind:'carrots',    label:'Carrots ×125',      qty:125,  price: 50},
  {id:'car_250',  kind:'carrots',    label:'Carrots ×250',      qty:250,  price: 88},
  {id:'car_500',  kind:'carrots',    label:'Carrots ×500',      qty:500,  price:160},
  {id:'car_1000', kind:'carrots',    label:'Carrots ×1000',     qty:1000, price:300},
  {id:'app_150',  kind:'apples',     label:'Apples ×150',       qty:150,  price:135},
  {id:'app_300',  kind:'apples',     label:'Apples ×300',       qty:300,  price:255},
  {id:'app_600',  kind:'apples',     label:'Apples ×600',       qty:600,  price:480},
  {id:'app_1200', kind:'apples',     label:'Apples ×1200',      qty:1200, price:900},
  {id:'sug_125',  kind:'sugarCubes', label:'Sugar Cubes ×125',  qty:125,  price:200},
  {id:'sug_250',  kind:'sugarCubes', label:'Sugar Cubes ×250',  qty:250,  price:360},
  {id:'sug_500',  kind:'sugarCubes', label:'Sugar Cubes ×500',  qty:500,  price:675},
  {id:'sug_1000', kind:'sugarCubes', label:'Sugar Cubes ×1000', qty:1000, price:1250}
];

// ---------- safe event wiring ----------
function on(id, evt, fn) {
  const el = $(id);
  if (!el) { console.warn('[market] Missing element id:', id); return; }
  el.addEventListener(evt, fn);
}

document.addEventListener('DOMContentLoaded', () => {
  // top tabs
  on('tabBuy',  'click', () => showTop('buy'));
  on('tabSell', 'click', () => showTop('sell'));

  // buy menu links
  on('linkStore',  'click', e => { e.preventDefault(); openBuy('store'); });
  on('linkRescue', 'click', e => { e.preventDefault(); openBuy('rescue'); });
  on('linkFeed',   'click', e => { e.preventDefault(); openBuy('feed'); });
  on('linkTreats', 'click', e => { e.preventDefault(); openBuy('treats'); });
  on('linkTack',   'click', e => { e.preventDefault(); openBuy('tack'); });

  // buy back links
  on('backFromStore',  'click', e => { e.preventDefault(); openBuy(null); });
  on('backFromRescue', 'click', e => { e.preventDefault(); openBuy(null); });
  on('backFromFeed',   'click', e => { e.preventDefault(); openBuy(null); });
  on('backFromTreats', 'click', e => { e.preventDefault(); openBuy(null); });
  on('backFromTack',   'click', e => { e.preventDefault(); openBuy(null); });

  // sell menu links
  on('linkSellHorses',   'click', e => { e.preventDefault(); openSell('horses'); });
  on('linkSellTack',     'click', e => { e.preventDefault(); openSell('soon'); });
  on('linkSellFeed',     'click', e => { e.preventDefault(); openSell('soon'); });
  on('linkSellTreats',   'click', e => { e.preventDefault(); openSell('soon'); });

  // sell back links
  on('backFromSellHorses','click', e => { e.preventDefault(); openSell(null); });
  on('backFromSellSoon', 'click', e => { e.preventDefault(); openSell(null); });

  // default tab
  showTop('buy');
});

// ---------- top-level show/hide ----------
function showTop(which){
  const buy = (which==='buy');
  show('buyMenu',  buy);
  show('sellMenu', !buy);
  toggleClass('tabBuy','active', buy);
  toggleClass('tabSell','active', !buy);
  ['buyStore','buyRescue','buyFeed','buyTreats','buyTack','sellHorses','sellComingSoon'].forEach(id => show(id,false));
}
function openBuy(view){
  ['buyStore','buyRescue','buyFeed','buyTreats','buyTack'].forEach(id => show(id,false));
  show('buyMenu', !view);
  if (!view) return;
  show(`buy${cap(view)}`, true);
  if (view==='store')  ensureStoreThenRender();
  if (view==='rescue') loadRescue();
  if (view==='feed')   renderFeed();
  if (view==='treats') renderTreats();
}
function openSell(view){
  ['sellHorses','sellComingSoon'].forEach(id => show(id,false));
  show('sellMenu', !view);
  if (!view) return;
  if (view==='horses'){ show('sellHorses', true); renderSell(); }
  else { show('sellComingSoon', true); }
}

function show(id, visible){ const el=$(id); if (el) el.style.display = visible ? 'block' : 'none'; }
function toggleClass(id, cls, on){ const el=$(id); if (el) el.classList.toggle(cls, on); }
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

// ---------- boot ----------
onAuthStateChanged(auth, async user => {
  if (!user) return (window.location.href = 'login.html');
  uid = user.uid;

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) { alert('User data not found.'); return; }
  userData = us.val();

  myHorses = toArray(userData.horses);

  // update topbar coin readout (app-chrome also handles live)
  const coinEl = $('coinCounter');
  if (coinEl) coinEl.textContent = `Coins: ${Number(userData.coins||0).toLocaleString()}`;

  // land on Buy tab
  showTop('buy');
});

// ---------- STORE (12h rotation) ----------
async function ensureStoreThenRender(){
  const period = currentStorePeriod();
  const oldPeriod = userData.storePeriod ?? -1;
  storeHorses = toArray(userData.store);

  if (period !== oldPeriod || storeHorses.length === 0) {
    storeHorses = Array.from({length:4}, genStoreHorse);
    userData.store = storeHorses;
    userData.storePeriod = period;
    await update(ref(db, `users/${uid}`), { store: storeHorses, storePeriod: period });
  }
  renderStore();
}

function renderStore(){
  const grid = $('storeGrid'); if (!grid) return; grid.innerHTML='';
  storeHorses.forEach((h,i)=>{
    const div=document.createElement('div'); div.className='horse-card';
    div.innerHTML = `
      <img src="${escapeAttr(h.image || 'horse-placeholder.png')}" alt="" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;">
      <p><strong>${escapeHtml(h.name || 'Unnamed Horse')}</strong></p>
      <p>Breed: ${escapeHtml(h.breed)}</p>
      <p>Color: ${escapeHtml(h.coatColor)}</p>
      <p>Gender: ${escapeHtml(h.gender)}</p>
      <p>Age: ${formatAge(h.age)}</p>
      <p><strong>Price:</strong> ${Number(h.price)} coins</p>
      <button data-idx="${i}">Buy</button>
    `;
    div.querySelector('button').onclick = ()=>buyStore(i);
    grid.appendChild(div);
  });
}

async function buyStore(index){
  const h = storeHorses[index]; if (!h) return;
  const price = Number(h.price||0), coins = Number(userData.coins||0);
  if (coins < price) return alert('Not enough coins.');

  userData.coins = coins - price;
  // Keep the SAME id so history stays with the horse
  myHorses.push({ ...h });

  storeHorses.splice(index,1);
  userData.store = storeHorses;

  await update(ref(db, `users/${uid}`), { coins:userData.coins, horses: myHorses, store: storeHorses });

  const coinEl = $('coinCounter');
  if (coinEl) coinEl.textContent = `Coins: ${Number(userData.coins||0).toLocaleString()}`;

  // History: backfill a "born" event for store-origin horses if missing (~2y ago),
  // then record the purchase from Town Store.
  await logStoreBirthIfMissing(h.id, 2);
  await logHorseEvent(h.id, 'purchased', { sellerUid: 'store', sellerName: 'Town Store', price });

  renderStore();
}

// ---------- RESCUE ----------
async function loadRescue(){
  const snap = await get(ref(db, 'rescueHorses'));
  const all  = snap.exists()? snap.val() : {};
  const list = Object.entries(all).map(([key, h])=>({key, ...h}));
  const grid = $('rescueGrid'); if (!grid) return; grid.innerHTML='';

  if (list.length===0){ grid.innerHTML='<p>No rescue horses right now.</p>'; return; }

  list.forEach(({key, ...h})=>{
    const div=document.createElement('div'); div.className='horse-card';
    div.innerHTML=`
      <img src="${escapeAttr(h.image || 'horse-placeholder.png')}" alt="" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;">
      <p><strong>${escapeHtml(h.name || 'Unnamed Horse')}</strong></p>
      <p>Breed: ${escapeHtml(h.breed)}</p>
      <p>Color: ${escapeHtml(h.coatColor)}</p>
      <p>Gender: ${escapeHtml(h.gender)}</p>
      <p>Age: ${formatAge(h.age)}</p>
      <p><strong>Price:</strong> ${Number(h.price)} coins</p>
      <button data-key="${key}" data-price="${Number(h.price||0)}">Adopt</button>
    `;
    div.querySelector('button').onclick = (ev)=> buyRescue(ev.target.getAttribute('data-key'), Number(ev.target.getAttribute('data-price')));
    grid.appendChild(div);
  });
}

async function buyRescue(key, price){
  const rescueRef = ref(db, `rescueHorses/${key}`);
  const userRef   = ref(db, `users/${uid}`);

  // atomically take the listing
  const lock = await runTransaction(rescueRef, cur => (cur===null ? undefined : cur));
  if (!lock.committed || lock.snapshot.val()===null){
    alert('Sorry, that horse was just adopted.');
    return loadRescue();
  }
  const horse = lock.snapshot.val();

  // charge + add horse (keep SAME id)
  const txn = await runTransaction(userRef, u=>{
    if (!u) return u;
    const coins = Number(u.coins||0);
    if (coins < price) return; // abort
    const horses = toArray(u.horses);
    horses.push({ ...horse }); // keep id
    return { ...u, coins: coins - price, horses };
  });
  if (!txn.committed){
    await set(rescueRef, horse);
    return alert('Not enough coins.');
  }
  await set(rescueRef, null);

  const us = await get(ref(db, `users/${uid}`));
  userData = us.val(); myHorses = toArray(userData.horses);

  const coinEl = $('coinCounter');
  if (coinEl) coinEl.textContent = `Coins: ${Number(userData.coins||0).toLocaleString()}`;

  // History: record both sides of the transfer
  await logTransfer(horse.id, {
    sellerUid: horse.listedByUid || null,
    sellerName: horse.listedByName || null,
    buyerUid: uid,
    buyerName: userData.username || userData.loginName || null,
    price
  });

  loadRescue();
}

// ---------- SELL HORSES ----------
function renderSell(){
  const grid=$('sellGrid'); if (!grid) return; grid.innerHTML='';
  if (myHorses.length===0){ grid.innerHTML='<p>You have no horses to list.</p>'; return; }
  myHorses.forEach((h,i)=>{
    const div=document.createElement('div'); div.className='horse-card';
    div.innerHTML=`
      <img src="${escapeAttr(h.image || 'horse-placeholder.png')}" alt="" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;">
      <p><strong>${escapeHtml(h.name || 'Unnamed Horse')}</strong></p>
      <p>Breed: ${escapeHtml(h.breed)}</p>
      <p>Gender: ${escapeHtml(h.gender)}</p>
      <button data-idx="${i}">List to Rescue (500 coins)</button>
    `;
    div.querySelector('button').onclick = ()=> listToRescue(i);
    grid.appendChild(div);
  });
}

async function listToRescue(index){
  const h=myHorses[index]; if (!h) return;
  const rescueRef = push(ref(db, 'rescueHorses'));
  await set(rescueRef, {
    ...h,
    price: 500,
    listedByUid: uid,
    listedByName: userData.username || userData.loginName || 'Player'
  });
  myHorses.splice(index,1);
  await update(ref(db, `users/${uid}`), { horses: myHorses });
  renderSell();
  if ($('buyRescue')?.style.display==='block') loadRescue();
}

// ---------- FEED SHOP ----------
function renderFeed(){
  const grid = $('feedGrid'); if (!grid) return; grid.innerHTML='';
  FEED_PACKS.forEach(p=>{
    const div=document.createElement('div'); div.className='horse-card';
    div.innerHTML = `
      <p><strong>${escapeHtml(p.label)}</strong></p>
      <p>Price: ${p.price} coins</p>
      <p>${p.lbs} lbs • Age ${Math.floor(p.minM/12)}y ${p.minM%12}m — ${Math.floor(p.maxM/12)}y ${p.maxM%12}m</p>
      <p>Happiness bonus: ${p.bonus}% (for 4 days)</p>
      <button data-id="${p.id}">Buy</button>
    `;
    div.querySelector('button').onclick = ()=> buyFeed(p.id);
    grid.appendChild(div);
  });
}

async function buyFeed(id){
  const pack = FEED_PACKS.find(p=>p.id===id); if (!pack) return;
  if ((userData.coins||0) < pack.price) return alert('Not enough coins.');
  userData.coins -= pack.price;

  const inv = userData.inventory || {};
  inv.feed = inv.feed || {};
  inv.feed[id] = (inv.feed[id] || 0) + pack.lbs;

  await update(ref(db, `users/${uid}`), { coins:userData.coins, inventory: inv });
  userData.inventory = inv;

  const coinEl = $('coinCounter');
  if (coinEl) coinEl.textContent = `Coins: ${Number(userData.coins||0).toLocaleString()}`;

  alert('Purchased!');
}

// ---------- TREATS SHOP ----------
function renderTreats(){
  const grid = $('treatGrid'); if (!grid) return; grid.innerHTML='';
  TREAT_PACKS.forEach(p=>{
    const div=document.createElement('div'); div.className='horse-card';
    div.innerHTML = `
      <p><strong>${escapeHtml(p.label)}</strong></p>
      <p>Price: ${p.price} coins</p>
      <button data-id="${p.id}">Buy</button>
    `;
    div.querySelector('button').onclick = ()=> buyTreat(p.id);
    grid.appendChild(div);
  });
}

async function buyTreat(id){
  const pack = TREAT_PACKS.find(p=>p.id===id); if (!pack) return;
  if ((userData.coins||0) < pack.price) return alert('Not enough coins.');
  userData.coins -= pack.price;

  const inv = userData.inventory || {};
  inv.treats = inv.treats || {};
  inv.treats[pack.kind] = (inv.treats[pack.kind] || 0) + pack.qty;

  await update(ref(db, `users/${uid}`), { coins:userData.coins, inventory: inv });
  userData.inventory = inv;

  const coinEl = $('coinCounter');
  if (coinEl) coinEl.textContent = `Coins: ${Number(userData.coins||0).toLocaleString()}`;

  alert('Purchased!');
}

// ---------- helpers ----------
function toArray(v){ return Array.isArray(v) ? v.filter(Boolean) : Object.values(v||{}); }
function newHorseId(){ return 'horse_' + Date.now() + '_' + Math.floor(Math.random()*1000); } // used for store generation only
function formatAge(age){
  if(!age) return '—';
  const y=age.years??0, m=age.months??0, d=age.days??0;
  if(y===0&&m===0) return `${d} day(s)`;
  if(y===0) return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function genStoreHorse(){
  const breeds={Thoroughbred:['Black','Bay','Chestnut'],Arabian:['Grey','Bay','Chestnut'],Friesian:['Black']};
  const genders=['Mare','Stallion'];
  const breed=pick(Object.keys(breeds)), coat=pick(breeds[breed]), gender=pick(genders);
  // Give store horses a stable id up-front (kept on purchase)
  return { id:newHorseId(), name:'Unnamed Horse', breed, coatColor:coat, gender, age:{years:2,months:0}, level:1, exp:0, price:1000 };
}
