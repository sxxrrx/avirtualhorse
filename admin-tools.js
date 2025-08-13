// admin-tools.js
import { auth } from './firebase-init.js';
import { grantPlayerXP } from './player-level.js';

const $ = (id) => document.getElementById(id);

export function mountTownAdminTools() {
  const host = document.querySelector('.main-content') || document.body;
  if (!host || $('#adminToolsBox')) return; // don't double-mount

  const anchor = host.querySelector('h2') || host.firstChild;

  const box = document.createElement('div');
  box.id = 'adminToolsBox';
  box.className = 'horse-card';
  box.style.marginBottom = '12px';
  box.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <strong>Admin Tools</strong>
      <input id="xpAmount" type="number" min="1" value="50" style="width:90px;padding:4px;" />
      <button id="btnGiveXP">Give XP (to me)</button>
      <span id="xpMsg" class="muted"></span>
    </div>
  `;
  host.insertBefore(box, anchor);

  const btn  = $('#btnGiveXP');
  const amtE = $('#xpAmount');
  const msgE = $('#xpMsg');

  btn.onclick = async () => {
    const user = auth.currentUser;
    if (!user) {
      msgE.textContent = 'Not signed in yet.';
      return;
    }
    const uid = user.uid; // ✅ real UID at click time
    const amt = Math.max(1, parseInt(amtE.value, 10) || 0);

    btn.disabled = true;
    msgE.textContent = 'Giving XP…';
    try {
      const res = await grantPlayerXP(uid, amt, 'admin_give_xp');
      msgE.textContent =
        `Gave ${amt} XP → Level ${res.level} (${res.exp} XP toward next)` +
        (res.leveled?.length ? ` • leveled: ${res.leveled.join(', ')}` : '');
    } catch (e) {
      console.error('[admin-tools] give XP failed', e);
      msgE.textContent = 'Failed to grant XP (see console).';
    } finally {
      btn.disabled = false;
    }
  };
}
