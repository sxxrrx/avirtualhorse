// town-square.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerXP } from './player-level.js';  // ⬅️ use our XP helper

const $ = id => document.getElementById(id);
const escapeHtml = s => String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  const uid = user.uid;

  // mark last seen
  await update(ref(db, `users/${uid}`), { lastSeen: Date.now() });

  // read my user doc (to check admin role)
  const meSnap = await get(ref(db, `users/${uid}`));
  const me = meSnap.exists() ? meSnap.val() : {};
  const isAdmin = !!me?.roles?.admin;

  // inject admin tools (self-only) if admin
  if (isAdmin) {
    injectAdminTools(uid);
  }

  // Load ALL news
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
      <p class="muted" style="margin:4px 0">${when}</p>
      <p style="white-space:pre-wrap;">${escapeHtml(n.body || '')}</p>
    `;
    list.appendChild(card);
  });
});

function injectAdminTools(uid){
  // put a small box above News list
  const host = document.querySelector('.main-content') || document.body;
  const box = document.createElement('div');
  box.className = 'horse-card';
  box.style.marginBottom = '12px';
  box.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <strong>Admin Tools</strong>
      <input id="xpAmount" type="number" min="1" value="50" style="width:90px;padding:4px;" />
      <button id="btnGiveXP">Give XP (to me)</button>
      <span id="xpMsg" class="muted"></span>
    </div>
  `;
  host.insertBefore(box, host.querySelector('h2') || host.firstChild);

  $('#btnGiveXP').onclick = async () => {
    const amt = Math.max(1, parseInt($('#xpAmount').value,10) || 0);
    $('#xpMsg').textContent = '…';
    try {
      const res = await grantPlayerXP(uid, amt, 'admin_give_xp');
      $('#xpMsg').textContent = `Gave ${amt} XP. Now level ${res.level} (${res.exp} XP toward next).`;
    } catch (e) {
      console.error(e);
      $('#xpMsg').textContent = 'Failed to grant XP (check console).';
    }
  };
}

