import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Firebase config
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

// Global
let currentUserId = null;
let currentUserData = null;
let currentHorseId = null;

export function showTab(id) {
  document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';

  const news = document.getElementById("newsSection");
  if (news) news.style.display = (id === 'myranch') ? 'block' : 'none';

  if (id === 'market') {
    showMarketSection('buy');
  }
}

export async function initializeGamePage() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return window.location.href = "login.html";

    currentUserId = user.uid;
    const userRef = ref(db, `users/${currentUserId}`);
    const snapshot = await get(userRef);
    if (!snapshot.exists()) return alert("User data not found.");

    currentUserData = snapshot.val();

    if (!currentUserData.market || currentUserData.market.length === 0) {
      currentUserData.market = [];
      for (let i = 0; i < 4; i++) currentUserData.market.push(generateMarketHorse());
      await update(userRef, { market: currentUserData.market });
    }

    showProfile(currentUserData);
    renderStables(currentUserData);
    showTab("myranch");
    startGameClock();
  });
}

export function showProfile(user) {
  document.getElementById("profileUsername").textContent = user.username || "Unknown";
  document.getElementById("profileLevel").textContent = user.level || 1;
  document.getElementById("profileJob").textContent = user.job || "Stablehand";
  document.getElementById("profileHorseCount").textContent = user.horses?.length || 0;
  document.getElementById("profileJoinDate").textContent = user.joinDate || "Unknown";
  document.getElementById("profileExp").textContent = `${user.exp || 0} / ${(user.level || 1) * 100}`;
  document.getElementById("profileExpBar").style.width = `${Math.min(((user.exp || 0) / ((user.level || 1) * 100)) * 100, 100)}%`;
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
}

export function renderStables(user) {
  const stableGrid = document.getElementById("stableGrid");
  stableGrid.innerHTML = "";
  user.horses?.forEach(horse => {
    const stall = document.createElement("div");
    stall.className = "stall";
    stall.innerHTML = `
      <a href="#" onclick="window.showHorseDetails('${horse.id}')">
        <img src="${horse.image || 'horse-placeholder.png'}" alt="${horse.name}">
        <p><strong>${horse.name}</strong></p>
        <p>${horse.breed}</p>
      </a>`;
    stableGrid.appendChild(stall);
  });
}

export function showHorseDetails(horseId) {
  if (!currentUserData?.horses) return;
  const horse = currentUserData.horses.find(h => h.id === horseId);
  if (!horse) return;
  currentHorseId = horseId;

  document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
  document.getElementById("horseDetail").style.display = "block";

  document.getElementById("horseNameDetail").innerHTML = `
    <span id="horseNameText">${horse.name}</span>
    <button id="editHorseNameBtn">✎</button>`;
  document.getElementById("horseDetailInfo").innerHTML = `
    <p><strong>Breed:</strong> ${horse.breed}</p>
    <p><strong>Color:</strong> ${horse.coatColor}</p>
    <p><strong>Gender:</strong> ${horse.gender}</p>
    <p><strong>Level:</strong> ${horse.level}</p>
    <p><strong>EXP:</strong> ${horse.exp}</p>
    <p><strong>Age:</strong> ${horse.age?.years || 0}y, ${horse.age?.months || 0}m</p>`;
}

export function startGameClock() {
  function getSeason(month, day) {
    const seasons = [
      { name: "Verdant's Bloom", start: [3, 20], end: [6, 19] },
      { name: "Summer's Height", start: [6, 20], end: [9, 21] },
      { name: "Harvest's Embrace", start: [9, 22], end: [12, 20] },
      { name: "Winter's Hold", start: [12, 21], end: [3, 19] }
    ];
    for (const s of seasons) {
      const [sm, sd] = s.start, [em, ed] = s.end;
      if ((month > sm || (month === sm && day >= sd)) &&
          (month < em || (month === em && day <= ed))) return s.name;
      if (s.name === "Winter's Hold" && ((month === 12 && day >= 21) || (month <= 3 && day <= 19))) return s.name;
    }
    return "Unknown";
  }

  function updateTime() {
    const now = new Date(), realStart = new Date(Date.UTC(2025, 0, 1));
    const inGameHours = Math.floor((now - realStart) / (60 * 1000));
    const gameDate = new Date(realStart.getTime() + Math.floor(inGameHours / 24) * 86400000);
    const hour = inGameHours % 24;
    const season = getSeason(gameDate.getMonth() + 1, gameDate.getDate());

    const clock = document.getElementById("gameClock");
    clock.innerHTML = `<strong>In-Game Date:</strong> ${season}, ${gameDate.toLocaleDateString()} — <strong>Hour:</strong> ${hour}:00`;
  }

  updateTime();
  setInterval(updateTime, 60000);
}

function generateMarketHorse() {
  const breeds = {
    "Thoroughbred": ["Black", "Bay", "Chestnut"],
    "Arabian": ["Grey", "Bay", "Chestnut"],
    "Friesian": ["Black"]
  };
  const genders = ["Mare", "Stallion"];
  const breed = Object.keys(breeds)[Math.floor(Math.random() * 3)];
  const coatColor = breeds[breed][Math.floor(Math.random() * breeds[breed].length)];
  const gender = genders[Math.floor(Math.random() * 2)];

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

function renderMarketBuySection() {
  const salesGrid = document.getElementById("salesGrid");
  if (!salesGrid) return;
  salesGrid.innerHTML = "";

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
      <button onclick="window.buyHorse(${index})">Buy Horse</button>`;
    salesGrid.appendChild(card);
  });
}

export function showMarketSection(section) {
  const buy = document.getElementById("marketBuySection");
  const sell = document.getElementById("marketSellSection");
  buy.style.display = section === "buy" ? "block" : "none";
  sell.style.display = section === "sell" ? "block" : "none";
  if (section === "buy") renderMarketBuySection();
}

window.buyHorse = async function(index) {
  const horse = currentUserData.market[index];
  if (!horse) return;
  if (currentUserData.coins < horse.price) return alert("Not enough coins.");
  currentUserData.coins -= horse.price;
  currentUserData.horses.push({ ...horse, id: generateHorseId() });
  currentUserData.market.splice(index, 1);
  await set(ref(db, `users/${currentUserId}`), currentUserData);
  renderStables(currentUserData);
  renderMarketBuySection();
  showProfile(currentUserData);
};

// Expose
window.showTab = showTab;
window.logout = logout;
window.showHorseDetails = showHorseDetails;
window.showMarketSection = showMarketSection;
