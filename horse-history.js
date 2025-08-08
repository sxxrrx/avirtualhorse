// horse-history.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { GAME_EPOCH_UTC } from './time.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const horseId = params.get('id');

// Only these kinds are shown
const ALLOWED = new Set(['born', 'purchased', 'sold', 'bred', 'foaled']);

onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = 'login.html');
  if (!horseId) return renderStatus('No horse specified.');

  // Try to grab horse name/image from the viewer’s account (optional, makes header nicer)
  let horse = null;
  const uSnap = await get(ref(db, `users/${user.uid}`));
  if (uSnap.exists()) {
    const me = uSnap.val();
    const horses = Array.isArray(me.horses) ? me.horses : Object.values(me.horses || {});
    horse = horses.find(h => h?.id === horseId) || null;
  }

  // Header
  $('historyTitle').textContent = `${horse?.name || 'Horse'} — History`;
  if (horse?.image) $('historyImg').src = horse.image;

  // Load per-horse global history
  const evSnap = await get(ref(db, `horseEvents/${horseId}`));
  const rows = evSnap.exists()
    ? Object.entries(evSnap.val()).map(([id, e]) => ({ id, ...e }))
    : [];

  // filter + sort newest first
  const events = rows
    .filter(e => ALLOWED.has((e.kind || '').toLowerCase()))
    .sort((a, b) =>
      (b.atGh ?? 0) - (a.atGh ?? 0) || (b.atMs ?? 0) - (a.atMs ?? 0)
    );

  renderList(events);
});

function renderList(events) {
  const list = $('historyList');
  list.innerHTML = '';

  if (!events.length) {
    list.innerHTML = `<p class="muted">No history yet.</p>`;
    return;
  }

  events.forEach(e => {
    const card = document.createElement('div');
    card.className = 'horse-card';
    card.innerHTML = `
      <div style="font-weight:700; margin-bottom:4px;">${label(e)}</div>
      <div class="muted">${stamp(e)}</div>
    `;
    list.appendChild(card);
  });
}

function label(e) {
  const kind = (e.kind || '').toLowerCase();
  const d = e.details || {};

  switch (kind) {
    case 'born': {
      const sire = linkHorse(d.sireOwnerUid, d.sireId, d.sireName);
      const dam  = linkHorse(d.damOwnerUid,  d.damId,  d.damName);
      const parents = [sire && `sire: ${sire}`, dam && `dam: ${dam}`].filter(Boolean).join(' • ');
      return parents ? `Born (${parents})` : `Born`;
    }
    case 'purchased': {
      const who = linkRanch(d.sellerUid, d.sellerName) || (d.sellerName || shortUid(d.sellerUid) || 'unknown');
      const price = num(d.price);
      return `Purchased from ${who} for ${price} coins`;
    }
    case 'sold': {
      const who = linkRanch(d.buyerUid, d.buyerName) || (d.buyerName || shortUid(d.buyerUid) || 'unknown');
      const price = num(d.price);
      return `Sold to ${who} for ${price} coins`;
    }
    case 'bred': {
      const partner = linkHorse(d.partnerOwnerUid, d.partnerId, d.partnerName) || (d.partnerName || 'Horse');
      const role = d.role || 'partner';
      return `Bred to ${partner} (${role})`;
    }
    case 'foaled': {
      const foal = linkHorse(d.foalOwnerUid, d.foalId, d.foalName) || (d.foalName || 'foal');
      const g = d.foalGender ? ` (${d.foalGender})` : '';
      return `Gave birth to ${foal}${g}`;
    }
    default:
      return kind || 'event';
  }
}

function stamp(e) {
  // Prefer game hour -> show in-game date + hour
  if (typeof e.atGh === 'number') {
    const day = Math.floor(e.atGh / 24), hour = e.atGh % 24;
    const dt = new Date(GAME_EPOCH_UTC + day * 86400000);
    return `${dt.toLocaleDateString()} — ${String(hour).padStart(2, '0')}:00`;
  }
  // Fallback: real timestamp
  if (e.atMs) return new Date(e.atMs).toLocaleString();
  return '—';
}

function linkHorse(ownerUid, id, name) {
  if (!id) return null;
  const href = ownerUid
    ? `horse-public.html?uid=${encodeURIComponent(ownerUid)}&id=${encodeURIComponent(id)}`
    : `horse.html?id=${encodeURIComponent(id)}`;
  return `<a href="${href}">${escapeHtml(name || id)}</a>`;
}
function linkRanch(uid, name) {
  if (!uid) return null;
  return `<a href="ranch-public.html?uid=${encodeURIComponent(uid)}">${escapeHtml(name || shortUid(uid))}</a>`;
}

function renderStatus(t) {
  const list = $('historyList');
  list.innerHTML = `<p class="muted">${escapeHtml(t)}</p>`;
}

function num(n) { n = Number(n || 0); return n.toLocaleString(); }
function shortUid(u){ return u ? `${String(u).slice(0,6)}…` : '—'; }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
