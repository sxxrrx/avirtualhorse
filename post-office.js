import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, push, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

let me = null;
let meUid = null;

const q = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const prefillTo = params.get('to') || ''; // when coming from ranch-public

// ---- Tab switching ----
q('tabInbox').onclick   = () => showView('Inbox');
q('tabSent').onclick    = () => showView('Sent');
q('tabCompose').onclick = () => showView('Compose');

function showView(name) {
  ['Inbox','Sent','Compose'].forEach(n => {
    q('view'+n).style.display = (n === name) ? 'block' : 'none';
    q('tab'+n).classList.toggle('active', n === name);
  });
  if (name === 'Inbox') loadInbox();
  if (name === 'Sent')  loadSent();
}

// ---- Auth & boot ----
onAuthStateChanged(auth, async user => {
  if (!user) return (window.location.href = 'login.html');
  me = user;
  meUid = user.uid;

  // If ?to= is present, prefill compose with resolved name
  if (prefillTo) {
    showView('Compose');
    const name = await getDisplayName(prefillTo);
    q('toInput').value = prefillTo;          // keep uid in To input (works for send)
    q('resolvedTo').value = `${name} (${shortUid(prefillTo)})`;
  } else {
    showView('Inbox');
  }
});

// ---- Inbox / Sent loaders ----
async function loadInbox() {
  const listEl = q('inboxList');
  listEl.innerHTML = 'Loading…';

  const idxSnap = await get(ref(db, `userMailIndex/${meUid}/inbox`));
  const ids = idxSnap.exists() ? Object.keys(idxSnap.val()) : [];
  if (ids.length === 0) { listEl.innerHTML = '<p>No messages.</p>'; return; }

  const msgs = await fetchMessages(ids);
  renderMail(listEl, msgs, 'inbox');
}

async function loadSent() {
  const listEl = q('sentList');
  listEl.innerHTML = 'Loading…';

  const idxSnap = await get(ref(db, `userMailIndex/${meUid}/sent`));
  const ids = idxSnap.exists() ? Object.keys(idxSnap.val()) : [];
  if (ids.length === 0) { listEl.innerHTML = '<p>No sent messages.</p>'; return; }

  const msgs = await fetchMessages(ids);
  renderMail(listEl, msgs, 'sent');
}

async function fetchMessages(ids) {
  const snaps = await Promise.all(ids.map(id => get(ref(db, `mail/${id}`)).then(s => ({ id, s }))));
  const rows = snaps
    .filter(({ s }) => s.exists())
    .map(({ id, s }) => ({ id, ...s.val() }))
    .sort((a,b) => (b.sentAt || 0) - (a.sentAt || 0));

  // Enrich with display names (from & to)
  const uids = new Set();
  rows.forEach(m => { if (m.fromUid) uids.add(m.fromUid); if (m.toUid) uids.add(m.toUid); });
  const nameMap = await getNamesMap([...uids]);

  return rows.map(m => ({
    ...m,
    fromName: nameMap[m.fromUid] || shortUid(m.fromUid),
    toName:   nameMap[m.toUid]   || shortUid(m.toUid),
  }));
}

// ---- Rendering ----
function renderMail(container, rows, box) {
  container.innerHTML = '';
  rows.forEach(m => {
    const isFriendReq = m.type === 'friend_request';
    const fromLink = `<a href="ranch-public.html?uid=${encodeURIComponent(m.fromUid)}">${escapeHtml(m.fromName)}</a>`;
    const toLink   = `<a href="ranch-public.html?uid=${encodeURIComponent(m.toUid)}">${escapeHtml(m.toName)}</a>`;
    const when = m.sentAt ? new Date(m.sentAt).toLocaleString() : '';

    const div = document.createElement('div');
    div.className = 'mail-card';
    div.innerHTML = `
      <div class="mail-meta">
        <span><strong>From:</strong> ${fromLink}</span> &nbsp;
        <span><strong>To:</strong> ${toLink}</span> &nbsp;
        <span><strong>Sent:</strong> ${escapeHtml(when)}</span>
        ${isFriendReq ? ` &nbsp; <span><strong>Status:</strong> ${escapeHtml(m.status || 'pending')}</span>` : ''}
      </div>
      <div><strong>${escapeHtml(m.subject || (isFriendReq ? 'Friend Request' : '(no subject)'))}</strong></div>
      ${!isFriendReq ? `<div style="white-space:pre-wrap; margin-top:6px;">${escapeHtml(m.body || '')}</div>` : ''}
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        ${isFriendReq && m.toUid === meUid && (m.status === 'pending')
          ? `<button data-act="accept" data-id="${m.id}" data-peer="${m.fromUid}">Accept</button>
             <button data-act="deny"   data-id="${m.id}" data-peer="${m.fromUid}">Deny</button>`
          : ''
        }
        ${!isFriendReq && box === 'inbox'
          ? `<button data-act="reply" data-peer="${m.fromUid}" data-subject="${escapeAttr(replySubject(m.subject))}">Reply</button>`
          : ''
        }
      </div>
    `;
    container.appendChild(div);
  });

  // Wire actions
  container.querySelectorAll('button[data-act]').forEach(btn => {
    const act  = btn.getAttribute('data-act');
    const id   = btn.getAttribute('data-id');
    const peer = btn.getAttribute('data-peer');

    if (act === 'accept') btn.onclick = () => acceptFriend(id, peer);
    if (act === 'deny')   btn.onclick = () => denyFriend(id);
    if (act === 'reply')  btn.onclick = () => {
      showView('Compose');
      q('toInput').value = peer;
      getDisplayName(peer).then(name => q('resolvedTo').value = `${name} (${shortUid(peer)})`);
      q('subjectInput').value = replySubject(btn.getAttribute('data-subject'));
      q('bodyInput').focus();
    };
  });
}

function replySubject(s) {
  s = s || '';
  if (/^re:/i.test(s)) return s;
  return 'Re: ' + s;
}

// ---- Compose sending ----

// Minimal content moderation (expand this list later if you want)
const BANNED = [
  'sex','fuck','shit','bitch','cunt','asshole','dick','pussy','nigger','faggot'
];

q('sendBtn').onclick = async () => {
  const toRaw = (q('toInput').value || '').trim();
  const subject = (q('subjectInput').value || '').trim();
  const body = (q('bodyInput').value || '').trim();

  q('composeStatus').textContent = '';

  if (!toRaw) return (q('composeStatus').textContent = 'Please enter a recipient (username or UID).');

  // content filter (case-insensitive, simple)
  const lower = (subject + ' ' + body).toLowerCase();
  if (BANNED.some(w => lower.includes(w))) {
    q('composeStatus').textContent = 'Your message contains inappropriate language.';
    return;
  }

  const toUid = await resolveRecipient(toRaw);
  if (!toUid) return (q('composeStatus').textContent = 'No user found with that username/UID.');

  try {
    const msgRef = push(ref(db, 'mail'));
    const message = {
      type: 'mail',
      fromUid: meUid,
      toUid,
      subject,
      body,
      status: 'unread',       // for regular mail
      sentAt: Date.now()
    };
    await set(msgRef, message);
    await Promise.all([
      set(ref(db, `userMailIndex/${meUid}/sent/${msgRef.key}`), true),
      set(ref(db, `userMailIndex/${toUid}/inbox/${msgRef.key}`), true),
    ]);
    q('composeStatus').textContent = 'Message sent!';
    q('subjectInput').value = '';
    q('bodyInput').value = '';
    // Keep toInput as-is (handy for multiple messages)
  } catch (e) {
    console.error(e);
    q('composeStatus').textContent = 'Failed to send. Try again.';
  }
};

// ---- Friend request actions ----
async function acceptFriend(mailId, peerUid) {
  await update(ref(db, `mail/${mailId}`), { status: 'accepted' });
  await Promise.all([
    set(ref(db, `users/${meUid}/friends/${peerUid}`), true),
    set(ref(db, `users/${peerUid}/friends/${meUid}`), true),
  ]);
  loadInbox();
}

async function denyFriend(mailId) {
  await update(ref(db, `mail/${mailId}`), { status: 'denied' });
  loadInbox();
}

// ---- Recipient resolution & names ----
async function resolveRecipient(value) {
  // If value *looks* like a UID (lengthy), try direct
  if (value.length >= 20) {
    const s = await get(ref(db, `users/${value}`));
    if (s.exists()) return value;
  }
  // otherwise search by username/loginName (exact match)
  const usersSnap = await get(ref(db, 'users'));
  if (!usersSnap.exists()) return null;
  const users = usersSnap.val() || {};
  for (const [uid, u] of Object.entries(users)) {
    const name = (u.username || u.loginName || '').trim().toLowerCase();
    if (name && name === value.toLowerCase()) return uid;
  }
  return null;
}

async function getNamesMap(uids) {
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
async function getDisplayName(uid) {
  const s = await get(ref(db, `users/${uid}`));
  if (!s.exists()) return shortUid(uid);
  const u = s.val();
  return u.username || u.loginName || shortUid(uid);
}

// ---- utils ----
function escapeHtml(str){ return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
function escapeAttr(str){ return String(str).replace(/"/g, '&quot;'); }
function shortUid(id){ return id ? id.slice(0,6) + '…' : '(unknown)'; }
