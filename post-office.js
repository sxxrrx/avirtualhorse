// post-office.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, push, update, remove } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { mountChrome } from './app-chrome.js';

mountChrome({}); // top/side bars

let me = null;
let meUid = null;
let meLevel = 1;

const q = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const prefillTo = params.get('to') || ''; // when coming from ranch-public

// --- safe wire after DOM is ready ---
document.addEventListener('DOMContentLoaded', () => {
  // Tabs (Compose tab gets gated below)
  q('tabInbox')  && (q('tabInbox').onclick  = () => showView('Inbox'));
  q('tabSent')   && (q('tabSent').onclick   = () => showView('Sent'));
  q('tabCompose')&& (q('tabCompose').onclick= () => showView('Compose'));

  // Send button
  const sendBtn = q('sendBtn');
  if (sendBtn) sendBtn.onclick = sendMail;
});

// ---- Auth & boot ----
onAuthStateChanged(auth, async user => {
  if (!user) return (window.location.href = 'login.html');
  me = user;
  meUid = user.uid;

  // Pull level so we can gate Compose (< L10 locked)
  const us = await get(ref(db, `users/${meUid}`));
  if (us.exists()) {
    const u = us.val();
    meLevel = Number(u.level || 1);
  }

  // Gate compose for < level 10
  gateCompose(meLevel >= 10);

  // If ?to= is present, prefill compose with resolved name (still gated)
  if (prefillTo && meLevel >= 10) {
    showView('Compose');
    const name = await getDisplayName(prefillTo);
    q('toInput')      && (q('toInput').value = prefillTo);          // keep uid in To input
    q('resolvedTo')   && (q('resolvedTo').value = `${name} (${shortUid(prefillTo)})`);
  } else {
    showView('Inbox');
  }
});

// ---- Gate Compose tab/section ----
function gateCompose(allowed){
  const tab = q('tabCompose');
  const view = q('viewCompose');
  const lock = q('composeLocked'); // optional <div id="composeLocked">You unlock mail at L10…</div>
  if (allowed) {
    if (tab)  tab.classList.remove('disabled');
    if (view) view.style.display = 'none'; // default hidden until clicked
    if (lock) lock.style.display = 'none';
  } else {
    if (tab)  tab.classList.add('disabled');
    if (view) view.style.display = 'none';
    if (lock) lock.style.display = 'block'; // show the lock message if you have it
  }
}

// ---- Tab switching ----
function showView(name) {
  // Protect from clicking disabled Compose
  if (name === 'Compose' && meLevel < 10) return;

  ['Inbox','Sent','Compose'].forEach(n => {
    const v = q('view'+n), t = q('tab'+n);
    if (v) v.style.display = (n === name) ? 'block' : 'none';
    if (t) t.classList.toggle('active', n === name);
  });
  if (name === 'Inbox') loadInbox();
  if (name === 'Sent')  loadSent();
}

// ---- Inbox / Sent loaders ----
async function loadInbox() {
  const listEl = q('inboxList'); if (!listEl) return;
  listEl.innerHTML = 'Loading…';

  const idxSnap = await get(ref(db, `userMailIndex/${meUid}/inbox`));
  const ids = idxSnap.exists() ? Object.keys(idxSnap.val()) : [];
  if (ids.length === 0) { listEl.innerHTML = '<p>No messages.</p>'; return; }

  const msgs = await fetchMessages(ids);
  renderMail(listEl, msgs, 'inbox');
}

async function loadSent() {
  const listEl = q('sentList'); if (!listEl) return;
  listEl.innerHTML = 'Loading…';

  const idxSnap = await get(ref(db, `userMailIndex/${meUid}/sent`));
  const ids = idxSnap.exists() ? Object.keys(idxSnap.val()) : [];
  if (ids.length === 0) { listEl.innerHTML = '<p>No sent messages.</p>'; return; }

  const msgs = await fetchMessages(ids);
  renderMail(listEl, msgs, 'sent');
}

async function fetchMessages(ids) {
  // Fetch all by id
  const snaps = await Promise.all(ids.map(id => get(ref(db, `mail/${id}`)).then(s => ({ id, s }))));

  const rows = snaps
    .filter(({ s }) => s.exists())
    .map(({ id, s }) => ({ id, ...s.val() }))
    // Use sentAt (player mail) OR postedAt (system mail)
    .sort((a,b) => ((b.sentAt || b.postedAt || 0) - (a.sentAt || a.postedAt || 0)));

  // Build name map for any UIDs we see
  const uids = new Set();
  rows.forEach(m => { if (m.fromUid) uids.add(m.fromUid); if (m.toUid) uids.add(m.toUid); });
  const nameMap = await getNamesMap([...uids]);

  return rows.map(m => ({
    ...m,
    // prefer stored names, else map, else fallback
    fromName: m.fromName || nameMap[m.fromUid] || (m.fromUid === 'SYSTEM' ? 'GAME' : shortUid(m.fromUid)),
    toName:   m.toName   || nameMap[m.toUid]   || shortUid(m.toUid),
  }));
}

// ---- Rendering ----
function renderMail(container, rows, box) {
  container.innerHTML = '';
  rows.forEach(m => {
    const isFriendReq = m.type === 'friend_request';
    const ts = m.sentAt || m.postedAt || 0;
    const when = ts ? new Date(ts).toLocaleString() : '—';

    const fromIsSystem = (m.fromUid === 'SYSTEM') || (!m.fromUid && m.fromName === 'GAME');
    const fromLabel = fromIsSystem
      ? escapeHtml(m.fromName || 'GAME')
      : `<a href="ranch-public.html?uid=${encodeURIComponent(m.fromUid)}">${escapeHtml(m.fromName || shortUid(m.fromUid))}</a>`;
    const toLabel = m.toUid
      ? `<a href="ranch-public.html?uid=${encodeURIComponent(m.toUid)}">${escapeHtml(m.toName || shortUid(m.toUid))}</a>`
      : escapeHtml(m.toName || '—');

    const div = document.createElement('div');
    div.className = 'mail-card';
    div.innerHTML = `
      <div class="mail-meta">
        <span><strong>From:</strong> ${fromLabel}</span>&nbsp;
        <span><strong>To:</strong> ${toLabel}</span>&nbsp;
        <span><strong>When:</strong> ${escapeHtml(when)}</span>
        ${isFriendReq ? ` &nbsp; <span><strong>Status:</strong> ${escapeHtml(m.status || 'pending')}</span>` : ''}
      </div>
      <div><strong>${escapeHtml(m.subject || (isFriendReq ? 'Friend Request' : '(no subject)'))}</strong></div>
      ${!isFriendReq ? `<div style="white-space:pre-wrap; margin-top:6px;">${escapeHtml(m.body || '')}</div>` : ''}
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        ${isFriendReq && m.toUid === meUid && (m.status === 'pending')
          ? `<button data-act="accept" data-id="${m.id}" data-peer="${m.fromUid}">Accept</button>
             <button data-act="deny"   data-id="${m.id}">Deny</button>`
          : ''
        }
        ${!isFriendReq && box === 'inbox'
          ? `<button data-act="reply" data-peer="${m.fromUid}" data-subject="${escapeAttr(replySubject(m.subject))}" ${fromIsSystem ? 'disabled' : ''}>Reply</button>`
          : ''
        }
        <button data-act="delete" data-id="${m.id}" data-box="${box}">Delete</button>
        ${box === 'inbox' && (m.status || 'unread') !== 'read'
          ? `<button data-act="markread" data-id="${m.id}">Mark read</button>`
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
    const box  = btn.getAttribute('data-box');

    if (act === 'accept')  btn.onclick = () => acceptFriend(id, peer);
    if (act === 'deny')    btn.onclick = () => denyFriend(id);
    if (act === 'reply')   btn.onclick = () => doReply(peer, btn.getAttribute('data-subject'));
    if (act === 'delete')  btn.onclick = () => deleteMail(id, box);
    if (act === 'markread')btn.onclick = () => markRead(id);
  });
}

function doReply(peerUid, subject){
  if (!peerUid) return;
  showView('Compose');
  q('toInput') && (q('toInput').value = peerUid);
  getDisplayName(peerUid).then(name => {
    if (q('resolvedTo')) q('resolvedTo').value = `${name} (${shortUid(peerUid)})`;
  });
  if (q('subjectInput')) q('subjectInput').value = replySubject(subject);
  q('bodyInput') && q('bodyInput').focus();
}

function replySubject(s) {
  s = s || '';
  return /^re:/i.test(s) ? s : ('Re: ' + s);
}

// ---- Compose sending ----
const BANNED = ['sex','fuck','shit','bitch','cunt','asshole','dick','pussy','nigger','faggot'];

async function sendMail(){
  if (meLevel < 10) {
    if (q('composeStatus')) q('composeStatus').textContent = 'Mail unlocks at level 10.';
    return;
  }
  const toRaw   = (q('toInput')?.value || '').trim();
  const subject = (q('subjectInput')?.value || '').trim();
  const body    = (q('bodyInput')?.value || '').trim();
  const statusEl = q('composeStatus'); if (statusEl) statusEl.textContent = '';

  if (!toRaw) { if (statusEl) statusEl.textContent = 'Please enter a recipient (username or UID).'; return; }

  const lower = (subject + ' ' + body).toLowerCase();
  if (BANNED.some(w => lower.includes(w))) {
    if (statusEl) statusEl.textContent = 'Your message contains inappropriate language.'; return;
  }

  const toUid = await resolveRecipient(toRaw);
  if (!toUid) { if (statusEl) statusEl.textContent = 'No user found with that username/UID.'; return; }

  try {
    const msgRef = push(ref(db, 'mail'));
    const message = {
      id: msgRef.key,
      type: 'mail',
      fromUid: meUid,
      toUid,
      subject,
      body,
      status: 'unread',
      sentAt: Date.now()
    };
    await set(msgRef, message);
    await Promise.all([
      set(ref(db, `userMailIndex/${meUid}/sent/${msgRef.key}`), true),
      set(ref(db, `userMailIndex/${toUid}/inbox/${msgRef.key}`), true),
    ]);
    if (statusEl) statusEl.textContent = 'Message sent!';
    if (q('subjectInput')) q('subjectInput').value = '';
    if (q('bodyInput')) q('bodyInput').value = '';
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = 'Failed to send. Try again.';
  }
}

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

// ---- Inbox utilities ----
async function deleteMail(mailId, box){
  // Remove only the index for this user; keep the canonical mail (other party may still need it)
  const path = box === 'sent'
    ? `userMailIndex/${meUid}/sent/${mailId}`
    : `userMailIndex/${meUid}/inbox/${mailId}`;
  await remove(ref(db, path));
  if (box === 'sent') loadSent(); else loadInbox();
}

async function markRead(mailId){
  await update(ref(db, `mail/${mailId}`), { status: 'read' });
  loadInbox();
}

// ---- Recipient resolution & names ----
async function resolveRecipient(value) {
  // If value looks like a UID (20+ chars), try direct
  if ((value || '').length >= 20) {
    const s = await get(ref(db, `users/${value}`));
    if (s.exists()) return value;
  }
  // otherwise exact match by username/loginName
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
function escapeHtml(str){ return String(str||'').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
function escapeAttr(str){ return String(str||'').replace(/"/g, '&quot;'); }
function shortUid(id){ return id ? id.slice(0,6) + '…' : '(unknown)'; }
