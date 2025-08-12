// player-rewards.js
import { db } from './firebase-init.js';
import { ref, get, set, update, push } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour, yearsToHours } from './time.js';

// --- helpers ---
function ensure(obj, path, initVal) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cur[k] = cur[k] ?? {};
    cur = cur[k];
  }
  const leaf = parts[parts.length - 1];
  cur[leaf] = cur[leaf] ?? initVal;
  return cur[leaf];
}

function add(obj, path, inc) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cur[k] = cur[k] ?? {};
    cur = cur[k];
  }
  const leaf = parts[parts.length - 1];
  cur[leaf] = Number(cur[leaf] || 0) + Number(inc || 0);
}

function qualityDurability(q) {
  switch (q) {
    case 'Poor': return 20;
    case 'Fair': return 50;
    case 'Good': return 80;
    case 'Very Good': return 120;
    case 'Excellent': return 250;
    case 'Divine': return 500;
    default: return 10;
  }
}

function makeTackSet(quality = 'Good', specialty = 'Standard') {
  const showsLeft = qualityDurability(quality);
  const ts = Date.now();
  const suffix = () => `${ts}_${Math.floor(Math.random()*1000)}`;
  return [
    { id: `tack_${suffix()}`, type:'bridle',      specialty, quality, showsLeft, createdAt: ts },
    { id: `tack_${suffix()}`, type:'saddle',      specialty, quality, showsLeft, createdAt: ts },
    { id: `tack_${suffix()}`, type:'horse_shoes', specialty, quality, showsLeft, createdAt: ts },
    { id: `tack_${suffix()}`, type:'horse_boots', specialty, quality, showsLeft, createdAt: ts },
  ];
}

// map magic keys to type/duration so they render correctly in magic.js
const MAGIC_META = {
  'magical_show_crop':   { type: 'duration',          years: 3 },
  'chronos_hourglass':   { type: 'duration',          years: 4 },
  'dolos_staff':         { type: 'duration_one_horse', years: 3 },
  'ceres_easy_breeding': { type: 'consumable_one_horse', years: 0 },
  'leucippus_shift':     { type: 'consumable_one_horse', years: 0 },
  'hebe_horseshoe':      { type: 'duration_one_horse', years: 1 },
};

// award one magic item by key (matches magic.js CATALOG keys)
async function awardMagicItem(uid, key) {
  const meta = MAGIC_META[key] || { type: 'consumable_one_horse', years: 0 };
  const invRef = push(ref(db, `users/${uid}/magicInventory`));
  const payload = {
    id: invRef.key,
    key,
    purchasedAt: Date.now(),
    type: meta.type,
    boundHorseId: null
  };
  if (meta.type === 'duration' || meta.type === 'duration_one_horse') {
    payload.expiresAtGameHour = currentGameHour() + yearsToHours(meta.years || 0);
  }
  if (meta.type === 'consumable_one_horse' || meta.type === 'permanent_one_horse') {
    payload.usesRemaining = 1;
  }
  await set(invRef, payload);
}

// idempotency flag path
function rewardFlagPath(level) {
  return `rewardFlags/level_${level}`;
}

/**
 * Grants level rewards exactly once and returns an array of human-readable lines
 * describing what the player got at that level.
 */
export async function grantPlayerLevelRewards(uid, level) {
  if (!uid || level < 2) return [];

  // read user once
  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) return [];
  const user = us.val();

  // skip if already granted
  if (user.rewardFlags && user.rewardFlags[`level_${level}`]) return [];

  // we’ll accumulate a patch and then one update()
  const patch = {};
  const rewardsLines = [];

  // ensure structures in a local copy we’ll merge back
  const inventory = user.inventory || {};
  inventory.treats = inventory.treats || {};
  inventory.feed   = inventory.feed   || {};
  let tackArray    = Array.isArray(inventory.tack) ? inventory.tack.slice() : [];

  // ---- global “every level 2–30 gets 1000 coins” rule ----
  if (level >= 2 && level <= 30) {
    add(patch, 'coins', 1000);
    rewardsLines.push('+1,000 coins');
  }
  // extra coins at 19 and 24
  if (level === 19 || level === 24) {
    add(patch, 'coins', 1000);
    rewardsLines.push('+1,000 bonus coins');
  }

  // ---- horse slot unlock (level => slots up to 30) ----
  if (level >= 2 && level <= 30) {
    const currentSlots = Number(user.maxHorses || 1);
    const targetSlots = Math.max(currentSlots, Math.min(level, 30));
    patch.maxHorses = targetSlots;
    rewardsLines.push(`Stable capacity increased to ${targetSlots} horse(s)`);
  }

  // ---- per-level specifics ----
  switch (level) {
    case 3:
      // treats
      add(inventory, 'treats.carrots',    100);
      add(inventory, 'treats.apples',     100);
      add(inventory, 'treats.sugarCubes', 50);
      rewardsLines.push('Treats: +100 Carrots, +100 Apples, +50 Sugar Cubes');
      break;

    case 4:
      add(inventory, 'feed.adult_elite', 2500);
      rewardsLines.push('Feed: +2,500 lbs Adult Elite');
      break;

    case 5:
      // unlocks + passes
      patch.unlocks = { ...(user.unlocks||{}), canSell:true, canCreateShows:true };
      add(patch, 'passes', 10);
      rewardsLines.push('Unlocked: Sell in Market, Create Shows', '+10 passes');
      break;

    case 6:
      patch.unlocks = { ...(user.unlocks||{}), magicShop:true };
      add(inventory, 'feed.adult_elite', 1000);
      rewardsLines.push('Unlocked: Magic Shop', 'Feed: +1,000 lbs Adult Elite');
      break;

    case 7:
      patch.unlocks = { ...(user.unlocks||{}), canBreed:true };
      await awardMagicItem(uid, 'magical_show_crop');
      rewardsLines.push('Unlocked: Breeding', 'Magic: Magical Show Crop');
      break;

    case 8:
      patch.unlocks = { ...(user.unlocks||{}), converter:true };
      rewardsLines.push('Unlocked: Coin → Pass conversion');
      break;

    case 9: {
      const set = makeTackSet('Good', 'Standard');
      tackArray = tackArray.concat(set);
      rewardsLines.push('Tack: Full Good Standard set');
      break;
    }

    case 10:
      patch.unlocks = { ...(user.unlocks||{}), canSendMail:true };
      rewardsLines.push('Unlocked: Send Mail');
      break;

    case 11:
      add(patch, 'passes', 10);
      rewardsLines.push('+10 passes');
      break;

    case 12:
      await awardMagicItem(uid, 'dolos_staff');
      rewardsLines.push('Magic: Dolos’ Staff');
      break;

    case 13:
      add(inventory, 'feed.adult_elite', 2500);
      rewardsLines.push('Feed: +2,500 lbs Adult Elite');
      break;

    case 14:
      await awardMagicItem(uid, 'ceres_easy_breeding');
      add(inventory, 'feed.ado_premium', 2500);
      rewardsLines.push('Magic: Ceres’ Easy Breeding Token', 'Feed: +2,500 lbs Adolescent Premium');
      break;

    case 15:
      patch.unlocks = { ...(user.unlocks||{}), clubhouse:true };
      await awardMagicItem(uid, 'chronos_hourglass');
      rewardsLines.push('Unlocked: Clubhouse', 'Magic: Chronos Rider Hourglass');
      break;

    case 16:
      add(inventory, 'treats.carrots',    200);
      add(inventory, 'treats.apples',     100);
      add(inventory, 'treats.sugarCubes', 50);
      rewardsLines.push('Treats: +200 Carrots, +100 Apples, +50 Sugar Cubes');
      break;

    case 17: {
      const set = makeTackSet('Good', 'Standard');
      tackArray = tackArray.concat(set);
      rewardsLines.push('Tack: Full Good Standard set');
      break;
    }

    case 18:
      await awardMagicItem(uid, 'leucippus_shift');
      rewardsLines.push('Magic: Leucippus’ Gender Shift');
      break;

    case 20:
      patch.unlocks = { ...(user.unlocks||{}), canBeVetAssistant:true };
      add(patch, 'passes', 30);
      rewardsLines.push('Unlocked: Vet Assistant job', '+30 passes');
      break;

    case 21:
      await awardMagicItem(uid, 'hebe_horseshoe');
      rewardsLines.push('Magic: Hebe’s Horseshoe');
      break;

    case 22:
      add(inventory, 'feed.ado_premium',  500);
      add(inventory, 'feed.adult_elite', 1000);
      rewardsLines.push('Feed: +500 lbs Adolescent Premium, +1,000 lbs Adult Elite');
      break;

    case 23: {
      const set = makeTackSet('Very Good', 'Standard');
      tackArray = tackArray.concat(set);
      rewardsLines.push('Tack: Full Very Good Standard set');
      break;
    }

    case 25:
      patch.unlocks = { ...(user.unlocks||{}), canHireRider:true };
      await awardMagicItem(uid, 'magical_show_crop');
      rewardsLines.push('Unlocked: Hire Rider', 'Magic: Magical Show Crop');
      break;

    default:
      // nothing extra for other levels (besides coins + slots)
      break;
  }

  // write inventory/tack changes
  patch.inventory = {
    ...(user.inventory || {}),
    treats: { ...(user.inventory?.treats || {}), ...(inventory.treats || {}) },
    feed:   { ...(user.inventory?.feed   || {}), ...(inventory.feed   || {}) },
    tack:   tackArray
  };

  // set idempotency flag
  patch[rewardFlagPath(level)] = true;

  // persist
  await update(ref(db, `users/${uid}`), patch);

  return rewardsLines;
}
