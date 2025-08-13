// magic.js
import { guardMagicPage } from './feature-guards.js';

// after you load user (uid/me) and before rendering store/inventory:
guardMagicPage(user);   // 'user' is your loaded user object
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, onValue, push } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour, yearsToHours } from './time.js'; // ✅ centralized time

const $ = id => document.getElementById(id);

// ------- Conversion config -------
const COINS_PER_100_PASSES = 8000;
const DAILY_CONVERT_COIN_CAP = 40000;

// Date helpers (UTC day key)
function yyyymmddUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ---- catalog ----
const CATALOG = [
  { key: 'pouch_of_gold', name: 'Pouch of Gold', pricePasses: 500,
    desc: 'Gives the owner 10,000 coins per real day. Expires after 1 in-game year.',
    type: 'duration', durationH: yearsToHours(1), data: { dailyCoins: 10000 } },
  { key: 'magical_show_crop', name: 'Magical Show Crop', pricePasses: 200,
    desc: 'Enter two shows with one click. Expires after 3 in-game years.',
    type: 'duration', durationH: yearsToHours(3), data: { doubleEntry: true } },
  { key: 'chronos_hourglass', name: "Chronos Rider Hourglass", pricePasses: 350,
    desc: "Doubles the player's or hired rider’s training EXP. Expires after 4 in-game years.",
    type: 'duration', durationH: yearsToHours(4), data: { doubleTrainingXP: true } },
  { key: 'unbreakable_tack', name: 'Unbreakable Tack (Full Set)', pricePasses: 150,
    desc: 'Permanent full set. Bind to one horse (non-removable). Does not expire.',
    type: 'permanent_one_horse', data: { specialty: 'standard', unbreakable: true } },
  { key: 'ceres_easy_breeding', name: 'Ceres’ Easy Breeding Token', pricePasses: 100,
    desc: 'Allows breeding regardless of level/happiness/checks. Also bypasses foal limit once. Single use on one horse.',
    type: 'consumable_one_horse', data: { bypassBreedingRulesOnce: true } },
  { key: 'fortuna_filly', name: "Fortuna’s Filly Token", pricePasses: 25,
    desc: 'Guarantees a filly for next foaling. Single use on one horse.',
    type: 'consumable_one_horse', data: { forceGender: 'Filly' } },
  { key: 'hermes_colt', name: "Hermes’ Colt Token", pricePasses: 25,
    desc: 'Guarantees a colt for next foaling. Single use on one horse.',
    type: 'consumable_one_horse', data: { forceGender: 'Colt' } },
  { key: 'leucippus_shift', name: "Leucippus’ Gender Shift", pricePasses: 50,
    desc: 'Shift a foal’s gender (< 3y only). Single use on one horse.',
    type: 'consumable_one_horse', data: { allowShiftIfAgeUnderYears: 3 } },
  { key: 'hebe_horseshoe', name: "Hebe’s Horseshoe", pricePasses: 75,
    desc: 'Foals may enter shows at 1 year old. Lasts 1 in-game year (bound to a horse).',
    type: 'duration_one_horse', durationH: yearsToHours(1), data: { earlyShowsAtYears: 1 } },
  { key: 'dolos_staff', name: "Dolos’ Staff", pricePasses: 100,
    desc: 'Wider show range (e.g., L10 can enter L4–13). Lasts 3 in-game years (bound to a horse).',
    type: 'duration_one_horse', durationH: yearsToHours(3), data: { widenShowRange: true } }
];

let uid = null;
let passes = 0;
let inventory = {};

onAuthStateChanged(auth, async u => {
  if (!u) return location.href = 'login.html';
  uid = u.uid;

  const uSnap = await get(ref(db, `users/${uid}`));
  if (!uSnap.exists()) return;
  const user = uSnap.val();
  if (user.passes === undefined) {
    await update(ref(db, `users/${uid}`), { passes: 0 });
  }

  onValue(ref(db, `users/${uid}/passes`), snap => {
    passes = Number(snap.val() || 0);
    updatePassesUI();
  });

  onValue(ref(db, `users/${uid}/magicInventory`), snap => {
    inventory = snap.exists() ? snap.val() : {};
    renderInventory();
  });

  renderStore();
  wireConverter();
  refreshConvertLimit();
});

function updatePassesUI(){
  const el = $('passesCount');
  if (el) el.textContent = passes.toLocaleString();
}

// ---------- Store render ----------
function renderStore(){
  const grid = $('storeGrid');
  if (!grid) return;
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
  if (item.type.startsWith('consumable')) return `<span class="pill">Single use</span>`;
  if (item.type === 'permanent_one_horse') return `<span class="pill">Permanent (binds to one horse)</span>`;
  return '';
}

// ---------- Inventory render ----------
function renderInventory(){
  const grid = $('inventoryGrid');
  if (!grid) return;

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
  if (passes < item.pricePasses) { alert('Not enough passes.'); return; }

  await update(ref(db, `users/${uid}`), { passes: passes - item.pricePasses });

  const invRef = push(ref(db, `users/${uid}/magicInventory`));
  const payload = {
    id: invRef.key,
    key: item.key,
    purchasedAt: Date.now(),
    type: item.type,
    data: item.data || {}
  };

  if (item.type === 'duration' || item.type === 'duration_one_horse') {
    payload.expiresAtGameHour = currentGameHour() + (item.durationH || 0);
    payload.boundHorseId = null;
  }
  if (item.type === 'consumable_one_horse') {
    payload.usesRemaining = 1;
    payload.boundHorseId = null;
  }
  if (item.type === 'permanent_one_horse') {
    payload.usesRemaining = 1;
    payload.boundHorseId = null;
  }
  if (item.key === 'pouch_of_gold') {
    payload.lastClaimRealMs = 0;
  }

  await set(invRef, payload);
  alert(`Purchased: ${item.name}`);
}

// ---------- Coins → Passes converter ----------
const COINS_PER_100_PASSES = 8000;
const DAILY_CONVERT_COIN_CAP = 40000;

function wireConverter(){
  const btn = $('btnConvert');
  if (!btn) return;
  btn.onclick = convertCoinsToPasses;
}

async function refreshConvertLimit(){
  const el = $('convertLimit');
  if (!el) return;
  const dayKey = yyyymmddUTC();
  const s = await get(ref(db, `users/${uid}/conversionStats/${dayKey}/coinsSpent`));
  const spent = Number(s.val() || 0);
  const left = Math.max(0, DAILY_CONVERT_COIN_CAP - spent);
  el.textContent = `Daily conversion used: ${spent.toLocaleString()} / ${DAILY_CONVERT_COIN_CAP.toLocaleString()} coins. Remaining: ${left.toLocaleString()}.`;
}

async function convertCoinsToPasses(){
  const input = $('coinsToConvert');
  const msgEl = $('convertMsg');
  if (!input || !msgEl) return;

  msgEl.textContent = '';
  let coins = Math.floor(Number(input.value || 0));
  if (isNaN(coins) || coins <= 0) { msgEl.textContent = 'Enter a positive number of coins.'; return; }
  if (coins % COINS_PER_100_PASSES !== 0) {
    msgEl.textContent = `Amount must be a multiple of ${COINS_PER_100_PASSES.toLocaleString()} coins.`; return;
  }

  const uSnap = await get(ref(db, `users/${uid}`));
  if (!uSnap.exists()) { msgEl.textContent = 'User not found.'; return; }
  const u = uSnap.val();
  const myCoins = Number(u.coins || 0);
  if (myCoins < coins) { msgEl.textContent = 'Not enough coins.'; return; }

  const dayKey = yyyymmddUTC();
  const spentSnap = await get(ref(db, `users/${uid}/conversionStats/${dayKey}/coinsSpent`));
  const already = Number(spentSnap.val() || 0);
  const remaining = Math.max(0, DAILY_CONVERT_COIN_CAP - already);
  if (coins > remaining) {
    msgEl.textContent = `Over daily limit. You can convert at most ${remaining.toLocaleString()} more coins today.`; return;
  }

  const passesToGive = (coins / COINS_PER_100_PASSES) * 100;

  const newCoins = myCoins - coins;
  const newPasses = Number(u.passes || 0) + passesToGive;
  await update(ref(db, `users/${uid}`), { coins: newCoins, passes: newPasses });
  await update(ref(db, `users/${uid}/conversionStats/${dayKey}`), { coinsSpent: already + coins });

  msgEl.textContent = `Converted ${coins.toLocaleString()} coins → ${passesToGive.toLocaleString()} passes.`;
  const pc = $('passesCount'); if (pc) pc.textContent = newPasses.toLocaleString();
  const cc = $('coinCounter'); if (cc) cc.textContent = `Coins: ${newCoins.toLocaleString()}`;

  input.value = '';
  refreshConvertLimit();
}
