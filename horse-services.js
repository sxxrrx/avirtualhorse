import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, push, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

let uid = null;
let horse = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = 'login.html';
  uid = user.uid;

  const horseId = new URLSearchParams(location.search).get('id');
  if (!horseId) return (document.querySelector('.main-content').innerHTML = '<p>No horse specified.</p>');

  // load user + horse
  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) return (document.querySelector('.main-content').innerHTML = '<p>No user data.</p>');
  const data = snap.val();
  const horses = Array.isArray(data.horses) ? data.horses : Object.values(data.horses || {});
  horse = horses.find(h => h.id === horseId);
  if (!horse) return (document.querySelector('.main-content').innerHTML = '<p>Horse not found.</p>');

  document.getElementById('horseTitle').textContent = `${horse.name} — ${horse.breed || ''}`;

  // hook buttons
  document.getElementById('reqShots').onclick = () => createRequest('vet_shots');
  document.getElementById('reqCheck').onclick = () => createRequest('vet_check');
  document.getElementById('reqBreedCheck').onclick = () => createRequest('breeding_check');
  document.getElementById('reqGeld').onclick = () => {
    if (horse.gender !== 'Stallion') return alert('Only stallions can be gelded.');
    createRequest('geld');
  };

  await renderRequests();
});

// in-game time helpers
function currentGameHour() {
  const start = new Date(Date.UTC(2025, 0, 1)).getTime();
  const hours = Math.floor((Date.now() - start) / (60 * 1000));
  return hours;
}

async function createRequest(type) {
  const nowH = currentGameHour();
  const reqRef = push(ref(db, 'serviceRequests'));
  await set(reqRef, {
    type,
    horseId: horse.id,
    horseName: horse.name || '',
    ownerUid: uid,
    requestedAtGameHour: nowH,
    dueAtGameHour: nowH + 24,        // auto-completes after 24 in-game hours
    status: 'pending',
    completedAtGameHour: null,
    completedByUid: null
  });
  await renderRequests();
  alert('Request created! A vet assistant can complete it, or it will auto-complete in 24 in-game hours.');
}

async function renderRequests() {
  const list = document.getElementById('horseRequests');
  list.innerHTML = 'Loading…';

  const s = await get(ref(db, 'serviceRequests'));
  const all = s.exists() ? s.val() : {};
  const rows = Object.entries(all)
    .map(([id, r]) => ({ id, ...r }))
    .filter(r => r.horseId === horse.id)
    .sort((a,b) => (b.requestedAtGameHour - a.requestedAtGameHour));

  if (rows.length === 0) {
    list.innerHTML = '<p>No requests yet.</p>';
    return;
  }

  list.innerHTML = rows.map(r => `
    <div class="horse-card" style="text-align:left;">
      <div><strong>Type:</strong> ${r.type}</div>
      <div><strong>Status:</strong> ${r.status}</div>
      <div><strong>Requested at:</strong> ${r.requestedAtGameHour}h</div>
      <div><strong>Due at:</strong> ${r.dueAtGameHour}h</div>
      ${r.completedAtGameHour ? `<div><strong>Completed at:</strong> ${r.completedAtGameHour}h</div>` : ''}
    </div>
  `).join('');
}
