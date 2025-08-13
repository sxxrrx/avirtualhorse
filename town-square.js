// town-square.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const q = new URLSearchParams(location.search);
const devAdmin = q.get('admin') === '1'; // ?admin=1 forces admin tools (dev only)

onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = 'login.html');
  const uid = user.uid;

  // mark last seen
  await update(ref(db, `users/${uid}`), { lastSeen: Date.now() });

  // check role
  const meSnap = await get(ref(db, `users/${uid}`));
  const me = meSnap.exists() ? meSnap.val() : {};
  const isAdmin = !!(me?.roles && me.roles.admin) || devAdmin;

  // Dynamically load admin tools if admin
  if (isAdmin) {
    try {
      const { mountTownAdminTools } = await import('./admin-tools.js');
      mountTownAdminTools();
    } catch (e) {
      console.error('[town-square] failed to load admin-tools', e);
    }
  }

  // --- NEWS LIST ---
  const snap = await get(ref(db, 'news'));
  const items = snap.exists()
    ? Object.entries(snap.val()).map(([id, n]) => ({ id, ...n }))
    : [];

  items.sort((a,b)=> (b.postedAt||0) - (a.postedAt||0));

  const list = $('newsList');
  if (!items.length){
    list.innerHTML = '<p>No news yet.</p>';
    return;
  }

  list.innerHTML = '';
  items.forEach(n=>{
    const card = document.createElement('div');
    card.className = 'horse-card';
    const when = n.postedAt ? new Date(n.postedAt).toLocaleString() : '';
    card.innerHTML = `
      <p style="font-weight:700">${escapeHtml(n.title || 'Update')}</p>
      <p class="muted" style="margin:4px 0">${when}${n.author ? ` • ${escapeHtml(n.author)}` : ''}</p>
      <p style="white-space:pre-wrap;">${escapeHtml(n.body || '')}</p>
    `;
    list.appendChild(card);
  });
});
