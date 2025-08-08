// bank.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update, push, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);

let uid = null;
let userData = null;
let ledger = [];   // local cache of transactions
let filter = 'all'; // 'all' | 'deposit' | 'withdraw'

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  await loadUser();
  await loadLedger();
  wireControls();
  render();
  renderLedger();
});

async function loadUser() {
  const snap = await get(ref(db, `users/${uid}`));
  userData = snap.exists() ? snap.val() : {};
  // ensure fields
  userData.coins = Number(userData.coins || 0);
  userData.bank = userData.bank || {};
  userData.bank.balance = Number(userData.bank.balance || 0);
}

async function loadLedger() {
  const s = await get(ref(db, `users/${uid}/bank/ledger`));
  if (!s.exists()) { ledger = []; return; }
  const obj = s.val();
  ledger = Object.entries(obj).map(([id, v]) => ({ id, ...v }))
           .sort((a,b) => (b.at||0) - (a.at||0));
}

function render() {
  const wallet = userData.coins;
  const bank   = userData.bank.balance;
  const total  = wallet + bank;

  $('walletCoins').textContent = wallet.toLocaleString();
  $('bankCoins').textContent   = bank.toLocaleString();
  $('totalCoins').textContent  = total.toLocaleString();

  const pct = total > 0 ? Math.round((bank / total) * 100) : 0;
  $('bankBar').style.width = pct + '%';
  $('bankPct').textContent = `${pct}% of your coins are in the bank.`;

  // keep topbar in sync if present
  const top = document.getElementById('coinCounter');
  if (top) top.textContent = `Coins: ${wallet}`;
}

function wireControls() {
  $('btnDeposit').onclick  = deposit;
  $('btnWithdraw').onclick = withdraw;

  $('btnDep25').onclick = () => setAmount('depositAmount', Math.floor(userData.coins * 0.25));
  $('btnDep50').onclick = () => setAmount('depositAmount', Math.floor(userData.coins * 0.50));
  $('btnDepAll').onclick = () => setAmount('depositAmount', userData.coins);

  $('btnWdr25').onclick = () => setAmount('withdrawAmount', Math.floor(userData.bank.balance * 0.25));
  $('btnWdr50').onclick = () => setAmount('withdrawAmount', Math.floor(userData.bank.balance * 0.50));
  $('btnWdrAll').onclick = () => setAmount('withdrawAmount', userData.bank.balance);

  $('fAll').onclick = () => { filter='all'; renderLedger(); };
  $('fDeposits').onclick = () => { filter='deposit'; renderLedger(); };
  $('fWithdrawals').onclick = () => { filter='withdraw'; renderLedger(); };
}

function setAmount(inputId, amt){
  const el = $(inputId);
  el.value = Math.max(0, Math.floor(amt || 0));
}

async function deposit() {
  const amt = Math.floor(Number(($('depositAmount').value || '0').trim()));
  if (!amt || amt <= 0) return msg('Enter a valid amount to deposit.');
  if (amt > userData.coins) return msg("You don't have that many coins in your wallet.");

  const before = snapshotBalances();
  userData.coins -= amt;
  userData.bank.balance += amt;

  await persist();
  await recordLedger('deposit', amt, before, snapshotBalances());

  $('depositAmount').value = '';
  msg(`Deposited ${amt} coin(s).`);
  render();
  renderLedger();
}

async function withdraw() {
  const amt = Math.floor(Number(($('withdrawAmount').value || '0').trim()));
  if (!amt || amt <= 0) return msg('Enter a valid amount to withdraw.');
  if (amt > userData.bank.balance) return msg("You don't have that many coins in the bank.");

  const before = snapshotBalances();
  userData.bank.balance -= amt;
  userData.coins += amt;

  await persist();
  await recordLedger('withdraw', amt, before, snapshotBalances());

  $('withdrawAmount').value = '';
  msg(`Withdrew ${amt} coin(s).`);
  render();
  renderLedger();
}

function snapshotBalances(){
  return {
    wallet: Number(userData.coins || 0),
    bank:   Number(userData.bank?.balance || 0)
  };
}

async function persist() {
  await update(ref(db, `users/${uid}`), {
    coins: userData.coins,
    bank: { balance: userData.bank.balance, lastUpdated: Date.now() }
  });
}

async function recordLedger(kind, amount, before, after){
  const entry = {
    type: kind,                 // 'deposit' | 'withdraw'
    amount: Number(amount||0),
    walletBefore: before.wallet,
    bankBefore: before.bank,
    walletAfter: after.wallet,
    bankAfter: after.bank,
    at: Date.now()
  };
  const r = push(ref(db, `users/${uid}/bank/ledger`));
  await set(r, entry);
  // update local cache at top
  ledger.unshift({ id: r.key, ...entry });
}

function renderLedger(){
  const list = $('ledgerList');
  const empty = $('ledgerEmpty');

  const rows = ledger.filter(e => {
    if (filter === 'deposit') return e.type === 'deposit';
    if (filter === 'withdraw') return e.type === 'withdraw';
    return true;
  });

  if (!rows.length) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = '';

  rows.forEach(e => {
    const div = document.createElement('div');
    div.className = 'ledger-item';

    const tagClass = e.type === 'deposit' ? 'deposit' : 'withdraw';
    const sign = e.type === 'deposit' ? '+' : '−';
    const amtClass = e.type === 'deposit' ? 'positive' : 'negative';

    div.innerHTML = `
      <div class="ledger-left">
        <div>
          <span class="tag ${tagClass}">${e.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span>
          <span class="amt ${amtClass}">${sign}${e.amount}</span>
        </div>
        <div class="balances-mini">
          Wallet: ${e.walletBefore} → ${e.walletAfter} &nbsp;|&nbsp;
          Bank: ${e.bankBefore} → ${e.bankAfter}
        </div>
      </div>
      <div class="hint">${formatTime(e.at)}</div>
    `;
    list.appendChild(div);
  });
}

function formatTime(ts){
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch { return ''; }
}

function msg(text){
  $('bankMsg').textContent = text;
}

