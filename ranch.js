// ranch.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { ensurePlayerProgress, xpNeededForLevel } from './player-level.js';

onAuthStateChanged(auth, async user => {
  if (!user) return (window.location.href = 'login.html');
  const uid = user.uid;

  // Make sure the user doc has numeric level/exp before we bind the UI
  await ensurePlayerProgress(uid);

  // Live updates so EXP bar moves automatically
  onValue(ref(db, `users/${uid}`), snap => {
    if (!snap.exists()) return;
    const data = snap.val() || {};

    const name = data.username || data.loginName || '(unnamed)';
    const horses = normalizeHorses(data.horses);
    const level = Number(data.level || 1);
    const exp   = Number(data.exp || 0);
    const expToLevel = xpNeededForLevel(level);
    const pct = Math.max(0, Math.min(100, (exp / expToLevel) * 100));

    setText('profileDisplayName', name);
    setText('profileJoinDate', data.joinDate || '—');
    setText('profileHorseCount', horses.length);
    setText('profileLevel', level);
    setText('profileExp', `${exp} / ${expToLevel}`);

    const bar = document.getElementById('profileExpBar');
    if (bar) bar.style.width = pct + '%';
  });
});

function normalizeHorses(h) {
  if (!h) return [];
  return Array.isArray(h) ? h.filter(Boolean) : Object.values(h || {});
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}
