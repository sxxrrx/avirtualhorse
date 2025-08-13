// craft-tack.js
// Pure helpers for crafting probabilities, outputs, and item creation.

export const TACK_TYPES = ['bridle', 'saddle', 'horse_boots', 'horse_shoes'];
export const SPECIALTIES = ['Standard', 'English', 'Jumper', 'Racing', 'Western'];

export function prettyType(t){
  switch(t){
    case 'horse_boots': return 'Horse Boots';
    case 'horse_shoes': return 'Horse Shoes';
    default: return t.charAt(0).toUpperCase()+t.slice(1);
  }
}

export function qualityProbabilities(level){
  if (level < 5)      return [{q:'Poor',       p:1.00}];
  if (level < 15)     return [{q:'Fair',       p:0.85},{q:'Poor',       p:0.15}];
  if (level < 30)     return [{q:'Good',       p:0.75},{q:'Fair',       p:0.15},{q:'Poor',       p:0.10}];
  if (level < 60)     return [{q:'Very Good',  p:0.60},{q:'Good',       p:0.20},{q:'Fair',       p:0.20}];
  if (level < 100)    return [{q:'Very Good',  p:0.85},{q:'Good',       p:0.15}];
  if (level < 200)    return [{q:'Excellent',  p:0.50},{q:'Very Good',  p:0.50}];
  if (level < 250)    return [{q:'Divine',     p:0.45},{q:'Excellent',  p:0.55}];
  return                    [{q:'Divine',     p:1.00}];
}

export function durabilityFor(q){
  switch(q){
    case 'Poor': return 20;
    case 'Fair': return 50;
    case 'Good': return 80;
    case 'Very Good': return 120;
    case 'Excellent': return 250;
    case 'Divine': return 500;
    default: return 10;
  }
}

export function expFor(q){
  switch(q){
    case 'Poor': return 10;
    case 'Fair': return 15;
    case 'Good': return 20;
    case 'Very Good': return randInt(25,30);
    case 'Excellent': return randInt(50,75);
    case 'Divine': return randInt(100,150);
    default: return 0;
  }
}

export function pickQuality(probs){
  const r = Math.random();
  let cum = 0;
  for (const p of probs) {
    cum += p.p;
    if (r <= cum) return p.q;
  }
  return probs[probs.length-1].q;
}

export function craftTackItem(userLevel, type, specialty){
  if (!TACK_TYPES.includes(type)) throw new Error('Invalid tack type');
  if (!SPECIALTIES.includes(specialty)) throw new Error('Invalid specialty');

  const probs = qualityProbabilities(Number(userLevel||1));
  const q = pickQuality(probs);
  const uses = durabilityFor(q);
  const exp  = expFor(q);

  const item = {
    id: `tack_${Date.now()}_${Math.floor(Math.random()*1000)}`,
    type,               // 'bridle' | 'saddle' | 'horse_boots' | 'horse_shoes'
    specialty,          // 'Standard' | 'English' | 'Jumper' | 'Racing' | 'Western'
    quality: q,
    showsLeft: uses,
    createdAt: Date.now()
  };

  return { item, exp, quality: q, uses };
}

function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
