// player-rewards.js
import { db } from './firebase-init.js';
import {
  ref, get, set, update, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

// --- small helpers -------------------------------------------------

async function addCoins(uid, amount) {
  if (!amount) return null;
  await runTransaction(ref(db, `users/${uid}/coins`), cur => (Number(cur)||0) + amount);
  return `${amount.toLocaleString()} coins`;
}

async function addPasses(uid, amount) {
  if (!amount) return null;
  await runTransaction(ref(db, `users/${uid}/passes`), cur => (Number(cur)||0) + amount);
  return `${amount} passes`;
}

async function addTreats(uid, { carrots=0, apples=0, sugarCubes=0 } = {}) {
  const p = {};
  if (carrots)    p['inventory/treats/carrots']    = (cur) => (Number(cur)||0) + carrots;
  if (apples)     p['inventory/treats/apples']     = (cur) => (Number(cur)||0) + apples;
  if (sugarCubes) p['inventory/treats/sugarCubes'] = (cur) => (Number(cur)||0) + sugarCubes;

  const updates = {};
  // do individual transactions so we don't clobber other fields
  const txs = Object.entries(p).map(([path, fn]) =>
    runTransaction(ref(db, `users/${uid}/${path}`), cur => fn(cur))
  );
  await Promise.all(txs);

  const lines = [];
  if (carrots)    lines.push(`${carrots} carrots`);
  if (apples)     lines.push(`${apples} apples`);
  if (sugarCubes) lines.push(`${sugarCubes} sugar cubes`);
  return lines.join(', ');
}

async function addFeedLbs(uid, packId, lbs) {
  if (!packId || !lbs) return null;
  // your inventory feed shape is pounds keyed by feed pack id
  await runTransaction(ref(db, `users/${uid}/inventory/feed/${packId}`), cur => (Number(cur)||0) + lbs);
  // human label (keep in sync with your FEED_PACKS)
  const LABELS = {
    ado_premium: 'Adolescent Premium',
    adult_elite: 'Adult Elite'
  };
  const name = LABELS[packId] || packId;
  return `${lbs} lbs ${name} feed`;
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

/** Append 4 tack pieces (bridle, saddle, horse_shoes, horse_boots), Standard specialty. */
async function addTackSet(uid, quality='Good') {
  const items = ['bridle','saddle','horse_shoes','horse_boots'].map(type => ({
    id: `tack_${Date.now()}_${Math.floor(Math.random()*100000)}`,
    type,
    specialty: 'Standard',
    quality,
    showsLeft: durabilityFor(quality),
    createdAt: Date.now()
  }));

  const tackRef = ref(db, `users/${uid}/inventory/tack`);
  const snap = await get(tackRef);

  if (!snap.exists()) {
    await set(tackRef, items);
  } else {
    const cur = snap.val();
    const arr = Array.isArray(cur) ? cur.filter(Boolean) : Object.values(cur || {});
    arr.push(...items);
    await set(tackRef, arr);
  }

  return `1 full set of ${quality.toLowerCase()} Standard tack`;
}

async function addMagic(uid, key, amount=1) {
  await runTransaction(ref(db, `users/${uid}/inventory/magic/${key}`), cur => (Number(cur)||0) + amount);
  const LABELS = {
    magical_show_crop: "Magical Show Crop",
    dolos_staff: "Dolo's Staff",
    ceres_easy_breeding_charm: "Ceres’ Easy Breeding Charm",
    chronos_hourglass: "Chronos’ Hourglass",
    leucippus_gender_shift_token: "Leucippus’ Gender Shift Token",
    hebes_horseshoe: "Hebe’s Horseshoe"
  };
  return `${amount} × ${LABELS[key] || key}`;
}

async function addHorseSlot(uid) {
  await runTransaction(ref(db, `users/${uid}/horseSlots`), cur => (Number(cur)||1) + 1);
  return `+1 horse slot (you can own one more horse)`;
}

async function setUnlock(uid, path, value=true) {
  // path like "market.sell" or "shows.create"
  const parts = path.split('.');
  let obj = value;
  for (let i=parts.length-1;i>=0;i--) {
    obj = { [parts[i]]: obj };
  }
  await update(ref(db, `users/${uid}/unlocks`), obj);
  return `Unlocked: ${path.replace(/\./g,' › ')}`;
}

// --- main rewards switch -------------------------------------------

/**
 * Grants rewards for a given player level. Returns an array of human-readable lines.
 * This function only adds; it does not remove anything.
 */
export async function grantPlayerLevelRewards(uid, level) {
  const lines = [];

  // 1000 coins every level from 2..30 (inclusive)
  if (level >= 2 && level <= 30) {
    const l = await addCoins(uid, 1000);
    if (l) lines.push(l);
  }

  // +1 horse slot at each level 2..30 (inclusive)
  if (level >= 2 && level <= 30) {
    const l = await addHorseSlot(uid);
    if (l) lines.push(l);
  }

  // Level-specific extras
  switch (level) {
    case 3: {
      const l = await addTreats(uid, { carrots:100, apples:100, sugarCubes:50 });
      if (l) lines.push(l);
      break;
    }
    case 4: {
      const l = await addFeedLbs(uid, 'adult_elite', 2500);
      if (l) lines.push(l);
      break;
    }
    case 5: {
      const l1 = await setUnlock(uid, 'market.sell', true);
      const l2 = await setUnlock(uid, 'shows.create', true);
      const l3 = await addPasses(uid, 10);
      lines.push(l1, l2, l3);
      break;
    }
    case 6: {
      const u = await setUnlock(uid, 'magic_shop', true);
      const f = await addFeedLbs(uid, 'adult_elite', 1000);
      lines.push(u, f);
      break;
    }
    case 7: {
      const u = await setUnlock(uid, 'breeding', true);
      const m = await addMagic(uid, 'magical_show_crop', 1);
      lines.push(u, m);
      break;
    }
    case 8: {
      const u = await setUnlock(uid, 'coin_to_pass', true);
      lines.push(u);
      break;
    }
    case 9: {
      const t = await addTackSet(uid, 'Good');
      lines.push(t);
      break;
    }
    case 10: {
      const u = await setUnlock(uid, 'mail.send', true);
      lines.push(u);
      break;
    }
    case 11: {
      const p = await addPasses(uid, 10);
      lines.push(p);
      break;
    }
    case 12: {
      const m = await addMagic(uid, 'dolos_staff', 1);
      lines.push(m);
      break;
    }
    case 13: {
      const f = await addFeedLbs(uid, 'adult_elite', 2500);
      lines.push(f);
      break;
    }
    case 14: {
      const m = await addMagic(uid, 'ceres_easy_breeding_charm', 1);
      const f = await addFeedLbs(uid, 'ado_premium', 2500);
      lines.push(m, f);
      break;
    }
    case 15: {
      const u = await setUnlock(uid, 'clubhouse', true);
      const m = await addMagic(uid, 'chronos_hourglass', 1);
      lines.push(u, m);
      break;
    }
    case 16: {
      const l = await addTreats(uid, { carrots:200, apples:100, sugarCubes:50 });
      if (l) lines.push(l);
      break;
    }
    case 17: {
      const t = await addTackSet(uid, 'Good');
      lines.push(t);
      break;
    }
    case 18: {
      const m = await addMagic(uid, 'leucippus_gender_shift_token', 1);
      lines.push(m);
      break;
    }
    case 19: {
      const extra = await addCoins(uid, 1000); // +1000 more (so total 2000 that level)
      lines.push(extra);
      break;
    }
    case 20: {
      const u = await setUnlock(uid, 'jobs.vet_assistant', true);
      const p = await addPasses(uid, 30);
      lines.push(u, p);
      break;
    }
    case 21: {
      const m = await addMagic(uid, 'hebes_horseshoe', 1);
      lines.push(m);
      break;
    }
    case 22: {
      const a = await addFeedLbs(uid, 'ado_premium', 500);
      const b = await addFeedLbs(uid, 'adult_elite', 1000);
      lines.push(a, b);
      break;
    }
    case 23: {
      const t = await addTackSet(uid, 'Very Good');
      lines.push(t);
      break;
    }
    case 24: {
      const extra = await addCoins(uid, 1000); // +1000 more (so total 2000 that level)
      lines.push(extra);
      break;
    }
    case 25: {
      const u = await setUnlock(uid, 'clubhouse.hire_rider', true);
      const m = await addMagic(uid, 'magical_show_crop', 1);
      lines.push(u, m);
      break;
    }
    default:
      break;
  }

  // tidy null/undefined, flatten
  return (lines || []).filter(Boolean);
}
