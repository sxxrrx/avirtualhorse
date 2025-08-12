// player-level.js
import { db } from './firebase-init.js';
import {
  ref, get, update, onValue, push
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

export const PLAYER_MAX_LEVEL = 300;

/* ---------- XP curve ---------- */
export function xpNeededForLevel(level) {
  return Math.max(50, Math.floor(level * 100));
}

/* ---------- ensure fields exist ---------- */
export async function ensurePlayerProgress(uid) {
  const r = ref(db, `users/${uid}`);
  const snap = await get(r);
  if (!snap.exists()) {
    console.warn('[level] user doc missing, cannot ensure progress');
    return false;
  }
  const u = snap.val() || {};
  const patch = {};
  let changed = false;

  const levelNum = Number(u.level);
  const expNum   = Number(u.exp);

  if (!Number.isFinite(levelNum)) { patch.level = 1; changed = true; }
  if (!Number.isFinite(expNum))   { patch.exp   = 0; changed = true; }

  if (changed) {
    await update(r, patch);
    console.log('[level] normalized level/exp ->', patch);
  }
  return changed;
}

/* ---------- grant XP (safe & non-blocking) ---------- */
export async function grantPlayerXP(uid, delta, source = 'misc') {
  if (!uid || !Number.isFinite(delta) || delta <= 0) {
    console.warn('[level] invalid XP grant', { uid, delta });
    return { level: 0, exp: 0, leveled: [] };
  }

  // Make sure we have numeric fields
  await ensurePlayerProgress(uid);

  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);
  if (!snap.exists()) {
    console.warn('[level] user not found for XP grant');
    return { level: 0, exp: 0, leveled: [] };
  }

  // Read current values
  const u0 = snap.val() || {};
  let level = Number(u0.level || 1);
  let exp   = Number(u0.exp   || 0);

  // Apply XP + compute level-ups
  exp += delta;
  const leveled = [];
  while (level < PLAYER_MAX_LEVEL && exp >= xpNeededForLevel(level)) {
    exp -= xpNeededForLevel(level);
    level += 1;
    leveled.push(level);
  }
  if (level >= PLAYER_MAX_LEVEL) { level = PLAYER_MAX_LEVEL; exp = 0; }

  // Persist PROGRESS FIRST so UI moves even if rewards/mail are slow
  await update(userRef, {
    level, exp,
    lastXPSource: source,
    lastXPAt: Date.now()
  });
  console.log('[level] XP granted:', { delta, to: { level, exp }, leveled });

  // Fire-and-forget rewards + mail (won’t block the button)
  if (leveled.length) {
    (async () => {
      try {
        // Dynamic imports so missing files don't break XP
        let grantPlayerLevelRewards = null;
        let sendSystemMail = null;

        try {
          ({ grantPlayerLevelRewards } = await import('./player-rewards.js'));
        } catch { console.warn('[level] player-rewards.js not found; skipping rewards'); }

        try {
          ({ sendSystemMail } = await import('./mail-utils.js'));
        } catch { console.warn('[level] mail-utils.js not found; skipping mail'); }

        for (const lvl of leveled) {
          let lines = [];
          if (typeof grantPlayerLevelRewards === 'function') {
            try {
              lines = await grantPlayerLevelRewards(uid, lvl);
              console.log('[level] rewards granted for level', lvl, lines);
            } catch (e) {
              console.warn('[level] reward grant failed for level', lvl, e);
            }
          }

          // Mail + notification (best-effort)
          const subject = `Level Up! You reached Level ${lvl}`;
          const body = (lines?.length)
            ? `Congrats on Level ${lvl}!\n\nRewards:\n- ${lines.join('\n- ')}\n\nKeep it up!`
            : `Congrats on Level ${lvl}!`;

          await Promise.allSettled([
            (typeof sendSystemMail === 'function'
              ? sendSystemMail(uid, subject, body)
              : Promise.resolve()),
            push(ref(db, `users/${uid}/notifications`), {
              type: 'level_up',
              at: Date.now(),
              level: lvl,
              message: `You reached player level ${lvl}!`
            })
          ]);
        }
      } catch (e) {
        console.warn('[level] side-effects failed:', e);
      }
    })();
  }

  return { level, exp, leveled, rewards: [] };
}

/* ---------- live bind helper (optional) ---------- */
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
