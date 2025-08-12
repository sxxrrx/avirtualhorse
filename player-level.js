// player-level.js
import { db } from './firebase-init.js';
import {
  ref, get, update, onValue, push
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerLevelRewards } from './player-rewards.js';
import { sendSystemMail } from './mail-utils.js';

export const PLAYER_MAX_LEVEL = 300;

// XP needed to go from current level -> next
export function xpNeededForLevel(level) {
  return Math.max(50, Math.floor(level * 100));
}

/** Ensure user doc has numeric level/exp so XP math is safe. */
export async function ensurePlayerProgress(uid) {
  const r = ref(db, `users/${uid}`);
  const snap = await get(r);
  if (!snap.exists()) return false;
  const u = snap.val() || {};
  const patch = {};
  let changed = false;

  if (!Number.isFinite(Number(u.level))) { patch.level = 1; changed = true; }
  if (!Number.isFinite(Number(u.exp)))   { patch.exp   = 0; changed = true; }

  if (changed) {
    await update(r, patch);
    console.log('[level] normalized player progress', patch);
  }
  return changed;
}

/**
 * Add XP, auto-level, grant rewards, and notify by mail.
 * Returns the new level/exp plus any levels crossed + reward lines.
 */
export async function grantPlayerXP(uid, delta, source = 'misc') {
  if (!uid || !Number.isFinite(delta) || delta <= 0) {
    return { level: 0, exp: 0, leveled: [] };
  }

  // Make sure level/exp exist
  await ensurePlayerProgress(uid);

  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);
  if (!snap.exists()) return { level: 0, exp: 0, leveled: [] };

  // read & normalize
  const u0 = snap.val() || {};
  let level = Number(u0.level || 1);
  let exp   = Number(u0.exp   || 0);

  // apply XP and level-ups
  exp += delta;
  const leveled = [];
  while (level < PLAYER_MAX_LEVEL && exp >= xpNeededForLevel(level)) {
    exp -= xpNeededForLevel(level);
    level += 1;
    leveled.push(level);
  }
  if (level >= PLAYER_MAX_LEVEL) { level = PLAYER_MAX_LEVEL; exp = 0; }

  // persist progress FIRST (so UI updates even if mail/rewards are slow)
  await update(userRef, {
    level, exp,
    lastXPSource: source,
    lastXPAt: Date.now()
  });
  console.log('[level] XP granted', { delta, to: { level, exp }, leveled });

  // rewards + mail (fire-and-forget so we don't block the button)
  if (leveled.length) {
    (async () => {
      try {
        for (const lvl of leveled) {
          // grant rewards (returns human-readable lines)
          const lines = await grantPlayerLevelRewards(uid, lvl);

          const subject = `Level Up! You reached Level ${lvl}`;
          const body = (lines?.length)
            ? `Congrats on Level ${lvl}!\n\nRewards:\n- ${lines.join('\n- ')}\n\nKeep it up!`
            : `Congrats on Level ${lvl}!`;

          await Promise.allSettled([
            sendSystemMail(uid, subject, body),
            push(ref(db, `users/${uid}/notifications`), {
              type: 'level_up',
              at: Date.now(),
              level: lvl,
              message: `You reached player level ${lvl}!`
            })
          ]);
        }
      } catch (e) {
        console.warn('[level] reward/mail side-effects failed:', e);
      }
    })();
  }

  return { level, exp, leveled, rewards: [] };
}

/** Live-bind player level/xp to UI bars/text (optional helper). */
export function bindPlayerLevelUI(uid, opts = {}) {
  const { levelEl, xpBarEl, xpTextEl } = opts;
  const lEl = levelEl ? document.getElementById(levelEl) : null;
  const bEl = xpBarEl ? document.getElementById(xpBarEl) : null;
  const tEl = xpTextEl ? document.getElementById(xpTextEl) : null;

  const userRef = ref(db, `users/${uid}`);
  onValue(userRef, snap => {
    if (!snap.exists()) return;
    const u = snap.val() || {};
    const level = Number(u.level || 1);
    const exp   = Number(u.exp || 0);
    const need  = xpNeededForLevel(level);
    const pct   = Math.max(0, Math.min(100, Math.round((exp / need) * 100)));

    if (lEl) lEl.textContent = String(level);
    if (bEl) bEl.style.width = pct + '%';
    if (tEl) tEl.textContent = `${exp} / ${need} XP`;
  });
}
