function loginUser() {
  const loginName = document.getElementById("loginName").value.trim();
  const password = document.getElementById("password").value;

  const allUsers = JSON.parse(localStorage.getItem("users")) || {};
  const user = allUsers[loginName];

  if (!user || user.password !== password) {
    return alert("Invalid login name or password.");
  }

  localStorage.setItem("activeUser", JSON.stringify(user));
  window.location.href = "game.html";
}

function generateUserId() {
  return 'user_' + Math.floor(Math.random() * 1000000000);
}

function generateHorseId() {
  return 'horse_' + Date.now();
}
function showProfile(user) {
  document.getElementById("profileUsername").textContent = user.username || "Unknown";
  document.getElementById("profileLevel").textContent = user.level || 1;
  document.getElementById("profileJob").textContent = user.job || "None";
  document.getElementById("profileHorseCount").textContent = user.horses?.length || 0;
  document.getElementById("profileJoinDate").textContent = user.joinDate || "Unknown";

  const level = user.level || 1;
  const exp = user.exp || 0;
  const nextLevelExp = level === 1 ? 100 : level === 2 ? 200 : level === 3 ? 400 : 600;
  const expPercent = Math.min((exp / nextLevelExp) * 100, 100);

  document.getElementById("profileExp").textContent = `${exp} / ${nextLevelExp}`;
  document.getElementById("profileExpBar").style.width = `${expPercent}%`;
}

function generateRandomHorse() {
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
function renderStables(user) {
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

function generateHorsesForSale() {
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

function getSalesHorses() {
  const saved = JSON.parse(localStorage.getItem("salesHorses"));
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  if (!saved || now - saved.timestamp > THIRTY_MINUTES) {
    return generateHorsesForSale();
  }
  return saved.horses;
}

function renderSalesHorses(user) {
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

function buyHorse(horseId) {
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
  localStorage.setItem("activeUser", JSON.stringify(user));
  renderSalesHorses(user);
  renderStables(user);
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
  alert(`${horse.name} has been added to your stable!`);
}

// JOB SYSTEM
function setupJobs(user) {
  const jobInfo = document.getElementById("jobInfo");
  const jobActions = document.getElementById("jobActions");
  const level = user.level || 1;

  if (!user.job || user.job === "None") {
    user.job = "Stablehand";
    localStorage.setItem("activeUser", JSON.stringify(user));
  }

  jobInfo.innerHTML = `<p><strong>Current Job:</strong> ${user.job}</p><p><strong>Level:</strong> ${level}</p>`;

  if (user.job === "Stablehand") {
    jobActions.innerHTML = `
      <p>Choose a task:</p>
      <button onclick="performStableTask('Feeding')">Feeding</button>
      <button onclick="performStableTask('Treating')">Treating</button>
      <button onclick="performStableTask('Grooming')">Grooming</button>
    `;
  } else if (user.job === "Vet Assistant" && level >= 20) {
    jobActions.innerHTML = `
      <p>You're a Vet Assistant. Choose a task:</p>
      <button onclick="performVetTask('Shots')">Shots</button>
      <button onclick="performVetTask('Breeding Checks')">Breeding Checks</button>
      <button onclick="performVetTask('Vet Checks')">Vet Checks</button>
    `;
  } else {
    jobActions.innerHTML = `<p>You must be level 20 to work as a Vet Assistant.</p>`;
  }

  jobActions.innerHTML += `<br><br><button onclick="hireRider()">Hire Rider (10,000 coins)</button>`;
}

function performStableTask(task) {
  let user = JSON.parse(localStorage.getItem("activeUser"));
  const pay = 35 * (user.horses.length || 1);
  user.coins += pay;
  localStorage.setItem("activeUser", JSON.stringify(user));
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
  alert(`You completed ${task} and earned ${pay} coins!`);
}

function performVetTask(task) {
  let user = JSON.parse(localStorage.getItem("activeUser"));
  const pay = 75 * (user.horses.length || 1);
  user.coins += pay;
  localStorage.setItem("activeUser", JSON.stringify(user));
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
  alert(`You completed ${task} and earned ${pay} coins!`);
}

// TACK CRAFTING
function craftTack(type) {
  let user = JSON.parse(localStorage.getItem("activeUser"));
  if (!user.tack) user.tack = [];

  const newTack = { type, level: 1 };
  user.tack.push(newTack);

  localStorage.setItem("activeUser", JSON.stringify(user));
  alert(`${type} crafted and added to your tack room!`);
  showTack(user);
}

function showTack(user) {
  const tackRoom = document.getElementById("tackContent");
  if (!user.tack || user.tack.length === 0) {
    tackRoom.innerHTML = "<p>No tack crafted yet.</p>";
    return;
  }

  tackRoom.innerHTML = "";
  user.tack.forEach((item, index) => {
    const value = item.level === 1 ? 25 : item.level === 2 ? 75 : item.level === 3 ? 125 : 225;
    tackRoom.innerHTML += `
      <p>${item.type} (Level ${item.level}) 
      <button onclick="sellTack(${index}, ${value})">Sell for ${value} coins</button></p>
    `;
  });
}

function sellTack(index, value) {
  let user = JSON.parse(localStorage.getItem("activeUser"));
  user.tack.splice(index, 1);
  user.coins += value;
  localStorage.setItem("activeUser", JSON.stringify(user));
  document.getElementById("coinCounter").textContent = `Coins: ${user.coins}`;
  showTack(user);
}

// RIDERS
function hireRider() {
  let user = JSON.parse(localStorage.getItem("activeUser"));
  if (user.coins < 10000) {
    alert("You don't have enough coins to hire a rider.");
    return;
  }
  user.coins -= 10000;
  user.rider = { name: "Unnamed Rider", level: 1, exp: 0, assignedHorseId: null };
  localStorage.setItem("activeUser", JSON.stringify(user));
  alert("Rider hired! Go to the Clubhouse to assign them.");
  showRider(user);
}

function showRider(user) {
  const riderSection = document.getElementById("riderInfo");
  if (!user.rider) {
    riderSection.innerHTML = "<p>No rider hired yet.</p>";
    return;
  }

  const { name, level, exp, assignedHorseId } = user.rider;
  const expNeeded = level === 1 ? 50 : level === 2 ? 150 : 300;
  const expPercent = Math.min((exp / expNeeded) * 100, 100);

  let horseOptions = '<option value="">None</option>';
  user.horses.forEach(horse => {
    horseOptions += `<option value="${horse.id}" ${horse.id === assignedHorseId ? 'selected' : ''}>${horse.name}</option>`;
  });

  riderSection.innerHTML = `
    <label>Name your rider: 
      <input type="text" value="${name}" onchange="updateRiderName(this.value)">
    </label><br><br>
    <p>Level: ${level}</p>
    <p>EXP: ${exp} / ${expNeeded}</p>
    <div style="width: 100%; background: #ccc; height: 20px; border-radius: 5px;">
      <div style="width: ${expPercent}%; background: #4caf50; height: 100%;"></div>
    </div><br>
    <label>Assign to Horse:
      <select id="riderHorseSelect">${horseOptions}</select>
    </label>
    <button onclick="confirmAssignRider()">Confirm Assignment</button>
  `;
}

function updateRiderName(newName) {
  let user = JSON.parse(localStorage.getItem("activeUser"));
  user.rider.name = newName;
  localStorage.setItem("activeUser", JSON.stringify(user));
}

function confirmAssignRider() {
  let user = JSON.parse(localStorage.getItem("activeUser"));
  const horseId = document.getElementById("riderHorseSelect").value;
  user.rider.assignedHorseId = horseId;
  localStorage.setItem("activeUser", JSON.stringify(user));
  alert("Rider assigned to horse.");
}
function enterShow() {
  const user = JSON.parse(localStorage.getItem("activeUser"));
  const horseId = localStorage.getItem("selectedHorseId");
  const horse = user.horses.find(h => h.id === horseId);
  if (!horse) return alert("Horse not found.");

  // Make sure level and exp are initialized
  horse.level = horse.level || 1;
  horse.exp = horse.exp || 0;
  user.exp = user.exp || 0;

  // Simulate 20 horses
  const competitors = Array.from({ length: 19 }, (_, i) => ({
    name: `Horse ${i + 1}`,
    level: horse.level,
    speed: Math.floor(Math.random() * 100),
    id: `npc_${i + 1}`
  }));

  competitors.push({
    name: horse.name + " (You)",
    level: horse.level,
    speed: Math.floor(Math.random() * 100) + 10,
    id: horse.id
  });

  competitors.sort((a, b) => b.speed - a.speed);
  const placement = competitors.findIndex(h => h.id === horse.id) + 1;

  // Rewards
  let coins = 0;
  let exp = 0;
  if (placement === 1) {
    coins = 500;
    exp = 150;
  } else if (placement === 2) {
    coins = 250;
    exp = 75;
  } else if (placement === 3) {
    coins = 100;
    exp = 50;
  } else if (placement === 4) {
    coins = 50;
    exp = 25;
  } else {
    coins = 25;
    exp = 10;
  }

  // Apply rewards
  user.coins += coins;
  user.exp += exp;
  horse.exp += exp;

  // Level-up thresholds
  const thresholds = { 1: 100, 2: 250, 3: 500 };
  while (thresholds[horse.level] && horse.exp >= thresholds[horse.level]) {
    horse.exp -= thresholds[horse.level];
    horse.level++;
    alert(`${horse.name} has leveled up to Level ${horse.level}!`);
  }

  localStorage.setItem("activeUser", JSON.stringify(user));
  alert(`${horse.name} placed ${placement}th!\nYou earned ${coins} coins and ${exp} EXP.`);

  showTab("shows");
  updateShowTab(horse.name, placement);
}
function submitForm() {
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

  const horse = {
    id: "horse_" + Date.now(),
    name: horseName,
    breed,
    coatColor,
    gender: sex,
    level: 1,
    exp: 0,
    age: { years: 3, months: 0 }
  };

  const newUser = {
    id: "user_" + Math.floor(Math.random() * 1000000000),
    loginName,
    username,
    email,
    password,
    coins: 5000,
    level: 1,
    exp: 0,
    horses: [horse],
    job: "Stablehand",
    joinDate: new Date().toLocaleDateString()
  };

  const allUsers = JSON.parse(localStorage.getItem("users")) || {};
  allUsers[loginName] = newUser;
  localStorage.setItem("users", JSON.stringify(allUsers));
  localStorage.setItem("lastSignedUpUser", JSON.stringify(newUser));

  window.location.href = "account-summary.html";
}
