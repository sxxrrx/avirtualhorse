// time.js
// ---------- Game clock ----------
export const GAME_EPOCH_UTC = Date.UTC(2025, 0, 1);
// 1 game hour = 30 real minutes (so 24 game hours = 12 real hours)
export const REAL_MS_PER_GAME_HOUR = 30 * 60 * 1000;

export function currentGameHour(now = Date.now()) {
  return Math.floor((now - GAME_EPOCH_UTC) / REAL_MS_PER_GAME_HOUR);
}
export function currentGameDay(now = Date.now()) {
  return Math.floor(currentGameHour(now) / 24);
}
export function yearsToHours(y) { return y * 365 * 24; }
export function hoursToDays(h)  { return Math.max(0, Math.ceil(h / 24)); }

// ---------- Seasons & date helpers ----------
export function seasonForDate(d) {
  const m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const inRange = (sm,sd,em,ed)=> (m>sm || (m===sm && day>=sd)) && (m<em || (m===em && day<=ed));
  if (inRange(3,20,6,19))  return "Verdant's Bloom";
  if (inRange(6,20,9,21))  return "Summer's Height";
  if (inRange(9,22,12,20)) return "Harvest's Embrace";
  return "Winter's Hold";
}
export function gameDateParts(now = Date.now()) {
  const gh = currentGameHour(now);
  const day = Math.floor(gh / 24);
  const hour = gh % 24;
  const date = new Date(GAME_EPOCH_UTC + day * 86400000);
  return { day, hour, date };
}

// ---------- Age math (Y/M/D <-> days) ----------
export function ymdToDays(age) {
  if (!age) return 0;
  const y = age.years|0, m = age.months|0, d = age.days|0;
  return y*365 + m*30 + d;
}
export function daysToYMD(days) {
  days = Math.max(0, days|0);
  const years = Math.floor(days / 365);
  const months = Math.floor((days - years*365) / 30);
  const d = days - years*365 - months*30;
  return { years, months, days: d };
}
export function formatAgeDisplay(ageDays) {
  if (ageDays < 30) return `${ageDays} day(s)`; // foal view
  const {years, months} = daysToYMD(ageDays);
  if (years === 0) return `${months} month(s)`;
  return `${years} year(s) ${months} month(s)`;
}

// ---------- Aging pace: 7 age-days per 1 real day ----------
export const AGE_DAYS_PER_REAL_DAY = 7;
const REAL_DAY_MS = 24 * 60 * 60 * 1000;

export function calcAgeDaysDelta(lastRealMs, now = Date.now()) {
  // If we don't have a last timestamp, no delta yet.
  if (!lastRealMs) return 0;
  const realDays = (now - lastRealMs) / REAL_DAY_MS;
  return Math.floor(realDays * AGE_DAYS_PER_REAL_DAY);
}

/**
 * Mutates `horse` in-place if aging occurs.
 * Returns the number of age-days added (0 if none).
 *
 * Fields used/maintained on horse:
 * - horse.ageDays (number) — authoritative age in days
 * - horse.age {years,months,days} — kept in sync for UI/backcompat
 * - horse.ageMeta.lastAgeRealMs — last real-time checkpoint for aging
 */
export function updateHorseAgeByRealTime(horse, now = Date.now()) {
  if (!horse) return 0;

  // Initialize storage
  horse.age ||= { years: 0, months: 0, days: 0 };
  horse.ageMeta ||= {};

  // If no ageDays yet, derive from legacy Y/M/D once
  if (typeof horse.ageDays !== 'number') {
    horse.ageDays = ymdToDays(horse.age);
  }

  // If we've never recorded a baseline, set it now and bail (no instant aging)
  if (!horse.ageMeta.lastAgeRealMs) {
    horse.ageMeta.lastAgeRealMs = now;
    return 0;
  }

  // Compute delta
  const addDays = calcAgeDaysDelta(horse.ageMeta.lastAgeRealMs, now);
  if (addDays <= 0) return 0;

  // Apply aging
  horse.ageDays += addDays;
  horse.age = daysToYMD(horse.ageDays);

  // Advance the baseline by exactly the real time "consumed" by the applied delta
  // so we don't double-count on the next call.
  const consumedMs = Math.floor((addDays / AGE_DAYS_PER_REAL_DAY) * REAL_DAY_MS);
  horse.ageMeta.lastAgeRealMs += consumedMs;

  return addDays;
}

/**
 * Apply aging to all horses for a user.
 * - Skips aging while frozen.
 * - While frozen, we move the baseline forward so no backlog accrues.
 * Returns the same userData object (mutated horses inside).
 */
export function updateHorsesAgesIfNeeded(userData, now = Date.now()) {
  if (!userData) return userData;

  const frozen = !!userData.freeze?.isFrozen;

  const arr = Array.isArray(userData.horses)
    ? userData.horses
    : Object.values(userData.horses || {});
  for (const h of arr) {
    if (!h) continue;

    h.age ||= { years: 0, months: 0, days: 0 };
    h.ageMeta ||= {};
    if (typeof h.ageDays !== 'number') {
      h.ageDays = ymdToDays(h.age);
    }

    if (frozen) {
      // Pause aging and also move the baseline to "now"
      // so time spent frozen doesn't dump a backlog later.
      h.ageMeta.lastAgeRealMs = now;
      continue;
    }

    // If no baseline yet, set it and continue.
    if (!h.ageMeta.lastAgeRealMs) {
      h.ageMeta.lastAgeRealMs = now;
      continue;
    }

    const added = updateHorseAgeByRealTime(h, now);
    if (added > 0) {
      // h.age & h.ageDays already updated
    }
  }
  return userData;
}

