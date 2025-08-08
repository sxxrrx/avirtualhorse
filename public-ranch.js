import { db } from './firebase-init.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const params = new URLSearchParams(location.search);
const uid = params.get('uid');

if (!uid) {
  document.querySelector('.main-content').innerHTML = '<p>No user specified.</p>';
} else {
  loadPublicRanch(uid);
}

async function loadPublicRanch(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) {
    document.querySelector('.main-content').innerHTML = '<p>Ranch not found.</p>';
    return;
  }
  const u = snap.val();

  document.getElementById('ownerName').textContent = (u.username || u.loginName || 'Ranch') + " — Ranch";
  document.getElementById('joinDate').textContent = u.joinDate || '—';
  document.getElementById('level').textContent = u.level ?? '—';
  document.getElementById('exp').textContent = u.exp ?? 0;

  const horses = Array.isArray(u.horses) ? u.horses : Object.values(u.horses || {});
  document.getElementById('horseCount').textContent = horses.length;

  const grid = document.getElementById('publicStableGrid');
  grid.innerHTML = horses.map(h => `
    <div class="horse-card">
      <p><strong><a href="horse-public.html?uid=${encodeURIComponent(uid)}&id=${encodeURIComponent(h.id)}">
        ${escapeHtml(h.name || 'Unnamed Horse')}
      </a></strong></p>
      <p>Breed: ${escapeHtml(h.breed || '—')}</p>
      <p>Gender: ${escapeHtml(h.gender || '—')}</p>
      <p>Level: ${Number(h.level || 1)}</p>
    </div>
  `).join('');
}

function escapeHtml(str){return String(str).replace(/[&<>"]/g,s=>({&:"&amp;",<:"&lt;",">":"&gt;",'"':"&quot;"}[s]));}
