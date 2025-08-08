import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, push, runTransaction } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = (id) => document.getElementById(id);

// state
let uid = null;
let userData = null;
let myHorses = [];
let storeHorses = [];

// ---- tab & menu wiring ----
$('tabBuy').onclick  = () => showTop('buy');
$('tabSell').onclick = () => showTop('sell');

$('linkStore').onclick  = (e)=>{e.preventDefault(); openBuy('store'); };
$('linkRescue').onclick = (e)=>{e.preventDefault(); openBuy('rescue'); };
$('linkFeed').onclick   = (e)=>{e.preventDefault(); openBuy('feed'); };
$('linkTreats').onclick = (e)=>{e.preventDefault(); openBuy('treats'); };
$('linkTack').onclick   = (e)=>{e.preventDefault(); openBuy('tack'); };

$('backFromStore').onclick  = (e)=>{e.preventDefault(); openBuy(null); };
$('backFromRescue').onclick = (e)=>{e.preventDefault(); openBuy(null); };
$('backFromFeed').onclick   = (e)=>{e.preventDefault(); openBuy(null); };
$('backFromTreats').onclick = (e)=>{e.preventDefault(); openBuy(null); };
$('backFromTack').onclick   = (e)=>{e.preventDefault(); openBuy(null); };

$('linkSellHorses').onclick   = (e)=>{e.preventDefault(); openSell('horses'); };
$('linkSellTack').onclick     = (e)=>{e.preventDefault(); openSell('soon'); };
$('linkSellFeed').onclick     = (e)=>{e.preventDefault(); openSell('soon'); };
$('linkSellTreats').onclick   = (e)=>{e.preventDefault(); openSell('soon'); };
$('linkSellMaterials').onclick= (e)=>{e.preventDefault(); openSell('soon'); };

$('backFromSellHorses').onclick = (e)=>{e.preventDefault(); openSell(null); };
$('backFromSellSoon').onclick   = (e)=>{e.preventDefault(); openSell(null); };

// top-level tabs
function showTop(which){
  const buy = (which==='buy');
  $('buyMenu').style.display  = buy ? 'block' : 'none';
  $('sellMenu').style.display = buy ? 'none'  : 'block';
  $('tabBuy').classList.toggle('active', buy);
  $('tabSell').classList.toggle('active', !buy);

  // hide all subviews
  ['buyStore','buyRescue','buyFeed','buyTreats','buyTack','sellHorses','sellComingSoon'].forEach(id => $(id).style.display='none');
}

function openBuy(view){
  // hide all buy subviews
  ['buyStore','buyRescue','buyFeed','buyTreats','buyTack'].forEach(id => $(id).style.display='none');
  $('buyMenu').style.display = view ? 'none' : 'block';
  if (!view) return;

  $(`buy${cap(view)}`).style.display='block';
  if (view==='store') renderStore();
  if (view==='rescue') loadRescue();
}

function openSell(view){
  // hide all sell subviews
  ['sellHorses','sellComingSoon'].forEach(id => $(id).style.display='none');
  $('sellMenu').style.display = view ? 'none' : 'block';
  if (!view) return;

  if (view==='horses') { $('sellHorses').style.display='block'; renderSell(); }
  else { $('sellComingSoon').style.display='block'; }
}

// ---- boot ----
onAuthStateChanged(auth, async user => {
  if (!user) return (window.location.href = 'login.html');
  uid = user.uid;

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) { alert('User data not found.'); return; }
  userData = us.val();

  myHorses = toArray(userData.horses);
  $('coinCounter').textContent = userData.coins ?? 0;

  storeHorses = toArray(userData.store);
  if (storeHorses.length === 0) {
    storeHorses = Array.from({length:4}, genStoreHorse);
    await update(ref(db, `users/${uid}`), { store: storeHorses });
  }

  // default view = Buy menu
  showTop('buy');

  // restock button (in store subview)
  $('btnRestockStore').onclick = async () => {
    storeHorses = Array.from({length:4}, genStoreHorse);
    await update(ref(db, `users/${uid}`), { store: storeHorses });
    renderStore();
  };
});

// ---- store (buy) ----
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

  await update(ref(db, `users/${uid}`), { coins:userData.coins, horses: myHorses, store: storeHorses });
  $('coinCounter').textContent = userData.coins;
  renderStore();
}

// ---- rescue (buy) ----
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

  // Lock the rescue horse
  const lock = await runTransaction(rescueRef, cur => (cur===null ? undefined : cur));
  if (!lock.committed || lock.snapshot.val()===null){
    alert('Sorry, that horse was just adopted.');
    return loadRescue();
  }
  const horse = lock.snapshot.val();

  // Charge & add horse
  const txn = await runTransaction(userRef, u=>{
    if (!u) return u;
    const coins = Number(u.coins||0);
    if (coins < price) return; // abort txn
    const horses = toArray(u.horses);
    horses.push({ ...horse, id: newHorseId() });
    return { ...u, coins: coins - price, horses };
  });
  if (!txn.committed){
    // put back
    await set(rescueRef, horse);
    return alert('Not enough coins.');
  }

  // remove from rescue
  await set(rescueRef, null);

  // refresh local
  const us = await get(ref(db, `users/${uid}`));
  userData = us.val(); myHorses = toArray(userData.horses);
  $('coinCounter').textContent = userData.coins;
  loadRescue();
}

// ---- sell horses ----
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
  const h=myHorses[index]; if (!h) return;
  const rescueRef = push(ref(db, 'rescueHorses'));
  await set(rescueRef, { ...h, price:500 });
  myHorses.splice(index,1);
  await update(ref(db, `users/${uid}`), { horses: myHorses });
  renderSell();
  // refresh rescue view if open
  if ($('buyRescue').style.display==='block') loadRescue();
}

// ---- helpers ----
function toArray(v){ return Array.isArray(v) ? v.filter(Boolean) : Object.values(v||{}); }
function newHorseId(){ return 'horse_' + Date.now() + '_' + Math.floor(Math.random()*1000); }
function formatAge(age){ if(!age) return '—'; const y=age.years??0,m=age.months??0,d=age.days??0; if(y===0&&m===0) return `${d} day(s)`; if(y===0) return `${m} month(s)`; return `${y} year(s) ${m} month(s)`; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function genStoreHorse(){
  const breeds={Thoroughbred:['Black','Bay','Chestnut'],Arabian:['Grey','Bay','Chestnut'],Friesian:['Black']};
  const genders=['Mare','Stallion'];
  const breed=pick(Object.keys(breeds)), coat=pick(breeds[breed]), gender=pick(genders);
  return { id:newHorseId(), name:'Unnamed Horse', breed, coatColor:coat, gender, age:{years:2,months:0}, level:1, exp:0, price:1000 };
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
