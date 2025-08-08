import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, push } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour, hoursToDays } from './time.js'; // ✅ centralized time

const $ = id => document.getElementById(id);

let uid = null;
let horseId = null;
let userData = null;
let horse = null;
let horses = [];

// Costs stay the same
const FEED_COST  = 300; // ~8 real days
const GROOM_COST = 150; // ~7 real days

// NEW: to actually be ~8/7 REAL DAYS with your 12h-per-game-day pacing,
// we need 16/14 GAME DAYS, not 8/7.
const FEED_DAYS  = 16; // ≈ 8 real days
const GROOM_DAYS = 14; // ≈ 7 real days

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  const params = new URLSearchParams(location.search);
  horseId = params.get('id');
  if (!horseId) {
    document.querySelector('.main-content').innerHTML = '<p>No horse specified.</p>';
    return;
  }

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) { alert('User not found.'); return; }
  userData = us.val();
  horses = Array.isArray(userData.horses) ? userData.horses : Object.values(userData.horses || {});
  horse = horses.find(h => h?.id === horseId);
  if (!horse) {
    document.querySelector('.main-content').innerHTML = '<p>Horse not found.</p>';
    return;
  }

  renderHead();
  await renderPlans();

  $('#btnStartFeed').onclick  = startFeedPlan;
  $('#btnStartGroom').onclick = startGroomPlan;
  $('#btnShots').onclick      = () => scheduleVet('vet_shots', 15);
  $('#btnVetCheck').onclick   = () => scheduleVet('vet_check', 20);
  $('#btnBreedCheck').onclick = () => scheduleVet('breeding_check', 50);
});

function renderHead(){
  const title = `${horse.name || 'Horse'} — Services`;
  $('#horseTitle').textContent = title;

  const retired = !!horse.retired;
  $('#retiredNote').style.display = retired ? 'block' : 'none';
  ['btnStartFeed','btnStartGroom','btnShots','btnVetCheck','btnBreedCheck'].forEach(id=>{
    const el=$(id); if (el) el.disabled = retired;
  });
}

function planId(kind){ return `${uid}_${horse.id}_${kind}`; }

async function renderPlans(){
  await renderFeedPlan();
  await renderGroomPlan();
}

async function renderFeedPlan(){
  const pRef = ref(db, `servicePlans/${planId('feed')}`);
  const snap = await get(pRef);
  const nowH = currentGameHour();

  if (!snap.exists()) {
    $('#feedPlanStatus').textContent = 'No active plan.';
    return;
  }
  const plan = snap.val();
  const remainingH = (plan.expiresAtGameHour ?? 0) - nowH;
  if (remainingH <= 0) {
    $('#feedPlanStatus').textContent = 'Expired.';
    return;
  }
  const leftDays = hoursToDays(remainingH);
  $('#feedPlanStatus').textContent = `Active — ${leftDays} day(s) remaining. Next due at game hour ${plan.nextDueGameHour}.`;
}

async function renderGroomPlan(){
  const pRef = ref(db, `servicePlans/${planId('groom')}`);
  const snap = await get(pRef);
  const nowH = currentGameHour();

  if (!snap.exists()) {
    $('#groomPlanStatus').textContent = 'No active plan.';
    return;
  }
  const plan = snap.val();
  const remainingH = (plan.expiresAtGameHour ?? 0) - nowH;
  if (remainingH <= 0) {
    $('#groomPlanStatus').textContent = 'Expired.';
    return;
  }
  const leftDays = hoursToDays(remainingH);
  $('#groomPlanStatus').textContent = `Active — ${leftDays} day(s) remaining. Next due at game hour ${plan.nextDueGameHour}.`;
}

async function startFeedPlan(){
  if (horse.retired) return;
  if ((userData.coins || 0) < FEED_COST) return alert('Not enough coins (300).');

  const nowH = currentGameHour();
  const p = {
    planType: 'feed',
    ownerUid: uid,
    horseId: horse.id,
    horseName: horse.name || 'Horse',
    startedAtGameHour: nowH,
    expiresAtGameHour: nowH + FEED_DAYS * 24,
    nextDueGameHour: nowH,
    remainingDays: FEED_DAYS,
    status: 'active'
  };

  userData.coins = (userData.coins || 0) - FEED_COST;
  await update(ref(db, `users/${uid}`), { coins: userData.coins });
  await set(ref(db, `servicePlans/${planId('feed')}`), p);

  await enqueueStablehandTask('feed_daily', p);

  alert('Feeding plan started!');
  await renderFeedPlan();
  $('#coinCounter')?.textContent = `Coins: ${Number(userData.coins||0).toLocaleString()}`;
}

async function startGroomPlan(){
  if (horse.retired) return;
  if ((userData.coins || 0) < GROOM_COST) return alert('Not enough coins (150).');

  const nowH = currentGameHour();
  const p = {
    planType: 'groom',
    ownerUid: uid,
    horseId: horse.id,
    horseName: horse.name || 'Horse',
    startedAtGameHour: nowH,
    expiresAtGameHour: nowH + GROOM_DAYS * 24,
    nextDueGameHour: nowH,
    remainingDays: GROOM_DAYS,
    status: 'active'
  };

  userData.coins = (userData.coins || 0) - GROOM_COST;
  await update(ref(db, `users/${uid}`), { coins: userData.coins });
  await set(ref(db, `servicePlans/${planId('groom')}`), p);

  await enqueueStablehandTask('groom_daily', p);

  alert('Grooming plan started!');
  await renderGroomPlan();
  $('#coinCounter')?.textContent = `Coins: ${Number(userData.coins||0).toLocaleString()}`;
}

async function enqueueStablehandTask(kind, plan){
  const req = {
    role: 'stablehand',
    type: kind,
    ownerUid: plan.ownerUid,
    horseId: plan.horseId,
    horseName: plan.horseName,
    planId: planId(kind === 'feed_daily' ? 'feed' : 'groom'),
    status: 'pending',
    postedAtGameHour: currentGameHour(),
    dueAtGameHour: plan.nextDueGameHour
  };
  const r = push(ref(db, 'serviceRequests'));
  await set(r, req);
}

async function scheduleVet(type, cost){
  if (horse.retired) return;
  if ((userData.coins || 0) < cost) { $('#vetMsg').textContent = 'Not enough coins.'; return; }

  userData.coins -= cost;
  await update(ref(db, `users/${uid}`), { coins: userData.coins });

  const req = {
    role: 'vet',
    type,
    ownerUid: uid,
    horseId: horse.id,
    horseName: horse.name || 'Horse',
    status: 'pending',
    postedAtGameHour: currentGameHour(),
    dueAtGameHour: currentGameHour() + 24
  };
  const r = push(ref(db, 'serviceRequests'));
  await set(r, req);

  $('#vetMsg').textContent = 'Vet request scheduled!';
}
