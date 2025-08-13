// town-square.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update, push, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerXP, ensurePlayerProgress } from './player-level.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const q = new URLSearchParams(location.search);
const devAdmin = q.get('admin') === '1';

onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = 'login.html');
  const uid = user.uid;

  // make sure level/exp exist
  await ensurePlayerProgress(uid);

  // mark last seen
  await update(ref(db, `users/${uid}`), { lastSeen: Date.now() });

  // admin?
  const meSnap = await get(ref(db, `users/${uid}`));
  const me = meSnap.exists() ? meSnap.val() : {};
const isAdmin = !!(me?.roles && me.roles.admin) || devAdmin;

if (isAdmin) {
  const { mountTownAdminTools } = await import('./admin-tools.js');
  mountTownAdminTools(); // grabs auth.currentUser.uid at click time
}


  // NEWS
  const snap = await get(ref(db, 'news'));
  const items = snap.exists()
    ? Object.entries(snap.val()).map(([id, n]) => ({ id, ...n }))
    : [];
  items.sort((a,b)=> (b.postedAt||0) - (a.postedAt||0));

  const list = $('newsList');
  list.innerHTML = items.length
    ? ''
    : '<p>No news yet.</p>';

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

function injectAdminTools(uid){
  const host = document.querySelector('.main-content') || document.body;
  const anchor = host.querySelector('h2') || host.firstChild;

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
  host.insertBefore(box, anchor);

  const btn  = $('#btnGiveXP');
  const amtE = $('#xpAmount');
  const msgE = $('#xpMsg');

  btn.onclick = async () => {
    const amt = Math.max(1, parseInt(amtE.value,10) || 0);
    btn.disabled = true;
    msgE.textContent = 'Giving XP…';
    try {
      const res = await grantPlayerXP(uid, amt, 'admin_give_xp');
      const rewardsTxt = formatRewards(res.rewards || []);
      msgE.textContent =
        `Gave ${amt} XP → Level ${res.level} (${res.exp} toward next)` +
        (res.leveled?.length ? ` • leveled to ${res.leveled.join(', ')}` : '') +
        (rewardsTxt ? ` • rewards: ${rewardsTxt}` : '');
      // tiny audit (optional)
      try {
        const id = push(ref(db, `adminLogs/${uid}`)).key;
        await set(ref(db, `adminLogs/${uid}/${id}`), { at: Date.now(), kind: 'give_xp', amount: amt });
      } catch {}
    } catch (e) {
      console.error(e);
      msgE.textContent = 'Failed to grant XP (see console).';
    } finally {
      btn.disabled = false;
    }
  };
}
function formatRewards(list){
  if (!Array.isArray(list) || !list.length) return '';
  return list.map(r => `${r.kind || r.type || r.item || 'reward'}${r.amount ? `×${r.amount}`:''}`).join(', ');
}
