// horse-level.js
import { db } from './firebase-init.js';
import {
  ref, get, set, runTransaction, onValue
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

// Simple horse curve (you can tune later).
// Keep it a bit lighter than player curve so horses feel progressy.
export function horseXpNeededForLevel(level) {
  return Math.max(30, Math.floor(level * 80));
}

// Find horse path (array or object) so we can run a transaction on that node.
export async function resolveHorsePath(ownerUid, horseId) {
  const uSnap = await get(ref(db, `users/${ownerUid}`));
  if (!uSnap.exists()) return null;
  const u = uSnap.val();

  if (Array.isArray(u.horses)) {
    const idx = u.horses.findIndex(h => h?.id === horseId);
    if (idx >= 0) return { kind: 'array', path: `users/${ownerUid}/horses/${idx}` };
  } else if (u.horses && typeof u.horses === 'object') {
    const key = Object.keys(u.horses).find(k => u.horses[k]?.id === horseId);
    if (key) return { kind: 'object', path: `users/${ownerUid}/horses/${key}` };
  }
  return null;
}

/**
 * Safely add XP to a horse; auto-levels. Updates xpPct for your UI bars.
 * Returns { level, exp, leveled: number[] } after the change.
 */
export async function grantHorseXP(ownerUid, horseId, delta, source = 'misc') {
  if (!ownerUid || !horseId || !Number.isFinite(delta) || delta <= 0) {
    return { level: 0, exp: 0, leveled: [] };
  }
  const loc = await resolveHorsePath(ownerUid, horseId);
  if (!loc) return { level: 0, exp: 0, leveled: [] };

  const hRef = ref(db, loc.path);
  let leveled = [];
  let after = { level: 1, exp: 0, xpPct: 0 };

  // Transactionally update this horse record
  const tx = await runTransaction(hRef, h => {
    if (!h) return h;
    const level0 = Number(h.level || 1);
    let level = level0;
    let exp   = Number(h.exp   || 0) + delta;

    const gained = [];
    while (exp >= horseXpNeededForLevel(level)) {
      exp -= horseXpNeededForLevel(level);
      level += 1;
      gained.push(level);
    }

    const need = horseXpNeededForLevel(level);
    const xpPct = Math.max(0, Math.min(100, Math.round((exp / need) * 100)));

    return { ...h, level, exp, xpPct, lastXPSource: source };
  });

  if (!tx.committed || !tx.snapshot.exists()) return { level: 0, exp: 0, leveled: [] };

  const h = tx.snapshot.val();
  after = { level: Number(h.level||1), exp: Number(h.exp||0), xpPct: Number(h.xpPct||0) };

  // Reconstruct which levels were crossed (same approach as player)
  {
    let level = after.level;
    let exp   = after.exp + delta; // pre-tx exp
    const crossed = [];
    while (level > 1 && exp < 0) { level -= 1; exp += horseXpNeededForLevel(level); }
    let L = level, E = exp;
    while (E >= horseXpNeededForLevel(L)) {
      E -= horseXpNeededForLevel(L);
      L += 1;
      crossed.push(L);
    }
    leveled = crossed;
  }

  return { ...after, leveled };
}

// -------- live UI binding (optional helper) --------
/**
 * Bind a single horse’s live level/xp to UI.
 * opts: { levelEl?: string, xpBarEl?: string, xpTextEl?: string }
 */
export async function bindHorseLevelUI(ownerUid, horseId, opts = {}) {
  const loc = await resolveHorsePath(ownerUid, horseId);
  if (!loc) return;
  const { levelEl, xpBarEl, xpTextEl } = opts;
  const lEl = levelEl ? document.getElementById(levelEl) : null;
  const bEl = xpBarEl ? document.getElementById(xpBarEl) : null;
  const tEl = xpTextEl ? document.getElementById(xpTextEl) : null;

  onValue(ref(db, loc.path), snap => {
    if (!snap.exists()) return;
    const h = snap.val();
    const level = Number(h.level || 1);
    const exp   = Number(h.exp   || 0);
    const need  = horseXpNeededForLevel(level);
    const pct   = Math.max(0, Math.min(100, Math.round((exp / need) * 100)));
    if (lEl) lEl.textContent = String(level);
    if (bEl) bEl.style.width = pct + '%';
    if (tEl) tEl.textContent = `${exp} / ${need} XP`;
  });
}
