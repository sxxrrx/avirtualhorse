// horse-pedigree.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { daysToYMD, ymdToDays } from './time.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const targetId = params.get('id');

let uid = null;
let me  = null;

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  if (!targetId) {
    $('pedMsg').textContent = 'No horse specified.';
    return;
  }

  // Load my user (for local horses and possibly inventory later)
  const uSnap = await get(ref(db, `users/${uid}`));
  if (!uSnap.exists()) { $('pedMsg').textContent = 'User not found.'; return; }
  me = uSnap.val();

  // Load the focus horse (mine first, or via index if you add it later)
  const root = await fetchHorseById(targetId, me);
  if (!root) { $('pedMsg').textContent = 'Horse not found.'; return; }

  $('pedTitle').textContent = `${root.name || 'Horse'} — Pedigree`;

  // First render
  render(parseInt($('#genSelect').value, 10), root);

  // Handle generation changes
  $('#genSelect').addEventListener('change', () => render(parseInt($('#genSelect').value, 10), root));

  // Redraw lines on resize
  window.addEventListener('resize', () => drawLines());
});

/* ------------------ data fetch helpers ------------------ */

async function fetchHorseById(horseId, myUser) {
  if (!horseId) return null;

  // 1) try my horses
  const mine = findHorseInUser(myUser, horseId);
  if (mine) return mine;

  // 2) try horseIndex (if you add it later)
  const idxSnap = await get(ref(db, `horseIndex/${horseId}`));
  if (idxSnap.exists()) {
    const { ownerUid } = idxSnap.val() || {};
    if (ownerUid) {
      const uSnap = await get(ref(db, `users/${ownerUid}`));
      if (uSnap.exists()) {
        const u = uSnap.val();
        const h = findHorseInUser(u, horseId);
        if (h) return h;
      }
    }
  }

  // 3) not found
  return null;
}

function findHorseInUser(u, id) {
  if (!u || !u.horses) return null;
  const arr = Array.isArray(u.horses) ? u.horses : Object.values(u.horses);
  return arr.find(h => h?.id === id) || null;
}

/* ------------------ pedigree building ------------------ */

async function buildTree(root, gens) {
  // Returns a flat list of nodes we’ll position into columns later
  // Each node: { id, name, gender, coatColor, breed, ageDays|age, sireId, damId, gen, slot }
  // gen 1 = root; parents are gen 2; etc.

  const nodes = [];
  async function walk(h, gen, slot) {
    const node = normalizeHorse(h);
    node.gen = gen;
    node.slot = slot; // used for layout/lines
    nodes.push(node);

    if (gen >= gens) return;

    // load parents by id if present, else stub by name
    let sire = null, dam = null;

    if (h?.sireId) sire = await fetchHorseById(h.sireId, me);
    if (!sire && h?.sireName) sire = { id: null, name: h.sireName, gender: 'Stallion' };

    if (h?.damId) dam = await fetchHorseById(h.damId, me);
    if (!dam && h?.damName) dam = { id: null, name: h.damName, gender: 'Mare' };

    const nextGen = gen + 1;
    // slot math: for a perfect tree, each node splits into two
    // By giving each node a slot, we can keep pairs together for lines.
    if (sire) await walk(sire, nextGen, slot * 2 - 1);
    if (dam)  await walk(dam,  nextGen, slot * 2);
  }

  await walk(root, 1, 1);
  return nodes;
}

function normalizeHorse(h) {
  if (!h) return { name:'Unknown', id:null };
  const out = {
    id: h.id || null,
    name: h.name || 'Unknown',
    gender: h.gender || '—',
    coatColor: h.coatColor || h.color || '',
    breed: h.breed || '',
    sireId: h.sireId || null,
    damId: h.damId || null
  };
  // age display (supports ageDays or legacy age)
  const days = typeof h.ageDays === 'number' ? h.ageDays : ymdToDays(h.age || {years:0,months:0,days:0});
  out.ageDays = days;
  out.ymd = daysToYMD(days);
  return out;
}

/* ------------------ render ------------------ */

async function render(gens, root) {
  const nodes = await buildTree(root, gens);

  // grid sizing: rows = 2^(gens-1), columns = gens
  const rows = Math.pow(2, gens - 1);
  const pedGrid = $('pedGrid');
  pedGrid.style.gridTemplateColumns = `repeat(${gens}, minmax(220px, 1fr))`;
  pedGrid.style.gridTemplateRows = `repeat(${rows}, auto)`;
  pedGrid.innerHTML = '';

  // Place nodes:
  // For column = gen, “slot” range in [1..2^(gen-1)].
  // We put each node at row = ceil( (slot * rows) / (2^(gen-1) + 1?) ) — simpler way:
  // Compute the span size for this column, and center node inside its segment.
  function rowFor(gen, slot) {
    const segments = Math.pow(2, gen - 1);     // number of slots in this column
    const segSize  = rows / segments;          // how many grid rows per slot
    const startRow = Math.round((slot - 1) * segSize) + 1;
    const center   = startRow + Math.floor(segSize / 2);
    return Math.max(1, Math.min(rows, center));
  }

  nodes.forEach(n => {
    const r = rowFor(n.gen, n.slot);
    const c = n.gen;
    const div = document.createElement('div');
    div.className = 'ped-node';
    div.dataset.horseId = n.id || '';
    div.dataset.gen = n.gen;
    div.dataset.slot = n.slot;
    div.style.gridColumn = String(c);
    div.style.gridRow = String(r);
    const ageStr = n.ageDays < 30
      ? `${n.ageDays} day(s)`
      : (n.ymd.years === 0 ? `${n.ymd.months} month(s)` : `${n.ymd.years} year(s) ${n.ymd.months} month(s)`);

    const maybeLinkOpen  = n.id ? `<a href="horse.html?id=${encodeURIComponent(n.id)}">` : '';
    const maybeLinkClose = n.id ? `</a>` : '';

    div.innerHTML = `
      <div class="nm">${maybeLinkOpen}${escape(n.name)}${maybeLinkClose}</div>
      <div class="meta">
        ${escape(n.gender)} ${n.coatColor? '• '+escape(n.coatColor):''} ${n.breed? '• '+escape(n.breed):''}
      </div>
      <div class="meta">Age: ${ageStr}</div>
    `;
    pedGrid.appendChild(div);
  });

  // Draw connectors after layout
  drawLines();
}

function drawLines(){
  const grid = $('pedGrid');
  const svg  = $('pedLines');
  if (!grid || !svg) return;

  // Size SVG to container box
  const rect = grid.getBoundingClientRect();
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  svg.innerHTML = '';

  // helper to get center points
  const getCenter = el => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left - rect.left + r.width / 2,
      y: r.top  - rect.top  + r.height / 2
    };
  };

  // For each node that has parents, connect it to its sire+dam (if present in DOM)
  const all = Array.from(grid.querySelectorAll('.ped-node'));
  const index = {};
  all.forEach(el => {
    const gen  = parseInt(el.dataset.gen, 10);
    const slot = parseInt(el.dataset.slot, 10);
    index[`${gen}:${slot}`] = el;
  });

  all.forEach(el => {
    const gen  = parseInt(el.dataset.gen, 10);
    const slot = parseInt(el.dataset.slot, 10);
    if (!Number.isFinite(gen) || gen >= parseInt($('#genSelect').value,10)) return;

    // parents live in next column (gen+1), slots (slot*2-1) and (slot*2)
    const sire = index[`${gen+1}:${slot*2-1}`];
    const dam  = index[`${gen+1}:${slot*2}`];
    if (!sire && !dam) return;

    const c = getCenter(el);
    const cx = c.x + 110; // nudge from child center to right edge-ish (since boxes are ~220 wide)

    // Draw a small stem from child to a junction, then to each parent
    const stemY = c.y;
    const stemX = cx + 10;

    if (sire) {
      const p = getCenter(sire);
      drawPath([
        [cx, stemY],
        [stemX, stemY],
        [stemX + 20, p.y],
        [p.x - 110, p.y]
      ]);
    }
    if (dam) {
      const p = getCenter(dam);
      drawPath([
        [cx, stemY],
        [stemX, stemY],
        [stemX + 20, p.y],
        [p.x - 110, p.y]
      ]);
    }
  });

  function drawPath(points){
    const d = points.map((pt, i) => (i===0 ? `M ${pt[0]} ${pt[1]}` : `L ${pt[0]} ${pt[1]}`)).join(' ');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#7aa77a');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
  }
}

/* ------------------ tiny utils ------------------ */
function escape(s){ return String(s||'').replace(/[&<>"]/g, t=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[t])); }

