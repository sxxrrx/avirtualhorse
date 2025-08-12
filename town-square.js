// town-square.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { seasonForDate, GAME_EPOCH_UTC } from './time.js';

const $ = id => document.getElementById(id);
const escapeHtml = s => String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* helpers to format an in-game timestamp */
function ghToSeasonAndTime(gh){
  const day = Math.floor(gh/24);
  const hour = gh % 24;
  const date = new Date(GAME_EPOCH_UTC + day*86400000);
  const season = seasonForDate(date);
  return { season, hour };
}
function hour12(h){ const hh = (h%12)||12; const ampm = h>=12?'pm':'am'; return `${hh}:00 ${ampm}`; }

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  const uid = user.uid;

  // just mark you as seen (coins/clock/mail handled by chrome)
  await update(ref(db, `users/${uid}`), { lastSeen: Date.now() });

  // Load news
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

    // Preferred: nice byline from in-game timestamp + author
    let byline = '';
    if (typeof n.postedAtGh === 'number') {
      const { season, hour } = ghToSeasonAndTime(n.postedAtGh);
      byline = `Posted on ${season} — ${hour12(hour)}. Posted by ${escapeHtml(n.authorName || 'Admin')}.`;
    } else {
      // Fallback: real time
      const when = n.postedAt ? new Date(n.postedAt).toLocaleString() : '';
      byline = `${when}${n.authorName ? ` • Posted by ${escapeHtml(n.authorName)}` : ''}`;
    }

    card.innerHTML = `
      <p style="font-weight:700">${escapeHtml(n.title || 'Update')}</p>
      <p class="muted" style="margin:4px 0">${byline}</p>
      <p style="white-space:pre-wrap;">${escapeHtml(n.body || '')}</p>
    `;
    list.appendChild(card);
  });
});
