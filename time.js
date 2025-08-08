// time.js
export const GAME_EPOCH_UTC = Date.UTC(2025, 0, 1);
// 1 game hour = 30 real minutes
export const REAL_MS_PER_GAME_HOUR = 30 * 60 * 1000;

export function currentGameHour(now = Date.now()) {
  return Math.floor((now - GAME_EPOCH_UTC) / REAL_MS_PER_GAME_HOUR);
}
export function currentGameDay(now = Date.now()) {
  return Math.floor(currentGameHour(now) / 24);
}
export function yearsToHours(y) { return y * 365 * 24; }
export function hoursToDays(h)  { return Math.max(0, Math.ceil(h / 24)); }

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
// ---- aging helpers ----
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
  if (years === 0) return `${months} month(s)`; // young horse under 1 year
  return `${years} year(s) ${months} month(s)`;
}

/**
 * Apply daily rollover aging if needed.
 * Skips entirely if the account is currently frozen.
 * Call this on login or whenever you fetch the user's horses.
 */
export function updateHorsesAgesIfNeeded(userData) {
  const today = currentGameDay();
  if (!userData || !userData.horses) return userData;

  // If account is frozen, do not advance ages at all.
  if (userData.freeze?.isFrozen) return userData;

  const horses = Array.isArray(userData.horses)
    ? userData.horses
    : Object.values(userData.horses || {});
  horses.forEach(h => {
    if (!h) return;
    // Initialize ageDays once from legacy age object if needed
    if (typeof h.ageDays !== 'number') {
      h.ageDays = ymdToDays(h.age);
    }
    const last = (h.ageLastUpdatedGameDay ?? today);
    const diff = today - last;
    if (diff > 0) {
      h.ageDays += diff;
      h.age = daysToYMD(h.ageDays);
      h.ageLastUpdatedGameDay = today;
    } else if (h.ageLastUpdatedGameDay == null) {
      h.ageLastUpdatedGameDay = today;
    }
  });
  return userData;
}
