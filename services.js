import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);

// ---- clock helpers ----
function currentGameHour(){
  const start = new Date(Date.UTC(2025,0,1)).getTime();
  return Math.floor((Date.now() - start) / (60 * 1000)); // 1 real min = 1 game hour
}
function currentGameDay(){ return Math.floor(currentGameHour()/24); }

// ---- state ----
let uid = null;
let userData = null;

// ---- boot ----
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  const us = await get(ref(db, `users/${uid}`));
  userData = us.exists() ? us.val() : {};
  const jobEl = $('currentJob');
  if (jobEl) jobEl.textContent = userData.job || 'Stablehand';

  // Wire job buttons + gating
  if ($('btnJobStablehand')) $('btnJobStablehand').onclick = () => switchJob('Stablehand');
  if ($('btnJobVet')) {
    $('btnJobVet').onclick = () => {
      if ((userData.level || 0) < 20) { alert('Vet Assistant requires Level 20.'); return; }
      switchJob('Vet Assistant');
    };
    // Visually disable if under-level
    if ((userData.level || 0) < 20) $('btnJobVet').disabled = true;
  }

  // Cooldown handling
  enforceCooldownUI();

  // Show appropriate queues
  if ((userData.job || 'Stablehand') === 'Vet Assistant') {
    showVet(true);  showStable(false); loadVetQueue();
  } else {
    showVet(false); showStable(true);  loadStablehandQueue();
  }
});

// ---- cooldown logic ----
function enforceCooldownUI(){
  const until = userData.jobSwitchUntilGameHour || 0;
  const nowH = currentGameHour();
  const inCooldown = nowH < until;
  const msg = $('jobCooldownMsg');
  if (msg) {
    msg.textContent = inCooldown ? `Job switch on cooldown: ${until - nowH} in-game hours remaining.` : '';
  }
  // disable both switch buttons if cooling down
  if ($('btnJobStablehand')) $('btnJobStablehand').disabled = inCooldown;
  if ($('btnJobVet'))        $('btnJobVet').disabled        = inCooldown || (userData.level||0) < 20;
}

async function switchJob(nextJob){
  const nowH = currentGameHour();
  const until = userData.jobSwitchUntilGameHour || 0;
  if (nowH < until) { alert(`You can switch jobs in ${until - nowH} in-game hours.`); return; }

  userData.job = nextJob;
  userData.jobSwitchUntilGameHour = nowH + 12; // 12-hour cooldown
  await update(ref(db, `users/${uid}`), {
    job: userData.job,
    jobSwitchUntilGameHour: userData.jobSwitchUntilGameHour
  });

  if ($('currentJob')) $('currentJob').textContent = userData.job;
  enforceCooldownUI();

  if (nextJob === 'Vet Assistant') { showVet(true);  showStable(false); loadVetQueue(); }
  else                              { showVet(false); showStable(true);  loadStablehandQueue(); }
}

function showVet(on){
  if ($('vetQueue')) $('vetQueue').style.display = on ? 'block' : 'none';
}
function showStable(on){
  if ($('stablehandQueue')) $('stablehandQueue').style.display = on ? 'block' : 'none';
}

// ================== VET QUEUE (existing, with payouts) ==================
async function loadVetQueue(){
  const list = $('requestList'); if (!list) return;
  list.innerHTML = 'Loading…';

  const s = await get(ref(db, 'serviceRequests'));
  const all = s.exists() ? s.val() : {};
  const reqs = Object.entries(all).map(([id, r]) => ({ id, ...r }))
                 .filter(r => r.role === 'vet' && r.status === 'pending');

  if (reqs.length === 0) { list.innerHTML = '<p>No pending vet requests.</p>'; return; }
  list.innerHTML = '';
  reqs.forEach(r=>{
    const div = document.createElement('div');
    div.className = 'horse-card';
    const ownerLink = `<a href="ranch-public.html?uid=${encodeURIComponent(r.ownerUid)}">${escapeHtml(r.ownerName || shortUid(r.ownerUid))}</a>`;
    div.innerHTML = `
      <p><strong>Type:</strong> ${escapeHtml(r.type)}</p>
      <p><strong>Horse:</strong> ${escapeHtml(r.horseName || r.horseId)}</p>
      <p><strong>Owner:</strong> ${ownerLink}</p>
      <p><strong>Due in:</strong> ${Math.max(0, (r.dueAtGameHour||0) - currentGameHour())} in-game hours</p>
      <button>Complete Now</button>
    `;
    div.querySelector('button').onclick = () => completeVetRequest(r);
    list.appendChild(div);
  });
}

async function completeVetRequest(r){
  // update horse records + pay Vet Assistant (75 coins + 75 EXP)
  const uRef = ref(db, `users/${r.ownerUid}`);
  const uSnap = await get(uRef);
  if (!uSnap.exists()) return;

  const owner = uSnap.val();
  const horses = Array.isArray(owner.horses) ? owner.horses : Object.values(owner.horses || {});
  const idx = horses.findIndex(h => h.id === r.horseId);
  if (idx === -1) return;

  const h = horses[idx];
  const today = currentGameDay();
  if (r.type === 'vet_shots')      h.lastVetShotsDay = today;
  if (r.type === 'vet_check')      h.lastVetCheckDay = today;
  if (r.type === 'breeding_check') h.lastBreedingCheckDay = today;

  await set(ref(db, `users/${r.ownerUid}/horses/${idx}`), h);

  // pay Vet Assistant
  const mySnap = await get(ref(db, `users/${uid}`));
  if (mySnap.exists()){
    const me = mySnap.val();
    await update(ref(db, `users/${uid}`), {
      coins: (me.coins || 0) + 75,
      exp:   (me.exp || 0) + 75
    });
  }

  await update(ref(db, `serviceRequests/${r.id}`), {
    status: 'completed',
    completedAtGameHour: currentGameHour(),
    completedByUid: uid
  });

  loadVetQueue();
}

function shortUid(u){ return (u||'').slice(0,6)+'…'; }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ================== STABLEHAND QUEUE (new) ==================
async function loadStablehandQueue(){
  const list = $('stableList'); if (!list) return;
  list.innerHTML = 'Loading…';

  const s = await get(ref(db, 'serviceRequests'));
  const all = s.exists() ? s.val() : {};
  const nowH = currentGameHour();
  // show pending feed/groom tasks
  const reqs = Object.entries(all).map(([id, r]) => ({ id, ...r }))
                 .filter(r => r.role === 'stablehand' && r.status === 'pending');

  if (reqs.length === 0) { list.innerHTML = '<p>No stablehand tasks at the moment.</p>'; return; }
  list.innerHTML = '';
  reqs.forEach(r=>{
    const div = document.createElement('div');
    div.className = 'horse-card';
    const ownerLink = `<a href="ranch-public.html?uid=${encodeURIComponent(r.ownerUid)}">${shortUid(r.ownerUid)}</a>`;
    div.innerHTML = `
      <p><strong>${r.type === 'feed_daily' ? 'Feed' : 'Groom'}</strong> — ${escapeHtml(r.horseName || r.horseId)}</p>
      <p><strong>Owner:</strong> ${ownerLink}</p>
      <p><strong>Due in:</strong> ${Math.max(0, (r.dueAtGameHour||nowH)-nowH)} in-game hours</p>
      <p class="muted">Payout: 25 coins • 25 EXP</p>
      <button>Complete Now</button>
    `;
    div.querySelector('button').onclick = () => completeStablehandTask(r);
    list.appendChild(div);
  });
}

async function completeStablehandTask(r){
  // Update owner's horse
  const uRef = ref(db, `users/${r.ownerUid}`);
  const uSnap = await get(uRef);
  if (!uSnap.exists()) return;

  const owner = uSnap.val();
  const horses = Array.isArray(owner.horses) ? owner.horses : Object.values(owner.horses || {});
  const idx = horses.findIndex(h => h.id === r.horseId);
  if (idx === -1) return;

  const h = horses[idx];
  if (r.type === 'feed_daily') {
    h.lastFedAt = Date.now();
  } else if (r.type === 'groom_daily') {
    const cur = Number(h.happiness || 0);
    h.happiness = Math.max(0, Math.min(100, cur + 20));
  }
  await set(ref(db, `users/${r.ownerUid}/horses/${idx}`), h);

  // Pay worker
  const mySnap = await get(ref(db, `users/${uid}`));
  if (mySnap.exists()){
    const me = mySnap.val();
    await update(ref(db, `users/${uid}`), {
      coins: (me.coins || 0) + 25,
      exp:   (me.exp || 0) + 25
    });
  }

  // Close this request
  await update(ref(db, `serviceRequests/${r.id}`), {
    status: 'completed',
    completedAtGameHour: currentGameHour(),
    completedByUid: uid
  });

  // Schedule the next day for this plan (if still active)
  const pRef = ref(db, `servicePlans/${r.planId}`);
  const pSnap = await get(pRef);
  if (pSnap.exists()){
    const p = pSnap.val();
    p.remainingDays = Math.max(0, (p.remainingDays || 0) - 1);
    p.nextDueGameHour = (p.nextDueGameHour || currentGameHour()) + 24;

    // If still before expiry and days remain, queue another task
    if ((p.expiresAtGameHour || 0) > currentGameHour() && p.remainingDays > 0) {
      await set(pRef, p);
      await enqueueNextStablehandTask(r.type, p);
    } else {
      p.status = 'expired';
      await set(pRef, p);
    }
  }

  loadStablehandQueue();
}

async function enqueueNextStablehandTask(kind, plan){
  const req = {
    role: 'stablehand',
    type: kind, // 'feed_daily' | 'groom_daily'
    ownerUid: plan.ownerUid,
    horseId: plan.horseId,
    horseName: plan.horseName,
    planId: plan.planType ? planId(plan.planType) : plan.planId, // tolerate either
    status: 'pending',
    postedAtGameHour: currentGameHour(),
    dueAtGameHour: plan.nextDueGameHour
  };
  const r = push(ref(db, 'serviceRequests'));
  await set(r, req);
}
