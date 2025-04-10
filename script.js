// script.js - now an ES module with Firebase only (no localStorage)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, get, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCkFOc0BwRqmR2LkjHj0vwXSAS1h4BlBCE",
  authDomain: "horse-game-by-sxxrrx.firebaseapp.com",
  projectId: "horse-game-by-sxxrrx",
  storageBucket: "horse-game-by-sxxrrx.firebasestorage.app",
  messagingSenderId: "87883054918",
  appId: "1:87883054918:web:4771a90eb5c6a3e7c0ef47",
  measurementId: "G-ZW6W5HVXBJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

function saveUserToFirebase(userId, userData) {
  return set(ref(db, 'users/' + userId), userData);
}

// Login
export function loginUser(event) {
  event.preventDefault();
  const loginName = document.getElementById("loginName").value.trim();
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, loginName, password)
    .then(() => {
      window.location.href = "game.html";
    })
    .catch((error) => {
      alert("Login failed: " + error.message);
    });
}

// Registration
export function submitForm() {
  const loginName = document.getElementById("loginName").value.trim();
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const horseName = document.getElementById("horseName").value.trim();
  const breed = document.getElementById("breed").value;
  const coatColor = document.getElementById("coatColor").value;
  const sex = document.getElementById("sex").value;

  if (!loginName || !username || !email || !password || !confirmPassword || !horseName || !breed || !coatColor || !sex) {
    alert("Please fill out all fields.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const userId = userCredential.user.uid;
      const horse = {
        id: generateHorseId(),
        name: horseName,
        breed,
        coatColor,
        gender: sex,
        level: 1,
        exp: 0,
        age: { years: 3, months: 0 }
      };

      const newUser = {
        id: userId,
        loginName,
        username,
        email,
        coins: 5000,
        level: 1,
        exp: 0,
        horses: [horse],
        job: "Stablehand",
        joinDate: new Date().toLocaleDateString()
      };

      return saveUserToFirebase(userId, newUser);
    })
    .then(() => {
      window.location.href = "account-summary.html";
    })
    .catch((error) => {
      alert("Signup failed: " + error.message);
    });
}

// Utilities
export function generateHorseId() {
  return 'horse_' + Date.now();
}

export function generateRandomHorse() {
  const breeds = {
    "Friesian": ["Black"],
    "Thoroughbred": ["Bay", "Dark Bay", "Chestnut", "Liver Chestnut", "Black"],
    "Arabian": ["Black", "Bay", "Dark Bay", "Chestnut", "Liver Chestnut", "Grey"]
  };
  const genders = ["Mare", "Stallion"];
  const breedKeys = Object.keys(breeds);
  const breed = breedKeys[Math.floor(Math.random() * breedKeys.length)];
  const coatColor = breeds[breed][Math.floor(Math.random() * breeds[breed].length)];
  const gender = genders[Math.floor(Math.random() * genders.length)];

  return {
    id: generateHorseId(),
    name: `${breed} (${coatColor} ${gender})`,
    breed,
    coatColor,
    gender,
    price: 1000,
    level: 1,
    exp: 0,
    age: { years: 3, months: 0 }
  };
}

export function showProfile(user) {
  document.getElementById("profileUsername").textContent = user.username || "Unknown";
  document.getElementById("profileLevel").textContent = user.level || 1;
  document.getElementById("profileJob").textContent = user.job || "Stablehand";
  document.getElementById("profileHorseCount").textContent = user.horses?.length || 0;
  document.getElementById("profileJoinDate").textContent = user.joinDate || "Unknown";

  const level = user.level || 1;
  const exp = user.exp || 0;
  const nextLevelExp = level === 1 ? 100 : level === 2 ? 200 : level === 3 ? 400 : 600;
  const expPercent = Math.min((exp / nextLevelExp) * 100, 100);

  document.getElementById("profileExp").textContent = `${exp} / ${nextLevelExp}`;
  document.getElementById("profileExpBar").style.width = `${expPercent}%`;

  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
}

export function renderStables(user) {
  const stableGrid = document.getElementById("stableGrid");
  stableGrid.innerHTML = "";
  user.horses.forEach(horse => {
    const stallDiv = document.createElement("div");
    stallDiv.className = "stall";
    const horseImage = horse.image || "horse-placeholder.png";
    stallDiv.innerHTML = `
      <a href="#" onclick="showHorseDetails('${horse.id}')">
        <img src="${horseImage}" alt="${horse.name}">
        <p><strong>${horse.name}</strong></p>
        <p>${horse.breed}</p>
      </a>`;
    stableGrid.appendChild(stallDiv);
  });
}

// Load game page from Firebase only
export async function initializeGamePage() {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) return window.location.href = "login.html";

    const uid = firebaseUser.uid;
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    if (!snapshot.exists()) return alert("User data not found.");

    const user = snapshot.val();
    showProfile(user);
    renderStables(user);
    renderSalesHorses(user);
    setupJobs(user);
    showRider(user);
    showTack(user);
    showTab("stables");
    startGameClock();
  });
}

// Placeholder functions for features
export function setupJobs() {}
export function showRider() {}
export function showTack() {}

// UI Tabs
export function showTab(id) {
  document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
  const news = document.getElementById("newsSection");
  if (news) news.style.display = (id === 'myranch') ? 'block' : 'none';
}

export function showSubTab(main, subId) {
  document.querySelectorAll(`#${main} .barn-tab`).forEach(tab => tab.style.display = 'none');
  const sub = document.getElementById(subId);
  if (sub) sub.style.display = 'block';
  showTab(main);
}

// In-game clock
export function startGameClock() {
  const seasons = [
    { name: "Verdant's Bloom", start: [3, 20], end: [6, 19] },
    { name: "Summer's Height", start: [6, 20], end: [9, 21] },
    { name: "Harvest's Embrace", start: [9, 22], end: [12, 20] },
    { name: "Winter's Hold", start: [12, 21], end: [3, 19] }
  ];

  function getSeason(month, day) {
    for (let s of seasons) {
      const [startMonth, startDay] = s.start;
      const [endMonth, endDay] = s.end;
      if ((month > startMonth || (month === startMonth && day >= startDay)) &&
          (month < endMonth || (month === endMonth && day <= endDay))) {
        return s.name;
      }
      if (s.name === "Winter's Hold") {
        if ((month === 12 && day >= 21) || (month <= 3 && day <= 19)) return s.name;
      }
    }
    return "Unknown Season";
  }

  function updateGameTime() {
    const now = new Date();
    const realStart = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));
    const msSinceStart = now - realStart;
    const inGameHours = Math.floor(msSinceStart / (60 * 1000));
    const inGameDays = Math.floor(inGameHours / 24);
    const inGameHour = inGameHours % 24;

    const gameDate = new Date(realStart.getTime() + inGameDays * 24 * 60 * 60 * 1000);
    const season = getSeason(gameDate.getMonth() + 1, gameDate.getDate());

    const clock = document.getElementById("gameClock");
    if (clock) {
      clock.innerHTML = `<strong>In-Game Date:</strong> ${season}, ${gameDate.toLocaleDateString('en-US')} — <strong>Hour:</strong> ${inGameHour}:00`;
    }
  }

  updateGameTime();
  setInterval(updateGameTime, 60 * 1000);
}
