// admin-tools.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerXP } from './player-level.js';

const $ = (id) => document.getElementById(id);

function injectCSS() {
  if (document.getElementById('admin-tools-css')) return;
  const s = document.createElement('style');
  s.id = 'admin-tools-css';
  s.textContent = `
    .admin-btn { background:#7953d2; color:#fff; border:none; border-radius:6px; padding:6px 10px; cursor:pointer; }
    .admin-btn:hover { background:#6942c7; }
    .admin-modal-backdrop {
      position:fixed; inset:0; background:rgba(0,0,0,.45);
      display:none; align-items:center; justify-content:center; z-index:2000;
    }
    .admin-modal {
      background:#fff; border-radius:10px; border:1px solid #c0e8c0;
      padding:14px; width:min(520px, 92vw);
      box-shadow: 0 10px 30px rgba(0,0,0,.2);
    }
    .admin-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:8px 0; }
    .admin-modal h3 { margin:0 0 6px; }
    .admin-modal .muted { opacity:.85; font-size:13px; }
    .admin-modal input {
      padding:6px 8px; border-radius:6px; border:1px solid #cbd5c0;
      min-width: 160px;
    }
    .admin-modal .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; background:#e7f7e7; border:1px solid #c0e8c0; }
    .admin-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
    .admin-secondary { background:#eee; border:none; border-radius:6px; padding:6px 10px; cursor:pointer; }
    .admin-primary { background:#2e402d; color:#fff; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; }
    .admin-primary:hover { background:#3d5a39; }
  `;
  document.head.appendChild(s);
}

function ensureModal() {
  if ($('#adminGiveXPBackdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.id = 'adminGiveXPBackdrop';
  backdrop.className = 'admin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="admin-modal">
      <h3>Give XP (Admin)</h3>
      <div class="admin-row muted">Grants XP and triggers level-up rewards + system mail.</div>
      <form id="adminGiveXPForm">
        <div class="admin-row">
          <label><strong>Target UID</strong></label>
          <input id="adminTargetUid" type="text" placeholder="leave blank for yourself"/>
          <span class="pill" id="adminMePill">Me</span>
        </div>
        <div class="admin-row">
          <label><strong>Amount</strong></label>
          <input id="adminXpAmount" type="number" min="1" step="1" value="100"/>
        </div>
        <div class="admin-row muted" id="adminResultMsg"></div>
        <div class="admin-actions">
          <button type="button" class="admin-secondary" id="adminCancelBtn">Cancel</button>
          <button type="submit" class="admin-primary">Give XP</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  // Close
  $('#adminCancelBtn').onclick = () => (backdrop.style.display = 'none');
  // “Me” shortcut
  $('#adminMePill').onclick = () => {
    const u = auth.currentUser;
    if (u) $('#adminTargetUid').value = u.uid;
  };
  // Submit
  $('#adminGiveXPForm').onsubmit = async (e) => {
    e.preventDefault();
    const u = auth.currentUser;
    if (!u) return;
    const target = ($('#adminTargetUid').value || u.uid).trim();
    const amt = Math.max(1, Math.floor(Number($('#adminXpAmount').value || 0)));
    const msg = $('#adminResultMsg');
    msg.textContent = 'Working…';

    try {
      const res = await grantPlayerXP(target, amt, 'admin_grant');
      const leveled = (res?.leveled || []).length ? `Levels gained: ${res.leveled.join(', ')}` : 'No level-up.';
      msg.textContent = `Gave ${amt} XP to ${target}. ${leveled}`;
    } catch (err) {
      console.error('[admin] grantPlayerXP failed', err);
      msg.textContent = 'Error — check console.';
    }
  };
}

async function isAdmin(uid) {
  const s = await get(ref(db, `users/${uid}/roles/admin`));
  // If you stored as boolean under roles: { admin: true }, s.val() will be true
  // If you stored roles/admin as a node with true, above is fine.
  return !!s.val();
}

export function mountAdminTools() {
  injectCSS();
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    if (!(await isAdmin(user.uid))) return;

    // Add a button to the topbar right-pack
    const pack = document.querySelector('#topbar .right-pack') || document.getElementById('topbar');
    if (!pack || $('#btnAdminGiveXP')) return;

    const btn = document.createElement('button');
    btn.id = 'btnAdminGiveXP';
    btn.className = 'admin-btn';
    btn.textContent = '⭐ Give XP';
    btn.onclick = () => {
      ensureModal();
      const bd = $('#adminGiveXPBackdrop');
      if (bd) {
        // default target = me
        const me = auth.currentUser?.uid || '';
        $('#adminTargetUid').value = me;
        $('#adminXpAmount').value = 100;
        $('#adminResultMsg').textContent = '';
        bd.style.display = 'flex';
      }
    };
    pack.prepend(btn); // put it left of Logout
  });
}
