// admin-tools.js
import { db } from './firebase-init.js';
import { ref, push, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { grantPlayerXP } from './player-level.js';

/**
 * Mount a tiny "Admin Tools" panel into the page (top of .main-content).
 * Safe to call multiple times (it no-ops if already mounted).
 */
export function mountAdminTools(uid) {
  const host = document.querySelector('.main-content') || document.body;
  if (!host) return;

  // avoid double-mount
  if (document.getElementById('adminToolsPanel')) return;

  const anchor = host.querySelector('h2') || host.firstChild;

  const box = document.createElement('div');
  box.id = 'adminToolsPanel';
  box.className = 'horse-card';
  box.style.marginBottom = '12px';
  box.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <strong>Admin Tools</strong>
      <input id="admXpAmount" type="number" min="1" value="50" style="width:90px;padding:4px;" />
      <button id="admBtnGiveXP">Give XP (to me)</button>
      <span id="admXpMsg" class="muted"></span>
    </div>
  `;
  host.insertBefore(box, anchor);

  const btn  = document.getElementById('admBtnGiveXP');
  const amtE = document.getElementById('admXpAmount');
  const msgE = document.getElementById('admXpMsg');

  btn.onclick = async () => {
    const amt = Math.max(1, parseInt(amtE.value, 10) || 0);
    if (!Number.isFinite(amt) || amt <= 0) return;

    // simple browser confirm to keep it robust
    if (!confirm(`Grant yourself ${amt} XP?`)) return;

    btn.disabled = true;
    msgE.textContent = 'Granting XP…';
    try {
      const res = await grantPlayerXP(uid, amt, 'admin_give_xp');
      const rewardsTxt = formatRewards(res.rewards || []);
      msgE.textContent =
        `Gave ${amt} XP → Level ${res.level} (${res.exp} toward next)` +
        (res.leveled?.length ? ` • leveled to ${res.leveled.join(', ')}` : '') +
        (rewardsTxt ? ` • rewards: ${rewardsTxt}` : '');

      // tiny audit log
      try {
        const id = push(ref(db, `adminLogs/${uid}`)).key;
        await set(ref(db, `adminLogs/${uid}/${id}`), {
          at: Date.now(), kind: 'give_xp', amount: amt
        });
      } catch {}
    } catch (e) {
      console.error('[admin-tools] grant XP failed', e);
      msgE.textContent = 'Failed to grant XP (see console).';
    } finally {
      btn.disabled = false;
    }
  };
}

function formatRewards(list){
  if (!Array.isArray(list) || !list.length) return '';
  return list.map(r => {
    const k = r.kind || r.type || r.item || 'reward';
    const a = r.amount ? `×${r.amount}` : '';
    return `${k}${a}`;
  }).join(', ');
}

