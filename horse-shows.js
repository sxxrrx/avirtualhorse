// horse-shows.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, runTransaction, onValue } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour } from './time.js';
import { logHorseEvent } from './horse-history-log.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const horseId = params.get('id');

const SPECIALTIES = ['English','Jumper','Racing','Western'];

// Age rules
const AGE_DAYS_2Y = 2 * 365;
const AGE_DAYS_1Y = 1 * 365;

// Entry XP on *enter*
const HORSE_EXP_ON_ENTRY  = 5;
const PLAYER_EXP_ON_ENTRY = 5;

// UI state
let currentSpec = 'English';

// Data state
let uid = null;
let userData = null;
let horse = null;
let showsCache = {}; // raw snapshot

// ---------- boot ----------
onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  if (!horseId) return fail('No horse specified.');

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) return fail('User not found.');
  userData = us.val();

  const horses = toArray(userData.horses);
  horse = horses.find(h => h?.id === horseId);
  if (!horse) return fail('Horse not found.');

  paintHeader();

  $('#tabEnglish').onclick = () => switchSpec('English');
  $('#tabJumper').onclick  = () => switchSpec('Jumper');
  $('#tabRacing').onclick  = () => switchSpec('Racing');
  $('#tabWestern').onclick = () => switchSpec('Western');

  onValue(ref(db, 'shows'), snap => {
    showsCache = snap.exists() ? snap.val() : {};
    renderShows();
  });
});

function fail(msg){
  const el = document.querySelector('#pageMain') || document.body;
  el.innerHTML = `<p>${escapeHtml(msg)}</p>`;
}

// ---------- header ----------
function paintHeader(){
  $('#pageTitle').textContent = `${horse.name || 'Horse'} — Enter Shows`;
  $('#horseImage').src = horse.image || 'horse-placeholder.png';

  const level = Number(horse.level || 1);
  const ageText = formatAge(horse);
  const tack = hasRequiredTack(horse, currentSpec) ? `<span class="pill">Tack OK</span>` : `<span class="pill warn">Need specialty or Standard tack</span>`;

  $('#horseMeta').innerHTML = `Level: <strong>${level}</strong> • Age: <strong>${ageText}</strong> • ${tack}`;
  $('#reqLine').innerHTML = `<span class="muted">Must be 2y+ (or 1y+ with item), tack equipped, and meet level/entry limits.</span>`;
}

// ---------- tabs ----------
function switchSpec(spec){
  currentSpec = spec;
  ['tabEnglish','tabJumper','tabRacing','tabWestern'].forEach(id => $(id).classList.toggle('active', id === 'tab'+spec));
  renderShows();
}

// ---------- render shows ----------
function renderShows(){
  const grid = $('#showsGrid'); if (!grid) return;
  grid.innerHTML = '';

  // Inflate to array with ids from keys
  const showsArr = Object.entries(showsCache).map(([id, s]) => ({ id, ...s }));

  const arr = showsArr.filter(s => {
    if (!s) return false;
    const spec = (s.specialty || s.discipline || '').toString();
    if (spec !== currentSpec) return false;
    const nowH = currentGameHour();
    if (s.status !== 'open') return false;
    if (typeof s.startsAtGameHour === 'number' && nowH >= s.startsAtGameHour) return false;
    const count = s.entrants ? Object.keys(s.entrants).length : 0;
    if (s.maxEntrants && count >= s.maxEntrants) return false;
    if (s.entrants && s.entrants[horse.id]) return false;
    return true;
  });

  if (arr.length === 0){
    $('#emptyMsg').style.display = 'block';
    return;
  } else {
    $('#emptyMsg').style.display = 'none';
  }

  arr.sort((a,b)=> (a.startsAtGameHour||0) - (b.startsAtGameHour||0));

  arr.forEach(show => {
    const card = document.createElement('div');
    card.className = 'card';

    const entryFee = resolveEntryFee(show, horse);
    const entrants = show.entrants ? Object.keys(show.entrants).length : 0;

    const reasons = [];
    if (!meetsAgeRule(horse, userData)) reasons.push('Too young');
    if (!hasRequiredTack(horse, show.specialty || show.discipline)) reasons.push('Need tack');
    if (!meetsLevelRule(horse, show)) reasons.push('Level mismatch');
    if (!meetsPlayerLevelForHighShows(userData, show)) reasons.push('Player must be L20+ for L50+ shows');
    if (!meetsCreateQuota(userData)) reasons.push('Create more shows to unlock entries');

    const canEnter = reasons.length === 0 && Number(userData.coins||0) >= Number(entryFee||0);

    card.innerHTML = `
      <h3>${escapeHtml(show.name || 'Show')}</h3>
      <div class="muted">${escapeHtml(show.specialty || show.discipline || '')}</div>
      <div>Levels: ${show.minLevel || 1} – ${show.maxLevel || 999}</div>
      <div>Entry fee: <strong>${Number(entryFee||0).toLocaleString()}</strong> • Entrants: ${entrants}/${show.maxEntrants || '∞'}</div>
      <div>Starts in ~${Math.max(0,(show.startsAtGameHour||0)-currentGameHour())} in-game hours</div>
      <div class="row">
        <button ${canEnter ? '' : 'disabled'}>Enter</button>
        ${!canEnter ? `<span class="muted">${reasons.join(' • ') || 'Not eligible'}</span>` : ''}
      </div>
    `;
    card.querySelector('button').onclick = () => enterShow(show, entryFee);
    grid.appendChild(card);
  });
}

// ---------- eligibility ----------
function meetsAgeRule(h, u){
  const days = (typeof h.ageDays === 'number') ? h.ageDays : ymdToDays(h.age || {years:0,months:0,days:0});
  const hasEarly = hasEarlyEntryToken(u, h.id);
  return days >= (hasEarly ? AGE_DAYS_1Y : AGE_DAYS_2Y);
}
function meetsLevelRule(h, show){
  const l = Number(h.level || 1);
  const minL = Number(show.minLevel || 1);
  const maxL = Number(show.maxLevel || 999);
  return l >= minL && l <= maxL;
}
function meetsPlayerLevelForHighShows(user, show){
  const minL = Number(show.minLevel || 1);
  if (minL < 50) return true;
  return Number(user.level || 1) >= 20;
}
function meetsCreateQuota(user){
  const level = Number(user.level || 1);
  if (level < 5) return true;
  const created = Number(user.showStats?.createdTotal || 0);
  const entered = Number(user.showStats?.enteredTotal || 0);
  return entered < created * 2;
}

function hasRequiredTack(h, specRaw){
  const spec = (specRaw || '').toString().toLowerCase();
  const t = h.tack || h.tackSet || h.equippedTack || (h.tack && h.tack.set);
  if (!t) return false;
  const s = (t.specialty || (t.set && t.set.specialty) || (t.items && t.items.specialty) || (typeof t === 'string' ? t : '') || '').toString().toLowerCase();
  if (!s) return false;
  if (s === 'standard') return true;
  return s === spec;
}

function hasEarlyEntryToken(user, horseId){
  const inv = user.magicInventory || {};
  const nowH = currentGameHour();
  return Object.values(inv).some(it => {
    if (!it) return false;
    if (it.key !== 'hebe_horseshoe') return false;
    if (it.boundHorseId !== horseId) return false;
    if (typeof it.expiresAtGameHour === 'number' && it.expiresAtGameHour <= nowH) return false;
    return true;
  });
}

// ---------- entry fee fallback ----------
function resolveEntryFee(show, h){
  if (show.fee != null) return Number(show.fee);
  const l = Number(h.level || 1);
  if (l < 5)   return 5;
  if (l < 10)  return 10;
  if (l < 25)  return 15;
  if (l < 50)  return 20;
  if (l < 100) return 30;
  if (l < 150) return 40;
  if (l < 200) return 50;
  if (l < 250) return 60;
  return 75;
}

// ---------- enter flow ----------
async function enterShow(show, entryFee){
  const sRef = ref(db, `shows/${show.id}`);
  const fresh = await get(sRef);
  if (!fresh.exists()) return alert('That show no longer exists.');
  const s = fresh.val();

  const nowH = currentGameHour();
  if (s.status !== 'open') return alert('Show is not open.');
  if (typeof s.startsAtGameHour === 'number' && nowH >= s.startsAtGameHour) return alert('Show already started.');

  const entrants = s.entrants ? Object.keys(s.entrants).length : 0;
  if (s.maxEntrants && entrants >= s.maxEntrants) return alert('Show is full.');
  if (s.entrants && s.entrants[horse.id]) return alert('This horse already entered here.');

  if (!meetsAgeRule(horse, userData)) return alert('Horse is too young for this show.');
  if (!hasRequiredTack(horse, s.specialty || s.discipline)) return alert('This horse needs the right tack (or Standard).');
  if (!meetsLevelRule(horse, s)) return alert('Horse level does not meet the show bracket.');
  if (!meetsPlayerLevelForHighShows(userData, s)) return alert('Player must be level 20+ for L50+ shows.');
  if (!meetsCreateQuota(userData)) return alert('Create more shows to unlock more entries.');

  const fee = Number(resolveEntryFee(s, horse) || 0);

  const userRef = ref(db, `users/${uid}`);
  const horsePath = resolveHorsePath(userData, horse.id);

  const txn = await runTransaction(userRef, u => {
    if (!u) return u;
    const coins = Number(u.coins || 0);
    if (coins < fee) return;

    const level = Number(u.level || 1);
    if (level >= 5) {
      const created = Number(u.showStats?.createdTotal || 0);
      const entered = Number(u.showStats?.enteredTotal || 0);
      if (entered >= created * 2) return;
    }

    const [container, key] = horsePath;
    if (!u[container] || !u[container][key]) return;

    const h = { ...u[container][key] };
    h.exp = Number(h.exp || 0) + HORSE_EXP_ON_ENTRY;

    const next = {
      ...u,
      coins: Number(u.coins || 0) - fee,
      exp:   Number(u.exp   || 0) + PLAYER_EXP_ON_ENTRY,
      showStats: {
        createdTotal: Number(u.showStats?.createdTotal || 0),
        enteredTotal: Number(u.showStats?.enteredTotal || 0) + 1
      }
    };
    next[container] = { ...(u[container] || {}) };
    next[container][key] = h;

    return next;
  });

  if (!txn.committed) {
    return alert('Could not enter — check coins or entry limits.');
  }

  const entrant = {
    ownerUid: uid,
    ownerName: userData.username || userData.loginName || 'Player',
    horseId: horse.id,
    horseName: horse.name || 'Horse',
    level: Number(horse.level || 1),
    enteredAtGameHour: currentGameHour()
  };
  await update(sRef, { [`entrants/${horse.id}`]: entrant });

  // NEW: index this show for this horse so we can list results quickly
  await update(ref(db, `horseShowsIndex/${horse.id}`), { [show.id]: true });

  // history: entry
  await logHorseEvent(horse.id, 'show_entered', {
    showId: show.id, showName: show.name || 'Show', fee
  });

  alert('Entered!');
}

// ---------- helpers ----------
function toArray(v){ return Array.isArray(v) ? v.filter(Boolean) : Object.values(v||{}); }

function resolveHorsePath(user, id){
  if (Array.isArray(user.horses)) {
    const idx = user.horses.findIndex(h => h?.id === id);
    return ['horses', String(idx)];
  }
  const entries = Object.entries(user.horses || {});
  for (const [k, h] of entries) if (h?.id === id) return ['horses', k];
  return ['horses', '0'];
}

function formatAge(h){
  const d = typeof h.ageDays === 'number' ? h.ageDays : ymdToDays(h.age || {years:0,months:0,days:0});
  if (d < 30) return `${d} day(s)`;
  const y = Math.floor(d / 365);
  const m = Math.floor((d - y*365) / 30);
  if (y === 0) return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}
function ymdToDays(age){
  if (!age) return 0;
  const y = age.years|0, m = age.months|0, d = age.days|0;
  return y*365 + m*30 + d;
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
