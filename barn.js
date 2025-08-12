// barn.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);

/* ---------------- state ---------------- */
let uid = null;
let userData = null;
let inventoryMap = {}; // { [id]: item }

/* -------------- wire tabs ASAP -------------- */
function wireStaticTabs(){
  const tw = $('#tabWorkshop');
  const ti = $('#tabInventory');
  if (tw && !tw._wired) { tw._wired = true; tw.addEventListener('click', ()=> setTab('workshop')); }
  if (ti && !ti._wired) { ti._wired = true; ti.addEventListener('click', ()=> setTab('inventory')); }
  // ensure default
  setTab('workshop');
}

// run now (even if DOM is already ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireStaticTabs, { once: true });
} else {
  wireStaticTabs();
}

/* -------------- auth / boot -------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = 'login.html');
  uid = user.uid;

  try {
    const us = await get(ref(db, `users/${uid}`));
    if (!us.exists()) { alert('User not found.'); return; }
    userData = us.val();

    // inventory: accept old array or new object
    const invSnap = await get(ref(db, `users/${uid}/inventory/tack`));
    if (!invSnap.exists()) {
      inventoryMap = {};
    } else {
      const v = invSnap.val();
      inventoryMap = Array.isArray(v)
        ? v.reduce((m, it, i) => { if (it) m[it.id || `legacy_${i}`] = it; return m; }, {})
        : (v || {});
    }

    // render & bind craft
    renderChances();
    renderInventory();
    const craftBtn = $('#btnCraft');
    if (craftBtn && !craftBtn._wired) {
      craftBtn._wired = true;
      craftBtn.addEventListener('click', craft);
    }
  } catch (e) {
    console.error('[barn] init failed', e);
    alert('Failed to load Barn data. Check console.');
  }
});

/* -------------- tabs -------------- */
function setTab(name){
  $('#tabWorkshop')?.classList.toggle('primary', name === 'workshop');
  $('#tabInventory')?.classList.toggle('primary', name === 'inventory');
  $('#secWorkshop')?.classList.toggle('active', name === 'workshop');
  $('#secInventory')?.classList.toggle('active', name === 'inventory');
}

/* -------------- quality / durability -------------- */
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

/* -------------- craft -------------- */
async function craft(){
  if (!uid || !userData) { alert('Still loading your profile… try again in a sec.'); return; }

  const type = $('#tackType')?.value || '';
  const spec = $('#tackSpec')?.value || '';
  if (!type) return alert('Please select a tack type.');
  if (!spec) return alert('Please select a specialty.');

  const lvl  = Number(userData.level || 1);
  const q    = pickQuality(qualityProbabilities(lvl));
  const uses = durabilityFor(q);
  const exp  = expFor(q);

  const id = `tack_${Date.now()}_${Math.floor(Math.random()*1000)}`;
  const item = {
    id,
    type,                 // 'bridle' | 'saddle' | 'horse_boots' | 'horse_shoes'
    specialty: spec,      // 'Standard' | 'English' | 'Jumper' | 'Racing' | 'Western'
    quality: q,
    showsLeft: uses,
    createdAt: Date.now()
  };

  try {
    // write as an object entry (no clobbering)
    await set(ref(db, `users/${uid}/inventory/tack/${id}`), item);
    inventoryMap[id] = item;

    await grantExp(exp);

    $('#craftResult').innerHTML = `
      <div class="horse-card">
        Crafted <strong>${prettyType(type)}</strong> (${escapeHtml(spec)}) —
        <span class="pill">${q}</span> • Durability: ${uses} shows • +${exp} EXP
      </div>
    `;
    renderInventory();
    renderChances();
    setTab('inventory');
    setTimeout(()=> document.querySelector('#invList .horse-card')?.scrollIntoView({behavior:'smooth'}), 30);
  } catch (e) {
    console.error('[barn] craft failed', e);
    alert('Craft failed. Check console for details.');
  }
}

/* -------------- EXP / leveling -------------- */
async function grantExp(amount){
  let lvl = Number(userData.level || 1);
  let xp  = Number(userData.exp || 0) + Number(amount || 0);
  let leveled = false;

  while (xp >= lvl * 100) { xp -= lvl * 100; lvl += 1; leveled = true; }
  userData.level = lvl; userData.exp = xp;
  await update(ref(db, `users/${uid}`), { level: lvl, exp: xp });
}

/* -------------- inventory render -------------- */
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
  items.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  list.innerHTML = '';
  for (const it of items){
    const card = document.createElement('div');
    card.className = 'horse-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <div><strong>${prettyType(it.type)}</strong> <span class="pill">${escapeHtml(it.specialty)}</span></div>
          <div class="hint">Quality: <strong>${it.quality}</strong> • Durability: ${it.showsLeft} shows</div>
        </div>
        <div class="pill">#${String(it.id||'').slice(-6)}</div>
      </div>
    `;
    list.appendChild(card);
  }
}

/* -------------- helpers -------------- */
function prettyType(t){
  switch(t){
    case 'horse_boots': return 'Horse Boots';
    case 'horse_shoes': return 'Horse Shoes';
    default: return t ? t.charAt(0).toUpperCase()+t.slice(1) : '';
  }
}
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* -------------- chances line -------------- */
function renderChances(){
  const lvl = Number(userData?.level || 1);
  const probs = qualityProbabilities(lvl);
  const line = probs.map(p => `${p.q} ${Math.round(p.p*100)}%`).join(' • ');
  $('#chanceLine')?.textContent = `Quality chances at your level (${lvl}): ${line}`;
}
