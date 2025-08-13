// feature-guards.js
import { guardButton, checkFeature } from './gating.js';

const $ = id => document.getElementById(id);

function note(elOrId, text){
  const el = typeof elOrId === 'string' ? $(elOrId) : elOrId;
  if (!el) return;
  let span = el.querySelector?.('.guard-note') || null;
  if (!span) {
    span = document.createElement('span');
    span.className = 'guard-note';
    el.appendChild(span);
  }
  span.textContent = text || '';
}

/** Magic Shop page (locks whole shop until L6; converter until L8) */
export function guardMagicPage(user){
  // Whole magic shop container
  const shop = $('#magicStoreSection') || $('#storeGrid') || $('#pageMain');
  const { ok, reason } = checkFeature(user, 'magic_shop');
  if (!ok && shop){
    shop.classList.add('guard-disabled');
    note(shop, reason);
  }
  // Converter button + inputs until L8
  const convertBtn = $('#btnConvert');
  const convertBox = $('#converterSection') || convertBtn?.closest?.('.card') || convertBtn?.parentElement;
  const conv = checkFeature(user, 'coin_to_pass');
  if (!conv.ok){
    if (convertBtn) convertBtn.disabled = true;
    if ($('#coinsToConvert')) $('#coinsToConvert').disabled = true;
    if (convertBox) note(convertBox, conv.reason);
  }
}

/** Clubhouse page (locks page until L15; hire rider until L25) */
export function guardClubhouse(user){
  const page = $('#clubhouseMain') || $('#pageMain') || document.querySelector('.main-content');
  const club = checkFeature(user, 'clubhouse');
  if (!club.ok && page){
    page.classList.add('guard-disabled');
    note(page, club.reason);
  }
  const hireBtn = $('#btnConfirmHire');
  guardButton(hireBtn, user, 'hire_rider');
}

/** Vet Assistant Job page/section (locks until L20) */
export function guardVetJob(user){
  const sec = $('#vetJobSection') || $('#pageMain') || document.querySelector('.main-content');
  const { ok, reason } = checkFeature(user, 'vet_job');
  if (!ok && sec){
    const btn = $('#btnApplyVetJob') || sec.querySelector('button');
    if (btn) btn.disabled = true;
    sec.classList.add('guard-disabled');
    note(sec, reason);
  }
}

/** Market: Sell tab locked until L5 */
export function guardMarket(user){
  guardButton($('#tabSell'), user, 'market_sell');
  guardButton($('#linkSellHorses'), user, 'market_sell');
}

/** Create Show page (extra belt-and-suspenders, button already guarded in your create-show.js) */
export function guardCreateShow(user){
  guardButton($('#btnCreate'), user, 'create_shows');
}

/** Mail compose (send locked until L10) */
export function guardMailCompose(user){
  guardButton($('#btnSendMail'), user, 'send_mail');
}

/** Breeding UI (button locked until L7; keep your per-horse lvl/age rules elsewhere) */
export function guardBreeding(user){
  guardButton($('#btnBreedNow'), user, 'breeding');
}

/** Optional: enforcing horse count gates when buying from store/rescue */
export function maxHorsesAllowed(user){
  const lvl = Number(user?.level || 1);
  // base 1 horse; +1 at each level from 2..30
  return Math.min(1 + Math.max(0, Math.min(lvl,30) - 1), 30);
}
export function guardHorsePurchase(user, currentOwned){
  const cap = maxHorsesAllowed(user);
  if (currentOwned >= cap) {
    alert(`You’ve reached your current horse limit (${cap}). Level up to unlock more slots.`);
    return false;
  }
  return true;
}
