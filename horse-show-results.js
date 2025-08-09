// horse-show-results.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { GAME_EPOCH_UTC, currentGameHour } from './time.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const horseId = params.get('id');

let uid = null;
let me  = null;
let horse = null;

onAuthStateChanged(auth, async user => {
  if (!user) return;
  uid = user.uid;

  if (!horseId) return;

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) return;
  me = us.val();

  // find the horse
  const horses = toArray(me.horses);
  horse = horses.find(h => h?.id === horseId);
  if (!horse) return;

  // wire button
  const btn = $('#btnShowResults');
  if (btn) btn.onclick = toggleResults;

  // optional: lazy-load immediately if you want
  // await loadAndRenderResults();
});

function toArray(v){ return Array.isArray(v) ? v.filter(Boolean) : Object.values(v||{}); }

async function toggleResults(){
  const panel = $('#showResults');
  if (!panel) return;
  if (panel.dataset.loaded === '1') {
    // simple toggle
    panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
    return;
  }
  await loadAndRenderResults();
  panel.style.display = 'block';
}

async function loadAndRenderResults(){
  const panel = $('#showResults'); if (!panel) return;
  panel.innerHTML = 'Loading results…';

  // 1) Prefer the index built on entry
  let showIds = [];
  const idxSnap = await get(ref(db, `horseShowsIndex/${horseId}`));
  if (idxSnap.exists()) {
    showIds = Object.keys(idxSnap.val());
  } else {
    // 2) Fallback: one-time scan of all shows; filter by entrants[horseId]
    const showsSnap = await get(ref(db, 'shows'));
    if (showsSnap.exists()){
      const all = showsSnap.val();
      showIds = Object.entries(all)
        .filter(([id, s]) => s?.entrants && s.entrants[horseId])
        .map(([id]) => id);
    }
  }

  if (showIds.length === 0){
    panel.innerHTML = `<div class="horse-card"><p class="muted">No show entries yet.</p></div>`;
    panel.dataset.loaded = '1';
    return;
  }

  // Pull each show doc (cap to something sane)
  const MAX = 200;
  const ids = showIds.slice(-MAX);

  const shows = [];
  for (const id of ids) {
    const s = await get(ref(db, `shows/${id}`));
    if (s.exists()) shows.push({ id, ...s.val() });
  }

  // Massage into rows
  const rows = shows.map(s => {
    // entry
    const ent = s.entrants?.[horseId] || null;
    const enteredGh = ent?.enteredAtGameHour ?? null;

    // result search (support a few shapes)
    let place = null, earnings = 0, doneGh = null;

    // results.byHorse.{horseId}
    if (s.results?.byHorse?.[horseId]) {
      place = s.results.byHorse[horseId].place ?? null;
      earnings = Number(s.results.byHorse[horseId].earnings || 0);
      doneGh = s.results.completedAtGameHour ?? null;
    }
    // results.placements: [{horseId,place,earnings}]
    else if (Array.isArray(s.results?.placements)) {
      const p = s.results.placements.find(x => x?.horseId === horseId);
      if (p) {
        place = p.place ?? null;
        earnings = Number(p.earnings || 0);
      }
      doneGh = s.results.completedAtGameHour ?? null;
    }
    // payouts map
    else if (s.payouts && s.payouts[horseId]) {
      const p = s.payouts[horseId];
      place = p.place ?? null;
      earnings = Number(p.earnings || 0);
      doneGh = s.completedAtGameHour ?? null;
    }

    // fallback status
    const status = place ? `Placed ${place}` : (s.status === 'completed' ? 'Completed' : 'Pending');

    return {
      id: s.id,
      name: s.name || 'Show',
      spec: s.specialty || s.discipline || '',
      min: s.minLevel || 1,
      max: s.maxLevel || 999,
      fee: Number(s.fee || 0),
      enteredGh,
      doneGh,
      status,
      place,
      earnings
    };
  });

  // Sort newest first by entered/completed
  rows.sort((a,b) => (b.doneGh ?? b.enteredGh ?? 0) - (a.doneGh ?? a.enteredGh ?? 0));

  const total = rows.reduce((sum, r) => sum + Number(r.earnings || 0), 0);

  // Render
  panel.innerHTML = `
    <div class="horse-card" style="text-align:left;">
      <h3>Show Results</h3>
      <p class="muted">Total earnings: <strong>${total.toLocaleString()}</strong> coins</p>
      <div style="overflow-x:auto; margin-top:8px;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; padding:6px; border-bottom:1px solid #c0e8c0;">Show</th>
              <th style="text-align:left; padding:6px; border-bottom:1px solid #c0e8c0;">Spec</th>
              <th style="text-align:left; padding:6px; border-bottom:1px solid #c0e8c0;">Bracket</th>
              <th style="text-align:left; padding:6px; border-bottom:1px solid #c0e8c0;">Entered</th>
              <th style="text-align:left; padding:6px; border-bottom:1px solid #c0e8c0;">Status</th>
              <th style="text-align:right; padding:6px; border-bottom:1px solid #c0e8c0;">Earnings</th>
            </tr>
          </thead>
          <tbody id="srBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const tbody = document.getElementById('srBody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:6px;">${escapeHtml(r.name)}</td>
      <td style="padding:6px;">${escapeHtml(r.spec)}</td>
      <td style="padding:6px;">L${r.min}–${r.max}</td>
      <td style="padding:6px;">${formatGameHour(r.enteredGh)}</td>
      <td style="padding:6px;">${escapeHtml(r.status)}</td>
      <td style="padding:6px; text-align:right;">${Number(r.earnings||0).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });

  panel.dataset.loaded = '1';
}

// ---------- helpers ----------
function formatGameHour(gh){
  if (typeof gh !== 'number') return '—';
  const day = Math.floor(gh/24), hour = gh%24;
  const d = new Date(GAME_EPOCH_UTC + day*86400000);
  return `${d.toLocaleDateString()} — ${String(hour).padStart(2,'0')}:00`;
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
