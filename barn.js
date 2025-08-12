// barn.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = (id) => document.getElementById(id);
const log = (...a)=>console.log('[barn]', ...a);
const err = (...a)=>console.error('[barn]', ...a);

// ---- State ----
let uid = null;
let userData = null;
let inventory = []; // array of tack items

// ---- Wire UI immediately (so tabs/craft button always work) ----
document.addEventListener('DOMContentLoaded', () => {
  log('DOM ready');
  wireTabs();
  wireButtons();
  // default tab
  setTab('workshop');
});

// ---- Auth/Data boot ----
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      location.href = 'login.html';
      return;
    }
    uid = user.uid;
    log('user', uid);

    const us = await get(ref(db, `users/${uid}`));
    if (!us.exists()) {
      alert('User not found.');
      return;
    }
    userData = us.val();

    // Load inventory/tack (supports array or object)
    const invSnap = await get(ref(db, `users/${uid}/inventory/tack`));
    if (invSnap.exists()) {
      const v = invSnap.val();
      inventory = Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {});
    } else {
      inventory = [];
    }

    renderChances();     // needs userData.level
    renderInventory();   // list current tack
  } catch (e) {
    err('boot failed', e);
    alert('Failed to load Barn. Check console for details.');
  }
});

// ---- Tabs ----
function wireTabs(){
  const w = $('#tabWorkshop');
  const i = $('#tabInventory');
  if (w) w.onclick = () => setTab('workshop');
  if (i) i.onclick = () => setTab('inventory');
}
function setTab(name){
  $('#tabWorkshop')?.classList.toggle('primary', name==='workshop');
  $('#tabInventory')?.classList.toggle('primary', name==='inventory');
  $('#secWorkshop')?.classList.toggle('active', name==='workshop');
  $('#secInventory')?.classList.toggle('active', name==='inventory');
}

// ---- Buttons ----
function wireButtons(){
  const craftBtn = $('#btnCraft');
  if (craftBtn) craftBtn.onclick = craft;
}

// ---- Crafting logic ----
const QUALITIES = ['Poor','Fair','Good','Very Good','Excellent','Divine'];

function qualityProbabilities(level){
  // mirrors your earlier curve
  if (level < 5)      return [{q:'Poor',       p:1.00}];
  if (level < 15)     return [{q:'Fair',       p:0.85},{q:'Poor',       p:0.15}];
  if (level < 30)     return [{q:'Good',       p:0.75},{q:'Fair',       p:0.15},{q:'Poor',       p:0.10}];
  if (level < 60)     return [{q:'Very Good',  p:0.60},{q:'Good',       p:0.20},{q:'Fair',       p:0.20}];
  if (level < 100)    return [{q:'Very Good',  p:0.85},{q:'Good',       p:0.15}];
  if (level < 200)    return [{q:'Excellent',  p:0.50},{q:'Very Good',  p:0.50}];
  if (level < 250)    return [{q:'Divine',     p:0.45},{q:'Excellent',  p:0.55}];
  return                    [{q:'Divine',     p:1.00}];
}
function durabilityFor(q){
  switch(q){
    case 'Poor': return 20;
    case 'Fair': return 50;
    case 'Good': return 80;
    case 'Very Good': return 120;
    case 'Excellent': return 250;
    case 'Divine': return 500;
    default: return 10;
  }
}
function expFor(q){
  switch(q){
    case 'Poor': return 10;
    case 'Fair': return 15;
    case 'Good': return 20;
    case 'Very Good': return randInt(25,30);
    case 'Excellent': return randInt(50,75);
    case 'Divine': return randInt(100,150);
    default: return 0;
  }
}
function renderChances(){
  const lvl = Number(userData?.level || 1);
  const probs = qualityProbabilities(lvl);
  const line = probs.map(p => `${p.q} ${Math.round(p.p*100)}%`).join(' • ');
  const el = $('#chanceLine');
  if (el) el.textContent = `Quality chances at your level (${lvl}): ${line}`;
}
function pickQuality(probs){
  const r = Math.random();
  let cum = 0;
  for (const p of probs) {
    cum += p.p;
    if (r <= cum) return p.q;
  }
  return probs[probs.length-1].q;
}
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function prettyType(t){
  switch(t){
    case 'horse_boots': return 'Horse Boots';
    case 'horse_shoes': return 'Horse Shoes';
    default: return t.charAt(0).toUpperCase()+t.slice(1);
  }
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// The craft button handler
async function craft(){
  try {
    if (!uid) { alert('Please wait, loading your profile…'); return; }

    const type = $('#tackType')?.value || '';
    const spec = $('#tackSpec')?.value || '';
    if (!type) return alert('Please select a tack type.');
    if (!spec) return alert('Please select a specialty.');

    const lvl = Number(userData?.level || 1);
    const q = pickQuality(qualityProbabilities(lvl));
    const uses = durabilityFor(q);
    const exp  = expFor(q);

    const item = {
      id: `tack_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      type,               // 'bridle' | 'saddle' | 'horse_boots' | 'horse_shoes'
      specialty: spec,    // 'Standard' | 'English' | 'Jumper' | 'Racing' | 'Western'
      quality: q,         // quality tier
      showsLeft: uses,    // durability
      createdAt: Date.now()
    };

    // append to inventory and persist
    inventory.push(item);
    await set(ref(db, `users/${uid}/inventory/tack`), inventory);

    // grant EXP (level threshold = level * 100)
    await grantExp(exp);

    // feedback + refresh
    const r = $('#craftResult');
    if (r) {
      r.innerHTML = `
        <div class="horse-card">
          Crafted <strong>${prettyType(type)}</strong> (${escapeHtml(spec)}) —
          <span class="pill">${q}</span> • Durability: ${uses} shows • +${exp} EXP
        </div>`;
    }
    renderInventory();
    renderChances();
    setTab('inventory'); // jump user to see their new item
  } catch (e) {
    err('craft failed', e);
    alert('Crafting failed. Check console for details.');
  }
}

// ---- EXP / Leveling (exp threshold = current level * 100) ----
async function grantExp(amount){
  try {
    const lvl0 = Number(userData?.level || 1);
    const xp0  = Number(userData?.exp || 0);

    let lvl = lvl0;
    let xp  = xp0 + Number(amount || 0);

    let leveled = false;
    while (xp >= lvl * 100) {
      xp -= lvl * 100;
      lvl += 1;
      leveled = true;
    }

    userData.level = lvl;
    userData.exp   = xp;
    await update(ref(db, `users/${uid}`), { level: lvl, exp: xp });

    log(`+${amount} EXP → level ${lvl}${leveled?' (level up!)':''}`);
  } catch (e) {
    err('grantExp failed', e);
  }
}

// ---- Inventory UI ----
function renderInventory(){
  const list = $('#invList');
  const empty = $('#invEmpty');
  if (!list || !empty) return;

  if (!inventory.length) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = '';
  inventory.slice().reverse().forEach(item => {
    const card = document.createElement('div');
    card.className = 'horse-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <div><strong>${prettyType(item.type)}</strong> <span class="pill">${escapeHtml(item.specialty)}</span></div>
          <div class="hint">Quality: <strong>${item.quality}</strong> • Durability: ${item.showsLeft} shows</div>
        </div>
        <div class="pill">#${String(item.id || '').slice(-6)}</div>
      </div>
    `;
    list.appendChild(card);
  });
}
