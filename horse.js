// horse.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

let uid = null;
let horseId = null;
let horse = null;

// Support both array/object storage for users/{uid}/horses
let horsesContainer = null;
let horsesIsArray = true;

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = 'login.html');
  uid = user.uid;

  const params = new URLSearchParams(location.search);
  horseId = params.get('id');
  if (!horseId) {
    document.querySelector('.main-content').innerHTML = '<p>Horse not specified.</p>';
    return;
  }

  // Load full user data
  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) {
    document.querySelector('.main-content').innerHTML = '<p>No user data found.</p>';
    return;
  }
  const data = snap.val();

  horsesContainer = data.horses || [];
  horsesIsArray = Array.isArray(horsesContainer);

  // Find horse
  if (horsesIsArray) {
    horse = (horsesContainer || []).find(h => h && h.id === horseId) || null;
  } else {
    for (const k in (horsesContainer || {})) {
      if (horsesContainer[k] && horsesContainer[k].id === horseId) {
        horse = horsesContainer[k];
        break;
      }
    }
  }

  if (!horse) {
    document.querySelector('.main-content').innerHTML = '<p>Horse not found.</p>';
    return;
  }

  // Ensure an ID exists (older data safety)
  if (!horse.id) {
    horse.id = `horse_${Date.now()}`;
    await saveHorseInternal(horse);
  }

  // Make sure the four status rows exist in the DOM, right under happiness bar
  ensureStatusRows();

  // Wire the status rows to horse-services.html
  setServiceLinks(horse.id);

  // Defaults + render
  ensureHorseDefaults();
  renderHorse();

  // UI buttons
  byId('btnRename')?.addEventListener('click', renameHorse);
  byId('btnDescription')?.addEventListener('click', changeDescription);
  byId('btnTreatCarrot')?.addEventListener('click', () => giveTreat('carrot', 2));
  byId('btnTreatApple')?.addEventListener('click', () => giveTreat('apple', 5));
  byId('btnTreatSugar')?.addEventListener('click', () => giveTreat('sugar', 10));
  byId('btnShowResults')?.addEventListener('click', toggleResults);
});

// ---------- DOM helpers ----------
function byId(id) { return document.getElementById(id); }

function ensureStatusRows() {
  // Insert after the happiness bar if missing
  const container = document.querySelector('.right-panel');
  if (!container) return;

  const rows = [
    { id: 'fedStatus', label: 'Fed Properly (4 real days):', linkId: 'fedStatusLink' },
    { id: 'vetShotsStatus', label: "Vet shots (every 3 in-game years, start 8mo):", linkId: 'vetShotsStatusLink' },
    { id: 'vetChecksStatus', label: "Vet checks (yearly, start 6mo):", linkId: 'vetChecksStatusLink' },
    { id: 'breedCheckStatus', label: "Breeding check (every 3 in-game years, start 2y5m):", linkId: 'breedCheckStatusLink' },
  ];

  // If fedStatus already exists, we assume the block is present
  if (byId('fedStatus')) return;

  // Find the happiness bar to insert after
  const anchor = byId('happinessBar')?.parentElement || container;

  rows.forEach(({ id, label, linkId }) => {
    const p = document.createElement('p');
    p.innerHTML = `<strong>${label}</strong> <a id="${linkId}"><span id="${id}">❌</span></a>`;
    anchor.insertAdjacentElement('afterend', p);
  });
}

function setServiceLinks(id) {
  const linkTarget = `horse-services.html?id=${encodeURIComponent(id)}`;
  ['fedStatusLink','vetShotsStatusLink','vetChecksStatusLink','breedCheckStatusLink']
    .forEach(elId => { const a = byId(elId); if (a) a.href = linkTarget; });
}

// ---------- Defaults ----------
function ensureHorseDefaults() {
  horse.name = horse.name || 'Unnamed Horse';
  horse.description = horse.description || '';
  horse.happiness = typeof horse.happiness === 'number' ? horse.happiness : 0;

  horse.level = Number(horse.level || 1);
  horse.exp = Number(horse.exp || 0);
  horse.foals = Number(horse.foals || 0);
  horse.earnings = Number(horse.earnings || 0);
  horse.showsEntered = Number(horse.showsEntered || 0);
  horse.showResults = Array.isArray(horse.showResults) ? horse.showResults : [];

  horse.coatColor = horse.coatColor || '—';
  horse.breed = horse.breed || '—';
  horse.gender = horse.gender || '—';
  horse.age = horse.age || { years: 0, months: 0, days: 0 };

  // Health timestamps
  horse.lastFedAt = horse.lastFedAt || 0; // real ms
  horse.lastVetShotsDay = horse.lastVetShotsDay || 0;
  horse.lastVetCheckDay = horse.lastVetCheckDay || 0;
  horse.lastBreedingCheckDay = horse.lastBreedingCheckDay || 0;

  // Treat limits per 24 real hours
  // { windowStartMs, carrot, apple, sugar }
  if (!horse.treats || typeof horse.treats !== 'object') {
    horse.treats = { windowStartMs: 0, carrot: 0, apple: 0, sugar: 0 };
  }
}

// ---------- Render ----------
function renderHorse() {
  byId('horseNameHeading').textContent = horse.name;
  byId('horseDescription').textContent = horse.description || 'No description yet.';
  byId('horseColor').textContent = horse.coatColor;
  byId('horseBreed').textContent = horse.breed;
  byId('horseGender').textContent = horse.gender;
  byId('horseAge').textContent = formatAge(horse.age);
  byId('horseLevel').textContent = horse.level;
  byId('horseFoals').textContent = horse.foals;
  byId('horseEarnings').textContent = horse.earnings;
  byId('horseShows').textContent = horse.showsEntered;

  // XP
  const xpPct = Math.max(0, Math.min(100, (horse.exp / (horse.level * 100)) * 100));
  byId('xpBar').style.width = xpPct + '%';

  // Happiness
  byId('happinessPct').textContent = Math.round(horse.happiness) + '%';
  byId('happinessBar').style.width = Math.max(0, Math.min(100, horse.happiness)) + '%';

  // Status checks
  const today = currentGameDay();
  setStatusIcon('fedStatus',       isFedProperly(horse.lastFedAt));
  setStatusIcon('vetShotsStatus',  isVetShotsCurrent(today, horse));
  setStatusIcon('vetChecksStatus', isVetCheckCurrent(today, horse));
  setStatusIcon('breedCheckStatus',isBreedingCheckCurrent(today, horse));
}

function setStatusIcon(id, ok) {
  const el = byId(id);
  if (el) el.textContent = ok ? '✅' : '❌';
}

// ---------- Actions ----------
function renameHorse() {
  const newName = prompt('Enter a new name for your horse:', horse.name || '');
  if (!newName) return;
  horse.name = newName.trim();
  saveHorse();
}

function changeDescription() {
  const desc = prompt('Write a short description for your horse:', horse.description || '');
  if (desc === null) return;
  horse.description = desc.trim();
  saveHorse();
}

function giveTreat(kind, percent) {
  // Reset treat window if > 24h old
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (!horse.treats.windowStartMs || now - horse.treats.windowStartMs >= dayMs) {
    horse.treats.windowStartMs = now;
    horse.treats.carrot = 0;
    horse.treats.apple = 0;
    horse.treats.sugar = 0;
  }

  const limits = { carrot: 5, apple: 2, sugar: 1 };
  const used = horse.treats[kind] || 0;
  const limit = limits[kind];

  if (used >= limit) {
    alert(`Daily ${kind} limit reached (${limit} per 24 hours).`);
    return;
  }

  // Apply treat
  horse.treats[kind] = used + 1;
  horse.happiness = Math.max(0, Math.min(100, (horse.happiness || 0) + percent));
  horse.lastFedAt = now; // counts as feeding
  saveHorse();
}

function toggleResults() {
  const el = byId('showResults');
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}

// ---------- Save ----------
async function saveHorse() {
  await saveHorseInternal(horse);
  renderHorse();
}

// Write back horse regardless of array/object storage
async function saveHorseInternal(h) {
  const base = `users/${uid}/horses`;

  if (Array.isArray(horsesContainer)) {
    const idx = (horsesContainer || []).findIndex(x => x && x.id === h.id);
    const path = idx === -1 ? `${base}/${(horsesContainer || []).length}` : `${base}/${idx}`;
    await set(ref(db, path), h);
    if (idx === -1) horsesContainer.push(h);
    else horsesContainer[idx] = h;
  } else {
    let key = null;
    for (const [k, v] of Object.entries(horsesContainer || {})) {
      if (v && v.id === h.id) { key = k; break; }
    }
    if (!key) key = `k_${Date.now()}`;
    await set(ref(db, `${base}/${key}`), h);
    horsesContainer[key] = h;
  }
}

// ---------- Utils ----------
function formatAge(age) {
  if (!age) return '—';
  const y = age.years ?? 0, m = age.months ?? 0, d = age.days ?? 0;
  if (y === 0 && m === 0) return `${d} day(s)`;
  if (y === 0) return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}

function isFedProperly(lastFedAt) {
  if (!lastFedAt) return false;
  const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
  return (Date.now() - lastFedAt) <= fourDaysMs;
}

// In-game clock: 1 real minute = 1 in-game hour
function currentGameDay() {
  const start = new Date(Date.UTC(2025, 0, 1)).getTime();
  const now = Date.now();
  const hours = Math.floor((now - start) / (60 * 1000));
  return Math.floor(hours / 24);
}

function isVetShotsCurrent(todayDay, h) {
  const ageDays = ageToDays(h.age);
  if (ageDays < monthsToDays(8)) return true; // not required yet
  const last = h.lastVetShotsDay || 0;
  return (todayDay - last) < yearsToDays(3);
}

function isVetCheckCurrent(todayDay, h) {
  const ageDays = ageToDays(h.age);
  if (ageDays < monthsToDays(6)) return true; // not required yet
  const last = h.lastVetCheckDay || 0;
  return (todayDay - last) < yearsToDays(1);
}

function isBreedingCheckCurrent(todayDay, h) {
  const ageDays = ageToDays(h.age);
  if (ageDays < yearsToDays(2) + monthsToDays(5)) return true; // not required yet
  const last = h.lastBreedingCheckDay || 0;
  return (todayDay - last) < yearsToDays(3);
}

function ageToDays(age) {
  if (!age) return 0;
  const y = age.years ?? 0, m = age.months ?? 0, d = age.days ?? 0;
  return y * 365 + m * 30 + d;
}
function yearsToDays(y) { return y * 365; }
function monthsToDays(m) { return m * 30; }

