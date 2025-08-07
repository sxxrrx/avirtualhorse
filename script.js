import { auth, db }               from './firebase-init.js';
import { onAuthStateChanged }      from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { ref, get, set }           from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

// Default data if none exists
const defaultData = { coins: 1000, horses: [] };
let gameData = null;

// Define tab IDs
const tabs = ['home','ranch','stables','market','services','shows','settings','reset'];

document.addEventListener('DOMContentLoaded', () => {
  // Wait until user is authenticated
  onAuthStateChanged(auth, async user => {
    if (!user) return window.location.href = 'login.html';
    const uid = user.uid;

    // Load or initialize gameData in Firebase
    const dataRef = ref(db, `users/${uid}/gameData`);
    const snapshot = await get(dataRef);
    if (snapshot.exists()) {
      gameData = snapshot.val();
    } else {
      gameData = defaultData;
      await set(dataRef, gameData);
    }

    // Setup tab listeners
    tabs.forEach(name => {
      const btn = document.getElementById(`tab-${name}`);
      if (btn) btn.addEventListener('click', () => selectTab(name, uid));
    });

    // Start on home
    selectTab('home', uid);
  });
});

async function selectTab(name, uid) {
  // Highlight active button
  tabs.forEach(n => {
    const b = document.getElementById(`tab-${n}`);
    if (b) b.classList.toggle('active', n === name);
  });

  const main = document.getElementById('main-content');
  switch (name) {
    case 'home':
      main.innerHTML = '<h1>Welcome!</h1><p>Start your ranch adventures.</p>';
      break;
    case 'ranch':
      main.innerHTML = `<h1>My Ranch</h1><p>💰 Coins: ${gameData.coins}</p>`;
      break;
    case 'stables':
      main.innerHTML = `<h1>Stables</h1><p>You have ${gameData.horses.length} horses.</p>`;
      break;
    // ... other tabs ...
    case 'reset':
      if (confirm('Reset game data?')) {
        gameData = defaultData;
        await set(ref(db, `users/${uid}/gameData`), gameData);
        selectTab('home', uid);
      }
      return;
    default:
      main.innerHTML = `<h1>${name.charAt(0).toUpperCase() + name.slice(1)}</h1><p>Coming soon...</p>`;
  }

  // Save any changes
  await set(ref(db, `users/${uid}/gameData`), gameData);
}

