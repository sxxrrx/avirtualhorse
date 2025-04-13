// scripts/market.js

// Firebase imports
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
  update
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Global variables
let currentUserId = null;
let currentUserData = null;

// Utility function to generate unique horse IDs
function generateHorseId() {
  return 'horse_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

// Function to generate a store-bought horse
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
    id: generateHorseId(),
    name: "Unnamed Horse",
    breed,
    coatColor,
    gender,
    level: 1,
    exp: 0,
    age: { years: 3, months: 0 },
    price: 1000
  };
}

// Function to update the game clock
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
    if (clock) {
      clock.innerHTML = `<strong>In-Game Date:</strong> ${season}, ${gameDate.toLocaleDateString()} — <strong>Hour:</strong> ${hour}:00`;
    }
  }

  updateTime();
  setInterval(updateTime, 60000);
}

// Function to render the Buy section
function renderMarketBuySection() {
  const salesGrid = document.getElementById("salesGrid");
  if (!salesGrid) return;
  salesGrid.innerHTML = "";

  // Load store horses
  if (!currentUserData.market || currentUserData.market.length === 0) {
    currentUserData.market = [];
    for (let i = 0; i < 4; i++) {
      currentUserData.market.push(generateMarketHorse());
    }
    update(ref(db, `users/${currentUserId}`), { market: currentUserData.market });
  }

  currentUserData.market.forEach((horse, index) => {
    const card = document.createElement("div");
    card.className = "horse-card";
    card.innerHTML = `
      <strong>${horse.name}</strong><br>
      Breed: ${horse.breed}<br>
      Color: ${horse.coatColor}<br>
      Gender: ${horse.gender}<br>
      Age: ${horse.age.years} years<br>
      Price: ${horse.price} coins<br>
      <button onclick="buyHorse(${index})">Buy Horse</button>
    `;
    salesGrid.appendChild(card);
  });

  // Load rescue horses
  const rescueRef = ref(db, 'rescueHorses');
  get(rescueRef).then(snapshot => {
    if (snapshot.exists()) {
      const rescueHorses = snapshot.val();
      Object.keys(rescueHorses).forEach((key) => {
        const horse = rescueHorses[key];
        const card = document.createElement("div");
        card.className = "horse-card";
        card.innerHTML = `
          <strong>${horse.name}</strong><br>
          Breed: ${horse.breed}<br>
          Color: ${horse.coatColor}<br>
          Gender: ${horse.gender}<br>
          Age: ${horse.age.years} years<br>
          Price: ${horse.price} coins<br>
          <button onclick="buyRescueHorse('${key}')">Adopt Horse</button>
        `;
        salesGrid.appendChild(card);
      });
    }
  });
}

// Function to render the Sell section
function renderMarketSellSection() {
  const playerHorseList = document.getElementById("playerHorseList");
  if (!playerHorseList) return;
  playerHorseList.innerHTML = "";

  if (!currentUserData.horses || currentUserData.horses.length === 0) {
    playerHorseList
::contentReference[oaicite:3]{index=3}
 
