// rate-limit.js
import { db } from './firebase-init.js';
import { ref, runTransaction } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

/**
 * Atomically enforce an action cooldown per user+key.
 * Returns true if allowed (and records the time), false if still cooling down.
 */
export async function rateLimitAllow(uid, key, windowMs){
  if (!uid || !key || !windowMs) return false;
  const r = ref(db, `users/${uid}/cooldowns/${key}`);
  const now = Date.now();

  const tx = await runTransaction(r, last => {
    const prev = Number(last || 0);
    // If still within the window, return the same value to "reject"
    if (now - prev < windowMs) return last;
    // Accept: set new timestamp
    return now;
  });

  // Allowed if the node now equals our "now"
  return tx.committed && Number(tx.snapshot.val() || 0) === now;
}
