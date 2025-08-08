import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set, update, push, onValue } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const $ = id => document.getElementById(id);
let uid = null;
let user = null;

onAuthStateChanged(auth, async (u) => {
  if (!u) return location.href = 'login.html';
  uid = u.uid;

  const us = await get(ref(db, `users/${uid}`));
  if (!us.exists()) return;
  user = us.val();
  if (user.bank == null) {
    await update(ref(db, `users/${uid}`), { bank: 0 });
    user.bank = 0;
  }

  renderBalances();

  // live tx list
  onValue(ref(db, `bankTx/${uid}`), snap => {
    const rows = snap.exists() ? Object.values(snap.val()) : [];
    renderTx(rows.sort((a,b)=>(b.at||0)-(a.at||0)));
  });

  // wire buttons
  $('btnDeposit').onclick  = deposit;
  $('btnWithdraw').onclick = withdraw;
});

function renderBalances(){
  $('coinsOnHand').textContent = Number(user.coins||0).toLocaleString();
  $('bankBalance').textContent = Number(user.bank||0).toLocaleString();
}

function msg(elId, text){ const el=$(elId); if(el) el.textContent=text; }

async function deposit(){
  const amt = Math.max(0, Math.floor(Number($('depAmount').value||0)));
  msg('depMsg','');
  if (!amt) return msg('depMsg','Enter a valid amount.');
  if ((user.coins||0) < amt) return msg('depMsg','Not enough coins on hand.');

  user.coins -= amt;
  user.bank  += amt;

  await update(ref(db, `users/${uid}`), { coins:user.coins, bank:user.bank });
  await addTx('deposit', amt);

  $('depAmount').value = '';
  renderBalances();
  msg('depMsg','Deposited.');
}

async function withdraw(){
  const amt = Math.max(0, Math.floor(Number($('wdAmount').value||0)));
  msg('wdMsg','');
  if (!amt) return msg('wdMsg','Enter a valid amount.');
  if ((user.bank||0) < amt) return msg('wdMsg','Not enough in bank.');

  user.bank  -= amt;
  user.coins += amt;

  await update(ref(db, `users/${uid}`), { coins:user.coins, bank:user.bank });
  await addTx('withdraw', amt);

  $('wdAmount').value = '';
  renderBalances();
  msg('wdMsg','Withdrawn.');
}

async function addTx(kind, amount){
  const txRef = push(ref(db, `bankTx/${uid}`));
  const row = {
    id: txRef.key,
    at: Date.now(),
    type: kind,                 // 'deposit' | 'withdraw'
    amount: Number(amount||0),
    coinsAfter: Number(user.coins||0),
    bankAfter:  Number(user.bank||0),
  };
  await set(txRef, row);
}

function renderTx(rows){
  const list = $('txList'); list.innerHTML = '';
  if (!rows.length) { list.innerHTML = '<div class="muted">No transactions yet.</div>'; return; }
  rows.forEach(r=>{
    const when = new Date(r.at).toLocaleString();
    const line = document.createElement('div');
    line.innerHTML = `
      <strong>${r.type === 'deposit' ? 'Deposit' : 'Withdraw'}</strong>
      — ${r.amount.toLocaleString()} coins
      <span class="muted">(${when})</span><br/>
      <span class="muted">After: on-hand ${r.coinsAfter.toLocaleString()}, bank ${r.bankAfter.toLocaleString()}</span>
    `;
    list.appendChild(line);
  });
}
