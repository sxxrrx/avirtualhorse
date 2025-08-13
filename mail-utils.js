// mail-utils.js
import { db } from './firebase-init.js';
import { ref, push, set, update, remove } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

/** Send a non-replyable system mail from "GAME" */
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

/** Mark as read */
export async function markMailRead(uid, mailId){
  await update(ref(db, `mail/${mailId}`), { status: 'read' });
}

/** Delete mail from player's inbox. We keep the global mail doc (optional), remove user index. */
export async function deleteMail(uid, mailId){
  await remove(ref(db, `userMailIndex/${uid}/inbox/${mailId}`));
  // optional: also mark on the mail doc
  await update(ref(db, `mail/${mailId}`), { status: 'deleted' });
}
