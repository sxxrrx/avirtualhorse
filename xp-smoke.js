// xp-smoke.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, onValue, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { xpNeededForLevel, grantPlayerXP, ensurePlayerProgress } from './player-level.js';

const $ = id => document.getElementById(id);
const msg = (t) => { const el=$('msg'); if (el) el.textContent = t; };

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href='login.html';
  $('uid').textContent = user.uid;

  // make sure level/exp exist
  await ensurePlayerProgress(user.uid);

  // live bind
  onValue(ref(db, `users/${user.uid}`), snap => {
    if (!snap.exists()) return;
    const u = snap.val() || {};
    const level = Number(u.level || 1);
    const exp   = Number(u.exp || 0);
    $('lvl').textContent = level;
    $('xp').textContent  = exp;
    $('need').textContent = `need: ${xpNeededForLevel(level)}`;
  });

  // direct writes (bypass helper) — proves DB rules / path
  $('btnPlus5').onclick = async () => {
    await addXPDirect(user.uid, 5);
  };
  $('btnPlus50').onclick = async () => {
    await addXPDirect(user.uid, 50);
  };

  // through your helper
  $('btnGrant50').onclick = async () => {
    msg('grantPlayerXP…');
    try {
      const res = await grantPlayerXP(user.uid, 50, 'smoke_test');
      msg(`grantPlayerXP OK → level ${res.level}, exp ${res.exp}, leveled: ${res.leveled?.join(',')||'none'}`);
    } catch (e) {
      console.error(e);
      msg('grantPlayerXP FAILED (see console)');
    }
  };

  // reset
  $('btnReset').onclick = async () => {
    msg('reset…');
    try {
      await update(ref(db, `users/${user.uid}`), { level: 1, exp: 0 });
      msg('Reset to level 1 / 0 XP');
    } catch (e) {
      console.error(e);
      msg('Reset FAILED (see console)');
    }
  };
});

async function addXPDirect(uid, delta){
  try {
    msg('direct update…');
    const r = ref(db, `users/${uid}`);
    // simple read-less increment: we’ll rely on current snapshot via onValue
    // safe-ish because it’s just a test — production can use transactions
    // but this tells us if rules allow writes
    // read current
    const cur = await (await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js'))
      .get(r);
    if (!cur.exists()) { msg('user missing'); return; }
    let { level=1, exp=0 } = cur.val() || {};
    level = Number(level)||1; exp = Number(exp)||0;

    exp += delta;
    while (exp >= xpNeededForLevel(level)) {
      exp -= xpNeededForLevel(level);
      level += 1;
    }
    await update(r, { level, exp, lastXPSource:'direct_smoke', lastXPAt:Date.now() });
    msg(`Direct +${delta} OK`);
  } catch (e) {
    console.error(e);
    // Most important clue: PERMISSION_DENIED here means rules are blocking writes.
    msg('Direct update FAILED (see console)');
  }
}
