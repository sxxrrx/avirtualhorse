// create-show.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, push, set, update, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { guardButton } from './gating.js';
import { rateLimitAllow } from './rate-limit.js';
import { currentGameHour } from './time.js';

const $ = id => document.getElementById(id);

const SPECIALTIES = ['English','Jumper','Racing','Western'];

// tweakable
function createFeeForLevel(level){
  return level >= 20 ? 500 : 250; // easy to tweak later
}

let uid = null;
let me  = null;

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) { alert('User not found.'); return; }
  me = us.val();

  // gate the create button visually
  guardButton($('#btnCreate'), me, 'create_shows');

  // wire
  $('#btnCreate').onclick = doCreate;
  $('#spec').innerHTML = SPECIALTIES.map(s=>`<option>${s}</option>`).join('');
});

async function doCreate(){
  // gate by feature level
  const myLevel = Number(me.level || 1);
  if (myLevel < 5) return alert('You unlock show creation at level 5.');

  // cooldown
  const ok = await rateLimitAllow(uid, 'create_show', 10_000);
  if (!ok) return alert('Please wait a moment before creating another show.');

  const name = ($('#name').value || '').trim() || 'Player Show';
  const spec = $('#spec').value || 'English';
  const minL = Math.max(1, parseInt($('#min').value, 10) || 1);
  const maxL = Math.max(minL, parseInt($('#max').value, 10) || Math.max(minL, 999));
  const startsInH = Math.max(1, parseInt($('#startIn').value, 10) || 2);
  const maxEntrants = Math.max(2, parseInt($('#cap').value, 10) || 16);

  // fee
  const feeCoins = createFeeForLevel(myLevel);
  const coins = Number(me.coins || 0);
  if (coins < feeCoins) return alert(`You need ${feeCoins} coins to create a show.`);
  await update(ref(db, `users/${uid}`), { coins: coins - feeCoins });

  // write show
  const idRef = push(ref(db, 'shows'));
  const show = {
    id: idRef.key,
    name, specialty: spec,
    minLevel: minL, maxLevel: maxL,
    fee: null,                // horses pay their own entry fee rules
    maxEntrants,
    createdByUid: uid,
    createdByName: me.username || me.loginName || 'Player',
    createdAtMs: Date.now(),
    startsAtGameHour: currentGameHour() + startsInH,
    status: 'open',
    entrants: null,
  };
  await set(idRef, show);

  // stats
  const createdTotal = Number(me.showStats?.createdTotal || 0) + 1;
  await update(ref(db, `users/${uid}/showStats`), { createdTotal });

  alert('Show created!');
  // optional: navigate
}

