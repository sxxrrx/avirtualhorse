// town-square.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);

// In-game clock: 1 real min = 1 in-game hour (matches your other pages)
function currentGameHour(){
  const start = new Date(Date.UTC(2025,0,1)).getTime();
  return Math.floor((Date.now() - start) / (60 * 1000));
}
function updateGameClockUI(){
  const hours = currentGameHour();
  const day = Math.floor(hours / 24);
  const hour = hours % 24;
  const start = new Date(Date.UTC(2025,0,1));
  const date = new Date(start.getTime() + day * 86400000);
  const season = getSeason(date);
  const fmt = date.toLocaleDateString();
  const el = $('gameClock');
  if (el) el.innerHTML = `<strong>${season}</strong> — ${fmt} — <strong>${hour}:00</strong>`;
}
function getSeason(d){
  const m = d.getUTCMonth()+1, day = d.getUTCDate();
  const inRange = (sm,sd,em,ed)=> (m>sm || (m===sm && day>=sd)) && (m<em || (m===em && day<=ed));
  if (inRange(3,20,6,19))  return "Verdant's Bloom";
  if (inRange(6,20,9,21))  return "Summer's Height";
  if (inRange(9,22,12,20)) return "Harvest's Embrace";
  return "Winter's Hold";
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  const uid = user.uid;

  // Load user for coins + update lastSeen
  const us = await get(ref(db, `users/${uid}`));
  if (us.exists()){
    const data = us.val();
    $('coinCounter').textContent = `Coins: ${data.coins || 0}`;
    // mark last seen
    await update(ref(db, `users/${uid}`), { lastSeen: Date.now() });
  }

  // Start in-game clock
  updateGameClockUI();
  setInterval(updateGameClockUI, 60000);

  // Load ALL news (kept forever)
  const snap = await get(ref(db, 'news'));
  const items = snap.exists() ? Object.entries(snap.val()).map(([id, n]) => ({ id, ...n })) : [];
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
        <p class="muted" style="margin:4px 0">${when}</p>
        <p>${escapeHtml(n.body || '')}</p>
      `;
      list.appendChild(card);
    });
  }

  // Logout
  const btn = $('btnLogout');
  if (btn) btn.onclick = () => signOut(auth).then(()=>location.href='login.html');
});
