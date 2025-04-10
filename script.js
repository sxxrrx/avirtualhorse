// script.js - ES module using Firebase only
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

// Save user to Firebase
function saveUserToFirebase(userId, userData) {
  return set(ref(db, 'users/' + userId), userData);
}

// Login
export function loginUser(event) {
  event.preventDefault();
  const loginName = document.getElementById("loginName").value.trim();
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, loginName, password)
    .then(() => window.location.href = "game.html")
    .catch((error) => alert("Login failed: " + error.message));
}

// Signup
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
    return alert("Please fill out all fields.");
  }

  if (password !== confirmPassword) {
    return alert("Passwords do not match.");
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
    .then(() => window.location.href = "account-summary.html")
    .catch((error) => alert("Signup failed: " + error.message));
}

// Utility Functions
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

// Display profile
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

// Render horses in stable
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

let currentHorseId = null;
let currentUserId = null;
let currentUserData = null;

// Show Horse Details
export function showHorseDetails(horseId) {
  if (!currentUserData || !currentUserData.horses) return;

  document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
  const horse = currentUserData.horses.find(h => h.id === horseId);
  if (!horse) return;

  // ... rest of the logic

  document.getElementById("horseNameDetail").innerHTML = `
    <h2>
      <span id="horseNameText">${horse.name}</span>
      <button id="editHorseNameBtn">Edit</button>
    </h2>
  `;

  document.getElementById("horseDetailInfo").innerHTML = `
    <p><strong>Breed:</strong> ${horse.breed}</p>
    <p><strong>Color:</strong> ${horse.coatColor}</p>
    <p><strong>Gender:</strong> ${horse.gender}</p>
    <p><strong>Level:</strong> ${horse.level}</p>
    <p><strong>EXP:</strong> ${horse.exp}</p>
    <p><strong>Age:</strong> ${horse.age.years} years, ${horse.age.months} months</p>
  `;

  document.getElementById("horseDetail").style.display = "block";
}

// Inline Editing Logic
document.addEventListener("click", async (e) => {
  if (e.target.id === "editHorseNameBtn") {
    const span = document.getElementById("horseNameText");
    const currentName = span.textContent;
    span.innerHTML = `
      <input id="horseNameInput" value="${currentName}" />
      <button id="saveHorseNameBtn">Save</button>
    `;
  }

  if (e.target.id === "saveHorseNameBtn") {
    const input = document.getElementById("horseNameInput");
    const newName = input.value.trim();
    if (!newName) return;

    const horse = currentUserData.horses.find(h => h.id === currentHorseId);
    if (horse) horse.name = newName;

    // Save to Firebase
    const userRef = ref(db, `users/${currentUserId}`);
    await set(userRef, currentUserData);

    // Re-render name
    document.getElementById("horseNameText").textContent = newName;
  }
});

// Load game page
export async function initializeGamePage() {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) return window.location.href = "login.html";

    const uid = firebaseUser.uid;
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    if (!snapshot.exists()) return alert("User data not found.");

    const user = snapshot.val();

    // 🔥 SET THESE
    currentUserId = uid;
    currentUserData = user;

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


// Game Clock
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

// Tabs
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
export function changeHorseName() {
  const nameDisplay = document.getElementById("horseNameDetail");
  const horseId = window.currentHorseId;
  const user = window.currentUserData;

  if (!horseId || !user) return;

  const horse = user.horses.find(h => h.id === horseId);
  if (!horse) return;

  // Prevent multiple inputs
  if (document.getElementById("nameInput")) return;

  // Create input with current name
  const input = document.createElement("input");
  input.id = "nameInput";
  input.type = "text";
  input.value = horse.name;
  input.style.marginLeft = "10px";
  input.style.padding = "4px";
  input.style.fontSize = "16px";

  // Create save button
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.style.marginLeft = "8px";
  saveBtn.onclick = async () => {
    const newName = input.value.trim();
    if (!newName) return;

    horse.name = newName;

    // Update Firebase
    await set(ref(db, 'users/' + user.id), user);

    // Update display
    nameDisplay.innerHTML = newName;
    renderStables(user);
  };

  // Clear existing name and insert input + button
  nameDisplay.innerHTML = '';
  nameDisplay.appendChild(input);
  nameDisplay.appendChild(saveBtn);
}

export function prepareBreeding() {
  const horseId = window.currentHorseId;
  if (!horseId || !window.currentUserData) return;

  const horse = window.currentUserData.horses.find(h => h.id === horseId);
  if (horse) {
    const detailBox = document.getElementById("horseDetailInfo");
    detailBox.innerHTML += `<p><em>Breeding system coming soon!</em></p>`;
  }
}
export function enterShow() {
  const horseId = window.currentHorseId;
  if (!horseId || !window.currentUserData) return;

  const horse = window.currentUserData.horses.find(h => h.id === horseId);
  if (horse) {
    const detailBox = document.getElementById("horseDetailInfo");
    detailBox.innerHTML += `<p><em>${horse.name} is now entered into a local show! (Feature coming soon)</em></p>`;
  }
}

// Placeholders
export function setupJobs() {}
export function showRider() {}
export function showTack() {}
export function renderSalesHorses() {}
