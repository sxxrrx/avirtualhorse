// public-foals.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { formatAgeDisplay, daysToYMD, ymdToDays } from './time.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ownerUid = params.get('uid');
const parentId = params.get('id');

let me = null;
let owner = null;
let parentHorse = null;
let foals = [];
let filterRole = 'all';
let page = 1, pageSize = 12;

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  me = user;

  if (!ownerUid || !parentId){ setStatus('Missing uid or id.'); return; }

  const uSnap = await get(ref(db, `users/${ownerUid}`));
  if (!uSnap.exists()) { setStatus('Owner not found.'); return; }
  owner = uSnap.val();

  parentHorse = findHorseInUser(owner, parentId);
  if (!parentHorse) { setStatus('Horse not found.'); return; }

  $('#pageTitle').textContent = `${parentHorse.name || 'Horse'} — Children`;
  $('#ownerLinks').innerHTML =
    `Owner: <a class="tabButton" href="ranch-public.html?uid=${encodeURIComponent(ownerUid)}">🌾 Ranch</a> ` +
    `<a class="tabButton" href="stable-public.html?uid=${encodeURIComponent(ownerUid)}">🐴 Stable</a>`;

  foals = await collectFoalsPublic(parentHorse);

  wireFilters();
  render();
});

function wireFilters(){
  $('#fAll').onclick  = () => { filterRole='all';  setActive('fAll');  render(); };
  $('#fDam').onclick  = () => { filterRole='dam';  setActive('fDam');  render(); };
  $('#fSire').onclick = () => { filterRole='sire'; setActive('fSire'); render(); };
  $('#prevPage').onclick = () => { page=Math.max(1,page-1); render(); };
  $('#nextPage').onclick = () => { page=Math.min(totalPages(),page+1); render(); };
}
function setActive(id){
  ['fAll','fDam','fSire'].forEach(x => $(x).classList.toggle('active', x===id));
}

function totalPages(){
  const items = filtered();
  return Math.max(1, Math.ceil(items.length / pageSize));
}
function filtered(){
  return foals.filter(f => filterRole==='all' ? true : f.role===filterRole);
}
function render(){
  const grid = $('#foalGrid'); grid.innerHTML = '';
  const items = filtered().sort((a,b) => (b.child.ageDays||0) - (a.child.ageDays||0));

  $('#counts').textContent =
    `Foals: ${items.length} (Dam: ${foals.filter(f=>f.role==='dam').length}, Sire: ${foals.filter(f=>f.role==='sire').length})`;

  if (items.length === 0){
    grid.innerHTML = '<p class="muted">No foals found yet.</p>';
    $('#pageInfo').textContent = 'Page 1 / 1';
    $('#prevPage').disabled = $('#nextPage').disabled = true;
    return;
  }

  page = Math.min(page, totalPages());
  const start = (page-1)*pageSize;
  const slice = items.slice(start, start+pageSize);

  slice.forEach(({child, ownerUid, role}) => {
    const card = document.createElement('div');
    card.className = 'horse-card';
    const link = ownerUid===me.uid
      ? `horse.html?id=${encodeURIComponent(child.id)}`
      : `horse-public.html?uid=${encodeURIComponent(ownerUid)}&id=${encodeURIComponent(child.id)}`;
    const ymd = daysToYMD(typeof child.ageDays==='number'?child.ageDays:ymdToDays(child.age||{years:0,months:0,days:0}));
    const ageStr = formatAgeDisplay(ymd.years*365 + ymd.months*30 + ymd.days);
    card.innerHTML = `
      <p><strong><a href="${link}">${escape(child.name || 'Unnamed Foal')}</a></strong></p>
      <p>${escape(child.gender || '—')} • ${escape(child.breed || '—')}</p>
      <p>Age: ${ageStr}</p>
      <p class="muted">Owner: ${ownerUid===me.uid ? 'You' : `<a href="ranch-public.html?uid=${encodeURIComponent(ownerUid)}">${shortUid(ownerUid)}</a>`}</p>
      <p class="muted">Relation: ${role === 'dam' ? 'Dam (mother)' : 'Sire (father)'}</p>
    `;
    grid.appendChild(card);
  });

  $('#pageInfo').textContent = `Page ${page} / ${totalPages()}`;
  $('#prevPage').disabled = page<=1;
  $('#nextPage').disabled = page>=totalPages();
}

/* -------- data -------- */

async function collectFoalsPublic(parent){
  const out = [];

  // owner’s local foals
  const local = toArray(owner.horses).filter(h => h && (h.sireId===parent.id || h.damId===parent.id));
  local.forEach(h => out.push({ child: h, ownerUid: params.get('uid'), role: h.damId===parent.id ? 'dam' : 'sire' }));

  // global index (optional)
  const idxSnap = await get(ref(db, `offspringIndex/${parent.id}`));
  if (idxSnap.exists()){
    const entries = Object.values(idxSnap.val() || {});
    const fetches = entries.slice(0,500).map(async row => {
      const uSnap = await get(ref(db, `users/${row.ownerUid}`));
      if (!uSnap.exists()) return null;
      const child = findHorseInUser(uSnap.val(), row.childId);
      if (!child) return null;
      const role = child.damId===parent.id ? 'dam' : (child.sireId===parent.id ? 'sire' : 'unknown');
      return { child, ownerUid: row.ownerUid, role };
    });
    (await Promise.all(fetches)).filter(Boolean).forEach(x => out.push(x));
  }

  // de-dupe
  const seen = new Set();
  return out.filter(x => {
    const key = `${x.ownerUid}:${x.child?.id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/* -------- utils -------- */
function toArray(v){ return Array.isArray(v) ? v.filter(Boolean) : Object.values(v||{}); }
function findHorseInUser(u, id){
  if (!u || !u.horses) return null;
  const arr = Array.isArray(u.horses) ? u.horses : Object.values(u.horses);
  return arr.find(h => h?.id === id) || null;
}
function shortUid(u){ return (u||'').slice(0,6)+'…'; }
function setStatus(t){ const el=$('#status'); if (el) el.textContent = t; }
function escape(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

