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

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCkFOc0BwRqmR2LkjHj0vwXSAS1h4BlBCE",
  authDomain: "horse-game-by-sxxrrx.firebaseapp.com",
  projectId: "horse-game-by-sxxrrx",
  storageBucket: "horse-game-by-sxxrrx.appspot.com",
  messagingSenderId: "87883054918",
  appId: "1:87883054918:web:4771a90eb5c6a3e7c0ef47",
  measurementId: "G-ZW6W5HVXBJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUserId = null;
let currentUserData = null;

// Initialize Page
onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "login.html";
  currentUserId = user.uid;

  const userRef = ref(db, `users/${currentUserId}`);
  const snapshot = await get(userRef);

  if (!snapshot.exists()) return alert("User data not found.");
  currentUserData = snapshot.val();

  renderTopbar();
  renderMarketStore();
  renderRescueHorses();
  renderSellableHorses();
});

// Coin + Clock
function renderTopbar() {
  document.getElementById("coinCounter").textContent = `Coins: ${currentUserData.coins || 0}`;
  updateGameClock();
  setInterval(updateGameClock, 60000);
}

function updateGameClock() {
  const now = new Date();
  const gameStart = new Date(Date.UTC(2025, 0, 1));
  const elapsed = now - gameStart;
  const inGameHours = Math.floor(elapsed / (60 * 1000));
  const inGameDays = Math.floor(inGameHours / 24);
  const hour = inGameHours % 24;
  const gameDate = new Date(gameStart.getTime() + inGameDays * 86400000);
  const month = gameDate.getMonth() + 1;
  const day = gameDate.getDate();
  const season = getSeason(month, day);

  document.getElementById("gameClock").innerHTML = `<strong>In-Game Date:</strong> ${season}, ${gameDate.toLocaleDateString()} — <strong>Hour:</strong> ${hour}:00`;
}

function getSeason(month, day) {
  const s = [
    { name: "Verdant's Bloom", start: [3, 20], end: [6, 19] },
    { name: "Summer's Height", start: [6, 20], end: [9, 21] },
    { name: "Harvest's Embrace", start: [9, 22], end: [12, 20] },
    { name: "Winter's Hold", start: [12, 21], end: [3, 19] }
  ];
  for (const season of s) {
    const [sm, sd] = season.start, [em, ed] = season.end;
    if ((month > sm || (month === sm && day >= sd)) &&
        (month < em || (month === em && day <= ed)) ||
        (season.name === "Winter's Hold" && (month === 12 || month <= 3))) return season.name;
  }
  return "Unknown";
}

// Store Horses
function generateStoreHorse() {
  const breeds = {
    Thoroughbred: ["Black", "Bay", "Chestnut"],
    Arabian: ["Grey", "Bay", "Chestnut"],
    Friesian: ["Black"]
  };
  const genders = ["Mare", "Stallion"];
  const breedList = Object.keys(breeds);
  const breed = breedList[Math.floor(Math.random() * breedList.length)];
  const coat = breeds[breed][Math.floor(Math.random() * breeds[breed].length)];
  const gender = genders[Math.floor(Math.random() * genders.length)];

  return {
    id: "store_" + Date.now(),
    name: "Unnamed Horse",
    breed,
    coatColor: coat,
    gender,
    level: 1,
    exp: 0,
    age: { years: 3, months: 0 },
    price: 1000
  };
}

async function renderMarketStore() {
  const grid = document.getElementById("storeHorseGrid");
  grid.innerHTML = "";

  if (!currentUserData.market || currentUserData.market.length === 0) {
    currentUserData.market = Array.from({ length: 4 }, generateStoreHorse);
    await update(ref(db, `users/${currentUserId}`), { market: currentUserData.market });
  }

  currentUserData.market.forEach((horse, index) => {
    const div = document.createElement("div");
    div.className = "horse-card";
    div.innerHTML = `
      <strong>${horse.name}</strong><br>
      Breed: ${horse.breed}<br>
      Color: ${horse.coatColor}<br>
      Gender: ${horse.gender}<br>
      Age: ${horse.age.years} years<br>
      Price: ${horse.price} coins<br>
      <button onclick="window.buyStoreHorse(${index})">Buy Horse</button>
    `;
    grid.appendChild(div);
  });
}

window.buyStoreHorse = async (index) => {
  const horse = currentUserData.market[index];
  if (!horse) return;

  if (currentUserData.coins < horse.price) return alert("Not enough coins.");
  currentUserData.coins -= horse.price;
  currentUserData.horses.push({ ...horse, id: "horse_" + Date.now() });
  currentUserData.market.splice(index, 1);

  await set(ref(db, `users/${currentUserId}`), currentUserData);
  renderTopbar();
  renderMarketStore();
};

// Rescue Horses
async function renderRescueHorses() {
  const grid = document.getElementById("rescueHorseGrid");
  grid.innerHTML = "";

  const snapshot = await get(ref(db, "rescueHorses"));
  if (!snapshot.exists()) return;

  const horses = snapshot.val();
  Object.entries(horses).forEach(([key, horse]) => {
    const div = document.createElement("div");
    div.className = "horse-card";
    div.innerHTML = `
      <strong>${horse.name}</strong><br>
      Breed: ${horse.breed}<br>
      Color: ${horse.coatColor}<br>
      Gender: ${horse.gender}<br>
      Price: ${horse.price} coins<br>
      <button onclick="window.buyRescueHorse('${key}')">Buy</button>
    `;
    grid.appendChild(div);
  });
}

window.buyRescueHorse = async (key) => {
  const snap = await get(ref(db, `rescueHorses/${key}`));
  if (!snap.exists()) return;

  const horse = snap.val();
  if (currentUserData.coins < horse.price) return alert("Not enough coins.");
  currentUserData.coins -= horse.price;
  currentUserData.horses.push({ ...horse, id: "horse_" + Date.now() });

  await update(ref(db, `users/${currentUserId}`), currentUserData);
  await set(ref(db, `rescueHorses/${key}`), null);
  renderRescueHorses();
  renderTopbar();
};

// Selling Horses
function renderSellableHorses() {
  const grid = document.getElementById("playerHorseList");
  grid.innerHTML = "";

  currentUserData.horses.forEach((horse, i) => {
    const div = document.createElement("div");
    div.className = "horse-card";
    div.innerHTML = `
      <strong>${horse.name}</strong><br>
      Breed: ${horse.breed}<br>
      Color: ${horse.coatColor}<br>
      Gender: ${horse.gender}<br>
      <button onclick="window.sellHorse(${i})">List for Rescue</button>
    `;
    grid.appendChild(div);
  });
}

window.sellHorse = async (index) => {
  const horse = currentUserData.horses[index];
  if (!horse) return;

  const rescueRef = push(ref(db, "rescueHorses"));
  await set(rescueRef, { ...horse, price: 500 });

  currentUserData.horses.splice(index, 1);
  await update(ref(db, `users/${currentUserId}`), currentUserData);
  renderSellableHorses();
};

