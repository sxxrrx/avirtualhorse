import { db } from './firebase-init.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const p = new URLSearchParams(location.search);
const uid = p.get('uid');
const id  = p.get('id');

if (!uid || !id) {
  document.querySelector('.main-content').innerHTML = '<p>Missing horse or owner.</p>';
} else {
  loadHorse(uid, id);
}

async function loadHorse(uid, horseId) {
  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) {
    document.querySelector('.main-content').innerHTML = '<p>Owner not found.</p>';
    return;
  }
  const u = us.val();
  const horses = Array.isArray(u.horses) ? u.horses : Object.values(u.horses || {});
  const h = horses.find(x => x.id === horseId);
  if (!h) {
    document.querySelector('.main-content').innerHTML = '<p>Horse not found.</p>';
    return;
  }

  byId('horseName').textContent = h.name || 'Unnamed Horse';
  byId('horseDesc').textContent = h.description || 'No description yet.';
  byId('color').textContent = h.coatColor || '—';
  byId('breed').textContent = h.breed || '—';
  byId('gender').textContent = h.gender || '—';
  byId('age').textContent = formatAge(h.age);
  byId('level').textContent = Number(h.level || 1);
  byId('foals').textContent = Number(h.foals || 0);
  byId('earnings').textContent = Number(h.earnings || 0);
  byId('shows').textContent = Number(h.showsEntered || 0);
}

function byId(id){ return document.getElementById(id); }
function formatAge(age){
  if (!age) return '—';
  const y = age.years ?? 0, m = age.months ?? 0, d = age.days ?? 0;
  if (y===0 && m===0) return `${d} day(s)`;
  if (y===0) return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}
