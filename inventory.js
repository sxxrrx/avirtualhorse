// inventory.js
// Tiny helpers for tack inventory kept at users/{uid}/inventory/tack
// NOTE: Keeps your existing ARRAY shape to avoid migrations.

import { db } from './firebase-init.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

export async function loadTack(uid){
  const snap = await get(ref(db, `users/${uid}/inventory/tack`));
  if (!snap.exists()) return [];
  const v = snap.val();
  return Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {});
}

export async function saveTackArray(uid, items){
  // Overwrite the array (your current behavior)
  await set(ref(db, `users/${uid}/inventory/tack`), items);
}

export async function addTackItem(uid, currentItems, item){
  const arr = Array.isArray(currentItems) ? currentItems.slice() : [];
  arr.push(item);
  await saveTackArray(uid, arr);
  return arr;
}
