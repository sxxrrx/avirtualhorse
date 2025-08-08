import { auth, db } from './firebase-init.js';
import {
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $  = (id) => document.getElementById(id);
const now = () => Date.now();
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

let uid = null;
let userDoc = null;
let me = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = 'login.html');
  me = user;
  uid = user.uid;

  // Load profile from DB
  const s = await get(ref(db, `users/${uid}`));
  userDoc = s.exists() ? s.val() : {};

  // Prefill UI
  if ($('usernameInput')) $('usernameInput').value = userDoc.username || userDoc.loginName || '';
  if ($('emailInput')) $('emailInput').value = user.email || (userDoc.email || '');

  // Freeze UI state
  refreshFreezeUI();
});

// ---------- Profile: display name ----------
$('saveUsernameBtn')?.addEventListener('click', async () => {
  const name = ($('usernameInput')?.value || '').trim();
  const status = $('usernameStatus');
  if (!name) { if (status) status.textContent = 'Please enter a name.'; return; }
  if (name.length < 3 || name.length > 24) {
    if (status) status.textContent = 'Name should be 3–24 characters.';
    return;
  }
  try {
    await update(ref(db, `users/${uid}`), { username: name });
    // Also set auth displayName (nice to have)
    await updateProfile(auth.currentUser, { displayName: name }).catch(()=>{});
    if (status) status.textContent = 'Saved!';
  } catch (e) {
    console.error(e);
    if (status) status.textContent = 'Failed to save name.';
  }
});

// ---------- Account: email ----------
$('saveEmailBtn')?.addEventListener('click', async () => {
  const newEmail = ($('emailInput')?.value || '').trim();
  const pw = $('emailCurrentPw')?.value || '';
  const status = $('emailStatus');
  if (!newEmail) { status.textContent = 'Enter a new email.'; return; }
  if (!pw) { status.textContent = 'Enter your current password to verify.'; return; }

  try {
    await reauth(pw);
    await updateEmail(auth.currentUser, newEmail);
    await update(ref(db, `users/${uid}`), { email: newEmail });
    status.textContent = 'Email updated!';
  } catch (e) {
    console.error(e);
    status.textContent = friendlyAuthError(e);
  }
});

// ---------- Account: password ----------
$('savePasswordBtn')?.addEventListener('click', async () => {
  const cur = $('pwCurrent')?.value || '';
  const p1  = $('pwNew')?.value || '';
  const p2  = $('pwNew2')?.value || '';
  const status = $('passwordStatus');

  if (!cur || !p1 || !p2) { status.textContent = 'Fill all password fields.'; return; }
  if (p1 !== p2) { status.textContent = 'New passwords do not match.'; return; }
  if (p1.length < 6) { status.textContent = 'New password must be at least 6 characters.'; return; }

  try {
    await reauth(cur);
    await updatePassword(auth.currentUser, p1);
    status.textContent = 'Password changed!';
    // clear inputs
    $('pwCurrent').value = ''; $('pwNew').value=''; $('pwNew2').value='';
  } catch (e) {
    console.error(e);
    status.textContent = friendlyAuthError(e);
  }
});

// ---------- Freeze / Unfreeze ----------
$('freezeBtn')?.addEventListener('click', async () => {
  if (!userDoc) return;
  const freeze = userDoc.freeze || {};
  const nowMs = now();

  // cooldown: cannot freeze if now < nextFreezeAllowedAtMs
  if (freeze.nextFreezeAllowedAtMs && nowMs < freeze.nextFreezeAllowedAtMs) {
    const leftMs = freeze.nextFreezeAllowedAtMs - nowMs;
    $('freezeMsg').textContent = `You can freeze again in ~${humanDuration(leftMs)}.`;
    return;
  }
  try {
    await update(ref(db, `users/${uid}/freeze`), {
      isFrozen: true,
      frozenAtMs: nowMs
    });
    // Refresh local doc and UI
    userDoc.freeze = { ...(userDoc.freeze||{}), isFrozen:true, frozenAtMs: nowMs };
    refreshFreezeUI();
  } catch (e) {
    console.error(e);
    $('freezeMsg').textContent = 'Failed to freeze account.';
  }
});

$('unfreezeBtn')?.addEventListener('click', async () => {
  if (!userDoc) return;
  const nowMs = now();
  try {
    await update(ref(db, `users/${uid}/freeze`), {
      isFrozen: false,
      lastUnfrozenAtMs: nowMs,
      nextFreezeAllowedAtMs: nowMs + SEVEN_DAYS
    });
    userDoc.freeze = {
      ...(userDoc.freeze||{}),
      isFrozen:false,
      lastUnfrozenAtMs: nowMs,
      nextFreezeAllowedAtMs: nowMs + SEVEN_DAYS
    };
    refreshFreezeUI();
  } catch (e) {
    console.error(e);
    $('freezeMsg').textContent = 'Failed to unfreeze account.';
  }
});

function refreshFreezeUI(){
  const fr = (userDoc && userDoc.freeze) || {};
  const frozen = !!fr.isFrozen;
  const status = frozen ? `Frozen since ${fr.frozenAtMs ? new Date(fr.frozenAtMs).toLocaleString() : '—'}` : 'Active';
  if ($('freezeStatus')) $('freezeStatus').textContent = status;

  const nowMs = now();
  const cooldownLeft = fr.nextFreezeAllowedAtMs && nowMs < fr.nextFreezeAllowedAtMs
    ? fr.nextFreezeAllowedAtMs - nowMs
    : 0;

  if ($('freezeBtn')) {
    $('freezeBtn').disabled = frozen || cooldownLeft > 0;
  }
  if ($('unfreezeBtn')) {
    $('unfreezeBtn').disabled = !frozen;
  }

  if ($('freezeMsg')) {
    $('freezeMsg').textContent = cooldownLeft > 0
      ? `Next freeze available in ~${humanDuration(cooldownLeft)}.`
      : '';
  }
}

// ---------- helpers ----------
async function reauth(currentPassword){
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Missing email for re-auth.');
  const cred = EmailAuthProvider.credential(email, currentPassword);
  await reauthenticateWithCredential(auth.currentUser, cred);
}

function friendlyAuthError(e){
  const code = e?.code || '';
  if (code === 'auth/wrong-password') return 'Incorrect current password.';
  if (code === 'auth/requires-recent-login') return 'Please log out and back in, then retry.';
  if (code === 'auth/invalid-email') return 'That email looks invalid.';
  if (code === 'auth/email-already-in-use') return 'That email is already in use.';
  return 'Something went wrong. Please try again.';
}

function humanDuration(ms){
  const d = Math.floor(ms / (24*60*60*1000));
  const h = Math.floor((ms % (24*60*60*1000)) / (60*60*1000));
  return d ? `${d} day(s) ${h} hr` : `${h} hr`;
}
