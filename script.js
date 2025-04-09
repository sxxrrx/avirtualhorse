// script.js - now an ES module with Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Save user data to Firebase
function saveUserToFirebase(userId, userData) {
  const dbRef = ref(db, 'users/' + userId);
  return set(dbRef, userData);
}

// Login function
export function loginUser() {
  const loginName = document.getElementById("loginName").value.trim();
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, loginName, password)
    .then(async (userCredential) => {
      const uid = userCredential.user.uid;
      const userRef = ref(db, 'users/' + uid);
      const snapshot = await get(userRef);
      if (snapshot.exists()) {
        const user = snapshot.val();
        localStorage.setItem("activeUser", JSON.stringify(user));
        window.location.href = "game.html";
      } else {
        alert("No user data found.");
      }
    })
    .catch((error) => {
      alert("Login failed: " + error.message);
    });
}

// Helper ID generators
export function generateUserId() {
  return 'user_' + Math.floor(Math.random() * 1000000000);
}

export function generateHorseId() {
  return 'horse_' + Date.now();
}
// Registration function
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

      saveUserToFirebase(userId, newUser)
        .then(() => {
          localStorage.setItem("activeUser", JSON.stringify(newUser));
          window.location.href = "account-summary.html";
        })
        .catch((error) => {
          alert("Error saving user data: " + error.message);
        });
    })
    .catch((error) => {
      alert("Signup failed: " + error.message);
    });
}

// Display profile info
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

  // Also update coins display
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
}

// Random starter horse generator
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
// Render user's horses in stable
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

// Sales horse generation & retrieval
export function generateHorsesForSale() {
  const horses = [];
  for (let i = 0; i < 5; i++) {
    horses.push(generateRandomHorse());
  }
  const salesData = {
    timestamp: Date.now(),
    horses
  };
  localStorage.setItem("salesHorses", JSON.stringify(salesData));
  return horses;
}

export function getSalesHorses() {
  const saved = JSON.parse(localStorage.getItem("salesHorses"));
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  if (!saved || now - saved.timestamp > THIRTY_MINUTES) {
    return generateHorsesForSale();
  }
  return saved.horses;
}

export function renderSalesHorses(user) {
  const horses = getSalesHorses();
  const salesList = document.getElementById("salesList");
  salesList.innerHTML = "";
  horses.forEach(horse => {
    const div = document.createElement("div");
    div.innerHTML = `
      <p><strong>${horse.name}</strong> (${horse.breed} - ${horse.coatColor} ${horse.gender}) - ${horse.price} coins
      <button onclick="buyHorse('${horse.id}')">Purchase</button></p>
    `;
    salesList.appendChild(div);
  });
}
export function buyHorse(horseId) {
  let user = JSON.parse(localStorage.getItem("activeUser"));
  let sales = JSON.parse(localStorage.getItem("salesHorses"));

  const index = sales.horses.findIndex(h => h.id === horseId);
  if (index === -1) return;

  const horse = sales.horses[index];
  if (user.coins < horse.price) {
    alert("You don't have enough coins!");
    return;
  }

  user.coins -= horse.price;
  user.horses.push(horse);
  sales.horses.splice(index, 1);
  sales.horses.push(generateRandomHorse());

  localStorage.setItem("salesHorses", JSON.stringify(sales));
  saveUserToFirebase(user.id, user);
  renderSalesHorses(user);
  renderStables(user);
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
  alert(`${horse.name} has been added to your stable!`);
}

// Utility function to show tabs
export function showTab(id) {
  document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
  const news = document.getElementById("newsSection");
  if (news) news.style.display = (id === 'myranch') ? 'block' : 'none';
}

// Utility for sub-tabs
export function showSubTab(main, subId) {
  document.querySelectorAll(`#${main} .barn-tab`).forEach(tab => tab.style.display = 'none');
  const sub = document.getElementById(subId);
  if (sub) sub.style.display = 'block';
  showTab(main);
}

// Load user on game.html with Firebase
export async function initializeGamePage() {
  const stored = localStorage.getItem("activeUser");
  if (!stored) {
    window.location.href = "login.html";
    return;
  }
  const user = JSON.parse(stored);
  document.getElementById("welcomeUser").textContent = `Welcome, ${user.username}!`;
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;

  const news = [
    "Welcome to HORSE GAME",
    "New event: coming soon...",
    "News Update: New Version of HORSE GAME v4.1.1"
  ];
  const newsListContainer = document.getElementById("newsList");
  if (newsListContainer) {
    news.forEach(item => {
      const div = document.createElement("div");
      div.textContent = item;
      newsListContainer.appendChild(div);
    });
  }

  showProfile(user);
  renderStables(user);
  renderSalesHorses(user);
  setupJobs(user);
  showRider(user);
  showTack(user);
  showTab("stables");
}
