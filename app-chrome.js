// app-chrome.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, onValue, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

export function mountChrome(opts = {}) {
  const { leftActive = '', rightActive = '' } = opts;
  const pageMain = document.getElementById('pageMain');
  if (!pageMain) {
    console.error('app-chrome: #pageMain not found on this page.');
    return;
  }

  // Detach page content
  pageMain.parentNode.removeChild(pageMain);

  // Build topbar
  const topbar = document.createElement('div');
  topbar.id = 'topbar';
  topbar.innerHTML = `
    <div id="coinCounter">Coins: 0</div>
    <div id="gameClock"></div>
    <div style="display:flex;gap:10px;align-items:center;">
      <a id="mailLink" href="post-office.html" title="Mailbox" style="position:relative;text-decoration:none;">
        📬
        <span id="mailBadge" style="
          position:absolute;top:-6px;right:-10px;
          background:#e53935;color:#fff;font-size:11px;
          padding:2px 5px;border-radius:10px;display:none;">0</span>
      </a>
      <button id="logoutBtn">Logout</button>
    </div>
  `;

  // Build sidebars
  const left = document.createElement('div');
  left.className = 'sidebar left-sidebar';
  left.innerHTML = `
    <a class="tabButton ${leftActive==='town'?'active':''}"   href="home.html">🏙️<br>Town Square</a>
    <a class="tabButton ${leftActive==='ranch'?'active':''}"  href="ranch.html">🌾<br>My Ranch</a>
    <a class="tabButton ${leftActive==='stables'?'active':''}" href="my-stable.html">🐴<br>Stables</a>
    <a class="tabButton ${leftActive==='barn'?'active':''}"   href="barn.html">🏠<br>Barn</a>
    <a class="tabButton ${leftActive==='bank'?'active':''}"   href="bank.html">🏦<br>Bank</a>
  `;

  const right = document.createElement('div');
  right.className = 'sidebar right-sidebar';
  right.innerHTML = `
    <a class="tabButton ${rightActive==='clubhouse'?'active':''}" href="clubhouse.html">👤<br>Clubhouse</a>
    <a class="tabButton ${rightActive==='services'?'active':''}"  href="services.html">🔧<br>Services</a>
    <a class="tabButton ${rightActive==='market'?'active':''}"    href="market.html">💰<br>Market</a>
    <a class="tabButton ${rightActive==='magic'?'active':''}"     href="magic.html">🪄<br>Magic Shop</a>
    <a class="tabButton ${rightActive==='settings'?'active':''}"  href="settings.html">⚙️<br>Settings</a>
  `;

  // Build main container and insert the actual page content in the center
  const container = document.createElement('div');
  container.id = 'mainContainer';
  container.appendChild(left);
  container.appendChild(pageMain);   // <-- your page content in the center
  container.appendChild(right);

  // Replace body with chrome + page content
  document.body.innerHTML = '';
  document.body.appendChild(topbar);
  document.body.appendChild(container);

  // Wire logout
  document.getElementById('logoutBtn').onclick = () => signOut(auth).then(() => location.href='login.html');

  // Start in-game clock (1 real min = 1 in-game hour)
  const updateClock = () => {
    const start = Date.UTC(2025,0,1);
    const ms = Date.now() - start;
    const hours = Math.floor(ms / (60*1000));
    const day = Math.floor(hours/24);
    const hour = hours % 24;
    const date = new Date(start + day*24*60*60*1000);
    document.getElementById('gameClock').textContent =
      `${date.toLocaleDateString()} — ${hour.toString().padStart(2,'0')}:00`;
  };
  updateClock();
  setInterval(updateClock, 60*1000);

  // Auth-driven topbar values
  onAuthStateChanged(auth, async user => {
    if (!user) return; // page-level scripts handle redirect if needed

    // Coins
    onValue(ref(db, `users/${user.uid}/coins`), snap => {
      const coins = Number(snap.val() || 0);
      const coinEl = document.getElementById('coinCounter');
      if (coinEl) coinEl.textContent = `Coins: ${coins.toLocaleString()}`;
    });

    // Mail badge (count inbox items; if you track read flags, swap this to unread count)
    onValue(ref(db, `userMailIndex/${user.uid}/inbox`), async snap => {
      const idx = snap.exists() ? Object.keys(snap.val()) : [];
      // If you later track read flags, fetch mail/* and filter. For now, show total inbox count.
      const badge = document.getElementById('mailBadge');
      if (!badge) return;
      if (idx.length > 0) {
        badge.textContent = String(idx.length);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    });
  });
}
