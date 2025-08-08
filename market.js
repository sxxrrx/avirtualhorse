// market.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, push, runTransaction } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { currentGameHour } from './time.js'; // ✅ use centralized clock

const $ = (id) => document.getElementById(id);

// 12-hour store rotation (in-game)
function currentStorePeriod() { return Math.floor(currentGameHour() / 12); }

// ---------- state ----------
let uid = null;
let userData = null;
let myHorses = [];
let storeHorses = [];

// ---------- pricing data ----------
const FEED_PACKS = [
  {id:'ado_basic',   label:'Adolescent Basic (1000 lbs)',    lbs:1000, price: 50,  minM:12,  maxM:29,  bonus:0},
  {id:'ado_premium', label:'Adolescent Premium (1000 lbs)',  lbs:1000, price: 75,  minM:12,  maxM:29,  bonus:5},
  {id:'adult_basic', label:'Adult Basic (1500 lbs)',         lbs:1500, price: 75,  minM:29,  maxM:300, bonus:0},
  {id:'adult_prem',  label:'Adult Premium (1500 lbs)',       lbs:1500, price:125,  minM:29,  maxM:300, bonus:5},
  {id:'adult_elite', label:'Adult Elite (2500 lbs)',         lbs:2500, price:200,  minM:29,  maxM:300, bonus:10},
  {id:'senior',      label:'Senior (1000 lbs)',              lbs:1000, price: 40,  minM:300, maxM:1200, bonus:20}
];

const TREAT_PACKS = [
  {id:'car_125',  kind:'carrots',    label:'Carrots ×125',      qty:125,  price: 50},
  {id:'car_250',  kind:'carrots',    label:'Carrots ×250',      qty:250,  price: 88},
  {id:'car_500',  kind:'carrots',    label:'Carrots ×500',      qty:500,  price:160},
  {id:'car_1000', kind:'carrots',    label:'Carrots ×1000',     qty:1000, price:300},
  {id:'app_150',  kind:'apples',     label:'Apples ×150',       qty:150,  price:135},
  {id:'app_300',  kind:'apples',     label:'Apples ×300',       qty:300,  price:255},
  {id:'app_600',  kind:'apples',     label:'Apples ×600',       qty:600,  price:480},
  {id:'app_1200', kind:'apples',     label:'Apples ×1200',      qty:1200, price:900},
  {id:'sug_125',  kind:'sugarCubes', label:'Sugar Cubes ×125',  qty:125,  price:200},
  {id:'sug_250',  kind:'sugarCubes', label:'Sugar Cubes ×250',  qty:250,  price:360},
  {id:'sug_500',  kind:'sugarCubes', label:'Sugar Cubes ×500',  qty:500,  price:675},
  {id:'sug_1000', kind:'sugarCubes', label:'Sugar Cubes ×1000', qty:1000, price:1250}
];

// ---------- safe event wiring ----------
function on(id, evt, fn) {
  const el = $(id);
  if (!el) { console.warn('[market] Missing element id:', id); return; }
  el.addEventListener(evt, fn);
}

document.addEventListener('DOMContentLoaded', () => {
  // top tabs
  on('tabBuy',  'click', () => showTop('buy'));
  on('tabSell', 'click', () => showTop('sell'));

  // buy menu links
  on('linkStore',  'click', e => { e.preventDefault(); openBuy('store'); });
  on('linkRescue', 'click', e => { e.preventDefault(); openBuy('rescue'); });
  on('linkFeed',   'click', e => { e.preventDefault(); openBuy('feed'); });
  on('linkTreats', 'click', e => { e.preventDefault(); openBuy('treats'); });
  on('linkTack',   'click', e => { e.preventDefault(); openBuy('tack'); });

  // buy back links
  on('backFromStore',  'click', e => { e.preventDefault(); openBuy(null); });
  on('backFromRescue', 'click', e => { e.preventDefault(); openBuy(null); });
  on('backFromFeed',   'click', e => { e.preventDefault(); openBuy(null); });
  on('backFromTreats', 'click', e => { e.preventDefault(); openBuy(null); });
  on('backFromTack',   'click', e => { e.preventDefault(); openBuy(null); });

  // sell menu links
  on('linkSellHorses',   'click', e => { e.preventDefault(); openSell('horses'); });
  on('linkSellTack',     'click', e => { e.preventDefault(); openSell('soon'); });
  on('linkSellFeed',     'click', e => { e.preventDefault(); openSell('soon'); });
  on('linkSellTreats',   'click', e => { e.preventDefault(); openSell('soon'); });

  // sell back links
  on('backFromSellHorses','click', e => { e.preventDefault(); openSell(null); });
  on('backFromSellSoon', 'click', e => { e.preventDefault(); openSell(null); });

  // default tab
  showTop('buy');
});

// (…rest of your file unchanged…)
