import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, push, runTransaction } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = (id) => document.getElementById(id);

// ---------- in-game clock ----------
function currentGameHour(){
  const start = new Date(Date.UTC(2025,0,1)).getTime();
  return Math.floor((Date.now() - start) / (60 * 1000)); // 1 real min = 1 in-game hour
}
function currentStorePeriod(){ return Math.floor(currentGameHour() / 12); } // 12-hour rotation

// ---------- state ----------
let uid = null;
let userData = null;
let myHorses = [];
let storeHorses = [];

// ---------- pricing data ----------
const FEED_PACKS = [
  // id, label, pounds, price, allowedAge (minMonths, maxMonths), bonusHappiness (percent for 4 days)
  {id:'ado_basic',   label:'Adolescent Basic (1000 lbs)',    lbs:1000, price: 50,  minM:12, maxM:29, bonus:0},
  {id:'ado_premium', label:'Adolescent Premium (1000 lbs)',  lbs:1000, price: 75,  minM:12, maxM:29, bonus:5},
  {id:'adult_basic', label:'Adult Basic (1500 lbs)',         lbs:1500, price: 75,  minM:29, maxM:300, bonus:0},
  {id:'adult_prem',  label:'Adult Premium (1500 lbs)',       lbs:1500, price:125,  minM:29, maxM:300, bonus:5},
  {id:'adult_elite', label:'Adult Elite (2500 lbs)',         lbs:2500, price:200,  minM:29, maxM:300, bonus:10},
  {id:'senior',      label:'Senior (1000 lbs)',              lbs:1000, price: 15,  minM:300, maxM:1200, bonus:40},
];

const TREAT_PACKS = [
  // carrots: cheapest
  {id:'car_125',  kind:'carrots',    label:'Carrots ×125',     qty:125,  price: 50},
  {id:'car_250',  kind:'carrots',    label:'Carrots ×250',     qty:250,  price: 88},
  {id:'car_500',  kind:'carrots',    label:'Carrots ×500',     qty:500,  price:160},
  {id:'car_1000', kind:'carrots',    label:'Carrots ×1000',    qty:1000, price:300},
  // apples: mid
  {id:'app_150',  kind:'apples',     label:'Apples ×150',      qty:150,  price:135},
  {id:'app_300',  kind:'apples',     label:'Apples ×300',      qty:300,  price:255},
  {id:'app_600',  kind:'apples',     label:'Apples ×600',      qty:600,  price:480},
  {id:'app_1200', kind:'apples',     label:'Apples ×1200',     qty:1200, price:900},
  // sugar cubes: most expensive
  {id:'sug_125',  kind:'sugarCubes', label:'Sugar Cubes ×125', qty:125,  price:200},
  {id:'sug_250',  kind:'sugarCubes', label:'Sugar Cubes ×250', qty:250,  price:360},
  {id:'sug_500',  kind:'sugarCubes', label:'Sugar Cubes ×500', qty:500,  price:675},
  {id:'sug_1000', kind:'sugarCubes', label:'Sugar Cubes ×1000',qty:1000, price:1250},
];

// ---------- tab & menu wiring ----------
$('tabBuy').onclick  = () => showTop('buy');
$('tabSell').onclick = () => showTop('sell');

$('linkStore').onclick  = (e)=>{e.preventDefault(); openBuy('store'); };
$('linkRescue').onclick = (e)=>{e.preventDefault(); openBuy('rescue'); };
$('linkFeed').onclick   = (e)=>{e.preventDefault(); openBuy('feed');   };
$('linkTreats').onclick = (e)=>{e.preventDefault(); openBuy('treats'); };
$('linkTack').onclick   = (e)=>{e.preventDefault(); openBuy('tack');   };

$('backFromStore').onclick  = (e)=>{e.preventDefault(); openBuy(null); };
$('backFromRescue').onclick = (e)=>{e.preventDefault(); openBuy(null); };
$('backFromFeed').onclick   = (e)=>{e.preventDefault(); openBuy(null); };
$('backFromTreats').onclick = (e)=>{e.preventDefault(); openBuy(null); };
$('backFromTack').onclick   = (e)=>{e.preventDefault(); openBuy(null); };

$('linkSellHorses').onclick    = (e)=>{e.preventDefault(); openSell('horses'); };
$('linkSellTack').onclick      = (e)=>{e.preventDefault(); openSell('soon');   };
$('linkSellFeed').onclick      = (e)=>{e.preventDefault(); openSell('soon');   };
$('linkSellTreats').onclick    = (e)=>{e.preventDefault(); openSell('soon');   };
$('linkSellMaterials').onclick = (e)=>{e.preventDefault(); openSell('soon');   };

$('backFromSellHorses').onclick = (e)=>{e.preventDefault(); openSell(null); };
$('backFromSellSoon').onclick   = (e)=>{e.preventDefault(); openSell(null); };

// top-level tabs
function showTop(which){
  const buy = (which==='buy');
  $('buyMenu').style.display  = buy ? 'block' : 'none';
  $('sellMenu').style.display = buy ? 'none'  : 'block';
  $('tabBuy').classList.toggle('active', buy);
  $('tabSell').classList.toggle('active', !buy);
  ['buyStore','buyRescue','buyFeed','buyTreats','buyTack','sellHorses','sellComingSoon']
    .forEach(id => $(id).style.display='none');
}

function openBuy(view){
  ['buyStore','buyRescue','buyFeed','buyTreats','buyTack'].forEach(id => $(id).style.display='none');
  $('buyMenu').style.display = view ? 'none' : 'block';
  if (!view) return;

  $(`buy${cap(view)}`).style.display='block';

  if (view==='store')    ensureStoreThenRender();
  if (view==='rescue')   loadRescue();
  if (view==='feed')     renderFeed();
  if (view==='treats')   renderTreats();
}

function openSell(view){
  ['sellHorses','sellComingSoon'].forEach(id => $(id).style.display='none');
  $('sellMenu').style.display = view ? 'none' : 'block';
  if (!view) return;

  if (view==='horses'){ $('sellHorses').style.display='block'; renderSell(); }
  else { $('sellComingSoon').style.display='block'; }
}

// ---------- boot ----------
onAuthStateChanged(auth, async user => {
  if (!user) return (window.location.href = 'login.html');
  uid = user.uid;

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) { alert('User data not found.'); return; }
  userData = us.val();

  myHorses = toArray(userData.horses);
  $('coinCounter').textContent = userData.coins ?? 0;

  // default tab
  showTop('buy');
});

// ---------- STORE (rotates every 12 in-game hours) ----------
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
  const grid = $('storeGrid'); grid.innerHTML='';
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
  myHorses.push({ ...h, id: newHorseId() });
  storeHorses.splice(index,1);
  userData.store = storeHorses;

  await update(ref(db, `users/${uid}`), { coins:userData.coins, horses: myHorses, store: storeHorses });
  $('coinCounter').textContent = userData.coins;
  renderStore();
}

// ---------- RESCUE (global) ----------
async function loadRescue(){
  const snap = await get(ref(db, 'rescueHorses'));
  const all  = snap.exists()? snap.val() : {};
  const list = Object.entries(all).map(([key, h])=>({key, ...h}));
  const grid = $('rescueGrid'); grid.innerHTML='';

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

  const lock = await runTransaction(rescueRef, cur => (cur===null ? undefined : cur));
  if (!lock.committed || lock.snapshot.val()===null){
    alert('Sorry, that horse was just adopted.');
    return loadRescue();
  }
  const horse = lock.snapshot.val();

  const txn = await runTransaction(userRef, u=>{
    if (!u) return u;
    const coins = Number(u.coins||0);
    if (coins < price) return;
    const horses = toArray(u.horses);
    horses.push({ ...horse, id: newHorseId() });
    return { ...u, coins: coins - price, horses };
  });
  if (!txn.committed){
    await set(rescueRef, horse);
    return alert('Not enough coins.');
  }
  await set(rescueRef, null);

  const us = await get(ref(db, `users/${uid}`));
  userData = us.val(); myHorses = toArray(userData.horses);
  $('coinCounter').textContent = userData.coins;
  loadRescue();
}

// ---------- SELL HORSES ----------
function renderSell(){
  const grid=$('sellGrid'); grid.innerHTML='';
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
  const h
