// mail-utils.js
import { db } from './firebase-init.js';
import { ref, push, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

/**
 * Send a non-replyable system mail from "GAME" to a single user.
 * This will show up in your existing topbar badge and inbox (post-office).
 */
export async function sendSystemMail(toUid, subject, body) {
  if (!toUid) return;
  const mref = push(ref(db, 'mail'));
  const payload = {
    id: mref.key,
    toUid,
    from: 'GAME',
    type: 'mail',
    subject: subject || 'Message',
    body: body || '',
    postedAt: Date.now(),
    status: 'unread'
  };
  await set(mref, payload);
  // index into user inbox (your topbar is already counting from here)
  await update(ref(db, `userMailIndex/${toUid}/inbox/${mref.key}`), true);
}
// mail-utils.js
import { db } from './firebase-init.js';
import { ref, push, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

/**
 * Send a system (non-replyable) mail to a player.
 * This matches your topbar badge logic:
 * - writes /mail/{id} with {type:'mail', status:'unread'}
 * - indexes at /userMailIndex/{uid}/inbox/{id}: true
 *
 * @returns {Promise<string>} the mail id
 */
export async function sendSystemMail(toUid, subject, body, extra = {}) {
  if (!toUid) return null;

  const idRef = push(ref(db, 'mail'));
  const id = idRef.key;

  const row = {
    id,
    type: 'mail',
    status: 'unread',
    toUid,
    fromUid: 'SYSTEM',
    fromName: 'GAME',
    subject: subject || 'Message from GAME',
    body: body || '',
    postedAt: Date.now(),
    ...extra
  };

  await set(idRef, row);
  await set(ref(db, `userMailIndex/${toUid}/inbox/${id}`), true);

  return id;
}
