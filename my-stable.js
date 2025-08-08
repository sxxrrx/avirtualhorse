import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

let horses = [];
let page = 1;
const pageSize = 10;

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = 'login.html';
  const uid = user.uid;

  // Try main user node first
  let snap = await get(ref(db, `users/${uid}`));
  let data = snap.exists() ? snap.val() : null;

  // Fallback to gameData shape if needed
  if (data && !data.horses && data.gameData) {
    console.warn('No horses at users/{uid}. Using users/{uid}/gameData instead.');
    data = data.gameData;
  }

  console.log('my-stable: loaded user data:', data);

  // Normalize horses to an array
  let rawHorses = data?.horses ?? [];
  if (!Array.isArray(rawHorses)) {
    // convert object -> array
    rawHorses = Object.values(rawHorses);
  }

  // Ensure each horse has an id
  let changed = false;
  horses = rawHorses.map((h, idx) => {
    if (!h.id) {
      h.id = `horse_${Date.now()}_${idx}`;
      changed = true;
    }
    // Safe defaults so rendering never explodes
    h.name = h.name || 'Unnamed Horse';
    h.level = Number(h.level || 1);
    h.gender = h.gender || '—';
    h.breed = h.breed || '—';
    h.age = h.age || { years: 0, months: 0, days: 0 };
    return h;
  });

  // If we generated IDs, write back once so links work
  if (changed) {
    try {
      await set(ref(db, `users/${uid}/horses`), horses);
      console.log('my-stable: wrote back horse IDs so links work.');
    } catch (e) {
      console.error('my-stable: failed to write back horse IDs', e);
    }
  }

  renderPage();

  // Pagination buttons
  document.getElementById('prevPage').addEventListener('click', () => {
    if (page > 1) { page--; renderPage(); }
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    const max = Math.max(1, Math.ceil(horses.length / pageSize));
    if (page < max) { page++; renderPage(); }
  });
});

function renderPage() {
  const list = document.getElementById('stableList');
  list.innerHTML = '';
  const start = (page - 1) * pageSize;
  const pageHorses = horses.slice(start, start + pageSize);

  if (pageHorses.length === 0) {
    list.innerHTML = '<p>You have no horses yet.</p>';
  }

  pageHorses.forEach((h) => {
    const card = document.createElement('div');
    card.className = 'horse-card';
    const ageText = formatAge(h.age);
    card.innerHTML = `
      <p><strong><a href="horse.html?id=${encodeURIComponent(h.id)}">${escapeHtml(h.name)}</a></strong></p>
      <p>Breed: ${escapeHtml(h.breed)}</p>
      <p>Gender: ${escapeHtml(h.gender)}</p>
      <p>Level: ${Number(h.level)}</p>
      <p>Age: ${ageText}</p>
    `;
    list.appendChild(card);
  });

  const max = Math.max(1, Math.ceil(horses.length / pageSize));
  document.getElementById('pageInfo').textContent = `Page ${page} of ${max}`;
}

function formatAge(age) {
  if (!age) return '—';
  const y = age.years ?? 0;
  const m = age.months ?? 0;
  const d = age.days ?? 0;
  if (y === 0 && m === 0) return `${d} day(s)`;
  if (y === 0) return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}
