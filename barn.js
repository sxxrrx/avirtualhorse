// barn.js
import { auth } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

import { loadTack, addTackItem } from './inventory.js';
import { craftTackItem, qualityProbabilities, prettyType } from './craft-tack.js';
import { grantPlayerXP, ensurePlayerProgress } from './player-level.js';

const $ = (id) => document.getElementById(id);
const log = (...a)=>console.log('[barn]', ...a);
const err = (...a)=>console.error('[barn]', ...a);

// ---- State ----
let uid = null;
let userData = null;
let inventory = []; // array of tack items

// ---- Ready helper ----
function onReady(fn){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once:true });
  } else {
    fn();
  }
}

// ---- UI init (tabs + buttons) ----
function initUI(){
  wireTabs();
  wireButtons();
  setTab('workshop');
  log('UI wired');
}
onReady(initUI);

// ---- Auth/Data boot ----
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) { location.href = 'login.html'; return; }
    uid = user.uid;

    // load minimal user (level used for chances)
    const us = await get(ref(window.db, `users/${uid}`)).catch(()=>null);
    if (us?.exists()) userData = us.val();
    else userData = { level: 1, exp: 0 };

    inventory = await loadTack(uid);

    renderChances();
    renderInventory();
  } catch (e) {
    err('boot failed', e);
    alert('Failed to load Barn. Check console for details.');
  }
});

// ---- Tabs ----
function wireTabs(){
  $('#tabWorkshop')?.addEventListener('click', () => setTab('workshop'));
  $('#tabInventory')?.addEventListener('click', () => {
    setTab('inventory');
    renderInventory(); // refresh
  });
}
function setTab(name){
  $('#tabWorkshop')?.classList.toggle('primary', name==='workshop');
  $('#tabInventory')?.classList.toggle('primary', name==='inventory');
  $('#secWorkshop')?.classList.toggle('active', name==='workshop');
  $('#secInventory')?.classList.toggle('active', name==='inventory');
}

// ---- Buttons ----
function wireButtons(){
  $('#btnCraft')?.addEventListener('click', craft);
}

// ---- Chances line ----
function renderChances(){
  const lvl = Number(userData?.level || 1);
  const probs = qualityProbabilities(lvl);
  const line = probs.map(p => `${p.q} ${Math.round(p.p*100)}%`).join(' • ');
  const el = $('#chanceLine');
  if (el) el.textContent = `Quality chances at your level (${lvl}): ${line}`;
}

// ---- Craft handler (now grants XP via player-level.js for rewards/mail) ----
async function craft(){
  try {
    if (!uid) { alert('Please wait, loading your profile…'); return; }

    const typeSel = $('#tackType');
    const specSel = $('#tackSpec');
    const type = (typeSel?.value || '').trim();
    const spec = (specSel?.value || '').trim();

    if (!type) { alert('Please select a tack type.'); typeSel?.focus(); return; }
    if (!spec) { alert('Please select a specialty.'); specSel?.focus(); return; }

    const lvl = Number(userData?.level || 1);
    const { item, exp, quality, uses } = craftTackItem(lvl, type, spec);

    // Save to inventory (array shape, as before)
    inventory = await addTackItem(uid, inventory, item);

    // IMPORTANT: Grant XP via shared player-level flow (rewards + mail)
    await ensurePlayerProgress(uid);
    await grantPlayerXP(uid, exp, 'craft_tack');

    // UI feedback + refresh
    const r = $('#craftResult');
    if (r) {
      r.innerHTML = `
        <div class="horse-card">
          Crafted <strong>${prettyType(type)}</strong> (${escapeHtml(spec)}) —
          <span class="pill">${quality}</span> • Durability: ${uses} shows • +${exp} XP
        </div>`;
    }
    renderInventory();
    renderChances();
    setTab('inventory');
  } catch (e) {
    err('craft failed', e);
    alert('Crafting failed. Check console for details.');
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
          <div class="hint">Quality: <strong>${escapeHtml(item.quality)}</strong> • Durability: ${Number(item.showsLeft||0)} shows</div>
        </div>
        <div class="pill">#${String(item.id || '').slice(-6)}</div>
      </div>
    `;
    list.appendChild(card);
  });
}

// ---- utils ----
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
