// player-level.js
import { db } from './firebase-init.js';
import {
  ref, runTransaction, update, onValue, push
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerLevelRewards } from './player-rewards.js';

export const PLAYER_MAX_LEVEL = 300;

// XP needed for *current* level to advance to next.
export function xpNeededForLevel(level) {
  return Math.max(50, Math.floor(level * 100));
}

/**
 * Safely add XP to player; auto-levels and grants rewards per level-up.
 * Returns { level, exp, leveled: number[], rewards: Array }
 */
export async function grantPlayerXP(uid, delta, source = 'misc') {
  if (!uid || !Number.isFinite(delta) || delta <= 0) {
    return { level: 0, exp: 0, leveled: [] };
  }

  const userRef = ref(db, `users/${uid}`);

  // We'll capture which levels were gained *inside* the transaction.
  let leveled = [];
  let after = { level: 1, exp: 0 };

  const tx = await runTransaction(userRef, cur => {
    if (!cur) return cur; // don't create users
    let level = Number(cur.level || 1);
    let exp   = Number(cur.exp   || 0);

    exp += delta;

    // compute level-ups and record each new level reached
    while (level < PLAYER_MAX_LEVEL && exp >= xpNeededForLevel(level)) {
      exp -= xpNeededForLevel(level);
      level += 1;
      leveled.push(level);           // <-- captured in outer scope
    }

    if (level >= PLAYER_MAX_LEVEL) {
      level = PLAYER_MAX_LEVEL;
      exp   = 0; // clamp at cap
    }

    return { ...cur, level, exp, lastXPSource: source };
  });

  if (!tx.committed || !tx.snapshot.exists()) {
    return { level: 0, exp: 0, leveled: [] };
  }

  const cur = tx.snapshot.val();
  after = { level: Number(cur.level || 1), exp: Number(cur.exp || 0) };

  // 2) Grant rewards for each level gained (if any)
  let rewards = [];
  for (const lvl of leveled) {
    // grant level rewards (idempotent inside grant function)
    // eslint-disable-next-line no-await-in-loop
    const r = await grantPlayerLevelRewards(uid, lvl);
    if (r?.length) rewards.push(...r);

    // optional toast/notification
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

/**
 * Live-bind player level/xp to UI.
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
