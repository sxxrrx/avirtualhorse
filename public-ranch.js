// ranch-public.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, push, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const params = new URLSearchParams(location.search);
const targetUid = params.get('uid');

let me = null;            // current user (viewer)
let targetUser = null;    // profile owner

if (!targetUid) {
  document.querySelector('.main-content').innerHTML = '<p>No user specified.</p>';
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // You could allow anonymous view if you want. For now, require login.
      window.location.href = 'login.html';
      return;
    }
    me = user;

    // Load the target user’s profile
    const snap = await get(ref(db, `users/${targetUid}`));
    if (!snap.exists()) {
      document.querySelector('.main-content').innerHTML = '<p>Ranch not found.</p>';
      return;
    }
    targetUser = snap.val();

    // Fill header + fields
    const name = targetUser.username || targetUser.loginName || '(unnamed)';
    byId('ranchTitle').textContent = `${name} — Ranch`;
    byId('profileUsername').textContent = name;
    byId('profileJoinDate').textContent = targetUser.joinDate || '—';
    byId('profileLastSeen').textContent = formatDateTime(targetUser.lastSeen) || '—';
    byId('profileLevel').textContent = targetUser.level ?? '—';

    const horses = toArray(targetUser.horses);
    byId('profileHorseCount').textContent = horses.length;

    // Wire buttons
    byId('btnMail').href = `post-office.html?to=${encodeURIComponent(targetUid)}`;
    byId('btnViewStable').href = `stable-public.html?uid=${encodeURIComponent(targetUid)}`;

    // Add Friend button logic
    setupFriendButton();
  });
}

// --------------- friend request ---------------
async function setupFriendButton() {
  const btn = byId('btnAddFriend');
  const status = byId('statusMsg');

  // Hide if this is your own ranch
  if (me.uid === targetUid) {
    btn.style.display = 'none';
    status.textContent = '';
    return;
  }

  // Already friends?
  const mySnap = await get(ref(db, `users/${me.uid}/friends/${targetUid}`));
  if (mySnap.exists() && mySnap.val() === true) {
    btn.disabled = true;
    btn.textContent = '✅ Friends';
    status.textContent = '';
    return;
  }

  // Pending outgoing request?
  const outPending = await hasPendingFriendRequest(me.uid, targetUid);
  if (outPending) {
    btn.disabled = true;
    btn.textContent = '⏳ Request Sent';
    status.textContent = 'Your friend request is pending in their mailbox.';
    return;
  }

  // Pending incoming request (they already asked you)?
  const inPending = await hasPendingFriendRequest(targetUid, me.uid);
  if (inPending) {
    btn.disabled = true;
    btn.textContent = '📬 Check Your Mail';
    status.textContent = 'They sent you a request. Open your mailbox to accept or deny.';
    byId('btnMail').href = `post-office.html`;
    return;
  }

  // Otherwise, allow sending
  btn.disabled = false;
  btn.textContent = '🤝 Add Friend';
  status.textContent = '';

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await sendFriendRequest(me.uid, targetUid);
      btn.textContent = '⏳ Request Sent';
      status.textContent = 'Your friend request has been sent.';
    } catch (e) {
      console.error('sendFriendRequest failed', e);
      btn.disabled = false;
      btn.textContent = '🤝 Add Friend';
      status.textContent = 'Failed to send request. Try again.';
    }
  };
}

// Create a friend request message and index it into sender/receiver mailboxes
async function sendFriendRequest(fromUid, toUid) {
  const msgRef = push(ref(db, 'mail'));
  const message = {
    type: 'friend_request',
    fromUid,
    toUid,
    subject: 'Friend Request',
    body: '',
    status: 'pending',           // 'pending' | 'accepted' | 'denied'
    sentAt: Date.now()
  };
  await set(msgRef, message);

  // Index for fast lookups in inbox/sent
  await Promise.all([
    set(ref(db, `userMailIndex/${fromUid}/sent/${msgRef.key}`), true),
    set(ref(db, `userMailIndex/${toUid}/inbox/${msgRef.key}`), true)
  ]);
}

// Check if there's a pending request where fromUid -> toUid
async function hasPendingFriendRequest(fromUid, toUid) {
  // Look up toUid inbox index
  const idxSnap = await get(ref(db, `userMailIndex/${toUid}/inbox`));
  if (!idxSnap.exists()) return false;

  const ids = Object.keys(idxSnap.val() || {});
  if (!ids.length) return false;

  // Pull the referenced mail entries and see if any match the pattern
  const fetches = ids.map(id => get(ref(db, `mail/${id}`)));
  const results = await Promise.all(fetches);
  for (const s of results) {
    if (!s.exists()) continue;
    const m = s.val();
    if (m.type === 'friend_request' &&
        m.status === 'pending' &&
        m.fromUid === fromUid &&
        m.toUid === toUid) {
      return true;
    }
  }
  return false;
}

// --------------- helpers ---------------
function byId(id){ return document.getElementById(id); }

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : Object.values(val);
}

function formatDateTime(ts) {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return null;
  }
}
,'"':"&quot;"}[s]));}
