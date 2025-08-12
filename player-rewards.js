// player-rewards.js
import { db } from './firebase-init.js';
import {
  ref, get, set, update, runTransaction, push
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour, yearsToHours } from './time.js';

// ---------- helpers ----------
function nowGh(){ return currentGameHour(); }
function randId(prefix){ return `${prefix}_${Date.now()}_${Math.floor(Math.random()*1000)}`; }

// durability to match your barn.js
function durabilityForQuality(q){
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

// push a magic item in the same shape as store purchases (so your magic UI “just works”)
async function grantMagic(uid, { key, kind }) {
  // kind: 'duration'|'duration_one_horse'|'consumable_one_horse'|'permanent_one_horse'
  // durations per your magic catalog
  const durations = {
    magical_show_crop: yearsToHours(3),
    chronos_hourglass: yearsToHours(4),
    dolos_staff: yearsToHours(3),
    hebe_horseshoe: yearsToHours(1),
  };

  const invRef = ref(db, `users/${uid}/magicInventory`);
  const rec = {
    id: randId('magic'),
    key,
    purchasedAt: Date.now(),
    type: kind,
    data: {},
  };

  if (kind === 'duration' || kind === 'duration_one_horse') {
    rec.expiresAtGameHour = nowGh() + (durations[key] || 0);
    rec.boundHorseId = null;
  }
  if (kind === 'consumable_one_horse') {
    rec.usesRemaining = 1;
    rec.boundHorseId = null;
  }
  if (key === 'pouch_of_gold') {
    rec.lastClaimRealMs = 0; // not used here, but consistent
  }

  // append to array-like collection
  const snap = await get(invRef);
  let arr = snap.exists()
    ? (Array.isArray(snap.val()) ? snap.val() : Object.values(snap.val()))
    : [];
  arr.push(rec);
  await set(invRef, arr);
  return rec;
}

async function addTreats(uid, add){
  const tRef = ref(db, `users/${uid}/inventory/treats`);
  const snap = await get(tRef);
  const cur = snap.exists() ? snap.val() : {};
  const next = {
    carrots:    Number(cur.carrots||0)    + Number(add.carrots||0),
    apples:     Number(cur.apples||0)     + Number(add.apples||0),
    sugarCubes: Number(cur.sugarCubes||0) + Number(add.sugarCubes||0),
  };
  await set(tRef, next);
  return next;
}

async function addFeed(uid, feedMap){
  const fRef = ref(db, `users/${uid}/inventory/feed`);
  const snap = await get(fRef);
  const cur = snap.exists() ? snap.val() : {};
  const next = { ...cur };
  for (const [packId, lbs] of Object.entries(feedMap||{})) {
    next[packId] = Number(next[packId] || 0) + Number(lbs || 0);
  }
  await set(fRef, next);
  return next;
}

async function addTackSet(uid, { specialty='Standard', quality='Good' }){
  const tRef = ref(db, `users/${uid}/inventory/tack`);
  const snap = await get(tRef);
  let arr = snap.exists()
    ? (Array.isArray(snap.val()) ? snap.val() : Object.values(snap.val()))
    : [];

  const types = ['bridle','saddle','horse_shoes','horse_boots'];
  const showsLeft = durabilityForQuality(quality);
  const items = types.map(type => ({
    id: randId('tack'),
    type,
    specialty,
    quality,
    showsLeft,
    createdAt: Date.now()
  }));
  arr.push(...items);
  await set(tRef, arr);
  return items;
}

// stable slots: set to at least desiredSlots (idempotent & monotonic)
async function ensureStableSlots(uid, desiredSlots){
  const refSlots = ref(db, `users/${uid}/limits/stableSlots`);
  await runTransaction(refSlots, cur => {
    const curN = Number(cur || 1);
    return Math.max(curN, desiredSlots);
  });
}

// feature unlock flags (safe to call multiple times)
async function unlock(uid, flags){
  await update(ref(db, `users/${uid}/unlocks`), flags);
}

// coins / passes helpers (atomic)
async function addCoins(uid, n){
  await runTransaction(ref(db, `users/${uid}/coins`), cur => Number(cur||0) + Number(n||0));
}
async function addPasses(uid, n){
  await runTransaction(ref(db, `users/${uid}/passes`), cur => Number(cur||0) + Number(n||0));
}

// ---------- reward plan (levels 2–25) ----------
function planForLevel(level){
  const out = { coins: 0, passes: 0, treats: null, feed: null, tackSet: null, magic: [], unlocks: {}, stableSlots: null };

  // Base: +1000 coins per level up to 30
  if (level <= 30) out.coins += 1000;
  // Extra coins on 19 and 24 (+1000 more)
  if (level === 19 || level === 24) out.coins += 1000;

  // Stable-slot growth: from L2 onward, slots >= level (cap 30)
  if (level >= 2) out.stableSlots = Math.min(level, 30);

  switch(level){
    case 2:
      // unlock: second horse (via stableSlots=2) + 1000 coins (already added)
      break;

    case 3:
      // third horse (slots=3) + coins + treats bundle
      out.treats = { carrots:100, apples:100, sugarCubes:50 };
      break;

    case 4:
      out.feed   = { adult_elite: 2500 };
      break;

    case 5:
      out.unlocks = { marketSell: true, createShows: true };
      out.passes  = 10;
      break;

    case 6:
      out.unlocks = { magicShop: true };
      out.feed    = { adult_elite: 1000 };
      break;

    case 7:
      out.unlocks = { breeding: true };
      out.magic.push({ key: 'magical_show_crop', kind: 'duration' });
      break;

    case 8:
      out.unlocks = { conversion: true }; // coin→pass converter
      break;

    case 9:
      out.tackSet = { specialty:'Standard', quality:'Good' };
      break;

    case 10:
      out.unlocks = { mail: true };
      break;

    case 11:
      out.passes  = 10;
      break;

    case 12:
      out.magic.push({ key: 'dolos_staff', kind: 'duration_one_horse' });
      break;

    case 13:
      out.feed = { adult_elite: 2500 };
      break;

    case 14:
      out.magic.push({ key: 'ceres_easy_breeding', kind: 'consumable_one_horse' });
      out.feed = { ado_premium: 2500 };
      break;

    case 15:
      out.unlocks = { clubhouse: true }; // hiring rider still locked
      out.magic.push({ key: 'chronos_hourglass', kind: 'duration' });
      break;

    case 16:
      out.treats = { carrots:200, apples:100, sugarCubes:50 };
      break;

    case 17:
      out.tackSet = { specialty:'Standard', quality:'Good' };
      break;

    case 18:
      out.magic.push({ key: 'leucippus_shift', kind: 'consumable_one_horse' });
      break;

    case 19:
      // coins handled by base+extra
      break;

    case 20:
      out.unlocks = { vetAssistantJob: true };
      out.passes  = 30;
      break;

    case 21:
      out.magic.push({ key: 'hebe_horseshoe', kind: 'duration_one_horse' });
      break;

    case 22:
      out.feed = { ado_premium: 500, adult_elite: 1000 };
      break;

    case 23:
      out.tackSet = { specialty:'Standard', quality:'Very Good' };
      break;

    case 24:
      // coins handled by base+extra
      break;

    case 25:
      out.unlocks = { hireRider: true };
      out.magic.push({ key: 'magical_show_crop', kind: 'duration' });
      break;
    default:
      // no extra specifics
      break;
  }
  return out;
}

// ---------- public: idempotent level-reward grant ----------
export async function grantPlayerLevelRewards(uid, level){
  if (!uid || !Number.isFinite(level) || level < 1) return [];

  // idempotency flag
  const flagRef = ref(db, `users/${uid}/rewardGrants/levels/${level}`);
  const took = await runTransaction(flagRef, cur => (cur ? cur : true));
  if (!took.committed || took.snapshot.val() !== true) {
    return []; // already granted
  }

  const plan = planForLevel(level);
  const summary = [];

  // coins / passes
  if (plan.coins) {
    await addCoins(uid, plan.coins);
    summary.push({ type:'coins', amount: plan.coins });
  }
  if (plan.passes) {
    await addPasses(uid, plan.passes);
    summary.push({ type:'passes', amount: plan.passes });
  }

  // treats / feed
  if (plan.treats) {
    await addTreats(uid, plan.treats);
    summary.push({ type:'treats', ...plan.treats });
  }
  if (plan.feed) {
    await addFeed(uid, plan.feed);
    summary.push({ type:'feed', ...plan.feed });
  }

  // tack sets
  if (plan.tackSet) {
    const items = await addTackSet(uid, plan.tackSet);
    summary.push({ type:'tackSet', quality: plan.tackSet.quality, specialty: plan.tackSet.specialty, count: items.length });
  }

  // magic items
  for (const m of plan.magic) {
    const rec = await grantMagic(uid, m);
    summary.push({ type:'magic', key: rec.key, id: rec.id });
  }

  // stable slots
  if (plan.stableSlots) {
    await ensureStableSlots(uid, plan.stableSlots);
    summary.push({ type:'stableSlots', to: plan.stableSlots });
  }

  // unlock flags
  if (plan.unlocks && Object.keys(plan.unlocks).length) {
    await unlock(uid, plan.unlocks);
    summary.push({ type:'unlocks', ...plan.unlocks });
  }

  // notify
  await push(ref(db, `users/${uid}/notifications`), {
    type: 'level_rewards',
    at: Date.now(),
    level,
    details: summary
  });

  return summary;
}

// ---------- optional: grant arbitrary pack (daily/event) ----------
export async function grantOneOffReward(uid, reward, reason='one_off'){
  const summary = [];
  if (reward.coins) { await addCoins(uid, reward.coins); summary.push({type:'coins', amount:reward.coins}); }
  if (reward.passes){ await addPasses(uid, reward.passes); summary.push({type:'passes', amount:reward.passes}); }
  if (reward.treats){ await addTreats(uid, reward.treats); summary.push({type:'treats', ...reward.treats}); }
  if (reward.feed)  { await addFeed(uid, reward.feed);     summary.push({type:'feed', ...reward.feed}); }
  if (reward.tackSet){ const items = await addTackSet(uid, reward.tackSet); summary.push({type:'tackSet', count:items.length}); }
  if (reward.magic){
    for (const m of reward.magic) {
      const rec = await grantMagic(uid, m);
      summary.push({type:'magic', key: rec.key});
    }
  }
  if (reward.unlocks){ await unlock(uid, reward.unlocks); summary.push({type:'unlocks', ...reward.unlocks}); }
  if (reward.stableSlots){ await ensureStableSlots(uid, reward.stableSlots); summary.push({type:'stableSlots', to: reward.stableSlots}); }

  await push(ref(db, `users/${uid}/notifications`), {
    type:'reward',
    at: Date.now(),
    reason,
    details: summary
  });
  return summary;
}
