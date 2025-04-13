// market.js
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
  onValue
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "login.html";
  currentUserId = user.uid;
  const userSnap = await get(ref(db, `users/${currentUserId}`));
  currentUserData = userSnap.val();
  document.getElementById("coinCounter").textContent = `Coins: ${currentUserData.coins || 0}`;
  startGameClock();
  renderMarketHorses();
});

window.logout = function () {
  signOut(auth).then(() => location.href = "login.html");
};

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

    document.getElementById("gameClock").innerHTML = `<strong>${season}</strong> — ${gameDate.toLocaleDateString()} @ ${hour}:00`;
  }

  updateTime();
  setInterval(updateTime, 60000);
}

function renderMarketHorses() {
  const grid = document.getElementById("salesGrid");
  if (!grid) return;
  grid.innerHTML = "Loading...";

  onValue(ref(db, 'market'), (snapshot) => {
    grid.innerHTML = "";
    const horses = snapshot.val();
    if (!horses) {
      grid.innerHTML = "<p>No horses for sale right now.</p>";
      return;
    }

    Object.entries(horses).forEach(([id, horse]) => {
      const card = document.createElement("div");
      card.className = "horse-card";
      card.innerHTML = `
        <strong>${horse.name}</strong><br>
        Breed: ${horse.breed}<br>
        Color: ${horse.coatColor}<br>
        Gender: ${horse.gender}<br>
        Price: ${horse.price} coins<br>
        <button onclick="buyHorse('${id}')">Buy</button>
      `;
      grid.appendChild(card);
    });
  });
}

window.buyHorse = async function (horseId) {
  const horseSnap = await get(ref(db, `market/${horseId}`));
  if (!horseSnap.exists()) return alert("Horse no longer available.");
  const horse = horseSnap.val();

  if (currentUserData.coins < horse.price) return alert("Not enough coins.");

  currentUserData.coins -= horse.price;
  currentUserData.horses.push({ ...horse, id: 'horse_' + Date.now() });

  await set(ref(db, `users/${currentUserId}`), currentUserData);
  await set(ref(db, `market/${horseId}`), null); // remove from market
  renderMarketHorses();
  document.getElementById("coinCounter").textContent = `Coins: ${currentUserData.coins}`;
};
import { ref, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { db } from "./firebaseInit.js"; // make sure this points to your initialized DB

function generateMarketHorse() {
  const breeds = {
    "Thoroughbred": ["Black", "Bay", "Chestnut"],
    "Arabian": ["Grey", "Bay", "Chestnut"],
    "Friesian": ["Black"]
  };
  const genders = ["Mare", "Stallion"];
  const breedKeys = Object.keys(breeds);
  const breed = breedKeys[Math.floor(Math.random() * breedKeys.length)];
  const coatColor = breeds[breed][Math.floor(Math.random() * breeds[breed].length)];
  const gender = genders[Math.floor(Math.random() * genders.length)];

  return {
    id: "horse_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    name: "Unnamed Horse",
    breed,
    coatColor,
    gender,
    level: 1,
    exp: 0,
    age: { years: 3, months: 0 },
    price: 1000,
    store: true
  };
}

// Call this once to seed the market
async function seedMarketStoreHorses() {
  const marketRef = ref(db, "market");
  const horses = {};
  for (let i = 0; i < 4; i++) {
    const horse = generateMarketHorse();
    horses[horse.id] = horse;
  }
  await set(marketRef, horses);
  console.log("Market store horses seeded.");
}

seedMarketStoreHorses();
