// horse-history.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { GAME_EPOCH_UTC } from './time.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const horseId = params.get('id');

let uid = null;
let me = null;
let horse = null;
let events = [];   // normalized timeline
let page = 1, pageSize = 15;
let filter = 'all';

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  if (!horseId) { setStatus('No horse specified.'); return; }

  const uSnap = await get(ref(db, `users/${uid}`));
  if (!uSnap.exists()) { setStatus('User not found.'); return; }
  me = uSnap.val();

  horse = findHorse(me, horseId);
  if (!horse) { setStatus('Horse not found.'); return; }

  // header
  $('#pageTitle').textContent = `${horse.name || 'Horse'} — History`;
  $('#horseImage').src = horse.image || 'horse-placeholder.png';
  $('#ownerLinks').innerHTML =
    `Owner: You • <a class="tabButton" href="horse.html?id=${encodeURIComponent(horseId)}">Open horse</a>`;

  // load timeline (global preferred, then local)
  events = await loadTimeline(horse.id, uid, me);

  wireUI();
  render();
});

function wireUI(){
  $('#fAll').onclick       = () => { filter='all';       setActive('fAll');       render(); };
  $('#fBreeding').onclick  = () => { filter='breeding';  setActive('fBreeding');  render(); };
  $('#fOwnership').onclick = () => { filter='ownership'; setActive('fOwnership'); render(); };
  $('#fHealth').onclick    = () => { filter='health';    setActive('fHealth');    render(); };
  $('#fShows').onclick     = () => { filter='shows';     setActive('fShows');     render(); };
  $('#fMisc').onclick      = () => { filter='misc';      setActive('fMisc');      render(); };

  $('#prevPage').onclick   = () => { page=Math.max(1,page-1); render(); };
  $('#nextPage').onclick   = () => { page=Math.min(totalPages(),page+1); render(); };
}
function setActive(id){ ['fAll','fBreeding','fOwnership','fHealth','fShows','fMisc'].forEach(x => $(x).classList.toggle('active', x===id)); }

async function loadTimeline(horseId, ownerUid, ownerObj){
  // 1) Global per-horse log (preferred)
  const gSnap = await get(ref(db, `horseEvents/${horseId}`));
  const list = gSnap.exists()
    ? Object.entries(gSnap.val()).map(([id, e]) => normalizeEvent({ id, ...e }))
    : [];

  // 2) Fallback: legacy per-user history if any
  const legacySnap = await get(ref(db, `users/${ownerUid}/horseHistory/${horseId}`));
  if (legacySnap.exists()){
    const legacy = Object.entries(legacySnap.val()).map(([id, e]) => normalizeEvent({ id, ...e }));
    list.push(...legacy);
  }

  // 3) Fallback: embedded on the horse object
  if (ownerObj && ownerObj.horsesHistory && ownerObj.horsesHistory[horseId]){
    const embedded = Object.entries(ownerObj.horsesHistory[horseId]).map(([id, e]) => normalizeEvent({ id, ...e }));
    list.push(...embedded);
  } else if (horse.history){
    const embedded = toArray(horse.history).map(e => normalizeEvent(e));
    list.push(...embedded);
  }

  // de-dupe + sort newest first
  const seen = new Set();
  const out = [];
  for (const e of list){
    const key = `${e.atGh||e.atMs}:${e.kind}:${e.note||''}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(e);
  }
  out.sort((a,b) => (b.atGh??0) - (a.atGh??0) || (b.atMs??0) - (a.atMs??0));
  return out;
}

/* ---------- render ---------- */
function filtered(){
  if (filter==='all') return events;
  return events.filter(e => e.category === filter);
}
function totalPages(){
  return Math.max(1, Math.ceil(filtered().length / pageSize));
}
function render(){
  const list = filtered();
  const tl = $('#timeline'); tl.innerHTML = '';

  if (list.length === 0){
    tl.innerHTML = '<p class="muted">No history yet.</p>';
    $('#pageInfo').textContent = 'Page 1 / 1';
    $('#prevPage').disabled = $('#nextPage').disabled = true;
    return;
  }

  page = Math.min(page, totalPages());
  const start = (page-1)*pageSize;
  const slice = list.slice(start, start+pageSize);

  slice.forEach(e => tl.appendChild(renderEvent(e)));

  $('#pageInfo').textContent = `Page ${page} / ${totalPages()}`;
  $('#prevPage').disabled = page<=1;
  $('#nextPage').disabled = page>=totalPages();
}

function renderEvent(e){
  const div = document.createElement('div');
  div.className = 'event';
  const when = formatGameDate(e.atGh, e.atMs);

  div.innerHTML = `
    <div class="when">${when}</div>
    <div class="body">${eventText(e)}</div>
  `;
  return div;
}

/* ---------- event formatting ---------- */
function eventText(e){
  const who = e.byName ? escape(e.byName) : (e.byUid ? shortUid(e.byUid) : 'System');
  const d = e.details || {};
  switch (e.kind) {
    case 'born':
      return `<p>Foaled ${escape(d.place||'in the ranch')}.</p>${parentLine(d)}`;
    case 'bred_with': // this horse participated in breeding with partner
      return `<p>Bred with <a href="${horseLink(d.partnerOwnerUid, d.partnerId)}">${escape(d.partnerName||'Horse')}</a> (${escape(d.partnerRole||'partner')}).</p>`;
    case 'foal_born':
      return `<p>Foal born: <a href="${horseLink(d.childOwnerUid, d.childId)}">${escape(d.childName||'Foal')}</a> (${escape(d.childGender||'—')}).</p>`;
    case 'listed_for_sale':
      return `<p>Listed for rescue/market for ${Number(d.price||0).toLocaleString()} coins.</p>`;
    case 'sold':
      return `<p>Sold to <a href="ranch-public.html?uid=${encodeURIComponent(d.buyerUid)}">${shortUid(d.buyerUid)}</a> for ${Number(d.price||0).toLocaleString()} coins.</p>`;
    case 'purchased':
      return `<p>Purchased from <a href="ranch-public.html?uid=${encodeURIComponent(d.sellerUid)}">${shortUid(d.sellerUid)}</a> for ${Number(d.price||0).toLocaleString()} coins.</p>`;
    case 'transferred':
      return `<p>Ownership transferred to <a href="ranch-public.html?uid=${encodeURIComponent(d.toUid)}">${shortUid(d.toUid)}</a>.</p>`;
    case 'show_entered':
      return `<p>Entered show <strong>${escape(d.showName||d.showId||'Show')}</strong> (fee ${Number(d.fee||0)} coins).</p>`;
    case 'show_result':
      return `<p>Show result: <strong>${escape(d.showName||d.showId||'Show')}</strong> — placed ${escape(String(d.place||'—'))}, earned ${Number(d.earnings||0)} coins.</p>`;
    case 'vet_shots':
      return `<p>Vet shots administered.</p>`;
    case 'vet_check':
      return `<p>Vet check completed.</p>`;
    case 'breeding_check':
      return `<p>Breeding check performed.</p>`;
    case 'fed':
      return `<p>Fed: ${escape(d.feedName||'feed')} (${Number(d.lbs||0)} lbs).</p>`;
    case 'groomed':
      return `<p>Groomed (+${Number(d.happiness||5)}% happiness).</p>`;
    case 'rename':
      return `<p>Renamed from “${escape(d.oldName||'') }” to “${escape(d.newName||'')}”.</p>`;
    case 'description':
      return `<p>Description updated by ${who}.</p>`;
    case 'tack_equipped':
      return `<p>Equipped tack: ${escape(d.setName||d.itemName||'tack')}.</p>`;
    case 'tack_removed':
      return `<p>Removed tack: ${escape(d.setName||d.itemName||'tack')}.</p>`;
    case 'retired':
      return `<p>Retired from competition.</p>`;
    case 'unretired':
      return `<p>Returned from retirement.</p>`;
    default:
      return `<p>${escape(e.note || 'Activity recorded.')}</p>`;
  }
}
function parentLine(d){
  const parts = [];
  if (d.sireId) parts.push(`Sire: <a href="${horseLink(d.sireOwnerUid, d.sireId)}">${escape(d.sireName||'—')}</a>`);
  if (d.damId)  parts.push(`Dam: <a href="${horseLink(d.damOwnerUid, d.damId)}">${escape(d.damName||'—')}</a>`);
  return parts.length ? `<p class="muted">${parts.join(' • ')}</p>` : '';
}

/* ---------- helpers ---------- */
function formatGameDate(atGh, atMs){
  if (typeof atGh === 'number') {
    const day = Math.floor(atGh/24), hour = atGh%24;
    const d = new Date(GAME_EPOCH_UTC + day*86400000);
    return `${d.toLocaleDateString()} — ${String(hour).padStart(2,'0')}:00`;
  }
  if (atMs) return new Date(atMs).toLocaleString();
  return '—';
}
function horseLink(ownerUid, horseId){
  if (!ownerUid || ownerUid===uid) return `horse.html?id=${encodeURIComponent(horseId||'')}`;
  return `horse-public.html?uid=${encodeURIComponent(ownerUid)}&id=${encodeURIComponent(horseId||'')}`;
}
function toArray(v){ return Array.isArray(v) ? v.filter(Boolean) : Object.values(v||{}); }
function findHorse(u, id){
  const arr = toArray(u.horses);
  return arr.find(h => h?.id === id) || null;
}
function shortUid(u){ return (u||'').slice(0,6)+'…'; }
function setStatus(t){ const el=$('#status'); if (el) el.textContent = t; }
function escape(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

/* ---------- normalizer ---------- */
/** We normalize whatever shape came from DB into:
 * { id, kind, category, atGh?, atMs?, byUid?, byName?, details?, note? }
 */
function normalizeEvent(src){
  const e = { ...src };
  // best-effort kind mapping and categorization
  let cat = 'misc';
  const k = (e.kind || e.type || 'misc').toLowerCase();
  if (['born','bred_with','foal_born'].includes(k)) cat='breeding';
  else if (['listed_for_sale','sold','purchased','transferred'].includes(k)) cat='ownership';
  else if (['vet_shots','vet_check','breeding_check','fed','groomed'].includes(k)) cat='health';
  else if (['show_entered','show_result'].includes(k)) cat='shows';
  e.kind = k; e.category = cat;

  // timestamps
  if (typeof e.atGh !== 'number' && typeof e.atGameHour === 'number') e.atGh = e.atGameHour;
  if (!e.atGh && e.gameHour) e.atGh = e.gameHour;
  if (!e.atMs && e.timeMs) e.atMs = e.timeMs;

  // details container
  e.details = e.details || e.data || {};
  return e;
}

