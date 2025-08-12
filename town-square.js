// town-square.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { GAME_EPOCH_UTC, seasonForDate } from './time.js';

const $ = id => document.getElementById(id);
const escapeHtml = s => String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Seed a single “Testing News” post if it doesn’t exist yet.
// Uses a fixed key so it won’t duplicate.
async function seedTestingNewsIfMissing() {
  const key = 'testing_news_seed_v1';
  const node = ref(db, `news/${key}`);
  const snap = await get(node);
  if (snap.exists()) return;

  // Choose a Verdant’s Bloom day (Mar 21, 2025) at 4:00 pm game-time
  const targetUtcMs = Date.UTC(2025, 2, 21); // months are 0-based
  const day = Math.floor((targetUtcMs - GAME_EPOCH_UTC) / 86400000);
  const postedAtGh = day * 24 + 16; // 16 => 4:00 pm

  await set(node, {
    title: 'Testing News',
    body: 'Hello all, this is a news test to see how the Town Square page is set up and working. Welcome to the game!',
    authorName: '~Legacy Stables~',
    postedAtGh,       // for season/hour display
    postedAt: Date.now()
  });
}

onAuthStateChanged(auth, async user => {
  if (!user) return (location.href = 'login.html');
  const uid = user.uid;

  // Update last seen (topbar handles coins/clock/mail)
  await update(ref(db, `users/${uid}`), { lastSeen: Date.now() });

  // Make sure our test post exists (one-time)
  await seedTestingNewsIfMissing();

  // Load all news (kept forever)
  const snap = await get(ref(db, 'news'));
  const items = snap.exists()
    ? Object.entries(snap.val()).map(([id, n]) => ({ id, ...n }))
    : [];

  // Newest first
  items.sort((a,b) => (b.postedAtGh ?? 0) - (a.postedAtGh ?? 0) || (b.postedAt || 0) - (a.postedAt || 0));

  const list = $('newsList');
  if (!items.length) {
    list.innerHTML = '<p>No news yet.</p>';
    return;
  }

  list.innerHTML = '';
  items.forEach(n => {
    const postedLine = formatPostedLine(n);
    const card = document.createElement('div');
    card.className = 'horse-card';
    card.innerHTML = `
      <p style="font-weight:700">${escapeHtml(n.title || 'Update')}</p>
      <p class="muted" style="margin:4px 0">${postedLine}</p>
      <p style="white-space:pre-wrap;">${escapeHtml(n.body || '')}</p>
    `;
    list.appendChild(card);
  });
});

// "Posted on Verdant’s Bloom — 4:00 pm. Posted by ~Legacy Stables~"
function formatPostedLine(n) {
  let when = '';
  if (typeof n.postedAtGh === 'number') {
    const day = Math.floor(n.postedAtGh / 24);
    const hour = n.postedAtGh % 24;
    const date = new Date(GAME_EPOCH_UTC + day * 86400000);
    const season = seasonForDate(date);
    const { label } = h12(hour);
    when = `${season} — ${label}`;
  } else if (n.postedAt) {
    when = new Date(n.postedAt).toLocaleString();
  } else {
    when = '—';
  }
  const by = n.authorName ? ` Posted by ${escapeHtml(n.authorName)}.` : '';
  return `Posted on ${when}.${by}`;
}

function h12(h24) {
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h = h24 % 12 || 12;
  return { h, label: `${h}:00 ${ampm}` };
}
