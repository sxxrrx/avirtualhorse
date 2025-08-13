// shows-auto.js
import { db } from './firebase-init.js';
import { ref, get, push, set, query, orderByChild, startAt } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour } from './time.js';

const SPECIALTIES = ['English','Jumper','Racing','Western'];

/**
 * Ensure there are at least N upcoming OPEN shows per specialty starting within the next H hours.
 * Anyone can call this; it’s safe and cheap.
 */
export async function ensureUpcomingShows({ minPerSpec = 6, horizonHours = 48 } = {}){
  const nowH = currentGameHour();

  // read all shows that start >= now and < now + horizonHours
  const snap = await get(ref(db, 'shows'));
  const all = snap.exists() ? Object.values(snap.val() || {}) : [];

  for (const spec of SPECIALTIES) {
    const candidates = all.filter(s =>
      s && (s.specialty === spec || s.discipline === spec) &&
      s.status === 'open' &&
      typeof s.startsAtGameHour === 'number' &&
      s.startsAtGameHour > nowH &&
      s.startsAtGameHour <= nowH + horizonHours
    );

    if (candidates.length >= minPerSpec) continue;

    const toMake = minPerSpec - candidates.length;
    for (let i = 0; i < toMake; i++) {
      const idRef = push(ref(db, 'shows'));
      const startIn = 2 + i * 3; // stagger starts
      const br = bracket(i);
      const show = {
        id: idRef.key,
        name: autoName(spec, nowH + startIn),
        specialty: spec,
        minLevel: br.min, maxLevel: br.max,
        fee: null,
        maxEntrants: 16,
        createdByUid: 'system',
        createdByName: 'System',
        createdAtMs: Date.now(),
        startsAtGameHour: nowH + startIn,
        status: 'open',
        entrants: null
      };
      await set(idRef, show);
    }
  }
}

function bracket(i){
  // simple rotating brackets; tweak as you like
  const table = [
    { min:1,   max:9  },
    { min:10,  max:24 },
    { min:25,  max:49 },
    { min:50,  max:74 },
    { min:75,  max:99 },
    { min:100, max:149 },
    { min:150, max:199 },
    { min:200, max:249 },
    { min:250, max:300 },
  ];
  return table[i % table.length];
}
function autoName(spec, gh){
  return `${spec} Show #${gh}`;
}
