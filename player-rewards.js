// player-rewards.js
import { db } from './firebase-init.js';
import { ref, get, update, push, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { sendSystemMail } from './mail-utils.js';

// Helper: add coins / passes safely
async function addWallet(uid, deltaCoins = 0, deltaPasses = 0){
  const uref = ref(db, `users/${uid}`);
  const snap = await get(uref);
  if (!snap.exists()) return { coins:0, passes:0 };
  const u = snap.val() || {};
  const coins = Number(u.coins || 0) + Number(deltaCoins || 0);
  const passes = Number(u.passes || 0) + Number(deltaPasses || 0);
  await update(uref, { coins, passes });
  return { coins, passes };
}

// Helper: add items to inventory
async function addInventory(uid, patch){
  // patch like: { treats: {carrots: +100}, feed: {adult_elite: +2500}, tackSets: [ {...}, ... ] }
  const invRef = ref(db, `users/${uid}/inventory`);
  const snap = await get(invRef);
  const inv = snap.exists() ? (snap.val() || {}) : {};

  // treats/feed/tack arrays tolerated whether existing or not
  inv.treats ||= {};
  inv.feed   ||= {};
  inv.tack   ||= []; // individual items list
  inv.tackSets ||= []; // optional: grouped “sets” list

  // treats
  if (patch?.treats){
    for (const [k, v] of Object.entries(patch.treats)) {
      inv.treats[k] = Number(inv.treats[k] || 0) + Number(v || 0);
    }
  }
  // feed (use your ids)
  if (patch?.feed){
    for (const [k, v] of Object.entries(patch.feed)) {
      inv.feed[k] = Number(inv.feed[k] || 0) + Number(v || 0);
    }
  }
  // tack items
  if (Array.isArray(patch?.tackItems) && patch.tackItems.length){
    inv.tack.push(...patch.tackItems);
  }
  // tack sets (if you want to group)
  if (Array.isArray(patch?.tackSets) && patch.tackSets.length){
    inv.tackSets.push(...patch.tackSets);
  }

  await set(invRef, inv);
}

// One helper to build a “Good/Very Good” full set
function fullTackSet(quality = 'Good', specialty = 'Standard'){
  const id = () => `tack_${Date.now()}_${Math.floor(Math.random()*1000)}`;
  const showsFor = q => (
    q === 'Very Good' ? 120 :
    q === 'Excellent' ? 250 :
    q === 'Divine' ? 500 :
    q === 'Good' ? 80 :
    q === 'Fair' ? 50 : 20
  );

  const s = (specialty || 'Standard');
  const q = (quality || 'Good');

  return [
    { id:id(), type:'bridle',      specialty:s, quality:q, showsLeft:showsFor(q), createdAt:Date.now() },
    { id:id(), type:'saddle',      specialty:s, quality:q, showsLeft:showsFor(q), createdAt:Date.now() },
    { id:id(), type:'horse_shoes', specialty:s, quality:q, showsLeft:showsFor(q), createdAt:Date.now() },
    { id:id(), type:'horse_boots', specialty:s, quality:q, showsLeft:showsFor(q), createdAt:Date.now() },
  ];
}

// ------- Rewards table (2..25) -------
function rewardsForLevel(level){
  switch(level){
    case 2:  return { coins:1000, unlock:['buy_second_horse'] };
    case 3:  return { coins:1000, treats:{carrots:100, apples:100, sugarCubes:50}, unlock:['buy_third_horse'] };
    case 4:  return { coins:1000, feed:{ adult_elite:2500 } };
    case 5:  return { passes:10,   unlock:['market_sell','create_shows'] };
    case 6:  return { feed:{ adult_elite:1000 }, unlock:['magic_shop'] };
    case 7:  return { magic:['magical_show_crop'], unlock:['breeding'] };
    case 8:  return { unlock:['coin_to_pass'] };
    case 9:  return { tackItems: fullTackSet('Good','Standard') };
    case 10: return { unlock:['send_mail'] };
    case 11: return { passes:10 };
    case 12: return { magic:['dolos_staff'] };
    case 13: return { feed:{ adult_elite:2500 } };
    case 14: return { magic:['ceres_easy_breeding'], feed:{ ado_premium:2500 } };
    case 15: return { magic:['chronos_hourglass'], unlock:['clubhouse'] };
    case 16: return { treats:{carrots:200, apples:100, sugarCubes:50} };
    case 17: return { tackItems: fullTackSet('Good','Standard') };
    case 18: return { magic:['leucippus_shift'] };
    case 19: return { coins:2000 }; // (1000 base + 1000 additional)
    case 20: return { passes:30, unlock:['vet_job'] };
    case 21: return { magic:['hebe_horseshoe'] };
    case 22: return { feed:{ ado_premium:500, adult_elite:1000 } };
    case 23: return { tackItems: fullTackSet('Very Good','Standard') };
    case 24: return { coins:2000 }; // (1000 base + 1000 additional)
    case 25: return { magic:['magical_show_crop'], unlock:['hire_rider'] };
    default:
      // Level 4..30: add 1000 coins baseline if that rule should apply every level
      if (level >= 4 && level <= 30) return { coins:1000 };
      return null;
  }
}

/**
 * Grant rewards for a specific level and mail the player. Returns an array of text lines describing rewards.
 */
export async function grantPlayerLevelRewards(uid, level){
  const pack = rewardsForLevel(level);
  if (!pack) return [];

  const lines = [];

  // coins/passes
  if (pack.coins || pack.passes){
    const res = await addWallet(uid, pack.coins||0, pack.passes||0);
    if (pack.coins)  lines.push(`Coins +${Number(pack.coins).toLocaleString()}`);
    if (pack.passes) lines.push(`Passes +${Number(pack.passes).toLocaleString()}`);
  }

  // inventory (treats / feed / tack)
  if (pack.treats || pack.feed || pack.tackItems){
    await addInventory(uid, { treats:pack.treats, feed:pack.feed, tackItems:pack.tackItems });
    if (pack.treats){
      const t = pack.treats;
      if (t.carrots)     lines.push(`Carrots ×${t.carrots}`);
      if (t.apples)      lines.push(`Apples ×${t.apples}`);
      if (t.sugarCubes)  lines.push(`Sugar Cubes ×${t.sugarCubes}`);
    }
    if (pack.feed){
      for (const [k,v] of Object.entries(pack.feed)) lines.push(`${prettyFeed(k)} +${v} lbs`);
    }
    if (pack.tackItems)  lines.push(`Full set of ${guessQuality(pack.tackItems)} ${guessSpec(pack.tackItems)} tack`);
  }

  // magic items (as entries in magicInventory)
  if (Array.isArray(pack.magic) && pack.magic.length){
    for (const key of pack.magic){
      const idRef = push(ref(db, `users/${uid}/magicInventory`));
      await set(idRef, {
        id: idRef.key, key, type: 'reward', purchasedAt: Date.now(), fromLevel: level
      });
      lines.push(prettyMagic(key));
    }
  }

  // unlock flags
  if (Array.isArray(pack.unlock) && pack.unlock.length){
    const flags = {};
    pack.unlock.forEach(k => flags[k] = true);
    await update(ref(db, `users/${uid}/unlocks`), flags);
    lines.push(...pack.unlock.map(k => `Unlocked: ${prettyUnlock(k)}`));
  }

  // mail the player
  const subject = `Level Up! You reached Level ${level}`;
  const body = lines.length
    ? `Congrats on reaching Level ${level}!\n\nRewards:\n- ${lines.join('\n- ')}\n\nEnjoy!`
    : `Congrats on reaching Level ${level}!`;
  await sendSystemMail(uid, subject, body);

  return lines;
}

/* ---------- tiny formatters ---------- */
function prettyFeed(k){
  return {
    ado_basic:'Adolescent Basic', ado_premium:'Adolescent Premium',
    adult_basic:'Adult Basic', adult_prem:'Adult Premium',
    adult_elite:'Adult Elite', senior:'Senior'
  }[k] || k;
}
function prettyMagic(k){
  return {
    magical_show_crop:'Magical Show Crop',
    chronos_hourglass:"Chronos Rider Hourglass",
    ceres_easy_breeding:"Ceres’ Easy Breeding Token",
    leucippus_shift:"Leucippus’ Gender Shift",
    hebe_horseshoe:"Hebe’s Horseshoe",
    dolos_staff:"Dolos’ Staff"
  }[k] || k;
}
function prettyUnlock(k){
  return {
    buy_second_horse:'Buy a 2nd horse',
    buy_third_horse:'Buy a 3rd horse',
    market_sell:'Market (sell tab)',
    create_shows:'Create Shows',
    magic_shop:'Magic Shop',
    breeding:'Breeding',
    coin_to_pass:'Coin→Pass Converter',
    send_mail:'Mail (send)',
    clubhouse:'Clubhouse',
    vet_job:'Vet Assistant job',
    hire_rider:'Hire a rider'
  }[k] || k;
}
function guessQuality(items){
  const q = items?.[0]?.quality || 'Good';
  return q;
}
function guessSpec(items){
  const s = items?.[0]?.specialty || 'Standard';
  return s;
}
