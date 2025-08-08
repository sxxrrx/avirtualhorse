import { db } from './firebase-init.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const params = new URLSearchParams(location.search);
const uid = params.get('uid');
const horseId = params.get('id');

if (!uid || !horseId) {
  setMain('<p>Missing horse or owner.</p>');
} else {
  // wire owner links immediately
  const ranchLink = document.getElementById('ownerRanchLink');
  const stableLink = document.getElementById('ownerStableLink');
  if (ranchLink) ranchLink.href = `ranch-public.html?uid=${encodeURIComponent(uid)}`;
  if (stableLink) stableLink.href = `stable-public.html?uid=${encodeURIComponent(uid)}`;

  loadHorse(uid, horseId);
}

async function loadHorse(ownerUid, id) {
  const us = await get(ref(db, `users/${ownerUid}`));
  if (!us.exists()) return setMain('<p>Owner not found.</p>');

  const u = us.val();
  const horses = Array.isArray(u.horses) ? u.horses : Object.values(u.horses || {});
  const h = horses.find(x => x && x.id === id);
  if (!h) return setMain('<p>Horse not found.</p>');

  byId('horseName').textContent = h.name || 'Unnamed Horse';
  byId('horseDesc').textContent = h.description || 'No description yet.';
  byId('color').textContent     = h.coatColor || '—';
  byId('breed').textContent     = h.breed || '—';
  byId('gender').textContent    = h.gender || '—';
  byId('age').textContent       = formatAge(h.age);
  byId('level').textContent     = Number(h.level || 1);
  byId('foals').textContent     = Number(h.foals || 0);
  byId('earnings').textContent  = Number(h.earnings || 0);
  byId('shows').textContent     = Number(h.showsEntered || 0);

  // If you later store per-horse images, show it:
  if (h.image) {
    const img = byId('horseImage');
    if (img) img.src = h.image;
  }
}

// helpers
function byId(id){ return document.getElementById(id); }
function setMain(html){ document.querySelector('.main-content').innerHTML = html; }
function formatAge(age){
  if (!age) return '—';
  const y = age.years ?? 0, m = age.months ?? 0, d = age.days ?? 0;
  if (y===0 && m===0) return `${d} day(s)`;
  if (y===0)          return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}
