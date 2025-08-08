import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const targetUid = params.get('uid');

let horses = [];
let ownerName = '(Ranch)';
let page = 1;
const pageSize = 10;

onAuthStateChanged(auth, async (user) => {
  if (!targetUid) {
    document.querySelector('.main-content').innerHTML = '<p>No user specified.</p>';
    return;
  }
  // Require login (keeps it consistent with ranch-public). If you want public view, remove this redirect.
  if (!user) return (window.location.href = 'login.html');

  // Load owner profile
  const userSnap = await get(ref(db, `users/${targetUid}`));
  if (!userSnap.exists()) {
    document.querySelector('.main-content').innerHTML = '<p>Stable not found.</p>';
    return;
  }
  const u = userSnap.val();
  ownerName = u.username || u.loginName || '(unnamed)';

  // Title + back link
  $('stableTitle').textContent = `${ownerName} — Public Stable`;
  $('ownerRanchLink').href = `ranch-public.html?uid=${encodeURIComponent(targetUid)}`;

  // Horses (array or object)
  const raw = u.horses || [];
  horses = Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw || {});
  $('horseTotal').textContent = horses.length;

  // Wire pager
  ['prevPage','prevPage2'].forEach(id => $(id).onclick = () => changePage(-1));
  ['nextPage','nextPage2'].forEach(id => $(id).onclick = () => changePage(+1));

  render();
});

function changePage(delta) {
  const totalPages = Math.max(1, Math.ceil(horses.length / pageSize));
  page = Math.min(totalPages, Math.max(1, page + delta));
  render();
}

function render() {
  const grid = $('publicStableGrid');
  grid.innerHTML = '';

  const totalPages = Math.max(1, Math.ceil(horses.length / pageSize));
  page = Math.min(totalPages, Math.max(1, page));

  const start = (page - 1) * pageSize;
  const items = horses.slice(start, start + pageSize);

  if (items.length === 0) {
    grid.innerHTML = '<p>No horses to display.</p>';
  } else {
    grid.innerHTML = items.map(h => horseCard(h)).join('');
  }

  // pager labels + button states
  $('pageInfo').textContent = `Page ${page} / ${totalPages}`;
  $('pageInfo2').textContent = `Page ${page} / ${totalPages}`;
  const atFirst = page <= 1;
  const atLast  = page >= totalPages;
  ['prevPage','prevPage2'].forEach(id => $(id).disabled = atFirst);
  ['nextPage','nextPage2'].forEach(id => $(id).disabled = atLast);
}

function horseCard(h) {
  const name = escapeHtml(h.name || 'Unnamed Horse');
  const breed = escapeHtml(h.breed || '—');
  const gender = escapeHtml(h.gender || '—');
  const level = Number(h.level || 1);
  const age = formatAge(h.age);

  const link = `horse-public.html?uid=${encodeURIComponent(targetUid)}&id=${encodeURIComponent(h.id)}`;

  return `
    <div class="horse-card">
      <p><strong><a href="${link}">${name}</a></strong></p>
      <p>Breed: ${breed}</p>
      <p>Gender: ${gender}</p>
      <p>Level: ${level}</p>
      <p>Age: ${escapeHtml(age)}</p>
    </div>
  `;
}

function formatAge(age) {
  if (!age) return '—';
  const y = age.years ?? 0, m = age.months ?? 0, d = age.days ?? 0;
  if (y === 0 && m === 0) return `${d} day(s)`;
  if (y === 0) return `${m} month(s)`;
  return `${y} year(s) ${m} month(s)`;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}
