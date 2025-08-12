// app-chrome.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, onValue, get, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { mountAdminTools } from './admin-tools.js';


// Game time + aging helpers
import { gameDateParts, seasonForDate, updateHorsesAgesIfNeeded } from './time.js';

const $ = (id) => document.getElementById(id);

// ---------- internal helpers ----------
function injectOnce(id, css){
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id; s.textContent = css;
  document.head.appendChild(s);
}

function navBtn(href, icon, label, key){
  return `<button class="tabButton" data-key="${key}" onclick="window.location.href='${href}'">${icon}<br>${label}</button>`;
}

function badge(count){
  return count>0
    ? `<span id="mailBadge" class="badge">${count}</span>`
    : `<span id="mailBadge" class="badge" style="display:none"></span>`;
}

function updateClockUI(){
  const { hour, date } = gameDateParts();
  const season = seasonForDate(date);
  const el = $('gameClock');
  if (el) el.innerHTML = `<strong>${season}</strong> — ${date.toLocaleDateString()} — <strong>${hour}:00</strong>`;
}

// Build/normalize layout without fighting existing markup
function ensureChromeContainers() {
  // Ensure #topbar exists and is the FIRST child of <body> so it never sits under content
  let top = document.getElementById('topbar');
  if (!top) {
    top = document.createElement('div');
    top.id = 'topbar';
    const first = document.body.firstChild;
    if (first) document.body.insertBefore(top, first);
    else document.body.appendChild(top);
  } else if (document.body.firstElementChild !== top) {
    document.body.insertBefore(top, document.body.firstElementChild);
  }

  // If page provided #pageMain, wrap it inside our 3-col chrome
  let mc  = document.getElementById('mainContainer');
  let left = document.getElementById('leftSidebar');
  let right = document.getElementById('rightSidebar');
  const pageMain = document.getElementById('pageMain');

  if (!mc && pageMain) {
    mc = document.createElement('div');
    mc.id = 'mainContainer';

    left = document.createElement('div');
    left.id = 'leftSidebar';
    left.className = 'sidebar left-sidebar';

    const mainWrap = document.createElement('div');
    mainWrap.className = 'main-content';
    while (pageMain.firstChild) mainWrap.appendChild(pageMain.firstChild);

    right = document.createElement('div');
    right.id = 'rightSidebar';
    right.className = 'sidebar right-sidebar';

    pageMain.replaceWith(mc);
    mc.appendChild(left);
    mc.appendChild(mainWrap);
    mc.appendChild(right);
  } else if (mc) {
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
  }
}

// ---------- one-time aging sync ----------
async function syncAgesOnce(uid){
  try {
    const userSnap = await get(ref(db, `users/${uid}`));
    if (!userSnap.exists()) return;

    const user = userSnap.val();
    const before = JSON.stringify(user.horses ?? null);

    // Mutates horses in-place, respects freeze, seeds baselines
    updateHorsesAgesIfNeeded(user);

    const after = JSON.stringify(user.horses ?? null);
    if (before === after) return; // nothing changed

    // Write back while preserving array/object shape
    const updates = {};
    if (Array.isArray(user.horses)) {
      user.horses.forEach((h, i) => { updates[`users/${uid}/horses/${i}`] = h ?? null; });
    } else {
      const obj = user.horses || {};
      Object.keys(obj).forEach(k => { updates[`users/${uid}/horses/${k}`] = obj[k]; });
    }
    if (Object.keys(updates).length) {
      await update(ref(db), updates);
    }
  } catch (e) {
    console.warn('[chrome] syncAgesOnce failed:', e);
  }
}

// ---------- PUBLIC API ----------
export async function mountChrome(opts = {}) {
  // 1) Make sure the structural containers exist in the right order
  ensureChromeContainers();

  // 2) Force a dark, legible topbar regardless of stray page styles
  injectOnce('chrome-dark-style', `
    #topbar{background:#2e402d!important;color:#fff!important;position:sticky;top:0;z-index:1000}
    #topbar a,#topbar button,#topbar span{color:#fff!important}
    #topbar .topbar-inner{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 12px}
    #topbar .left-pack{display:flex;align-items:center;gap:10px}
    #topbar .badge{position:relative;top:-8px;left:-8px;background:#c62828;color:#fff;border-radius:10px;padding:0 6px;font-size:12px}
    #topbar .tb-logout{background:#3b5d3b;border:none;border-radius:6px;padding:6px 10px;cursor:pointer}
    #topbar .tb-logout:hover{background:#567d46}
    #mainContainer{margin-top:8px}
  `);

  // 3) Inject chrome markup (fill placeholders only)
  const topbar = $('topbar');
  const left   = $('leftSidebar');
  const right  = $('rightSidebar');

// inside mountChrome(), after your styles
if (!document.querySelector('link[rel="icon"]')) {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = 'favicon.svg';   // note: no leading slash
  document.head.appendChild(link);
}


  topbar.innerHTML = `
    <div class="topbar-inner">
      <div class="left-pack">
        <div id="coinCounter">Coins: 0</div>
        <a id="mailLink" class="mail-link" href="post-office.html" title="Inbox">📬</a>${badge(0)}
      </div>
      <div id="gameClock"></div>
      <div class="right-pack">
        <button id="btnLogout" class="tb-logout">Logout</button>
      </div>
    </div>
  `;

  left.innerHTML = `
    ${navBtn('town-square.html','🏙️','Town Square','town')}
    ${navBtn('ranch.html','🌾','My Ranch','ranch')}
    ${navBtn('my-stable.html','🐴','Stables','stables')}
    ${navBtn('barn.html','🧰','Barn','barn')}
    ${navBtn('bank.html','🏦','Bank','bank')}
  `;

  right.innerHTML = `
    ${navBtn('clubhouse.html','🏇','Clubhouse','clubhouse')}
    ${navBtn('services.html','🔧','Services','services')}
    ${navBtn('market.html','💰','Market','market')}
    ${navBtn('magic.html','✨','Magic Shop','magic')}
    ${navBtn('settings.html','⚙️','Settings','settings')}
  `;

  // 4) Highlight the active tab(s) if provided
  if (opts.leftActive)  left.querySelector(`[data-key="${opts.leftActive}"]`)?.classList.add('active');
  if (opts.rightActive) right.querySelector(`[data-key="${opts.rightActive}"]`)?.classList.add('active');

  // 5) Live data wiring (coins, mail badge, logout) + one-time age sync
  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // page-level auth guards can redirect

    // One-time age reconciliation on mount
    await syncAgesOnce(user.uid);

    // Coins live
    onValue(ref(db, `users/${user.uid}/coins`), snap => {
      const c = Number(snap.val() || 0);
      const cc = $('coinCounter');
      if (cc) cc.textContent = `Coins: ${c.toLocaleString()}`;
    });

    // Mail badge: unread mail + pending friend requests
    onValue(ref(db, `userMailIndex/${user.uid}/inbox`), async idxSnap => {
      const ids = idxSnap.exists() ? Object.keys(idxSnap.val()) : [];
      if (!ids.length) {
        const b = $('mailBadge'); if (b){ b.style.display='none'; b.textContent=''; }
        return;
      }
      const rows = (await Promise.all(
        ids.slice(0, 120).map(id => get(ref(db, `mail/${id}`)).then(s => s.exists()? s.val(): null))
      )).filter(Boolean);
      let count = 0;
      rows.forEach(m => {
        if (m.type === 'friend_request' && (m.status || 'pending') === 'pending') count++;
        if (m.type === 'mail' && (m.status || 'unread') !== 'read') count++;
      });
      const b = $('mailBadge');
      if (b){
        if (count>0){ b.style.display='inline-block'; b.textContent = String(count); }
        else { b.style.display='none'; b.textContent=''; }
      }
    });

    // Logout
    const logout = $('btnLogout');
    if (logout) logout.onclick = () => signOut(auth).then(()=>location.href='login.html');
  });

  // 6) In-game clock (driven by time.js)
  updateClockUI();
  setInterval(updateClockUI, 60000); // refresh once a minute is plenty
}
mountAdminTools();

