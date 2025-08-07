// ranch.js
// ------------------------------
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

onAuthStateChanged(auth, async user => {
  if (!user) return window.location.href = 'login.html';
  const uid = user.uid;

  // fetch user data
  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) return alert('User data not found.');
  const data = snap.val();

  // populate profile fields
  document.getElementById('profileDisplayName').textContent = data.username || data.loginName;
  document.getElementById('profileJoinDate').textContent = data.joinDate;
  document.getElementById('profileHorseCount').textContent = data.horses?.length || 0;
  document.getElementById('profileLevel').textContent = data.level;
  document.getElementById('profileExp').textContent = data.exp;
});
