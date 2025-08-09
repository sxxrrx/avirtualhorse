// horse.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { daysToYMD, ymdToDays } from './time.js';

const $ = id => document.getElementById(id);
const escapeHtml = s => String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}));
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

// ---------- Tunables ----------
const TREAT_LIMITS_PER_DAY = { carrots: 5, apples: 3, sugarCubes: 1 };
const TREAT_EFFECTS = { carrots: 2, apples: 5, sugarCubes: 10 }; // happiness %
const FEED_SERVING_LBS = 50;                                     // pounds consumed per feed
const FEED_COOLDOWN_MS = 4 * 24 * 60 * 60 * 1000;                // 4 real days
const FEED_BUFF_DUR_MS = 4 * 24 * 60 * 60 * 1000;                // show a “fed” buff for 4 real days

// Same catalogue as market.js (age gates + bonus)
const FEED_PACKS = [
  {id:'ado_basic',   label:'Adolescent Basic (1000 lbs)',    lbs:1000, price: 50,  minM:12,  maxM:29,  bonus:0},
  {id:'ado_premium', label:'Adolescent Premium (1000 lbs)',  lbs:1000, price: 75,  minM:12,  maxM:29,  bonus:5},
  {id:'adult_basic', label:'Adult Basic (1500 lbs)',         lbs:1500, price: 75,  minM:29,  maxM:300, bonus:0},
  {id:'adult_prem',  label:'Adult Premium (1500 lbs)',       lbs:1500, price:125,  minM:29,  maxM:300, bonus:5},
  {id:'adult_elite', label:'Adult Elite (2500 lbs)',         lbs:2500, price:200,  minM:29,  maxM:300, bonus:10},
  {id:'senior',      label:'Senior (1000 lbs)',              lbs:1000, price: 40,  minM:300, maxM:1200, bonus:20}
];

let uid = null;
let userData = null;
let horseId = null;
let horse = null;

// ---------- utils ----------
function yyyymmddUTC(d = new Date()){
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}
function monthsFromAge(age){
  const days = typeof age.ageDays === 'number' ? age.ageDays : ymdToDays(age.age);
  return Math.floor(days / 30);
}
function formatAge(h){
  const days = typeof h.ageDays === 'number' ? h.ageDays : ymdToDays(h.age);
  const ymd = daysToYMD(days);
  if (days < 30) return `${days} day(s)`;
  if (ymd.years === 0) return `${ymd.months} month(s)`;
  return `${ymd.years} year(s) ${ymd.months} month(s)`;
}
function getHorseWritePath(u, id){
  if (Array.isArray(u.horses)) {
    const idx = u.horses.findIndex(h => h?.id === id);
    return { kind:'array', idx };
  }
  const obj = u.horses || {};
  const key = Object.keys(obj).find(k => obj[k]?.id === id);
  return { kind:'object', key };
}
async function saveHorse(){
  if (typeof horse.ageDays === 'number') horse.age = daysToYMD(horse.ageDays);
  const path = getHorseWritePath(userData, horse.id);
  if (path.kind === 'array' && path.idx >= 0) {
    await set(ref(db, `users/${uid}/horses/${path.idx}`), horse);
  } else if (path.kind === 'object' && path.key) {
    await set(ref(db, `users/${uid}/horses/${path.key}`), horse);
  } else {
    console.warn('Could not locate horse write path; skipping save.');
  }
}
function invEnsure(){
  userData.inventory ||= {};
  userData.inventory.treats ||= {};
  userData.inventory.feed ||= {};
}
async function saveInventory(){
  invEnsure();
  await update(ref(db, `users/${uid}/inventory`), userData.inventory);
}

// ---------- boot ----------
onAuthStateChanged(auth, async user => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  const params = new URLSearchParams(location.search);
  horseId = params.get('id');

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) { $('pageMain').innerHTML = '<p>User not found.</p>'; return; }
  userData = us.val();
  const list = Array.isArray(userData.horses) ? userData.horses : Object.values(userData.horses || {});
  horse = list.find(h => h?.id === horseId);
  if (!horse) { $('pageMain').innerHTML = '<p>Horse not found.</p>'; return; }

  // ensure stable fields
  horse.happiness = Number(horse.happiness || 0);
  horse.treatsMeta ||= { dayKey:null, carrots:0, apples:0, sugarCubes:0 };
  horse.feedMeta ||= { lastFedRealMs:0, buffBonus:0, buffExpires:0 };

  renderAll();
  wireActions();
});

// ---------- UI render ----------
function renderAll(){
  $('horseNameHeading').textContent = horse.name || 'Horse';

  if (horse.image) $('horseImage').src = horse.image;
  $('horseDescription').textContent = horse.description || 'No description yet.';

  $('horseColor').textContent   = horse.coatColor || horse.color || '—';
  $('horseBreed').textContent   = horse.breed || '—';
  $('horseGender').textContent  = horse.gender || '—';
  $('horseAge').textContent     = formatAge(horse);
  $('horseLevel').textContent   = Number(horse.level || 1);
  $('horseFoals').textContent   = Number(horse.foals || 0);
  $('horseEarnings').textContent= Number(horse.earnings || 0);
  $('horseShows').textContent   = Number(horse.showsEntered || 0);

  const xpPct = Math.max(0, Math.min(100, Number(horse.xpPct || 0)));
  $('xpBar').style.width = xpPct + '%';

  const happy = clamp(Number(horse.happiness || 0), 0, 100);
  $('happinessPct').textContent = happy.toFixed(0) + '%';
  $('happinessBar').style.width = happy + '%';

  const now = Date.now();
  if ((horse.feedMeta?.buffExpires || 0) > now && (horse.feedMeta?.buffBonus || 0) > 0) {
    const leftMs = horse.feedMeta.buffExpires - now;
    const hrs = Math.ceil(leftMs / 3600000);
    $('feedBuffLine').textContent = `Feed bonus active: +${horse.feedMeta.buffBonus}% happiness (ends in ~${hrs}h)`;
  } else {
    $('feedBuffLine').textContent = '';
  }

  const canFeedAt = (horse.feedMeta?.lastFedRealMs || 0) + FEED_COOLDOWN_MS;
  if (Date.now() >= canFeedAt) {
    $('fedStatus').textContent = '✅';
    $('nextFeedLine').textContent = 'Feeding available now.';
  } else {
    $('fedStatus').textContent = '⏳';
    const left = canFeedAt - Date.now();
    const leftDays = Math.floor(left / (24*3600000));
    const leftHrs  = Math.ceil((left % (24*3600000)) / 3600000);
    $('nextFeedLine').textContent = `Next feed in ~${leftDays}d ${leftHrs}h.`;
  }

  buildTreatSelect();
  buildFeedSelect();

  const hid = encodeURIComponent(horse.id);
  $('#linkPedigree').href     = `horse-pedigree.html?id=${hid}`;
  $('#linkFoals').href        = `horse-foals.html?id=${hid}`;
  $('#linkHistory').href      = `horse-history.html?id=${hid}`;
  $('#linkEnterShows').href   = `horse-shows.html?id=${hid}`;

  // IMPORTANT: do NOT set linkShowResults.href — we toggle inline instead
}

function buildTreatSelect(){
  invEnsure();
  const inv = userData.inventory.treats;
  const dayKey = yyyymmddUTC();
  const meta = horse.treatsMeta || { dayKey:null, carrots:0, apples:0, sugarCubes:0 };

  if (meta.dayKey !== dayKey){
    meta.dayKey = dayKey;
    meta.carrots = meta.apples = meta.sugarCubes = 0;
    horse.treatsMeta = meta;
  }

  const items = [
    {key:'carrots',    label:'Carrots',    have:Number(inv.carrots||0),    used:meta.carrots,    cap:TREAT_LIMITS_PER_DAY.carrots,    effect:TREAT_EFFECTS.carrots},
    {key:'apples',     label:'Apples',     have:Number(inv.apples||0),     used:meta.apples,     cap:TREAT_LIMITS_PER_DAY.apples,     effect:TREAT_EFFECTS.apples},
    {key:'sugarCubes', label:'Sugar Cubes',have:Number(inv.sugarCubes||0), used:meta.sugarCubes, cap:TREAT_LIMITS_PER_DAY.sugarCubes, effect:TREAT_EFFECTS.sugarCubes},
  ];

  const sel = $('#treatSelect');
  sel.innerHTML = `<option value="">Select treat…</option>` +
    items.map(i=>{
      const left = Math.max(0, i.cap - i.used);
      const disabled = (i.have<=0 || left<=0) ? 'disabled' : '';
      return `<option value="${i.key}" ${disabled}>
        ${i.label} (+${i.effect}%) — inv:${i.have} • left today:${left}
      </option>`;
    }).join('');
}

function buildFeedSelect(){
  invEnsure();
  const inv = userData.inventory.feed;
  const months = monthsFromAge(horse);
  const sel = $('#feedSelect');
  const opts = FEED_PACKS.map(p=>{
    const have = Number(inv[p.id]||0);
    const gated = (months < p.minM || months > p.maxM);
    const dis = (have < FEED_SERVING_LBS || gated) ? 'disabled' : '';
    const gateTxt = gated ? ' (age gated)' : '';
    return `<option value="${p.id}" ${dis}>
      ${p.label} — inv:${have} lbs${gateTxt}
    </option>`;
  });
  sel.innerHTML = `<option value="">Select feed…</option>${opts.join('')}`;
}

// ---------- actions ----------
function wireActions(){
  $('#btnRename').onclick = async ()=>{
    const name = prompt('New name for your horse?', horse.name || '');
    if (!name) return;
    horse.name = name.slice(0,60);
    await saveHorse();
    renderAll();
  };

  $('#btnDescription').onclick = async ()=>{
    const txt = prompt('Write a description for your horse (Markdown/plain OK):', horse.description || '');
    if (txt == null) return;
    horse.description = txt.slice(0, 5000);
    await saveHorse();
    renderAll();
  };

  $('#btnGiveTreat').onclick = doGiveTreat;
  $('#btnFeed').onclick = doFeed;
  $('#btnGroom').onclick = doGroom;

  // Inline show results (toggle + lazy load renderer)
  const link = $('#linkShowResults');
  if (link) {
    link.onclick = async (e) => {
      e.preventDefault();
      const panel = $('#showResults');
      const nowVisible = panel.style.display !== 'block';
      panel.style.display = nowVisible ? 'block' : 'none';
      if (nowVisible) {
        try {
          const mod = await import('./horse-show-results.js');
          if (typeof mod.renderHorseShowResults === 'function') {
            await mod.renderHorseShowResults(horse.id, 'showResults');
          } else {
            panel.innerHTML = '<p class="muted">Show results module not found.</p>';
          }
        } catch (err) {
          console.error(err);
          panel.innerHTML = '<p class="muted">Failed to load show results.</p>';
        }
      }
    };
  }
}

async function doGiveTreat(){
  const kind = $('#treatSelect').value;
  if (!kind) { msg('Pick a treat first.'); return; }
  invEnsure();

  const inv = userData.inventory.treats;
  const have = Number(inv[kind] || 0);
  if (have <= 0) { msg('You have none of that treat.'); return; }

  const dayKey = yyyymmddUTC();
  const meta = horse.treatsMeta || { dayKey:null, carrots:0, apples:0, sugarCubes:0 };
  if (meta.dayKey !== dayKey){
    meta.dayKey = dayKey; meta.carrots = meta.apples = meta.sugarCubes = 0;
  }

  const cap = TREAT_LIMITS_PER_DAY[kind] || 0;
  if ((meta[kind] || 0) >= cap) { msg(`Daily limit reached for ${kind}.`); return; }

  const effect = TREAT_EFFECTS[kind] || 0;
  horse.happiness = clamp(Number(horse.happiness||0) + effect, 0, 100);
  meta[kind] = (meta[kind]||0) + 1;
  horse.treatsMeta = meta;

  inv[kind] = have - 1;

  await Promise.all([ saveHorse(), saveInventory() ]);
  msg(`Gave ${kind}. Happiness +${effect}%`);
  renderAll();
}

async function doFeed(){
  const packId = $('#feedSelect').value;
  if (!packId) { msg('Pick a feed first.'); return; }

  const now = Date.now();
  const canAt = (horse.feedMeta?.lastFedRealMs || 0) + FEED_COOLDOWN_MS;
  if (now < canAt){
    const left = canAt - now;
    const hrs = Math.ceil(left/3600000);
    msg(`Too soon to feed again. Try in ~${hrs}h.`);
    return;
  }

  invEnsure();
  const inv = userData.inventory.feed;
  const have = Number(inv[packId] || 0);
  if (have < FEED_SERVING_LBS) { msg('Not enough pounds of that feed.'); return; }

  const pack = FEED_PACKS.find(p=>p.id===packId);
  const months = monthsFromAge(horse);
  if (!pack || months < pack.minM || months > pack.maxM) { msg('That feed isn’t appropriate for this age.'); return; }

  inv[packId] = have - FEED_SERVING_LBS;

  horse.feedMeta ||= {};
  horse.feedMeta.lastFedRealMs = now;
  horse.feedMeta.buffBonus = Number(pack.bonus || 0);
  horse.feedMeta.buffExpires = now + FEED_BUFF_DUR_MS;

  if (pack.bonus) horse.happiness = clamp(Number(horse.happiness||0) + pack.bonus, 0, 100);

  await Promise.all([ saveHorse(), saveInventory() ]);
  msg(`Fed ${pack.label} (−${FEED_SERVING_LBS} lbs).`);
  renderAll();
}

async function doGroom(){
  const before = Number(horse.happiness || 0);
  horse.happiness = clamp(before + 5, 0, 100);
  await saveHorse();
  msg('Groomed. Happiness +5%');
  renderAll();
}

function msg(s){ const el=$('horseMsg'); if (el) el.textContent = s; }
