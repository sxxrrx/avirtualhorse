// script.js - Firebase-enabled ES module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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

// Global user data
let currentUserId = null;
let currentUserData = null;
let currentHorseId = null;

// ✅ Utility
export function generateHorseId() {
  return 'horse_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

// ✅ Login
export function loginUser(event) {
  event.preventDefault();
  const loginName = document.getElementById("loginName").value.trim();
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, loginName, password)
    .then(() => window.location.href = "game.html")
    .catch((error) => alert("Login failed: " + error.message));
}

// ✅ Logout
export function logout() {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
}

// ✅ Tab switching
export function showTab(id) {
  document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
  const news = document.getElementById("newsSection");
  if (news) news.style.display = (id === 'myranch') ? 'block' : 'none';
}

// ✅ Initialize game
export async function initializeGamePage() {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) return window.location.href = "login.html";

    const uid = firebaseUser.uid;
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) return alert("User data not found.");

    currentUserId = uid;
    currentUserData = snapshot.val();

    showProfile(currentUserData);
    renderStables(currentUserData);
    showTab("myranch");
    startGameClock();
  });
}

// ✅ Show profile
export function showProfile(user) {
  document.getElementById("profileUsername").textContent = user.username || "Unknown";
  document.getElementById("profileLevel").textContent = user.level || 1;
  document.getElementById("profileJob").textContent = user.job || "Stablehand";
  document.getElementById("profileHorseCount").textContent = user.horses?.length || 0;
  document.getElementById("profileJoinDate").textContent = user.joinDate || "Unknown";

  const level = user.level || 1;
  const exp = user.exp || 0;
  const nextLevelExp = level * 100;
  const expPercent = Math.min((exp / nextLevelExp) * 100, 100);

  document.getElementById("profileExp").textContent = `${exp} / ${nextLevelExp}`;
  document.getElementById("profileExpBar").style.width = `${expPercent}%`;

  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
}

// ✅ Show stable
export function renderStables(user) {
  const stableGrid = document.getElementById("stableGrid");
  if (!stableGrid) return;
  stableGrid.innerHTML = "";

  user.horses.forEach(horse => {
    const stall = document.createElement("div");
    stall.className = "stall";
    const img = horse.image || "horse-placeholder.png";
    stall.innerHTML = `
      <a href="#" onclick="window.showHorseDetails('${horse.id}')">
        <img src="${img}" alt="${horse.name}">
        <p><strong>${horse.name}</strong></p>
        <p>${horse.breed}</p>
      </a>`;
    stableGrid.appendChild(stall);
  });
}

// ✅ Show horse detail
export function showHorseDetails(horseId) {
  if (!currentUserData || !currentUserData.horses) return;

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
    <p><strong>Age:</strong> ${horse.age?.years || 0} years, ${horse.age?.months || 0} months</p>`;
}

// ✅ Game Clock
export function startGameClock() {
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

// ✅ Inline renaming for horse
document.addEventListener("click", async (e) => {
  if (e.target.id === "editHorseNameBtn") {
    const span = document.getElementById("horseNameText");
    const currentName = span.textContent;
    span.innerHTML = `<input id="horseNameInput" value="${currentName}" />
                      <button id="saveHorseNameBtn">Save</button>`;
  }

  if (e.target.id === "saveHorseNameBtn") {
    const input = document.getElementById("horseNameInput");
    const newName = input.value.trim();
    if (!newName) return;
    const horse = currentUserData.horses.find(h => h.id === currentHorseId);
    if (horse) horse.name = newName;
    await set(ref(db, `users/${currentUserId}`), currentUserData);
    document.getElementById("horseNameDetail").innerHTML = `
      <span id="horseNameText">${newName}</span>
      <button id="editHorseNameBtn">✎</button>`;
    renderStables(currentUserData);
  }
});

// ✅ Expose to HTML
window.showTab = showTab;
window.logout = logout;
window.showHorseDetails = showHorseDetails;
