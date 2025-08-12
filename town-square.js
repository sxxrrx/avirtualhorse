// town-square.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update, push, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerXP } from './player-level.js';

const $ = (id) => document.getElementById(id);
const log = (...a) => console.log('[town]', ...a);
const warn = (...a) => console.warn('[town]', ...a);
const err = (...a) => console.error('[town]', ...a);

const escapeHtml = (s) => String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const q = new URLSearchParams(location.search);
const devAdmin = q.get('admin') === '1'; // ?admin=1 shows tools (dev only)

onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = 'login.html');
  const uid = user.uid;
  log('auth ok', uid);

  // mark last seen
  try { await update(ref(db, `users/${uid}`), { lastSeen: Date.now() }); } catch(e){ warn('lastSeen fail', e); }

  // check role
  let me = {};
  try {
    const meSnap = await get(ref(db, `users/${uid}`));
    me = meSnap.exists() ? meSnap.val() : {};
  } catch(e){ err('load me failed', e); }
  const isAdmin = !!(me?.roles && me.roles.admin) || devAdmin;
  log('isAdmin?', isAdmin);

  if (isAdmin) injectAdminTools(uid);

  // --- NEWS LIST ---
  try {
    const snap = await get(ref(db, 'news'));
    const items = snap.exists()
      ? Object.entries(snap.val()).map(([id, n]) => ({ id, ...n }))
      : [];

    items.sort((a,b)=> (b.postedAt||0) - (a.postedAt||0));

    const list = $('newsList');
    if (!items.length){
      list.innerHTML = '<p>No news yet.</p>';
    } else {
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
    }
  } catch(e){ err('news load failed', e); }
});

// ---------- Admin Tools ----------
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

  if (!btn || !amtE || !msgE) { warn('admin box missing elements'); return; }

  // sanity ping that the module loaded
  if (typeof grantPlayerXP !== 'function') {
    msgE.textContent = 'player-level.js not loaded';
    warn('grantPlayerXP is not a function — check import/path');
  }

  btn.onclick = async () => {
    const amt = Math.max(1, parseInt(amtE.value,10) || 0);
    log('GiveXP clicked', amt);
    btn.disabled = true;
    msgE.textContent = 'Giving XP…';
    try {
      const res = await grantPlayerXP(uid, amt, 'admin_give_xp');
      log('grantPlayerXP result', res);
      const rewardsTxt = formatRewards(res?.rewards || []);
      msgE.textContent =
        `Gave ${amt} XP → Level ${res.level} (${res.exp} toward next)` +
        (res.leveled?.length ? ` • leveled: ${res.leveled.join(', ')}` : '') +
        (rewardsTxt ? ` • rewards: ${rewardsTxt}` : '');
      // lightweight audit
      try {
        const keyRef = push(ref(db, `adminLogs/${uid}`));
        await set(keyRef, { at: Date.now(), kind: 'give_xp', amount: amt });
      } catch (e) { warn('audit write failed', e); }
    } catch (e) {
      err('grantPlayerXP failed', e);
      msgE.textContent = 'Failed to grant XP (see console).';
      alert('Grant XP failed — check console for error details.');
    } finally {
      btn.disabled = false;
    }
  };
}

function formatRewards(list){
  if (!Array.isArray(list) || !list.length) return '';
  return list.map(r => {
    const k = r.kind || r.type || r.item || 'reward';
    const a = r.amount ? `×${r.amount}` : '';
    return `${k}${a}`;
  }).join(', ');
}
