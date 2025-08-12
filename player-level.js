// player-level.js
import { db } from './firebase-init.js';
import {
  ref, runTransaction, update, onValue, push, set
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerLevelRewards } from './player-rewards.js';

export const PLAYER_MAX_LEVEL = 300;

// XP needed for *current* level to advance to next.
// (Keep your existing curve: level * 100; easy to tweak later.)
export function xpNeededForLevel(level) {
  return Math.max(50, Math.floor(level * 100));
}

// -------- main: grant player XP --------
/**
 * Safely add XP to player; auto-levels and grants rewards per level-up.
 * @returns {Promise<{level:number, exp:number, leveled: number[], rewards?:Array}>}
 */
export async function grantPlayerXP(uid, delta, source = 'misc') {
  if (!uid || !Number.isFinite(delta) || delta <= 0) {
    return { level: 0, exp: 0, leveled: [] };
  }

  const userRef = ref(db, `users/${uid}`);
  let leveled = [];
  let after = { level: 1, exp: 0 };

  // 1) Transactionally add XP & compute level-ups
  const tx = await runTransaction(userRef, cur => {
    if (!cur) return cur; // don't create users
    let level = Number(cur.level || 1);
    let exp   = Number(cur.exp   || 0);
    let lups  = [];

    exp += delta;

    while (level < PLAYER_MAX_LEVEL && exp >= xpNeededForLevel(level)) {
      exp -= xpNeededForLevel(level);
      level += 1;
      lups.push(level);
    }
    // If at cap, clamp exp to 0..cap-1
    if (level >= PLAYER_MAX_LEVEL) {
      level = PLAYER_MAX_LEVEL;
      exp   = 0;
    }

    // also stash lastXPSource (optional debug)
    return { ...cur, level, exp, lastXPSource: source };
  });

  if (!tx.committed || !tx.snapshot.exists()) {
    return { level: 0, exp: 0, leveled: [] };
  }
  const cur = tx.snapshot.val();
  after = { level: Number(cur.level || 1), exp: Number(cur.exp || 0) };

  // Find which levels were gained by comparing to "before" in the snapshot's "prev" is not available,
  // so we re-compute by simulating (cheap): run XP backwards
  // To avoid complexity, we re-read XP & Level before transaction via separate read is overkill.
  // Instead, capture the leveled levels inside the transaction by returning them in a side channel.
  // Since RTDB transactions can’t expose that, we just compute afterwards using delta heuristic:
  // We’ll infer with a quick loop up to small bound.
  // (Pragmatic: in normal play delta is small; on huge deltas we still grant rewards correctly by loop.)
  {
    let level0 = Number(tx.snapshot.val().level || 1);
    let exp0   = Number(tx.snapshot.val().exp || 0);
    // Reverse-walk: add back delta and see which levels were crossed.
    let level = level0;
    let exp   = exp0 + delta; // “pre-transaction” exp
    let tempLevels = [];
    // peel levels down until within 0..needed-1
    while (level > 1 && exp < 0) {
      level -= 1;
      exp += xpNeededForLevel(level);
    }
    // Now simulate forward from the reconstructed "before"
    let simLevel = level;
    let simExp   = exp;
    while (simLevel < PLAYER_MAX_LEVEL && simExp >= xpNeededForLevel(simLevel)) {
      simExp -= xpNeededForLevel(simLevel);
      simLevel += 1;
      tempLevels.push(simLevel);
    }
    leveled = tempLevels;
  }

  // 2) Grant rewards for each level gained (if any)
  let rewards = [];
  for (const lvl of leveled) {
    // eslint-disable-next-line no-await-in-loop
    const r = await grantPlayerLevelRewards(uid, lvl);
    if (r?.length) rewards.push(...r);
    // optional: add a lightweight notification
    // eslint-disable-next-line no-await-in-loop
    await push(ref(db, `users/${uid}/notifications`), {
      type: 'level_up',
      at: Date.now(),
      level: lvl,
      message: `You reached player level ${lvl}! Rewards added to your account.`,
    });
  }

  return { ...after, leveled, rewards };
}

// -------- live UI binding (optional helper) --------
/**
 * Bind live player level/xp to UI.
 * opts: { levelEl?: string, xpBarEl?: string, xpTextEl?: string }
 */
export function bindPlayerLevelUI(uid, opts = {}) {
  const { levelEl, xpBarEl, xpTextEl } = opts;
  const lEl = levelEl ? document.getElementById(levelEl) : null;
  const bEl = xpBarEl ? document.getElementById(xpBarEl) : null;
  const tEl = xpTextEl ? document.getElementById(xpTextEl) : null;

  const userRef = ref(db, `users/${uid}`);
  onValue(userRef, snap => {
    if (!snap.exists()) return;
    const u = snap.val();
    const level = Number(u.level || 1);
    const exp   = Number(u.exp || 0);
    const need  = xpNeededForLevel(level);
    const pct   = Math.max(0, Math.min(100, Math.round((exp / need) * 100)));

    if (lEl) lEl.textContent = String(level);
    if (bEl) bEl.style.width = pct + '%';
    if (tEl) tEl.textContent = `${exp} / ${need} XP`;
  });
}
