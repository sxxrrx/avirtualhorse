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
  update,
  push
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Globals
let currentUserId = null;
let currentUserData = null;
let currentHorseId = null;

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
      const starterHorse = {
        id: generateHorseId(),
        name: horseName,
        breed,
        coatColor,
        gender: sex,
        level: 1,
        exp: 0,
        age: { years: 3, months: 0 },
        tack: {},
        isPregnant: false
      };

      const userData = {
        id: userId,
        loginName,
        username,
        email,
        coins: 5000,
        level: 1,
        exp: 0,
        horses: [starterHorse],
        job: "Stablehand",
        joinDate: new Date().toLocaleDateString(),
        tack: [],
        tackSkills: {
          bridle: { durability: 1, prestige: 0, progress: 0 },
          saddle: { durability: 1, prestige: 0, progress: 0 },
          horseBoots: { durability: 1, prestige: 0, progress: 0 },
          horseShoes: { durability: 1, prestige: 0, progress: 0 }
        },
        riders: []
      };

      return saveUserToFirebase(userId, userData);
    })
    .then(() => window.location.href = "game.html")
    .catch((error) => alert("Signup failed: " + error.message));
}

// Show profile
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
// Utility: generate unique horse ID
export function generateHorseId() {
  return 'horse_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

// Show horses in the player's stable
export function renderStables(user) {
  const stableGrid = document.getElementById("stableGrid");
  stableGrid.innerHTML = "";
  user.horses.forEach(horse => {
    const stallDiv = document.createElement("div");
    stallDiv.className = "stall";
    const horseImage = horse.image || "horse-placeholder.png";
    stallDiv.innerHTML = `
      <a href="#" onclick="window.showHorseDetails('${horse.id}')">
        <img src="${horseImage}" alt="${horse.name}">
        <p><strong>${horse.name}</strong></p>
        <p>${horse.breed}</p>
      </a>`;
    stableGrid.appendChild(stallDiv);
  });
}

// Current selected horse/user for inline editing
let currentHorseId = null;

// Show horse details panel
export function showHorseDetails(horseId) {
  if (!currentUserData || !currentUserData.horses) return;
  currentHorseId = horseId;

  document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
  const horse = currentUserData.horses.find(h => h.id === horseId);
  if (!horse) return;

  document.getElementById("horseDetail").style.display = "block";
  document.getElementById("horseNameDetail").innerHTML = `
    <span id="horseNameText">${horse.name}</span>
    <button id="editHorseNameBtn">✎</button>
  `;
  document.getElementById("horseDetailInfo").innerHTML = `
    <p><strong>Breed:</strong> ${horse.breed}</p>
    <p><strong>Color:</strong> ${horse.coatColor}</p>
    <p><strong>Gender:</strong> ${horse.gender}</p>
    <p><strong>Level:</strong> ${horse.level}</p>
    <p><strong>EXP:</strong> ${horse.exp}</p>
    <p><strong>Age:</strong> ${horse.age.years} years, ${horse.age.months} months</p>
  `;
}

// Rename horse (inline editor)
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

    await set(ref(db, `users/${currentUserId}`), currentUserData);

    document.getElementById("horseNameDetail").innerHTML = `
      <span id="horseNameText">${newName}</span>
      <button id="editHorseNameBtn">✎</button>
    `;

    renderStables(currentUserData);
  }
});
// ✅ Initialize game after login
export async function initializeGamePage() {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) return window.location.href = "login.html";

    const uid = firebaseUser.uid;
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) return alert("User data not found.");

    // Store in global vars
    currentUserId = uid;
    currentUserData = snapshot.val();

    // Render all game data
    showProfile(currentUserData);
    renderStables(currentUserData);
    renderSalesHorses(currentUserData); // Market
    setupJobs(currentUserData);
    showRider(currentUserData);
    showTack(currentUserData);
    showTab("stables");
    startGameClock();
  });
}

// ✅ Game Clock - 1 real min = 1 in-game hour
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

// ✅ Tab switching
export function showTab(id) {
  document.querySelectorAll('.content').forEach(c => c.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
  const news = document.getElementById("newsSection");
  if (news) news.style.display = (id === 'myranch') ? 'block' : 'none';
}

// ✅ Sub-tab switching
export function showSubTab(main, subId) {
  document.querySelectorAll(`#${main} .barn-tab`).forEach(tab => tab.style.display = 'none');
  const sub = document.getElementById(subId);
  if (sub) sub.style.display = 'block';
  showTab(main);
}

// ✅ Placeholder stubs
export function setupJobs() {}
export function showRider() {}
export function showTack() {}
export function renderSalesHorses() {} // Market (was Sales Yard)
// ✅ Generate a random market horse (with breed & coat)
export function generateMarketHorse() {
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
    id: "market_" + Date.now() + Math.floor(Math.random() * 1000),
    name: "Unnamed Horse",
    breed,
    coatColor,
    gender,
    price: 1000,
    level: 1,
    exp: 0,
    age: { years: 3, months: 0 }
  };
}

// ✅ Show Market horses
export function renderSalesHorses(userData) {
  const marketGrid = document.getElementById("salesGrid");
  marketGrid.innerHTML = "";

  // Generate if not already present
  if (!userData.market) {
    userData.market = [];
    for (let i = 0; i < 4; i++) {
      userData.market.push(generateMarketHorse());
    }
    update(ref(db, { [`users/${currentUserId}/market`]: userData.market }));
  }

  userData.market.forEach((horse, index) => {
    const card = document.createElement("div");
    card.className = "horse-card";
    card.innerHTML = `
      <strong>${horse.name}</strong><br>
      Breed: ${horse.breed}<br>
      Color: ${horse.coatColor}<br>
      Gender: ${horse.gender}<br>
      Age: ${horse.age.years} years<br>
      Price: ${horse.price} coins<br>
      <button onclick="window.buyHorse(${index})">Buy Horse</button>
    `;
    marketGrid.appendChild(card);
  });
}

// ✅ Buy Horse from Market
window.buyHorse = async function(index) {
  const horse = currentUserData.market?.[index];
  if (!horse) return alert("Horse not found.");
  if (currentUserData.coins < horse.price) return alert("Not enough coins.");

  // Deduct coins, add horse to stable
  currentUserData.coins -= horse.price;
  horse.id = generateHorseId(); // New unique ID
  currentUserData.horses.push(horse);

  // Remove from market
  currentUserData.market.splice(index, 1);

  // Save
  await set(ref(db, `users/${currentUserId}`), currentUserData);

  // Refresh UI
  renderStables(currentUserData);
  renderSalesHorses(currentUserData);
  document.getElementById("coinCounter").textContent = `Coins: ${currentUserData.coins}`;
};
// ✅ Hire a rider
export function hireRider() {
  if (currentUserData.coins < 10000) {
    return alert("Not enough coins to hire a rider! You need 10,000 coins.");
  }

  currentUserData.coins -= 10000;
  const newRider = {
    id: 'rider_' + Date.now(),
    name: "Unnamed Rider",
    balance: 1,
    control: 1,
    empathy: 1,
    technique: 1,
    experience: 0
  };

  if (!currentUserData.riders) currentUserData.riders = [];
  currentUserData.riders.push(newRider);

  // Save
  set(ref(db, `users/${currentUserId}`), currentUserData)
    .then(() => {
      showRider(currentUserData);
      document.getElementById("coinCounter").textContent = `Coins: ${currentUserData.coins}`;
    });
}

// ✅ Show riders in Clubhouse
export function showRider(user) {
  const riderList = document.getElementById("riderList");
  riderList.innerHTML = "";
  const horses = user.horses || [];

  if (!user.riders || user.riders.length === 0) {
    riderList.innerHTML = "<p>No riders hired yet.</p>";
    return;
  }

  user.riders.forEach((rider, riderIndex) => {
    const div = document.createElement("div");
    div.className = "horse-card";

    // Horse assignment dropdown
    let horseOptions = '<option value="">-- Unassigned --</option>';
    horses.forEach((horse, horseIndex) => {
      const selected = horse.assignedRiderId === rider.id ? 'selected' : '';
      horseOptions += `<option value="${horseIndex}" ${selected}>${horse.name}</option>`;
    });

    div.innerHTML = `
      <input type="text" value="${rider.name}" onchange="window.renameRider('${rider.id}', this.value)" /><br>
      Balance: ${rider.balance}, Control: ${rider.control}, Empathy: ${rider.empathy}, Technique: ${rider.technique}<br>
      Experience: ${rider.experience}/1000<br>
      Assign to Horse:
      <select onchange="window.assignRiderToHorse('${rider.id}', this.value)">${horseOptions}</select>
    `;

    riderList.appendChild(div);
  });
}

// ✅ Rename rider
window.renameRider = function (riderId, newName) {
  const rider = currentUserData.riders.find(r => r.id === riderId);
  if (!rider) return;
  rider.name = newName;
  set(ref(db, `users/${currentUserId}`), currentUserData).then(() => showRider(currentUserData));
};

// ✅ Assign rider to horse
window.assignRiderToHorse = function (riderId, horseIndex) {
  currentUserData.horses.forEach(horse => {
    if (horse.assignedRiderId === riderId) horse.assignedRiderId = null;
  });

  if (horseIndex !== "") {
    currentUserData.horses[horseIndex].assignedRiderId = riderId;
  }

  set(ref(db, `users/${currentUserId}`), currentUserData)
    .then(() => {
      renderStables(currentUserData);
      showRider(currentUserData);
    });
};
// ✅ Craft a tack item
export function craftTack(type) {
  if (!currentUserData.tackSkills) {
    currentUserData.tackSkills = {
      bridle: { durability: 1, prestige: 0, progress: 0 },
      saddle: { durability: 1, prestige: 0, progress: 0 },
      horseBoots: { durability: 1, prestige: 0, progress: 0 },
      horseShoes: { durability: 1, prestige: 0, progress: 0 }
    };
  }

  const skill = currentUserData.tackSkills[type];
  const durability = skill.durability;
  const prestige = skill.prestige;

  const item = {
    type: type,
    durability: durability,
    level: prestige + 1
  };

  if (!currentUserData.tack) currentUserData.tack = [];
  currentUserData.tack.push(item);

  // Add progress
  const base = 5;
  const scaling = 0.5;
  const prestigePenalty = 1;
  const required = base + (durability * scaling) + (prestige * prestigePenalty);
  const luck = Math.random() * 0.4 + 0.8;
  const gain = (1 / required) * luck;
  skill.progress += gain;

  if (skill.progress >= 1) {
    skill.durability += 1;
    skill.progress -= 1;
  }

  set(ref(db, `users/${currentUserId}`), currentUserData).then(() => {
    showTack(currentUserData);
  });
}

// ✅ Sell a tack item (first found of its kind)
export function sellTackItem(key) {
  const grouped = {};
  currentUserData.tack.forEach((item, index) => {
    const k = item.type + '-' + item.durability + '-' + item.level;
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(index);
  });

  const toRemove = grouped[key]?.[0];
  if (toRemove != null) {
    const item = currentUserData.tack[toRemove];
    const value = 50 + (item.level * item.durability);
    currentUserData.coins += value;
    currentUserData.tack.splice(toRemove, 1);

    set(ref(db, `users/${currentUserId}`), currentUserData).then(() => {
      document.getElementById("coinCounter").textContent = `Coins: ${currentUserData.coins}`;
      showTack(currentUserData);
    });
  }
}

// ✅ Equip a tack item
export function equipTackItem(key, horseIndex) {
  const grouped = {};
  currentUserData.tack.forEach((item, index) => {
    const k = item.type + '-' + item.durability + '-' + item.level;
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(index);
  });

  const toEquipIndex = grouped[key]?.[0];
  if (toEquipIndex != null) {
    const item = currentUserData.tack[toEquipIndex];
    const horse = currentUserData.horses[horseIndex];

    if (!horse.tack) {
      horse.tack = { bridle: null, saddle: null, horseBoots: null, horseShoes: null };
    }

    if (horse.tack[item.type]) {
      return alert(`This horse already has a ${item.type} equipped.`);
    }

    horse.tack[item.type] = { ...item };
    currentUserData.tack.splice(toEquipIndex, 1);

    set(ref(db, `users/${currentUserId}`), currentUserData).then(() => {
      renderStables(currentUserData);
      showTack(currentUserData);
    });
  }
}
// Used in the UI
window.sellTackItem = sellTackItem;
window.equipTackItem = (key) => {
  const dropdown = document.getElementById('tackHorseSelect');
  if (!dropdown || dropdown.value === "") return alert("Select a horse first.");
  const horseIndex = parseInt(dropdown.value);
  equipTackItem(key, horseIndex);
};
// ✅ Enter a Show with the current horse
export function enterShow() {
  if (!currentUserData || currentHorseId == null) return;

  const horse = currentUserData.horses.find(h => h.id === currentHorseId);
  if (!horse) return;

  if (horse.age.years < 3) {
    alert("This horse is too young to compete.");
    return;
    // 🧠 Rider EXP Gain and Leveling
if (rider) {
  const expGain = Math.floor(10 + (11 - placement) * 2); // Same as horse
  rider.experience = (rider.experience || 0) + expGain;

  if (rider.experience >= 1000) {
    rider.experience = 0;
    // Random stat to boost
    const riderStats = ['balance', 'control', 'empathy', 'technique'];
    const statToBoost = riderStats[Math.floor(Math.random() * riderStats.length)];
    rider[statToBoost] = (rider[statToBoost] || 1) + 1;

    // Optional console log
    console.log(`${rider.name} gained a level in ${statToBoost}!`);
  }
}

  if (horse.gender === "Mare" && horse.isPregnant) {
    alert("This mare is pregnant and cannot enter shows.");
    return;
  }

  if (!horse.tack || !horse.tack.bridle || !horse.tack.saddle || !horse.tack.horseBoots || !horse.tack.horseShoes) {
    alert("This horse must be fully equipped with tack to compete.");
    return;
  }

  const rider = horse.riderId != null ? currentUserData.riders?.[horse.riderId] : null;
  const difficulty = horse.difficulty || 0;

  // Generate 19 NPCs
  const opponents = [];
  for (let i = 0; i < 19; i++) {
    const base = 200 + difficulty * 25;
    opponents.push({ score: Math.floor(Math.random() * base) });
  }

  // Player score
  let baseScore = horse.level * 10 + horse.exp;
  if (rider) {
    baseScore += (rider.balance || 0) + (rider.control || 0) + (rider.technique || 0) + (rider.empathy || 0);
  }
  const weather = Math.floor(Math.random() * 21) - 10;
  const mood = Math.floor(Math.random() * 21) - 10;
  const finalScore = baseScore + weather + mood;
  opponents.push({ score: finalScore, isPlayer: true });

  // Rank players
  opponents.sort((a, b) => b.score - a.score);
  const placement = opponents.findIndex(o => o.isPlayer) + 1;

  // Rewards
  let prize = 0;
  if (placement <= 10) {
    prize = Math.max(0, 100 - (placement - 1) * 10 + difficulty * 20);
    currentUserData.coins += prize;
    horse.exp += 10;

    // Level up horse
    const nextExp = horse.level * 100;
    if (horse.exp >= nextExp) {
      horse.level += 1;
      horse.exp = 0;
    }
  }

  // Rider EXP
  if (rider) {
    rider.experience = (rider.experience || 0) + 1;
    if (rider.experience >= 1000) {
      rider.experience = 0;
      const boost = ['balance', 'control', 'technique', 'empathy'][Math.floor(Math.random() * 4)];
      rider[boost] = (rider[boost] || 1) + 1;
    }
  }

  // Tack damage
  const brokenTack = [];
  for (const slot in horse.tack) {
    const tackItem = horse.tack[slot];
    if (tackItem) {
      tackItem.durability -= 1;
      if (tackItem.durability <= 0) {
        brokenTack.push(slot);
        horse.tack[slot] = null;
      }
    }
  }

  // Save and update UI
  set(ref(db, `users/${currentUserId}`), currentUserData).then(() => {
    renderStables(currentUserData);
    showProfile(currentUserData);
    document.getElementById("horseDetailInfo").innerHTML += `
      <p><strong>Show Result:</strong> Placed ${placement}, earned ${prize} coins</p>
      ${brokenTack.length ? `<p><strong>Broke:</strong> ${brokenTack.join(', ')}</p>` : ""}
    `;
  });
}
export function updateShowHorseSelect() {
  const select = document.getElementById('showHorseSelect');
  if (!select || !currentUserData) return;
  select.innerHTML = '';
  currentUserData.horses.forEach(horse => {
    const option = document.createElement('option');
    option.value = horse.id;
    option.textContent = horse.name || "Unnamed Horse";
    select.appendChild(option);
  });
}
// Breeding Dropdown Setup
export function renderBreedingDropdowns() {
  const mareSelect = document.getElementById("mareSelect");
  const stallionSelect = document.getElementById("stallionSelect");
  if (!mareSelect || !stallionSelect || !currentUserData?.horses) return;

  mareSelect.innerHTML = "";
  stallionSelect.innerHTML = "";

  currentUserData.horses.forEach((horse) => {
    if (horse.gender === "Mare" && horse.age.years >= 3 && !horse.isPregnant) {
      const option = document.createElement("option");
      option.value = horse.id;
      option.textContent = horse.name;
      mareSelect.appendChild(option);
    }

    if (horse.gender === "Stallion" && horse.age.years >= 3) {
      const option = document.createElement("option");
      option.value = horse.id;
      option.textContent = horse.name;
      stallionSelect.appendChild(option);
    }
  });
}

// Breed Horses
export async function breedHorses() {
  const mareId = document.getElementById("mareSelect").value;
  const stallionId = document.getElementById("stallionSelect").value;
  const resultDiv = document.getElementById("breedResult");

  if (!mareId || !stallionId || mareId === stallionId) {
    resultDiv.textContent = "Please select a valid mare and stallion.";
    return;
  }

  const mare = currentUserData.horses.find(h => h.id === mareId);
  const stallion = currentUserData.horses.find(h => h.id === stallionId);

  if (!mare || !stallion) {
    resultDiv.textContent = "Selected horses not found.";
    return;
  }

  mare.isPregnant = true;
  mare.pregnancyDays = 0;
  mare.lastBredTo = stallion.id;

  await set(ref(db, 'users/' + currentUserId), currentUserData);
  resultDiv.textContent = `${mare.name} has been bred to ${stallion.name} and is now pregnant.`;
}
function inheritGenePair(mareGenes, stallionGenes, gene) {
  const marePair = mareGenes[gene];
  const stallionPair = stallionGenes[gene];
  const inherited = [
    marePair[Math.floor(Math.random() * 2)],
    stallionPair[Math.floor(Math.random() * 2)],
  ];
  return inherited.sort().join('');
}

function generateFoalGenetics(mareGenes, stallionGenes) {
  const genes = [
    "B", "A", "W", "G", "CR", "D", "CH", "F", "Z",
    "RN", "RB", "ST", "TO", "O", "SP", "LP", "LK", "SB", "SN", "TG"
  ];
  const foalGenes = {};
  genes.forEach(gene => {
    foalGenes[gene] = inheritGenePair(mareGenes, stallionGenes, gene);
  });

  // Generate facial and leg markings based on simplified rules
  foalGenes.faceMarking = Math.random() < 0.5 ? "Blaze" : "Star";
  foalGenes.legMarkings = Math.random() < 0.5 ? "Sock" : "Coronet";

  return foalGenes;
}

function getFoalColorFromGenes(genes) {
  // You can expand this based on gene combinations
  if (genes.G.includes("G")) return "Gray";
  if (genes.W.includes("W")) return "White";
  if (genes.B === "EE" || genes.B === "Ee") {
    if (genes.A === "AA" || genes.A === "Aa") return "Bay";
    return "Black";
  }
  return "Chestnut";
}

function breedFoal(mare, stallion) {
  const foalGenes = generateFoalGenetics(mare.genes, stallion.genes);
  const foalColor = getFoalColorFromGenes(foalGenes);
  const gender = Math.random() < 0.5 ? "Mare" : "Stallion";

  return {
    id: generateHorseId(),
    name: "Unnamed Foal",
    breed: mare.breed, // Inherit breed from mare (you can customize)
    coatColor: foalColor,
    gender,
    level: 1,
    exp: 0,
    age: { years: 0, months: 0 },
    genes: foalGenes,
    parents: {
      sireId: stallion.id,
      damId: mare.id
    }
  };
}

export function checkForFoals() {
  const now = Date.now();

  currentUserData.horses.forEach(mare => {
    if (mare.gender === "Mare" && mare.isPregnant) {
      const msPassed = now - mare.pregnancyStart;
      const threeDays = 3 * 24 * 60 * 60 * 1000;

      if (msPassed >= threeDays) {
        const stallion = currentUserData.horses.find(h => h.id === mare.lastBredTo);
        const foal = createFoal(mare, stallion);
        currentUserData.horses.push(foal);

        mare.isPregnant = false;
        delete mare.pregnancyStart;
        delete mare.lastBredTo;

        console.log(`${mare.name} gave birth to ${foal.name}!`);
      }
    }
  });

  return set(ref(db, `users/${currentUserId}`), currentUserData);
}

  if (newFoals.length > 0) {
    const userRef = ref(db, `users/${currentUserId}`);
    set(userRef, currentUserData).then(() => {
      alert(`${newFoals.length} foal(s) were born!`);
      renderStables(currentUserData);
    });
  }
}
export function renderBreedingDropdowns() {
  const mareSelect = document.getElementById("mareSelect");
  const stallionSelect = document.getElementById("stallionSelect");
  if (!mareSelect || !stallionSelect || !currentUserData?.horses) return;

  mareSelect.innerHTML = "";
  stallionSelect.innerHTML = "";

  currentUserData.horses.forEach(horse => {
    const age = horse.age?.years || 0;
    const name = horse.name || "Unnamed horse";

    if (horse.gender === "Mare" && age >= 3 && !horse.isPregnant) {
      const option = document.createElement("option");
      option.value = horse.id;
      option.textContent = `${name} (${horse.breed})`;
      mareSelect.appendChild(option);
    }

    if (horse.gender === "Stallion" && age >= 3) {
      const option = document.createElement("option");
      option.value = horse.id;
      option.textContent = `${name} (${horse.breed})`;
      stallionSelect.appendChild(option);
    }
  });
}

  // Save to Firebase
  const userRef = ref(db, `users/${currentUserId}`);
  set(userRef, currentUserData).then(() => {
    resultBox.innerHTML = `<strong>${mare.name}</strong> has been bred to <strong>${stallion.name}</strong> and is now pregnant!`;
    renderStables(currentUserData);
    renderBreedingDropdowns();
  });
}
export async function checkForFoals() {
  let foalBorn = false;

  currentUserData.horses.forEach(mare => {
    if (mare.isPregnant && typeof mare.pregnancyDays === "number") {
      mare.pregnancyDays += 1;

      if (mare.pregnancyDays >= 3) {
        const stallion = currentUserData.horses.find(h => h.id === mare.lastBredTo);
        const foal = generateFoal(mare, stallion);

        currentUserData.horses.push(foal);
        mare.isPregnant = false;
        mare.pregnancyDays = 0;
        foalBorn = true;
      }
    }
  });

  if (foalBorn) {
    await set(ref(db, `users/${currentUserId}`), currentUserData);
    renderStables(currentUserData);
    renderBreedingDropdowns();
  }
}

// Genetics-based foal generator
function generateFoal(mare, stallion) {
  const gender = Math.random() < 0.5 ? "Mare" : "Stallion";
  const breed = mare.breed; // Assume foal inherits mare's breed
  const coatColor = Math.random() < 0.5 ? mare.coatColor : stallion.coatColor;

  const foal = {
    id: generateHorseId(),
    name: "Unnamed Foal",
    breed,
    coatColor,
    gender,
    level: 1,
    exp: 0,
    age: { years: 0, months: 0 },
    genes: {},
  };

  // Inherit each gene pair from mare and stallion
  const geneList = ["B", "A", "W", "G", "CR", "D", "CH", "F", "Z", "RN", "RB", "ST", "TO", "O", "SP", "LP", "LK", "SB", "SN", "TG"];
  geneList.forEach(gene => {
    const mareGenes = mare.genes?.[gene] || [gene, gene];
    const stallionGenes = stallion.genes?.[gene] || [gene, gene];
    const inherited = [
      mareGenes[Math.floor(Math.random() * mareGenes.length)],
      stallionGenes[Math.floor(Math.random() * stallionGenes.length)]
    ];
    foal.genes[gene] = inherited;
  });

  return foal;
}
export function renderBreedingDropdowns() {
  const mareSelect = document.getElementById("mareSelect");
  const stallionSelect = document.getElementById("stallionSelect");
  if (!mareSelect || !stallionSelect || !currentUserData) return;

  mareSelect.innerHTML = "";
  stallionSelect.innerHTML = "";

  currentUserData.horses.forEach(horse => {
    if (!horse.age || horse.age.years < 3) return;

    const option = document.createElement("option");
    option.value = horse.id;
    option.textContent = horse.name || "Unnamed";

    if (horse.gender === "Mare" && !horse.isPregnant) {
      mareSelect.appendChild(option);
    } else if (horse.gender === "Stallion") {
      stallionSelect.appendChild(option);
    }
  });
}

export async function breedHorses() {
  const mareId = document.getElementById("mareSelect")?.value;
  const stallionId = document.getElementById("stallionSelect")?.value;
  const resultDiv = document.getElementById("breedResult");
  resultDiv.textContent = "";

  if (!mareId || !stallionId) {
    resultDiv.textContent = "Please select both a mare and a stallion.";
    return;
  }

  const mare = currentUserData.horses.find(h => h.id === mareId);
  const stallion = currentUserData.horses.find(h => h.id === stallionId);

  if (!mare || !stallion) {
    resultDiv.textContent = "Selected horses not found.";
    return;
  }

  if (mare.gender !== "Mare" || stallion.gender !== "Stallion") {
    resultDiv.textContent = "Please select a mare and a stallion.";
    return;
  }

  if (mare.age.years < 3 || stallion.age.years < 3) {
    resultDiv.textContent = "Both horses must be at least 3 years old.";
    return;
  }

  mare.isPregnant = true;
  mare.pregnancyDays = 0;
  mare.lastBredTo = stallion.id;

  await set(ref(db, `users/${currentUserId}`), currentUserData);
  renderBreedingDropdowns();

  resultDiv.textContent = `${mare.name} has been bred to ${stallion.name} and is now pregnant.`;
}
// ⏳ Call this function once when the game loads to age horses and check pregnancies
export async function checkForFoals() {
  if (!currentUserData || !currentUserData.horses) return;

  const now = Date.now();
  const updatedHorses = currentUserData.horses.map(horse => {
    // Initialize timestamp tracking
    if (!horse.lastAgeUpdate) horse.lastAgeUpdate = now;

    // 1 real-world minute = 1 in-game hour
    const minutesPassed = Math.floor((now - horse.lastAgeUpdate) / (60 * 1000));
    const inGameDaysPassed = Math.floor(minutesPassed / 24);

    // 👶 Pregnancy logic
    if (horse.isPregnant) {
      horse.pregnancyDays = (horse.pregnancyDays || 0) + inGameDaysPassed;

      if (horse.pregnancyDays >= 3) {
        const stallion = currentUserData.horses.find(h => h.id === horse.lastBredTo);
        const foal = generateFoalWithGenetics(horse, stallion);
        foal.id = generateHorseId();
        currentUserData.horses.push(foal);

        horse.isPregnant = false;
        horse.pregnancyDays = 0;

        console.log(`${horse.name} gave birth to a foal!`);
      }
    }

    // 🐴 Age progression
    if (inGameDaysPassed >= 1) {
      horse.age = horse.age || { years: 3, months: 0 };
      horse.age.months += inGameDaysPassed;
      while (horse.age.months >= 12) {
        horse.age.years += 1;
        horse.age.months -= 12;
      }
      horse.lastAgeUpdate = now;
    }

    return horse;
  });

  currentUserData.horses = updatedHorses;

  // Save the updated data to Firebase
  await set(ref(db, `users/${currentUserId}`), currentUserData);

  // Refresh UI
  renderStables(currentUserData);
  renderBreedingDropdowns();
}

// Call this inside initializeGamePage AFTER loading user data
// Example: await checkForFoals();
// ⭐ Horse EXP Gain and Leveling
let expGained = 0;
if (placement <= 10) {
  expGained = 10 + (11 - placement) * 2; // 30 EXP for 1st place, 12 for 10th
}

horse.exp += expGained;
const nextLevelExp = getNextLevelExp(horse.level || 1);

if (horse.exp >= nextLevelExp) {
  horse.exp -= nextLevelExp;
  horse.level = (horse.level || 1) + 1;

  // Optional: notify player
  console.log(`${horse.name} leveled up to ${horse.level}!`);
}
// Expose functions to window for inline onclick in HTML
window.showTab = showTab;
window.logout = logout;
window.showHorseDetails = showHorseDetails;
window.buyHorse = buyHorse;
window.renameRider = renameRider;
window.assignRiderToHorse = assignRiderToHorse;
export function logout() {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
}
