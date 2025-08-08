// bank.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);

let uid = null;
let userData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = 'login.html';
  uid = user.uid;

  await loadUser();
  wireControls();
  render();
});

async function loadUser() {
  const snap = await get(ref(db, `users/${uid}`));
  userData = snap.exists() ? snap.val() : {};
  // ensure fields
  userData.coins = Number(userData.coins || 0);
  userData.bank = userData.bank || {};
  userData.bank.balance = Number(userData.bank.balance || 0);
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
}

function setAmount(inputId, amt){
  const el = $(inputId);
  el.value = Math.max(0, Math.floor(amt || 0));
}

async function deposit() {
  const amt = Math.floor(Number(($('depositAmount').value || '0').trim()));
  if (!amt || amt <= 0) return msg('Enter a valid amount to deposit.');
  if (amt > userData.coins) return msg("You don't have that many coins in your wallet.");

  userData.coins -= amt;
  userData.bank.balance += amt;

  await persist();
  $('depositAmount').value = '';
  msg(`Deposited ${amt} coin(s).`);
  render();
}

async function withdraw() {
  const amt = Math.floor(Number(($('withdrawAmount').value || '0').trim()));
  if (!amt || amt <= 0) return msg('Enter a valid amount to withdraw.');
  if (amt > userData.bank.balance) return msg("You don't have that many coins in the bank.");

  userData.bank.balance -= amt;
  userData.coins += amt;

  await persist();
  $('withdrawAmount').value = '';
  msg(`Withdrew ${amt} coin(s).`);
  render();
}

async function persist() {
  // write minimal fields
  await update(ref(db, `users/${uid}`), {
    coins: userData.coins,
    bank: { balance: userData.bank.balance, lastUpdated: Date.now() }
  });
}

function msg(text){
  $('bankMsg').textContent = text;
}
