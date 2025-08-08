// horse-history-log.js
import { db } from './firebase-init.js';
import { ref, push, set, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour, yearsToHours } from './time.js';

/**
 * Core logger. Writes one record under /horseEvents/{horseId}
 * kind: 'born' | 'purchased' | 'sold' | 'bred' | 'foaled'
 * details: freeform object (seller/buyer/parents/partner/etc)
 * meta: { byUid?, byName?, atGh? }  (atGh is optional override)
 */
export async function logHorseEvent(horseId, kind, details = {}, meta = {}) {
  if (!horseId || !kind) return;
  const atGh = typeof meta.atGh === 'number' ? meta.atGh : currentGameHour();
  const rec = {
    kind, details,
    byUid: meta.byUid || null,
    byName: meta.byName || null,
    atGh,
    atMs: Date.now()
  };
  const evRef = push(ref(db, `horseEvents/${horseId}`));
  await set(evRef, rec);
}

/** Convenience: log both sides of a transfer (sold + purchased). */
export async function logTransfer(horseId, { sellerUid=null, sellerName=null, buyerUid=null, buyerName=null, price=0 } = {}) {
  const gh = currentGameHour();
  await Promise.all([
    logHorseEvent(horseId, 'sold',      { buyerUid,  buyerName,  price }, { atGh: gh }),
    logHorseEvent(horseId, 'purchased', { sellerUid, sellerName, price }, { atGh: gh }),
  ]);
}

/** Breeding: log onto BOTH parents with a partner reference. */
export async function logBreedingPair({ sireId, sireOwnerUid, sireName }, { damId, damOwnerUid, damName }) {
  const gh = currentGameHour();
  const sireDetails = { partnerId: damId, partnerOwnerUid: damOwnerUid, partnerName: damName, role: 'dam' };
  const damDetails  = { partnerId: sireId, partnerOwnerUid: sireOwnerUid, partnerName: sireName, role: 'sire' };
  await Promise.all([
    logHorseEvent(sireId, 'bred', sireDetails, { atGh: gh }),
    logHorseEvent(damId,  'bred', damDetails,  { atGh: gh }),
  ]);
}

/** Foaling: add 'born' on foal with parents, and 'foaled' on the dam. */
export async function logFoalBirth({ foalId, foalName }, { sireId, sireOwnerUid, sireName }, { damId, damOwnerUid, damName }) {
  const gh = currentGameHour();
  await Promise.all([
    logHorseEvent(foalId, 'born',   {
      sireId, sireOwnerUid, sireName,
      damId,  damOwnerUid,  damName
    }, { atGh: gh }),
    logHorseEvent(damId,  'foaled', {
      foalId, foalName
    }, { atGh: gh })
  ]);
}

/**
 * Backfill a birth record for “origin horses” (e.g., Town Store) who
 * arrive without parents. Writes one 'born' entry dated N years ago.
 */
export async function logStoreBirthIfMissing(horseId, approxYears = 2) {
  if (!horseId) return;
  const snap = await get(ref(db, `horseEvents/${horseId}`));
  const hasBorn = snap.exists() &&
    Object.values(snap.val()).some(e => String(e?.kind).toLowerCase() === 'born');
  if (hasBorn) return;

  const atGh = currentGameHour() - yearsToHours(approxYears);
  await logHorseEvent(horseId, 'born', { origin: 'Town Store' }, { atGh });
}
