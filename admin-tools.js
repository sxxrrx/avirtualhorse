// admin-tools.js
import { auth } from './firebase-init.js';
import { grantPlayerXP } from './player-level.js';

export function mountTownAdminTools() {
  const host = document.querySelector('.main-content') || document.body;
  if (!host) return;
  if (host.querySelector('#adminToolsBox')) return; // don't double-mount

  const box = document.createElement('div');
  box.id = 'adminToolsBox';
  box.className = 'horse-card';
  box.style.marginBottom = '12px';

  // build UI using real element references (avoid ID lookups until after attach)
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';
  row.style.flexWrap = 'wrap';

  const title = document.createElement('strong');
  title.textContent = 'Admin Tools';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.value = '50';
  input.style.width = '90px';
  input.style.padding = '4px';

  const btn = document.createElement('button');
  btn.textContent = 'Give XP (to me)';

  const msg = document.createElement('span');
  msg.className = 'muted';
  msg.style.marginLeft = '4px';

  row.appendChild(title);
  row.appendChild(input);
  row.appendChild(btn);
  row.appendChild(msg);
  box.appendChild(row);

  // insert above the News <h2> if present
  const anchor = host.querySelector('h2');
  if (anchor) host.insertBefore(box, anchor);
  else host.insertBefore(box, host.firstChild);

  // wire after nodes exist
  btn.onclick = async () => {
    const user = auth.currentUser;
    if (!user) { msg.textContent = 'Not signed in yet.'; return; }
    const uid = user.uid;
    const amt = Math.max(1, parseInt(input.value, 10) || 0);

    btn.disabled = true;
    msg.textContent = 'Giving XP…';
    try {
      const res = await grantPlayerXP(uid, amt, 'admin_give_xp');
      msg.textContent =
        `Gave ${amt} XP → Level ${res.level} (${res.exp} XP toward next)` +
        (res.leveled?.length ? ` • leveled: ${res.leveled.join(', ')}` : '');
    } catch (e) {
      console.error('[admin-tools] give XP failed', e);
      msg.textContent = 'Failed to grant XP (see console).';
    } finally {
      btn.disabled = false;
    }
  };
}
