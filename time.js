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
