// gating.js
export const FEATURE_LEVELS = {
  buy_second_horse: 2,
  buy_third_horse: 3,           // and so on, your UI can enforce continuing pattern
  market_sell: 5,
  create_shows: 5,
  magic_shop: 6,
  breeding: 7,                  // horses still must be lvl 10+ (your rule) + any age checks
  coin_to_pass: 8,
  send_mail: 10,
  clubhouse: 15,
  vet_job: 20,
  hire_rider: 25
};

export function checkFeature(user, key){
  const need = FEATURE_LEVELS[key] ?? 1;
  const have = Number(user?.level || 1);
  return { ok: have >= need, reason: have >= need ? '' : `Unlocks at level ${need}` };
}

/** Disable a button if locked and add a tooltip. Returns whether it's usable. */
export function guardButton(btn, user, key){
  const { ok, reason } = checkFeature(user, key);
  if (!ok) {
    btn.disabled = true;
    btn.title = reason;
    btn.classList.add('disabled');
  }
  return ok;
}

/** Generic level check helper for one-off gates */
export function requireLevel(user, min, reason){
  const have = Number(user?.level || 1);
  return { ok: have >= min, reason: have >= min ? '' : (reason || `Requires level ${min}`) };
}
