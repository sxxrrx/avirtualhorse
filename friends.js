import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, onValue, get, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = (id) => document.getElementById(id);
const shortUid = (id) => id ? id.slice(0,6) + '…' : '(unknown)';
const escapeHtml = (str) => String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));

let meUid = null;

// Wait for DOM before wiring buttons that reference elements
document.addEventListener('DOMContentLoaded', () => {
  const tabFriends = $('tabFriends');
  const tabPending = $('tabPending');
  if (tabFriends && tabPending) {
    tabFriends.onclick = () => showView('Friends');
    tabPending.onclick = () => showView('Pending');
  }
  // Default tab
  showView('Friends');
});

function showView(name){
  ['Friends','Pending'].forEach(n => {
    const view = $('view'+n);
    const tab  = $('tab'+n);
    if (view) view.style.display = (n===name) ? 'block' : 'none';
    if (tab)  tab.classList.toggle('active', n===name);
  });
}

// Auth + live data
onAuthStateChanged(auth, async user => {
  if (!user) return (window.location.href = 'login.html');
  meUid = user.uid;

  // Live friends list
  onValue(ref(db, `users/${meUid}/friends`), async snap => {
    const friendsObj = snap.exists() ? snap.val() : {};
    const friendUids = Object.keys(friendsObj).filter(uid => friendsObj[uid] === true);
    if ($('friendsCount')) $('friendsCount').textContent = `(${friendUids.length})`;
    if (friendUids.length === 0) {
      if ($('friendsList')) $('friendsList').innerHTML = '<p>No friends yet.</p>';
    } else {
      const names = await getNamesMap(friendUids);
      renderFriends(friendUids, names);
    }
  });

  // Live pending: incoming + outgoing (watch indices; then load details)
  onValue(ref(db, `userMailIndex/${meUid}/inbox`), () => loadPending());
  onValue(ref(db, `userMailIndex/${meUid}/sent`),  () => loadPending());
});

// Render friends list
function renderFriends(uids, namesMap){
  const list = $('friendsList');
  if (!list) return;
  list.innerHTML = '';
  uids.forEach(uid => {
    const name = namesMap[uid] || shortUid(uid);
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `
      <div><strong><a href="ranch-public.html?uid=${encodeURIComponent(uid)}">${escapeHtml(name)}</a></strong></div>
      <div class="actions">
        <a class="tabButton" style="padding:6px 10px; text-decoration:none;"
           href="post-office.html?to=${encodeURIComponent(uid)}">📬 Message</a>
        <a class="tabButton" style="padding:6px 10px; text-decoration:none;"
           href="stable-public.html?uid=${encodeURIComponent(uid)}">🐴 View Stable</a>
      </div>
    `;
    list.appendChild(card);
  });
}

// Load pending (incoming/outgoing)
async function loadPending() {
  const incomingIdx = await get(ref(db, `userMailIndex/${meUid}/inbox`));
  const outgoingIdx = await get(ref(db, `userMailIndex/${meUid}/sent`));

  const incomingIds = incomingIdx.exists() ? Object.keys(incomingIdx.val()) : [];
  const outgoingIds = outgoingIdx.exists() ? Object.keys(outgoingIdx.val()) : [];

  const [incomingMsgs, outgoingMsgs] = await Promise.all([
    fetchMessages(incomingIds),
    fetchMessages(outgoingIds)
  ]);

  const incomingFR = incomingMsgs.filter(m => m.type==='friend_request' && m.status==='pending' && m.toUid===meUid);
  const outgoingFR = outgoingMsgs.filter(m => m.type==='friend_request' && m.status==='pending' && m.fromUid===meUid);

  if ($('pendingCount')) $('pendingCount').textContent = `(${incomingFR.length + outgoingFR.length})`;

  // Names for all peers
  const peerUids = new Set();
  incomingFR.forEach(m => peerUids.add(m.fromUid));
  outgoingFR.forEach(m => peerUids.add(m.toUid));
  const namesMap = await getNamesMap([...peerUids]);

  renderPendingIncoming(incomingFR, namesMap);
  renderPendingOutgoing(outgoingFR, namesMap);
}

async function fetchMessages(ids){
  const snaps = await Promise.all(ids.map(id => get(ref(db, `mail/${id}`)).then(s => ({id, s}))));  
  return snaps
    .filter(({s}) => s.exists())
    .map(({id, s}) => ({ id, ...s.val() }))
    .sort((a,b) => (b.sentAt||0) - (a.sentAt||0));
}

function renderPendingIncoming(rows, names){
  const list = $('pendingIncomingList');
  if (!list) return;
  list.innerHTML = '';
  if (rows.length === 0) {
    list.innerHTML = '<p>No incoming requests.</p>';
    return;
  }
  rows.forEach(m => {
    const name = names[m.fromUid] || shortUid(m.fromUid);
    const div = document.createElement('div');
    div.className = 'mail-card';
    div.innerHTML = `
      <div><strong>From:</strong> <a href="ranch-public.html?uid=${encodeURIComponent(m.fromUid)}">${escapeHtml(name)}</a></div>
      <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
        <button data-act="accept" data-id="${m.id}" data-peer="${m.fromUid}">Accept</button>
        <button data-act="deny"   data-id="${m.id}">Deny</button>
      </div>
    `;
    div.querySelector('[data-act="accept"]').onclick = () => acceptFriend(m.id, m.fromUid);
    div.querySelector('[data-act="deny"]').onclick   = () => denyFriend(m.id);
    list.appendChild(div);
  });
}

function renderPendingOutgoing(rows, names){
  const list = $('pendingOutgoingList');
  if (!list) return;
  list.innerHTML = '';
  if (rows.length === 0) {
    list.innerHTML = '<p>No outgoing requests.</p>';
    return;
  }
  rows.forEach(m => {
    const name = names[m.toUid] || shortUid(m.toUid);
    const div = document.createElement('div');
    div.className = 'mail-card';
    div.innerHTML = `
      <div><strong>To:</strong> <a href="ranch-public.html?uid=${encodeURIComponent(m.toUid)}">${escapeHtml(name)}</a></div>
      <div style="margin-top:6px; opacity:0.8;">Pending…</div>
    `;
    list.appendChild(div);
  });
}

// Accept / Deny
async function acceptFriend(mailId, peerUid){
  await update(ref(db, `mail/${mailId}`), { status: 'accepted' });
  await Promise.all([
    set(ref(db, `users/${meUid}/friends/${peerUid}`), true),
    set(ref(db, `users/${peerUid}/friends/${meUid}`), true),
  ]);
  // Re-render will be triggered by listeners
}

async function denyFriend(mailId){
  await update(ref(db, `mail/${mailId}`), { status: 'denied' });
  // Re-render via listeners
}

// Names helpers
async function getNamesMap(uids){
  const map = {};
  await Promise.all(uids.map(async uid => {
    const s = await get(ref(db, `users/${uid}`));
    if (s.exists()) {
      const u = s.val();
      map[uid] = u.username || u.loginName || shortUid(uid);
    } else {
      map[uid] = shortUid(uid);
    }
  }));
  return map;
}
