// player-level.js
import { db } from './firebase-init.js';
import {
  ref, runTransaction, onValue, push
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerLevelRewards } from './player-rewards.js';
import { sendSystemMail } from './mail-utils.js';

export const PLAYER_MAX_LEVEL = 300;

export function xpNeededForLevel(level) {
  return Math.max(50, Math.floor(level * 100));
}

export async function grantPlayerXP(uid, delta, source = 'misc') {
  if (!uid || !Number.isFinite(delta) || delta <= 0) {
    return { level: 0, exp: 0, leveled: [] };
  }

  const userRef = ref(db, `users/${uid}`);

  let leveled = [];
  let after = { level: 1, exp: 0 };

  const tx = await runTransaction(userRef, cur => {
    if (!cur) return cur;
    let level = Number(cur.level || 1);
    let exp   = Number(cur.exp   || 0);

    exp += delta;

    while (level < PLAYER_MAX_LEVEL && exp >= xpNeededForLevel(level)) {
      exp -= xpNeededForLevel(level);
      level += 1;
      leveled.push(level);
    }

    if (level >= PLAYER_MAX_LEVEL) {
      level = PLAYER_MAX_LEVEL;
      exp   = 0;
    }

    return { ...cur, level, exp, lastXPSource: source };
  });

  if (!tx.committed || !tx.snapshot.exists()) {
    return { level: 0, exp: 0, leveled: [] };
  }

  const cur = tx.snapshot.val();
  after = { level: Number(cur.level || 1), exp: Number(cur.exp || 0) };

  // grant rewards + mail per level
  let rewards = [];
  for (const lvl of leveled) {
    // grant loot
    // eslint-disable-next-line no-await-in-loop
    const lines = await grantPlayerLevelRewards(uid, lvl);
    if (lines?.length) rewards.push(...lines);

    // notify by mail
    const subject = `Level Up! You reached Level ${lvl}`;
    const body = lines?.length
      ? `Congrats on Level ${lvl}!\n\nRewards:\n- ${lines.join('\n- ')}\n\nKeep it up!`
      : `Congrats on Level ${lvl}!`;
    // eslint-disable-next-line no-await-in-loop
    await sendSystemMail(uid, subject, body);

    // (Optional) also keep your existing notifications entry
    // eslint-disable-next-line no-await-in-loop
    await push(ref(db, `users/${uid}/notifications`), {
      type: 'level_up',
      at: Date.now(),
      level: lvl,
      message: `You reached player level ${lvl}!`,
    });
  }

  return { ...after, leveled, rewards };
}

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
