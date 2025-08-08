// horse.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

let uid = null;
let horseId = null;
let horse = null;

// For saving: handle both array and object storage under users/{uid}/horses
let horsesContainer = null;     // the original value at users/{uid}/horses (array OR object)
let horsesIsArray = true;       // shape flag
let horseIndexOrKey = null;     // array index or object key for this horse

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = 'login.html');
  uid = user.uid;

  const params = new URLSearchParams(window.location.search);
  horseId = params.get('id');
  if (!horseId) {
    document.querySelector('.main-content').innerHTML = '<p>Horse not specified.</p>';
    return;
  }

  // Load user + horses
  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) {
    document.querySelector('.main-content').innerHTML = '<p>No user data found.</p>';
    return;
  }
  const data = snap.val();

  horsesContainer = data.horses || [];
  horsesIsArray = Array.isArray(horsesContainer);

  // Find the horse + remember its index/key for saving
  if (horsesIsArray) {
    horseIndexOrKey = (horsesContainer || []).findIndex(h => h && h.id === horseId);
    if (horseIndexOrKey !== -1) horse = horsesContainer[horseIndexOrKey];
  } else {
    const entries = Object.entries(horsesContainer || {});
    const found = entries.find(([, h]) => h && h.id === horseId);
    if (found) {
      horseIndexOrKey = found[0]; // the object key
      horse = found[1];
    }
  }

  if (!horse) {
    document.querySelector('.main-content').innerHTML = '<p>Horse not found.</p>';
    return;
  }

  // Safety: generate missing id and write back once so links always work
  if (!horse.id) {
    horse.id = `horse_${Date.now()}`;
    await saveHorseInternal(horse);
  }

  // Wire status links -> horse-services.html now that we have horse.id
  setServiceLinks(horse.id);

  ensureHorseDefaults();
  renderHorse();

  // Button hooks
  byId('btnRename')?.addEventListener('click', renameHorse);
  byId('btnDescription')?.addEventListener('click', changeDescription);
  byId('btnTreatCarrot')?.addEventListener('click', () => giveTreat(2));
  byId('btnTreatApple')?.addEventListener('click', () => giveTreat(5));
  byId('btnTreatSugar')?.addEventListener('click', () => giveTreat(10));
  byId('btnShowResults')?.addEventListener('click', toggleResults);
});

// -------------------- helpers: DOM + defaults --------------------
function byId(id) { return document.getElementById(id); }

function setServiceLinks(id) {
  const linkTarget = `horse-services.html?id=${encodeURIComponent(id)}`;
  ['fedStatusLink','vetShotsStatusLink','vetChecksStatusLink','breedCheckStatusLink']
    .forEach(elId => { const a = byId(elId); if (a) a.href = linkTarget; });
}

function ensureHorseDefaults() {
  horse.name = horse.name || 'Unnamed Horse';
  horse.description = horse.description || '';
  horse.happiness = typeof horse.happiness === 'number' ? horse.happiness : 0; // 0-100

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
  horse.lastFedAt = horse.lastFedAt || 0;           // real-world ms
  horse.lastVetShotsDay = horse.lastVetShotsDay || 0;     // in-game day counters
  horse.lastVetCheckDay = horse.lastVetCheckDay || 0;
  horse.lastBreedingCheckDay = horse.lastBreedingCheckDay || 0;
}

// -------------------- render --------------------
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

  // XP bar
  const xpPct = Math.max(0, Math.min(100, (horse.exp / (horse.level * 100)) * 100));
  byId('xpBar').style.width = xpPct + '%';

  // Happiness bar
  byId('happinessPct').textContent = Math.round(horse.happiness) + '%';
  byId('happinessBar').style.width = Math.max(0, Math.min(100, horse.happiness)) + '%';

  // Health statuses
  byId('fedStatus').textContent = isFedProperly(horse.lastFedAt) ? '✅' : '❌';
  const today = currentGameDay();
  byId('vetShotsStatus').textContent   = isVetShotsCurrent(today, horse) ? '✅' : '❌';
  byId('vetChecksStatus').textContent  = isVetCheckCurrent(today, horse) ? '✅' : '❌';
  byId('breedCheckStatus').textContent = isBreedingCheckCurrent(today, horse) ? '✅' : '❌';

  // Results area
  const res = byId('showResults');
  if (!horse.showResults.length) {
    res.innerHTML = '<p>No show results yet.</p>';
  } else {
    res.innerHTML = '<h3>Show Results</h3>' + horse.showResults.map(r => `
      <div class="horse-card" style="text-align:left;">
        <div><strong>${escapeHtml(r.event || 'Event')}</strong></div>
        <div>Placed: ${escapeHtml(r.placed || '—')}</div>
        <div>Earnings: ${Number(r.earnings || 0)}</div>
        <div>Date: ${escapeHtml(r.date || '')}</div>
      </div>
    `).join('');
  }
}

// -------------------- actions --------------------
function renameHorse() {
  const newName = prompt('Enter a new name for your horse:', horse.name || '');
  if (!newName) return;
  horse.name = newName.trim();
  saveHorse();
}

function changeDescription() {
  const desc = prompt('Write a short description for your horse:', horse.description || '');
  if (desc === null) return; // cancel
  horse.description = desc.trim();
  saveHorse();
}

function giveTreat(percent) {
  horse.happiness = Math.max(0, Math.min(100, (horse.happiness || 0) + percent));
  horse.lastFedAt = Date.now();
  saveHorse();
}

function toggleResults() {
  const el = byId('showResults');
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}

// -------------------- persistence --------------------
async function saveHorse() {
  await saveHorseInternal(horse);
  renderHorse();
}

async function saveHorseInternal(h) {
  const base = `users/${uid}/horses`;
  if (horsesIsArray) {
    const idx = (horsesContainer || []).findIndex(x => x && x.id === h.id);
    const path = idx === -1 ? `${base}/${(horsesContainer || []).length}` : `${base}/${idx}`;
    await set(ref(db, path), h);
    if (idx === -1) horsesContainer.push(h);
    else horsesContainer[idx] = h;
  } else {
    // object mode
    let key = null;
    for (const [k, v] of Object.entries(horsesContainer || {})) {
      if (v && v.id === h.id) { key = k; break; }
    }
    if (!key) {
      key = `k_${Date.now()}`;
    }
    await set(ref(db, `${base}/${key}`), h);
    horsesContainer[key] = h;
  }
}

// -------------------- utilities --------------------
function formatAge(age) {
  if (!age) return '—';
  const y = age.years ?? 0, m = age.months ?? 0, d = age.days ?? 0;
  if (y === 0 && m === 0) return `${d} day(s)`;
  if (y === 0) return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

// Health helpers
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
