import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

let uid = null;
let horse = null;
let horses = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = 'login.html';
  uid = user.uid;

  const params = new URLSearchParams(window.location.search);
  const horseId = params.get('id');
  if (!horseId) {
    document.querySelector('.main-content').innerHTML = '<p>Horse not specified.</p>';
    return;
  }

  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) {
    document.querySelector('.main-content').innerHTML = '<p>No user data found.</p>';
    return;
  }
  const data = snap.val();
  horses = Array.isArray(data.horses) ? data.horses : [];
  horse = horses.find(h => h.id === horseId);
  if (!horse) {
    document.querySelector('.main-content').innerHTML = '<p>Horse not found.</p>';
    return;
  }

  ensureHorseDefaults();
  renderHorse();

  // Button hooks
  document.getElementById('btnRename').addEventListener('click', renameHorse);
  document.getElementById('btnDescription').addEventListener('click', changeDescription);
  document.getElementById('btnTreatCarrot').addEventListener('click', () => giveTreat(2));
  document.getElementById('btnTreatApple').addEventListener('click', () => giveTreat(5));
  document.getElementById('btnTreatSugar').addEventListener('click', () => giveTreat(10));
  document.getElementById('btnShowResults').addEventListener('click', toggleResults);
});

function ensureHorseDefaults() {
  horse.description = horse.description || '';
  horse.happiness = typeof horse.happiness === 'number' ? horse.happiness : 0; // 0-100
  horse.level = Number(horse.level || 1);
  horse.exp = Number(horse.exp || 0);
  horse.foals = Number(horse.foals || 0);
  horse.earnings = Number(horse.earnings || 0);
  horse.showsEntered = Number(horse.showsEntered || 0);
  horse.showResults = Array.isArray(horse.showResults) ? horse.showResults : [];
  // Health timestamps
  // real-world feed timestamp (ms since epoch)
  horse.lastFedAt = horse.lastFedAt || 0;
  // in-game days counters (integers)
  horse.lastVetShotsDay = horse.lastVetShotsDay || 0;
  horse.lastVetCheckDay = horse.lastVetCheckDay || 0;
  horse.lastBreedingCheckDay = horse.lastBreedingCheckDay || 0;
}

function renderHorse() {
  document.getElementById('horseNameHeading').textContent = horse.name || 'Unnamed Horse';
  document.getElementById('horseDescription').textContent = horse.description || 'No description yet.';
  document.getElementById('horseColor').textContent = horse.coatColor || '—';
  document.getElementById('horseBreed').textContent = horse.breed || '—';
  document.getElementById('horseGender').textContent = horse.gender || '—';
  document.getElementById('horseAge').textContent = formatAge(horse.age);
  document.getElementById('horseLevel').textContent = horse.level;
  document.getElementById('horseFoals').textContent = horse.foals;
  document.getElementById('horseEarnings').textContent = horse.earnings;
  document.getElementById('horseShows').textContent = horse.showsEntered;

  // XP bar
  const xpPct = Math.max(0, Math.min(100, (horse.exp / (horse.level * 100)) * 100));
  document.getElementById('xpBar').style.width = xpPct + '%';

  // Happiness bar
  document.getElementById('happinessPct').textContent = Math.round(horse.happiness) + '%';
  document.getElementById('happinessBar').style.width = Math.max(0, Math.min(100, horse.happiness)) + '%';

  // Health statuses
  document.getElementById('fedStatus').textContent = isFedProperly(horse.lastFedAt) ? '✅' : '❌';
  const todayDay = currentGameDay();
  document.getElementById('vetShotsStatus').textContent = isVetShotsCurrent(todayDay, horse) ? '✅' : '❌';
  document.getElementById('vetChecksStatus').textContent = isVetCheckCurrent(todayDay, horse) ? '✅' : '❌';
  document.getElementById('breedCheckStatus').textContent = isBreedingCheckCurrent(todayDay, horse) ? '✅' : '❌';

  // Results area
  const res = document.getElementById('showResults');
  if (horse.showResults.length === 0) {
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

function renameHorse() {
  const newName = prompt('Enter a new name for your horse:', horse.name || '');
  if (!newName) return;
  horse.name = newName.trim();
  saveHorse('name');
}

function changeDescription() {
  const desc = prompt('Write a short description for your horse:', horse.description || '');
  if (desc === null) return; // cancel
  horse.description = desc.trim();
  saveHorse('description');
}

function giveTreat(percent) {
  horse.happiness = Math.max(0, Math.min(100, (horse.happiness || 0) + percent));
  horse.lastFedAt = Date.now();
  saveHorse('happiness');
}

function toggleResults() {
  const el = document.getElementById('showResults');
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}

async function saveHorse(reason) {
  const idx = horses.findIndex(h => h.id === horse.id);
  if (idx === -1) return;
  horses[idx] = horse;
  await set(ref(db, `users/${uid}/horses/${idx}`), horse);
  renderHorse();
}

function formatAge(age) {
  if (!age) return '—';
  const y = age.years ?? 0, m = age.months ?? 0, d = age.days ?? 0;
  if (y === 0 && m === 0) return `${d} day(s)`;
  if (y === 0) return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>\"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

// Health helpers -------------------------------------------------
function isFedProperly(lastFedAt) {
  if (!lastFedAt) return false;
  const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
  return (Date.now() - lastFedAt) <= fourDaysMs;
}

// In-game clock: 1 real minute = 1 in-game hour (like your market.js)
function currentGameDay() {
  const start = new Date(Date.UTC(2025, 0, 1)).getTime();
  const now = Date.now();
  const hours = Math.floor((now - start) / (60 * 1000));
  const days = Math.floor(hours / 24);
  return days; // integer day counter
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
