// magic.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, onValue, push } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);

// ---- in-game clock helpers (1 real min = 1 in-game hour) ----
function currentGameHour() {
  const start = Date.UTC(2025,0,1);
  return Math.floor((Date.now() - start) / (60 * 1000));
}
function yearsToHours(y){ return y * 365 * 24; }

// ---- catalog ----
const CATALOG = [
  {
    key: 'pouch_of_gold',
    name: 'Pouch of Gold',
    pricePasses: 500,
    desc: 'Gives the owner 10,000 coins per real day. Expires after 1 in-game year.',
    type: 'duration', // tracked on player
    durationH: yearsToHours(1),
    data: { dailyCoins: 10000 }
  },
  {
    key: 'magical_show_crop',
    name: 'Magical Show Crop',
    pricePasses: 200,
    desc: 'Enter two shows with one click. Expires after 3 in-game years.',
    type: 'duration',
    durationH: yearsToHours(3),
    data: { doubleEntry: true }
  },
  {
    key: 'chronos_hourglass',
    name: 'Chronos Rider Hourglass',
    pricePasses: 350,
    desc: "Doubles the player's or hired rider’s training EXP. Expires after 4 in-game years.",
    type: 'duration',
    durationH: yearsToHours(4),
    data: { doubleTrainingXP: true }
  },
  {
    key: 'unbreakable_tack',
    name: 'Unbreakable Tack (Full Set)',
    pricePasses: 150,
    desc: 'Permanent full set. Bind to one horse (non-removable). Does not expire.',
    type: 'permanent_one_horse',
    data: { specialty: 'standard', unbreakable: true }
  },
  {
    key: 'ceres_easy_breeding',
    name: 'Ceres’ Easy Breeding Token',
    pricePasses: 100,
    desc: 'Allows breeding regardless of level/happiness/checks. Also bypasses foal limit once. Single use on one horse.',
    type: 'consumable_one_horse',
    data: { bypassBreedingRulesOnce: true }
  },
  {
    key: 'fortuna_filly',
    name: "Fortuna’s Filly Token",
    pricePasses: 25,
    desc: 'Guarantees a filly for next foaling. Single use on one horse.',
    type: 'consumable_one_horse',
    data: { forceGender: 'Filly' }
  },
  {
    key: 'hermes_colt',
    name: "Hermes’ Colt Token",
    pricePasses: 25,
    desc: 'Guarantees a colt for next foaling. Single use on one horse.',
    type: 'consumable_one_horse',
    data: { forceGender: 'Colt' }
  },
  {
    key: 'leucippus_shift',
    name: "Leucippus’ Gender Shift",
    pricePasses: 50,
    desc: 'Shift a foal’s gender (< 3y only). Single use on one horse.',
    type: 'consumable_one_horse',
    data: { allowShiftIfAgeUnderYears: 3 }
  },
  {
    key: 'hebe_horseshoe',
    name: "Hebe’s Horseshoe",
    pricePasses: 75,
    desc: 'Foals may enter shows at 1 year old. Lasts 1 in-game year (bound to a horse).',
    type: 'duration_one_horse',
    durationH: yearsToHours(1),
    data: { earlyShowsAtYears: 1 }
  },
  {
    key: 'dolos_staff',
    name: "Dolos’ Staff",
    pricePasses: 100,
    desc: 'Wider show range (e.g., L10 can enter L4–13). Lasts 3 in-game years (bound to a horse).',
    type: 'duration_one_horse',
    durationH: yearsToHours(3),
    data: { widenShowRange: true }
  }
];

let uid = null;
let user = null;
let passes = 0;
let inventory = {}; // map of id -> item

onAuthStateChanged(auth, async u => {
  if (!u) return location.href = 'login.html';
  uid = u.uid;

  // live passes
  onValue(ref(db, `users/${uid}/passes`), snap => {
    passes = Number(snap.val() || 0);
    updatePassesUI();
  });

  // live inventory
  onValue(ref(db, `users/${uid}/magicInventory`), snap => {
    inventory = snap.exists() ? snap.val() : {};
    renderInventory();
  });

  renderStore();
  // ensure field exists
  const uSnap = await get(ref(db, `users/${uid}`));
  if (!uSnap.exists()) return;
  user = uSnap.val();
  if (user.passes === undefined) {
    await update(ref(db, `users/${uid}`), { passes: 0 });
  }
});

function updatePassesUI(){
  const el = $('passesCount');
  if (el) el.textContent = passes.toLocaleString();
}

// ---------- Store render ----------
function renderStore(){
  const grid = $('storeGrid');
  grid.innerHTML = '';
  CATALOG.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <h3>${item.name}</h3>
      <div class="muted">${item.desc}</div>
      <div class="row">
        <span class="price">💳 ${item.pricePasses} passes</span>
        ${durationPill(item)}
      </div>
      <button>Buy</button>
    `;
    card.querySelector('button').onclick = () => buyItem(item);
    grid.appendChild(card);
  });
}
function durationPill(item){
  if (item.type.startsWith('duration')) {
    const years = (item.durationH / (365*24)).toFixed(0);
    return `<span class="pill">Duration: ${years} in-game year${years==='1'?'':'s'}</span>`;
  }
  if (item.type.startsWith('consumable')) {
    return `<span class="pill">Single use</span>`;
  }
  if (item.type === 'permanent_one_horse') {
    return `<span class="pill">Permanent (binds to one horse)</span>`;
  }
  return '';
}

// ---------- Inventory render ----------
function renderInventory(){
  const grid = $('inventoryGrid');
  grid.innerHTML = '';

  const entries = Object.entries(inventory);
  if (entries.length === 0) {
    grid.innerHTML = '<div class="muted">No magical items yet.</div>';
    return;
  }

  entries
    .sort((a,b) => (b[1].purchasedAt || 0) - (a[1].purchasedAt || 0))
    .forEach(([id, it]) => {
      const cat = CATALOG.find(c => c.key === it.key);
      const name = cat ? cat.name : it.key;
      const status = humanStatus(it);
      const card = document.createElement('div');
      card.className = 'inv-card';
      card.innerHTML = `
        <div><strong>${name}</strong></div>
        <div class="muted">${cat ? cat.desc : ''}</div>
        <div>${status}</div>
        <div class="row">
          <button disabled>Apply (coming soon)</button>
          <button class="muted" disabled>Transfer</button>
        </div>
      `;
      grid.appendChild(card);
    });
}

function humanStatus(it){
  // show bound horse, remaining duration, uses
  const parts = [];
  if (it.boundHorseId) parts.push(`Bound to: ${it.boundHorseName || it.boundHorseId}`);
  if (it.usesRemaining != null) parts.push(`Uses remaining: ${it.usesRemaining}`);
  if (it.expiresAtGameHour != null) {
    const leftH = it.expiresAtGameHour - currentGameHour();
    const leftDays = Math.max(0, Math.floor(leftH/24));
    parts.push(leftH > 0 ? `Expires in ~${leftDays} in-game day(s)` : `Expired`);
  } else {
    parts.push(`No expiry`);
  }
  return parts.join(' • ');
}

// ---------- Purchase ----------
async function buyItem(item){
  if (passes < item.pricePasses) {
    alert('Not enough passes.');
    return;
  }

  // Deduct passes
  await update(ref(db, `users/${uid}`), { passes: passes - item.pricePasses });

  // Create inventory entry
  const invRef = push(ref(db, `users/${uid}/magicInventory`));
  const payload = {
    id: invRef.key,
    key: item.key,
    purchasedAt: Date.now(),
    type: item.type,
    data: item.data || {}
  };

  // duration items
  if (item.type === 'duration' || item.type === 'duration_one_horse') {
    payload.expiresAtGameHour = currentGameHour() + (item.durationH || 0);
    payload.boundHorseId = null; // will bind when applied
  }

  // consumables
  if (item.type === 'consumable_one_horse') {
    payload.usesRemaining = 1;
    payload.boundHorseId = null;
  }

  // permanent_one_horse
  if (item.type === 'permanent_one_horse') {
    payload.usesRemaining = 1;    // single bind action
    payload.boundHorseId = null;
  }

  // Special fields for Pouch of Gold daily payout
  if (item.key === 'pouch_of_gold') {
    payload.lastClaimRealMs = 0; // will credit daily; we’ll implement claim/auto-credit later
  }

  await set(invRef, payload);
  alert(`Purchased: ${item.name}`);
}
