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

let currentUserId = null;
let currentUserData = null;

export function showTab(id) {
  document.querySelectorAll(".content").forEach(c => c.style.display = "none");
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
  if (id === "market") {
    showMarketSection("buy");
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
    if (!currentUserData.horses) currentUserData.horses = [];
    if (!currentUserData.market || currentUserData.market.length === 0) {
      currentUserData.market = [];
      for (let i = 0; i < 4; i++) currentUserData.market.push(generateMarketHorse());
      await update(userRef, { market: currentUserData.market });
    }
    showProfile(currentUserData);
    renderStables(currentUserData);
    showTab("myranch");
  });
}

export function showProfile(user) {
  document.getElementById("profileUsername").textContent = user.username || "Unknown";
  document.getElementById("profileLevel").textContent = user.level || 1;
  document.getElementById("profileJob").textContent = user.job || "Stablehand";
  document.getElementById("profileHorseCount").textContent = user.horses.length || 0;
  document.getElementById("profileJoinDate").textContent = user.joinDate || "Unknown";
  document.getElementById("profileExp").textContent = `${user.exp || 0} / ${(user.level || 1) * 100}`;
  document.getElementById("profileExpBar").style.width = `${Math.min((user.exp || 0) / ((user.level || 1) * 100) * 100, 100)}%`;
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
}

export function renderStables(user) {
  const grid = document.getElementById("stableGrid");
  grid.innerHTML = "";
  user.horses.forEach(horse => {
    const stall = document.createElement("div");
    stall.className = "stall";
    stall.innerHTML = `
      <a href="#" onclick="window.showHorseDetails('${horse.id}')">
        <img src="${horse.image || 'horse-placeholder.png'}" />
        <p><strong>${horse.name}</strong></p>
        <p>${horse.breed}</p>
      </a>
    `;
    grid.appendChild(stall);
  });
}

export function showHorseDetails(horseId) {
  const horse = currentUserData.horses.find(h => h.id === horseId);
  if (!horse) return;
  document.querySelectorAll(".content").forEach(c => c.style.display = "none");
  document.getElementById("horseDetail").style.display = "block";
  document.getElementById("horseNameDetail").innerHTML = horse.name;
  document.getElementById("horseDetailInfo").innerHTML = `
    <p><strong>Breed:</strong> ${horse.breed}</p>
    <p><strong>Color:</strong> ${horse.coatColor}</p>
    <p><strong>Gender:</strong> ${horse.gender}</p>
    <p><strong>Level:</strong> ${horse.level}</p>
    <p><strong>EXP:</strong> ${horse.exp}</p>
    <p><strong>Age:</strong> ${horse.age?.years || 0}y ${horse.age?.months || 0}m</p>
  `;
}

export function showMarketSection(section) {
  document.getElementById("marketBuySection").style.display = section === "buy" ? "block" : "none";
  document.getElementById("marketSellSection").style.display = section === "sell" ? "block" : "none";
  if (section === "buy") renderMarketBuySection();
}

function renderMarketBuySection() {
  const grid = document.getElementById("salesGrid");
  grid.innerHTML = "";
  currentUserData.market.forEach((horse, index) => {
    const card = document.createElement("div");
    card.className = "horse-card";
    card.innerHTML = `
      <strong>${horse.name}</strong><br>
      Breed: ${horse.breed}<br>
      Color: ${horse.coatColor}<br>
      Gender: ${horse.gender}<br>
      Age: ${horse.age?.years || 0}y<br>
      Price: ${horse.price} coins<br>
      <button onclick="window.buyHorse(${index})">Buy</button>
    `;
    grid.appendChild(card);
  });
}

window.buyHorse = async function(index) {
  const horse = currentUserData.market[index];
  if (!horse) return alert("Horse not found.");
  if (currentUserData.coins < horse.price) return alert("Not enough coins.");
  currentUserData.coins -= horse.price;
  currentUserData.horses.push({ ...horse, id: generateHorseId() });
  currentUserData.market.splice(index, 1);
  await set(ref(db, `users/${currentUserId}`), currentUserData);
  renderStables(currentUserData);
  renderMarketBuySection();
  showProfile(currentUserData);
};

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

function generateHorseId() {
  return 'horse_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

export function logout() {
  signOut(auth).then(() => window.location.href = "login.html");
}

window.showTab = showTab;
window.logout = logout;
window.showHorseDetails = showHorseDetails;
window.showMarketSection = showMarketSection;
