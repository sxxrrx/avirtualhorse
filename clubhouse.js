// clubhouse.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, push } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);

let uid = null;
let user = null;
let horses = [];
let riders = [];           // users/{uid}/riders (array of {id, name, level, exp, createdAt})
let assignments = {};      // users/{uid}/horseRiders (map: horseId -> 'player' | riderId)

onAuthStateChanged(auth, async (u) => {
  if (!u) return location.href = 'login.html';
  uid = u.uid;

  await loadAll();
  wireEvents();
  renderAll();
});

// ---- Load/Save ----
async function loadAll(){
  // user
  const us = await get(ref(db, `users/${uid}`));
  user = us.exists() ? us.val() : { coins:0, level:1, exp:0 };

  // horses
  const hs = await get(ref(db, `users/${uid}/horses`));
  horses = hs.exists() ? (Array.isArray(hs.val()) ? hs.val() : Object.values(hs.val())) : [];

  // riders (array or object)
  const rs = await get(ref(db, `users/${uid}/riders`));
  riders = rs.exists() ? (Array.isArray(rs.val()) ? rs.val() : Object.values(rs.val())) : [];

  // assignments
  const as = await get(ref(db, `users/${uid}/horseRiders`));
  assignments = as.exists() ? as.val() : {};
}

async function saveRiders(){ await set(ref(db, `users/${uid}/riders`), riders); }
async function saveAssignments(){ await set(ref(db, `users/${uid}/horseRiders`), assignments); }
async function saveUser(fields){ await update(ref(db, `users/${uid}`), fields); }

// ---- Render ----
function renderAll(){
  // profile
  $('#playerLevel').textContent = Number(user.level || 1);
  $('#playerExp').textContent   = Number(user.exp || 0);
  $('#playerCoins').textContent = Number(user.coins || 0).toLocaleString();

  // hire cost label
  $('#hireCostLabel').textContent = (eligibleForTopRider() ? 10_000_000 : 1_000_000).toLocaleString();

  // riders list
  const list = $('#riderList');
  const empty = $('#riderEmpty');
  if (!riders.length) {
    list.innerHTML = '';
    empty.style.display = '';
  } else {
    empty.style.display = 'none';
    list.innerHTML = '';
    riders.forEach(r => {
      const div = document.createElement('div');
      div.className = 'horse-card';
      div.innerHTML = `
        <div><strong>${escapeHtml(r.name || `Rider ${r.id?.slice(-4)||''}`)}</strong></div>
        <div class="hint">Level ${Number(r.level||1)} — EXP ${Number(r.exp||0)}</div>
        <div class="hint">ID: ${r.id}</div>
      `;
      list.appendChild(div);
    });
  }

  // rider select (training)
  const sel = $('#riderSelect');
  sel.innerHTML = '<option value="">— Select rider —</option>';
  riders.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name || 'Rider'} (Lv ${r.level})`;
    sel.appendChild(opt);
  });

  // horses select
  const hsel = $('#horseSelect');
  hsel.innerHTML = '<option value="">— Select horse —</option>';
  horses.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.id;
    opt.textContent = `${h.name} (${h.breed || '—'})`;
    hsel.appendChild(opt);
  });

  // assign select
  const asign = $('#assignSelect');
  asign.innerHTML = '<option value="player">Player (you)</option>';
  riders.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name || 'Rider'} (Lv ${r.level})`;
    asign.appendChild(opt);
  });

  // current assignments
  renderAssignments();
}

function renderAssignments(){
  const box = $('#assignments');
  box.innerHTML = '';
  if (!horses.length) {
    box.innerHTML = '<p class="hint">No horses.</p>';
    return;
  }
  horses.forEach(h => {
    const rid = assignments[h.id] || 'player';
    const label = rid === 'player'
      ? 'Player (you)'
      : (riders.find(r => r.id === rid)?.name || `Rider ${rid.slice(-4)}`);
    const div = document.createElement('div');
    div.className = 'horse-card';
    div.innerHTML = `
      <div><strong>${escapeHtml(h.name)}</strong></div>
      <div class="hint">Assigned Rider: ${escapeHtml(label)}</div>
    `;
    box.appendChild(div);
  });
}

// ---- Events ----
function wireEvents(){
  $('#btnTrainSelf').onclick = trainSelf;
  $('#btnPreviewHire').onclick = previewHire;
  $('#btnConfirmHire').onclick = confirmHire;
  $('#btnTrainRider').onclick = trainRider;
  $('#btnAssign').onclick = assignRider;
}

// ---- Self training ----
async function trainSelf(){
  const gain = randInt(25,100);
  await grantPlayerExp(gain);
  $('#msgSelf').textContent = `You completed a training session and gained ${gain} EXP.`;
  renderAll();
}

// ---- Hiring logic ----
function suggestedRiderLevel(lvl){
  if (lvl >= 300) return 300;
  if (lvl >= 200) return 250;
  if (lvl >= 100) return 175;
  if (lvl >= 50)  return 100;
  if (lvl >= 20)  return 40;
  return 10;
}
function eligibleForTopRider(){ return Number(user.level || 1) >= 300; }

function previewHire(){
  const pLvl = Number(user.level || 1);
  const rLvl = suggestedRiderLevel(pLvl);
  const cost = eligibleForTopRider() ? 10_000_000 : 1_000_000;

  $('#msgHire').textContent = `Offer: Rider Level ${rLvl} for ${cost.toLocaleString()} coins. Click “Hire Rider” to confirm.`;
  $('#btnConfirmHire').disabled = false;
}

async function confirmHire(){
  const pLvl = Number(user.level || 1);
  const rLvl = suggestedRiderLevel(pLvl);
  const cost = eligibleForTopRider() ? 10_000_000 : 1_000_000;

  if (eligibleForTopRider() && pLvl < 300) {
    $('#msgHire').textContent = 'You must be level 300 to hire a level 300 rider.';
    return;
  }
  if (Number(user.coins || 0) < cost) {
    $('#msgHire').textContent = 'Not enough coins.';
    return;
  }

  user.coins = Number(user.coins || 0) - cost;
  const rider = {
    id: `rider_${Date.now()}_${Math.floor(Math.random()*1000)}`,
    name: `Rider ${randInt(1000,9999)}`,
    level: rLvl,
    exp: 0,
    createdAt: Date.now()
  };
  riders.push(rider);

  await Promise.all([
    saveRiders(),
    saveUser({ coins: user.coins })
  ]);

  $('#msgHire').textContent = `Hired ${rider.name} (Lv ${rLvl}).`;
  $('#btnConfirmHire').disabled = true;
  // sync topbar coin counter if present
  const top = document.getElementById('coinCounter');
  if (top) top.textContent = `Coins: ${user.coins}`;
  renderAll();
}

// ---- Train hired rider ----
async function trainRider(){
  const id = $('#riderSelect').value;
  if (!id) { $('#msgTrainRider').textContent = 'Select a rider first.'; return; }
  const r = riders.find(x => x.id === id);
  if (!r) { $('#msgTrainRider').textContent = 'Rider not found.'; return; }

  const pGain = randInt(5,15);
  const rGain = randInt(25,50);

  await grantPlayerExp(pGain);
  await grantRiderExp(r, rGain);
  await saveRiders();

  $('#msgTrainRider').textContent = `You gained ${pGain} EXP. ${r.name} gained ${rGain} EXP.`;
  renderAll();
}

// ---- Assignment ----
async function assignRider(){
  const horseId = $('#horseSelect').value;
  const riderId = $('#assignSelect').value || 'player';
  if (!horseId) { $('#msgAssign').textContent = 'Select a horse.'; return; }

  // Rule: one NPC rider can ride one horse at a time.
  if (riderId !== 'player') {
    // ensure this rider isn't already assigned elsewhere
    for (const [hId, rid] of Object.entries(assignments)) {
      if (rid === riderId && hId !== horseId) {
        $('#msgAssign').textContent = 'That rider is already assigned to another horse.';
        return;
      }
    }
  }

  assignments[horseId] = riderId;
  await saveAssignments();
  $('#msgAssign').textContent = 'Rider assignment saved.';
  renderAssignments();
}

// ---- EXP / Leveling helpers ----
async function grantPlayerExp(amount){
  let lvl = Number(user.level || 1);
  let xp  = Number(user.exp || 0) + Number(amount || 0);
  let leveled = false;
  while (xp >= lvl * 100) { xp -= lvl * 100; lvl += 1; leveled = true; }
  user.level = lvl; user.exp = xp;
  await saveUser({ level: lvl, exp: xp });
}

async function grantRiderExp(rider, amount){
  rider.exp = Number(rider.exp || 0) + Number(amount || 0);
  let lvl = Number(rider.level || 1);
  while (rider.exp >= lvl * 100) { rider.exp -= lvl * 100; lvl += 1; }
  rider.level = lvl;
}

// ---- Utils ----
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
