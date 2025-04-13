import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  child
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Firebase setup
const firebaseConfig = {
  apiKey: "AIzaSyCkFOc0BwRqmR2LkjHj0vwXSAS1h4BlBCE",
  authDomain: "horse-game-by-sxxrrx.firebaseapp.com",
  projectId: "horse-game-by-sxxrrx",
  storageBucket: "horse-game-by-sxxrrx.appspot.com",
  messagingSenderId: "87883054918",
  appId: "1:87883054918:web:4771a90eb5c6a3e7c0ef47"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUserId = null;
let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "login.html";
  currentUserId = user.uid;

  const snapshot = await get(ref(db, `users/${currentUserId}`));
  if (!snapshot.exists()) return alert("User data not found.");
  currentUserData = snapshot.val();

  updateCoinDisplay();
  startGameClock();
  renderStoreHorses();
  renderRescueHorses();
  renderSellableHorses();
});

function updateCoinDisplay() {
  document.getElementById("coinCounter").textContent = `Coins: ${currentUserData.coins || 0}`;
}

// ✅ Game clock
function startGameClock() {
  function getSeason(month, day) {
    const seasons = [
      { name: "Verdant's Bloom", start: [3, 20], end: [6, 19] },
      { name: "Summer's Height", start: [6, 20], end: [9, 21] },
      { name: "Harvest's Embrace", start: [9, 22], end: [12, 20] },
      { name: "Winter's Hold", start: [12, 21], end: [3, 19] }
    ];
    for (const s of seasons) {
      const [sm, sd] = s.start;
      const [em, ed] = s.end;
      if ((month > sm || (month === sm && day >= sd)) &&
          (month < em || (month === em && day <= ed))) return s.name;
      if (s.name === "Winter's Hold" && ((month === 12 && day >= 21) || (month <= 3 && day <= 19))) return s.name;
    }
    return "Unknown";
  }

  function updateTime() {
    const now = new Date();
    const realStart = new Date(Date.UTC(2025, 0, 1));
    const msSince = now - realStart;
    const inGameHours = Math.floor(msSince / (60 * 1000));
    const inGameDays = Math.floor(inGameHours / 24);
    const hour = inGameHours % 24;
    const gameDate = new Date(realStart.getTime() + inGameDays * 86400000);
    const season = getSeason(gameDate.getMonth() + 1, gameDate.getDate());

    const clock = document.getElementById("gameClock");
    clock.textContent = `${season}, ${gameDate.toLocaleDateString()} — ${hour}:00`;
  }

  updateTime();
  setInterval(updateTime, 60000);
}

// ✅ Store horse rendering (per user)
function renderStoreHorses() {
  const grid = document.getElementById("storeGrid");
  grid.innerHTML = "";

  if (!currentUserData.store || currentUserData.store.length === 0) {
    currentUserData.store = Array.from({ length: 4 }, generateStoreHorse);
    update(ref(db, `users/${currentUserId}`), { store: currentUserData.store });
  }

  currentUserData.store.forEach((horse, index) => {
    const div = document.createElement("div");
    div.className = "horse-card";
    div.innerHTML = `
      <strong>${horse.name}</strong><br>
      ${horse.breed}, ${horse.coatColor}<br>
      ${horse.gender}, ${horse.age.years} yrs<br>
      Price: ${horse.price} coins<br>
      <button onclick="buyStoreHorse(${index})">Buy</button>
    `;
    grid.appendChild(div);
  });
}

function generateStoreHorse() {
  const breeds = {
    "Thoroughbred": ["Black", "Bay", "Chestnut"],
    "Arabian": ["Grey", "Bay", "Chestnut"],
    "Friesian": ["Black"]
  };
  const genders = ["Mare", "Stallion"];
  const breed = Object.keys(breeds)[Math.floor(Math.random() * 3)];
  const coat = breeds[breed][Math.floor(Math.random() * breeds[breed].length)];
  return {
    id: `horse_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: "Unnamed Horse",
    breed,
    coatColor: coat,
    gender: genders[Math.floor(Math.random() * 2)],
    level: 1,
    exp: 0,
    age: { years: 3, months: 0 },
    price: 1000
  };
}

window.buyStoreHorse = async function(index) {
  const horse = currentUserData.store[index];
  if (!horse) return;
  if (currentUserData.coins < horse.price) return alert("Not enough coins.");

  currentUserData.coins -= horse.price;
  currentUserData.horses.push(horse);
  currentUserData.store.splice(index, 1);

  await set(ref(db, `users/${currentUserId}`), currentUserData);
  updateCoinDisplay();
  renderStoreHorses();
};

// ✅ Rescue Horses (from public/rescueMarket)
async function renderRescueHorses() {
  const grid = document.getElementById("rescueGrid");
  grid.innerHTML = "";

  const snapshot = await get(ref(db, "rescueMarket"));
  if (!snapshot.exists()) return;

  const horses = snapshot.val();
  Object.entries(horses).forEach(([key, horse]) => {
    const div = document.createElement("div");
    div.className = "horse-card";
    div.innerHTML = `
      <strong>${horse.name}</strong><br>
      ${horse.breed}, ${horse.coatColor}<br>
      ${horse.gender}, ${horse.age.years} yrs<br>
      Price: ${horse.price} coins<br>
      <button onclick="buyRescueHorse('${key}')">Adopt</button>
    `;
    grid.appendChild(div);
  });
}

window.buyRescueHorse = async function(horseKey) {
  const snapshot = await get(ref(db, `rescueMarket/${horseKey}`));
  if (!snapshot.exists()) return alert("Horse no longer available.");
  const horse = snapshot.val();

  if (currentUserData.coins < horse.price) return alert("Not enough coins.");

  currentUserData.coins -= horse.price;
  currentUserData.horses.push(horse);
  await Promise.all([
    update(ref(db, `users/${currentUserId}`), currentUserData),
    set(ref(db, `rescueMarket/${horseKey}`), null)
  ]);
  updateCoinDisplay();
  renderRescueHorses();
};

// ✅ Sell user horse to rescue market
function renderSellableHorses() {
  const grid = document.getElementById("sellGrid");
  grid.innerHTML = "";

  (currentUserData.horses || []).forEach((horse, index) => {
    const div = document.createElement("div");
    div.className = "horse-card";
    div.innerHTML = `
      <strong>${horse.name}</strong><br>
      ${horse.breed}, ${horse.coatColor}<br>
      ${horse.gender}, ${horse.age.years} yrs<br>
      <input id="price_${index}" type="number" placeholder="Price" />
      <button onclick="sellHorse(${index})">List for Sale</button>
    `;
    grid.appendChild(div);
  });
}

window.sellHorse = async function(index) {
  const horse = currentUserData.horses[index];
  const priceInput = document.getElementById(`price_${index}`);
  const price = parseInt(priceInput.value);
  if (!price || price < 100) return alert("Set a valid price (min 100)");

  horse.price = price;
  await push(ref(db, "rescueMarket"), horse);
  currentUserData.horses.splice(index, 1);
  await set(ref(db, `users/${currentUserId}`), currentUserData);
  renderSellableHorses();
};
