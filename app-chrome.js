// app-chrome.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, onValue, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

console.log('[chrome] loaded');

// --- add this near the top of app-chrome.js ---
function ensureChromeContainers() {
  // If the page already has placeholders, just make sure sidebars exist and bail
  let top = document.getElementById('topbar');
  let mc  = document.getElementById('mainContainer');
  let left = document.getElementById('leftSidebar');
  let right = document.getElementById('rightSidebar');

  // Mode A: content-only page provided <div id="pageMain" class="main-content">…</div>
  const pageMain = document.getElementById('pageMain');

  if (!mc && pageMain) {
    // Create topbar (insert before pageMain)
    if (!top) {
      top = document.createElement('div');
      top.id = 'topbar';
      document.body.insertBefore(top, pageMain);
    }

    // Build container
    mc = document.createElement('div');
    mc.id = 'mainContainer';

    left = document.createElement('div');
    left.id = 'leftSidebar';
    left.className = 'sidebar left-sidebar';

    // new main-content wrapper
    const mainWrap = document.createElement('div');
    mainWrap.className = 'main-content';
    // move children out of #pageMain into the new wrapper
    while (pageMain.firstChild) mainWrap.appendChild(pageMain.firstChild);

    right = document.createElement('div');
    right.id = 'rightSidebar';
    right.className = 'sidebar right-sidebar';

    // Replace #pageMain with the full layout
    pageMain.replaceWith(mc);
    mc.appendChild(left);
    mc.appendChild(mainWrap);
    mc.appendChild(right);
  } else {
    // Mode B: page already has #mainContainer — ensure sidebars exist
    if (mc) {
      if (!left) {
        left = document.createElement('div');
        left.id = 'leftSidebar';
        left.className = 'sidebar left-sidebar';
        mc.insertBefore(left, mc.firstChild);
      }
      if (!right) {
        right = document.createElement('div');
        right.id = 'rightSidebar';
        right.className = 'sidebar right-sidebar';
        mc.appendChild(right);
      }
      if (!top) {
        // Add a topbar at the top of body if missing
        top = document.createElement('div');
        top.id = 'topbar';
        document.body.insertBefore(top, mc);
      }
    }
  }
}

// make mountChrome resilient
export async function mountChrome(opts = {}) {
  ensureChromeContainers();
  // ...existing mountChrome logic that renders topbar & sidebars...
}

// ---------- helpers ----------
function el(id){ return document.getElementById(id); }
function ensureEl(id, tag, parent=document.body){
  let n = el(id);
  if (!n) { n = document.createElement(tag); n.id = id; parent.appendChild(n); }
  return n;
}
function currentGameHour(){
  const start = new Date(Date.UTC(2025,0,1)).getTime();
  return Math.floor((Date.now() - start) / (60 * 1000)); // 1 real min = 1 in-game hour
}
function updateClockUI(){
  const h = currentGameHour();
  const day = Math.floor(h/24), hour = h%24;
  const start = new Date(Date.UTC(2025,0,1));
  const d = new Date(start.getTime() + day*86400000);
  const seasons = [
    {s:[3,20], e:[6,19], name:"Verdant's Bloom"},
    {s:[6,20], e:[9,21], name:"Summer's Height"},
    {s:[9,22], e:[12,20], name:"Harvest's Embrace"},
  ];
  let season = "Winter's Hold";
  for (const x of seasons){
    const m = d.getUTCMonth()+1, dd = d.getUTCDate();
    const inRange = (sm,sd,em,ed)=> (m>sm || (m===sm && dd>=sd)) && (m<em || (m===em && dd<=ed));
    if (inRange(x.s[0],x.s[1],x.e[0],x.e[1])) { season = x.name; break; }
  }
  const target = el('gameClock');
  if (target) target.innerHTML = `<strong>${season}</strong> — ${d.toLocaleDateString()} — <strong>${hour}:00</strong>`;
}
function navBtn(href, icon, label){
  return `<button class="tabButton" onclick="window.location.href='${href}'">${icon}<br>${label}</button>`;
}
function badge(count){ return count>0 ? `<span id="mailBadge" class="badge">${count}</span>` : `<span id="mailBadge" class="badge" style="display:none"></span>`; }
function shortUid(u){ return (u||'').slice(0,6)+'…'; }

// ---------- ensure containers exist ----------
const topbar = ensureEl('topbar', 'div');
const main   = ensureEl('mainContainer', 'div');
const left   = ensureEl('leftSidebar', 'div', main);
const right  = ensureEl('rightSidebar', 'div', main);

// apply required classes if missing
left.classList.add('sidebar','left-sidebar');
right.classList.add('sidebar','right-sidebar');

// ---------- inject chrome ----------
topbar.innerHTML = `
  <div class="topbar-inner">
    <div class="left-pack">
      <div id="coinCounter">0</div>
      <a id="mailLink" class="mail-link" href="post-office.html" title="Inbox">📬</a>${badge(0)}
    </div>
    <div id="gameClock"></div>
    <div class="right-pack">
      <button id="btnLogout">Logout</button>
    </div>
  </div>
`;

left.innerHTML = `
  ${navBtn('town-square.html','🏙️','Town Square')}
  ${navBtn('ranch.html','🌾','My Ranch')}
  ${navBtn('my-stable.html','🐴','Stables')}
  ${navBtn('barn.html','🧰','Barn')}
  ${navBtn('bank.html','🏦','Bank')}
`;

right.innerHTML = `
  ${navBtn('clubhouse.html','🏇','Clubhouse')}
  ${navBtn('services.html','🔧','Services')}
  ${navBtn('market.html','💰','Market')}
  ${navBtn('magic.html','✨','Magic Shop')}
  ${navBtn('settings.html','⚙️','Settings')}
`;

// ---------- behavior ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) return; // let page-level auth guards handle redirects

  // coins live
  onValue(ref(db, `users/${user.uid}/coins`), snap => {
    const c = Number(snap.val() || 0);
    const cc = el('coinCounter');
    if (cc) cc.textContent = `Coins: ${c.toLocaleString()}`;
  });

  // unread/pending mail badge
  // Count: regular mail with status !== 'read' + friend_request with status === 'pending'
  onValue(ref(db, `userMailIndex/${user.uid}/inbox`), async idxSnap => {
    const idx = idxSnap.exists() ? Object.keys(idxSnap.val()) : [];
    if (idx.length === 0) {
      const b = el('mailBadge'); if (b){ b.style.display='none'; b.textContent=''; }
      return;
    }
    const gets = idx.slice(0,100).map(id => get(ref(db, `mail/${id}`)).then(s => s.exists()? s.val(): null));
    const rows = (await Promise.all(gets)).filter(Boolean);
    let count = 0;
    rows.forEach(m => {
      if (m.type === 'friend_request' && (m.status || 'pending') === 'pending') count++;
      if (m.type === 'mail' && (m.status || 'unread') !== 'read') count++;
    });
    const b = el('mailBadge');
    if (b){
      if (count>0){ b.style.display='inline-block'; b.textContent = String(count); }
      else { b.style.display='none'; b.textContent=''; }
    }
  });

  // logout
  const logout = el('btnLogout');
  if (logout) logout.onclick = () => signOut(auth).then(()=>location.href='login.html');
});

// game clock
updateClockUI();
setInterval(updateClockUI, 60000);

// minimal styles if not present in your CSS
const style = document.createElement('style');
style.textContent = `
  #topbar { position:sticky; top:0; z-index:5; background:#eaf8ea; border-bottom:1px solid #c0e8c0; }
  .topbar-inner { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 12px; }
  .left-pack { display:flex; align-items:center; gap:10px; }
  .mail-link { position:relative; text-decoration:none; font-size:20px; }
  .badge { position:relative; top:-8px; left:-8px; background:#c62828; color:#fff; border-radius:10px; padding:0 6px; font-size:12px; }
`;
document.head.appendChild(style);

console.log('[chrome] ready');
