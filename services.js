import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

let uid = null;

// --- helpers for owner display ---
function escapeHtml(str){ return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
function shortUid(id){ return id ? id.slice(0,6) + '…' : '(unknown)'; }

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = 'login.html';
  uid = user.uid;

  // Load user job
  const uSnap = await get(ref(db, `users/${uid}`));
  let userData = uSnap.exists() ? uSnap.val() : {};
  const jobEl = document.getElementById('currentJob');
  jobEl.textContent = userData.job || '(none)';

  document.getElementById('btnJobStablehand').onclick = async () => {
    await update(ref(db, `users/${uid}`), { job: 'Stablehand' });
    jobEl.textContent = 'Stablehand';
    document.getElementById('vetQueue').style.display = 'none';
  };
  document.getElementById('btnJobVet').onclick = async () => {
    await update(ref(db, `users/${uid}`), { job: 'Vet Assistant' });
    jobEl.textContent = 'Vet Assistant';
    document.getElementById('vetQueue').style.display = 'block';
    loadQueue();
  };

  if (userData.job === 'Vet Assistant') {
    document.getElementById('vetQueue').style.display = 'block';
    loadQueue();
  }
});

// 1 real minute = 1 in-game hour
function currentGameHour() {
  const start = new Date(Date.UTC(2025, 0, 1)).getTime();
  const hours = Math.floor((Date.now() - start) / (60 * 1000));
  return hours;
}
function currentGameDay() {
  return Math.floor(currentGameHour() / 24);
}

// Pull all requests, auto-complete overdue (>= 24h), and render
async function loadQueue() {
  const list = document.getElementById('requestList');
  list.innerHTML = 'Loading…';

  const s = await get(ref(db, 'serviceRequests'));
  const all = s.exists() ? s.val() : {};
  const requests = Object.entries(all).map(([id, r]) => ({ id, ...r }));

  // auto-complete any overdue requests
  const nowH = currentGameHour();
  const updates = {};
  for (const r of requests) {
    if (r.status === 'pending' && r.dueAtGameHour && nowH >= r.dueAtGameHour) {
      // mark completed + update horse records
      await completeService(r, true);
      updates[r.id] = true;
    }
  }

  // refetch if anything changed
  let toRender = requests;
  if (Object.keys(updates).length) {
    const s2 = await get(ref(db, 'serviceRequests'));
    const all2 = s2.exists() ? s2.val() : {};
    toRender = Object.entries(all2).map(([id, r]) => ({ id, ...r }));
  }

  // --- NEW: fetch display names for owners ---
  const ownerUids = [...new Set(toRender.map(r => r.ownerUid).filter(Boolean))];
  const ownerMap = {};
  await Promise.all(ownerUids.map(async (u) => {
    const us = await get(ref(db, `users/${u}`));
    if (us.exists()) {
      const ud = us.val();
      ownerMap[u] = ud.username || ud.loginName || shortUid(u);
    } else {
      ownerMap[u] = shortUid(u);
    }
  }));

  renderQueue(toRender, ownerMap);
}

function renderQueue(reqs, ownerMap = {}) {
  const list = document.getElementById('requestList');
  const pending = reqs.filter(r => r.status === 'pending');
  if (pending.length === 0) {
    list.innerHTML = '<p>No pending requests.</p>';
    return;
  }
  list.innerHTML = '';
  pending.forEach((r) => {
    const ownerName = ownerMap[r.ownerUid] || shortUid(r.ownerUid);
    const ownerLink = `<a href="ranch-public.html?uid=${encodeURIComponent(r.ownerUid)}">${escapeHtml(ownerName)}</a>`;

    const div = document.createElement('div');
    div.className = 'horse-card';
    div.innerHTML = `
      <p><strong>Type:</strong> ${escapeHtml(r.type)}</p>
      <p><strong>Horse:</strong> ${escapeHtml(r.horseName || r.horseId)}</p>
      <p><strong>Owner:</strong> ${ownerLink}</p>
      <p><strong>Due in:</strong> ${Math.max(0, r.dueAtGameHour - currentGameHour())} in-game hours</p>
      <button>Complete Now</button>
    `;
    div.querySelector('button').onclick = () => completeService(r, false);
    list.appendChild(div);
  });
}

async function completeService(r, auto) {
  // update horse fields based on service type
  const hPath = `users/${r.ownerUid}/horses`;
  const uSnap = await get(ref(db, `users/${r.ownerUid}`));
  if (!uSnap.exists()) return;

  let userData = uSnap.val();
  let horses = Array.isArray(userData.horses) ? userData.horses : Object.values(userData.horses || {});
  const idx = horses.findIndex(h => h.id === r.horseId);
  if (idx === -1) return;

  const h = horses[idx];
  const today = currentGameDay();

  if (r.type === 'vet_shots')      h.lastVetShotsDay = today;
  if (r.type === 'vet_check')      h.lastVetCheckDay = today;
  if (r.type === 'breeding_check') h.lastBreedingCheckDay = today;
  if (r.type === 'geld' && h.gender === 'Stallion') { h.gender = 'Gelding'; }

  // write back horse
  await set(ref(db, `${hPath}/${idx}`), h);

  // close request
  const nowH = currentGameHour();
  await update(ref(db, `serviceRequests/${r.id}`), {
    status: auto ? 'auto-completed' : 'completed',
    completedAtGameHour: nowH,
    completedByUid: auto ? null : uid
  });

  // refresh
  loadQueue();
}
