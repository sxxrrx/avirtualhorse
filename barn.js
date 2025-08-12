// barn.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);

/* ----------------- local state ----------------- */
let uid = null;
let userData = null;
// inventoryMap: { [id]: item }
let inventoryMap = {};

/* ----------------- tabs wire-up (eager) ----------------- */
document.addEventListener('DOMContentLoaded', () => {
  const tw = $('#tabWorkshop');
  const ti = $('#tabInventory');
  if (tw) tw.addEventListener('click', () => setTab('workshop'));
  if (ti) ti.addEventListener('click', () => setTab('inventory'));
  // default
  setTab('workshop');
});

/* ----------------- auth / boot ----------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = 'login.html');
  uid = user.uid;

  // load user
  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) { alert('User not found.'); return; }
  userData = us.val();

  // load inventory (supports both object and old array)
  const invSnap = await get(ref(db, `users/${uid}/inventory/tack`));
  if (!invSnap.exists()) {
    inventoryMap = {};
  } else {
    const v = invSnap.val();
    inventoryMap = Array.isArray(v)
      ? v.reduce((m, it, i) => { if (it) m[it.id || `legacy_${i}`] = it; return m; }, {})
      : (v || {});
  }

  // render
  renderChances();
  renderInventory();

  // craft button (bind after DOM + auth)
  const craftBtn = $('#btnCraft');
  if (craftBtn) craftBtn.addEventListener('click', craft);
});

/* ----------------- tabs / sections ----------------- */
function setTab(name){
  $('#tabWorkshop')?.classList.toggle('primary', name==='workshop');
  $('#tabInventory')?.classList.toggle('primary', name==='inventory');
  $('#secWorkshop')?.classList.toggle('active', name==='workshop');
  $('#secInventory')?.classList.toggle('active', name==='inventory');
}

/* ----------------- quality model ----------------- */
// same curve we agreed on
function qualityProbabilities(level){
  if (level < 5)   return [{q:'Poor',       p:1}];
  if (level < 15)  return [{q:'Fair',       p:0.85},{q:'Poor', p:0.15}];
  if (level < 30)  return [{q:'Good',       p:0.75},{q:'Fair', p:0.15},{q:'Poor', p:0.10}];
  if (level < 60)  return [{q:'Very Good',  p:0.60},{q:'Good', p:0.20},{q:'Fair', p:0.20}];
  if (level < 100) return [{q:'Very Good',  p:0.85},{q:'Good', p:0.15}];
  if (level < 200) return [{q:'Excellent',  p:0.50},{q:'Very Good', p:0.50}];
  if (level < 250) return [{q:'Divine',     p:0.45},{q:'Excellent', p:0.55}];
  return [{q:'Divine', p:1}];
}
function pickQuality(probs){
  const r = Math.random(); let cum = 0;
  for (const p of probs){ cum += p.p; if (r <= cum) return p.q; }
  return probs[probs.length-1].q;
}
function durabilityFor(q){
  switch(q){
    case 'Poor':       return 20;
    case 'Fair':       return 50;
    case 'Good':       return 80;
    case 'Very Good':  return 120;
    case 'Excellent':  return 250;
    case 'Divine':     return 500;
    default:           return 10;
  }
}
function expFor(q){
  switch(q){
    case 'Poor':       return 10;
    case 'Fair':       return 15;
    case 'Good':       return 20;
    case 'Very Good':  return randInt(25,30);
    case 'Excellent':  return randInt(50,75);
    case 'Divine':     return randInt(100,150);
    default:           return 0;
  }
}

/* ----------------- crafting ----------------- */
async function craft(){
  const type = $('#tackType')?.value || '';
  const spec = $('#tackSpec')?.value || '';
  if (!type) return alert('Please select a tack type.');
  if (!spec) return alert('Please select a specialty.');

  const lvl = Number(userData?.level || 1);
  const q   = pickQuality(qualityProbabilities(lvl));
  const uses = durabilityFor(q);
  const exp  = expFor(q);

  const id = `tack_${Date.now()}_${Math.floor(Math.random()*1000)}`;
  const item = {
    id,
    type,                 // 'bridle' | 'saddle' | 'horse_boots' | 'horse_shoes'
    specialty: spec,      // 'Standard' | 'English' | 'Jumper' | 'Racing' | 'Western'
    quality: q,
    showsLeft: uses,      // durability
    createdAt: Date.now()
  };

  // persist as object entry to avoid clobbering
  inventoryMap[id] = item;
  await set(ref(db, `users/${uid}/inventory/tack/${id}`), item);

  // give EXP (+ auto level-ups: threshold = current level * 100)
  await grantExp(exp);

  // UI
  $('#craftResult').innerHTML = `
    <div class="horse-card">
      Crafted <strong>${prettyType(type)}</strong> (${escapeHtml(spec)}) —
      <span class="pill">${q}</span> • Durability: ${uses} shows • +${exp} EXP
    </div>
  `;
  renderInventory();
  renderChances();
  setTab('inventory');

  // scroll newest into view
  setTimeout(()=> document.querySelector('#invList .horse-card')?.scrollIntoView({behavior:'smooth'}), 25);
}

/* ----------------- EXP / leveling ----------------- */
async function grantExp(amount){
  let lvl = Number(userData.level || 1);
  let xp  = Number(userData.exp || 0) + Number(amount || 0);
  let leveled = false;

  while (xp >= lvl * 100) { xp -= lvl * 100; lvl += 1; leveled = true; }
  userData.level = lvl; userData.exp = xp;
  await update(ref(db, `users/${uid}`), { level: lvl, exp: xp });

  if (leveled) {
    // optional: toast later
    // console.log('Level up to', lvl);
  }
}

/* ----------------- inventory render ----------------- */
function renderInventory(){
  const list = $('#invList');
  const empty = $('#invEmpty');
  if (!list || !empty) return;

  const items = Object.values(inventoryMap || {});
  if (!items.length) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  // newest first
  items.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  list.innerHTML = '';
  for (const item of items){
    const card = document.createElement('div');
    card.className = 'horse-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <div><strong>${prettyType(item.type)}</strong> <span class="pill">${escapeHtml(item.specialty)}</span></div>
          <div class="hint">Quality: <strong>${item.quality}</strong> • Durability: ${item.showsLeft} shows</div>
        </div>
        <div class="pill">#${String(item.id||'').slice(-6)}</div>
      </div>
    `;
    list.appendChild(card);
  }
}

/* ----------------- utilities ----------------- */
function prettyType(t){
  switch(t){
    case 'horse_boots': return 'Horse Boots';
    case 'horse_shoes': return 'Horse Shoes';
    default: return t ? t.charAt(0).toUpperCase()+t.slice(1) : '';
  }
}
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ----------------- quality odds line ----------------- */
function renderChances(){
  const lvl = Number(userData?.level || 1);
  const probs = qualityProbabilities(lvl);
  const line = probs.map(p => `${p.q} ${Math.round(p.p*100)}%`).join(' • ');
  $('#chanceLine')?.textContent = `Quality chances at your level (${lvl}): ${line}`;
}

