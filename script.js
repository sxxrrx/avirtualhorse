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

function generateHorseId() {
  return 'horse_' + Date.now();
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

function getGenesFromColor(color) {
  switch (color.toLowerCase()) {
    case "black": return { black: ["B", "B"], agouti: ["a", "a"] };
    case "bay": return { black: ["B", "b"], agouti: ["A", "a"] };
    case "dark bay": return { black: ["B", "b"], agouti: ["AT", "a"] };
    case "liver chestnut":
    case "chestnut": return { black: ["b", "b"], agouti: ["a", "a"] };
    case "grey": return { black: ["B", "b"], agouti: ["A", "a"], grey: ["G", "g"] };
    default: return { black: ["b", "b"], agouti: ["a", "a"] };
  }
}

function checkForFoals() {
  const user = JSON.parse(localStorage.getItem("activeUser"));
  if (!user || !user.horses) return;

  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  let foalsBorn = 0;

  user.horses.forEach(mare => {
    if (mare.gender === "Mare" && mare.pregnantSince && now - mare.pregnantSince >= THREE_DAYS) {
      const sire = user.horses.find(h => h.id === mare.sireId);
      if (!sire) return;

      const foal = {
        id: generateHorseId(),
        name: "Unnamed Foal",
        breed: mare.breed,
        coatColor: mare.coatColor,
        gender: Math.random() < 0.5 ? "Mare" : "Stallion",
        level: 1,
        exp: 0,
        age: { years: 0, months: 0 },
        parents: {
          dam: mare.name,
          sire: sire.name
        }
      };

      user.horses.push(foal);
      mare.pregnantSince = null;
      mare.sireId = null;
      foalsBorn++;
    }
  });

  if (foalsBorn > 0) {
    alert(`🎉 ${foalsBorn} new foal(s) have been born and added to your stable!`);
    localStorage.setItem("activeUser", JSON.stringify(user));
    renderStables(user);
  }
}

function prepareBreeding() {
  const user = JSON.parse(localStorage.getItem("activeUser"));
  const horseId = localStorage.getItem("selectedHorseId");
  const horse = user.horses.find(h => h.id === horseId);
  if (!horse) return alert("Horse not found.");

  if (horse.age.years < 3) return alert(`${horse.name} is too young to breed.`);
  if (horse.age.years >= 20) return alert(`${horse.name} is retired and cannot breed.`);
  if (horse.level < 2) return alert(`${horse.name} must be at least level 2 to breed.`);
  if (horse.gender === "Mare" && horse.pregnantSince) return alert(`${horse.name} is already pregnant.`);

  const eligible = user.horses.filter(h =>
    h.id !== horse.id &&
    ((horse.gender === "Mare" && h.gender === "Stallion") || (horse.gender === "Stallion" && h.gender === "Mare")) &&
    h.age.years >= 3 && h.age.years < 20 && h.level >= 2 &&
    (h.gender !== "Mare" || !h.pregnantSince)
  );

  if (eligible.length === 0) return alert("No eligible breeding partners found.");

  const partnerList = eligible.map(h => `${h.name} (${h.breed}, ${h.coatColor})`).join("\n");
  const choice = prompt("Choose a partner:\n" + partnerList);
  if (!choice) return;

  const partner = eligible.find(h => `${h.name} (${h.breed}, ${h.coatColor})` === choice);
  if (!partner) return alert("Invalid choice.");
const eligible = user.horses.filter(h => ...);
  let mare, stallion;
  if (horse.gender === "Mare") {
    mare = horse;
    stallion = partner;
  } else {
    mare = partner;
    stallion = horse;
  }

  mare.pregnantSince = Date.now();
  mare.sireId = stallion.id;

  alert(`${mare.name} is now pregnant by ${stallion.name}. The foal will be born in 3 real-life days.`);
  localStorage.setItem("activeUser", JSON.stringify(user));
  renderStables(user);
  showHorseDetails(mare.id);

  const eligible = user.horses.filter(h =>
    h.id !== horse.id &&
    h.gender !== horse.gender &&
    h.age.years >= 3 &&
    h.age.years < 20 &&
    h.level >= 2 &&
    (!isMare || !h.pregnantSince)
  );

  if (eligible.length === 0) {
    alert("No eligible breeding partners.");
    return;
  }


  if (eligible.length === 0) {
    alert("No eligible breeding partners.");
    return;
  }

  // Create dropdown
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = 0;
  modal.style.left = 0;
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "rgba(0,0,0,0.6)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = 9999;

  const dropdownBox = document.createElement("div");
  dropdownBox.style.background = "white";
  dropdownBox.style.padding = "20px";
  dropdownBox.style.borderRadius = "10px";
  dropdownBox.innerHTML = `
    <label for="partnerSelect">Select a breeding partner:</label><br><br>
    <select id="partnerSelect">
      ${eligible.map(h => `<option value="${h.id}">${h.name} (${h.breed}, ${h.coatColor}, Age ${h.age.years})</option>`).join("")}
    </select><br><br>
    <button onclick="confirmBreeding('${horseId}')">Confirm</button>
    <button onclick="document.body.removeChild(document.getElementById('breedingModal'))">Cancel</button>
  `;

  modal.id = "breedingModal";
  modal.appendChild(dropdownBox);
  document.body.appendChild(modal);
}

function confirmBreeding(horseId) {
  const user = JSON.parse(localStorage.getItem("activeUser"));
  const horse = user.horses.find(h => h.id === horseId);
  const partnerId = document.getElementById("partnerSelect").value;
  const partner = user.horses.find(h => h.id === partnerId);

  let mare, stallion;
  if (horse.gender === "Mare") {
    mare = horse;
    stallion = partner;
  } else {
    mare = partner;
    stallion = horse;
  }

  mare.pregnantSince = Date.now();
  mare.sireId = stallion.id;

  localStorage.setItem("activeUser", JSON.stringify(user));
  alert(`${mare.name} is now pregnant by ${stallion.name}.`);

  // Remove modal
  const modal = document.getElementById("breedingModal");
  if (modal) document.body.removeChild(modal);

  showHorseDetails(mare.id);
}
function checkForFoals() {
  const user = JSON.parse(localStorage.getItem("activeUser"));
  if (!user || !user.horses) return;

  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  let foalsBorn = 0;

  user.horses.forEach(mare => {
    if (mare.gender === "Mare" && mare.pregnantSince && now - mare.pregnantSince >= THREE_DAYS) {
      const sire = user.horses.find(h => h.id === mare.sireId);
      if (!sire) return;

      const foal = {
        id: "horse_" + Date.now(),
        name: "Unnamed Foal",
        breed: mare.breed,
        coatColor: mare.coatColor,
        gender: Math.random() < 0.5 ? "Mare" : "Stallion",
        level: 1,
        exp: 0,
        age: { years: 0, months: 0 },
        parents: {
          dam: mare.name,
          sire: sire.name
        }
      };

      user.horses.push(foal);
      mare.pregnantSince = null;
      mare.sireId = null;
      foalsBorn++;
    }
  });

  if (foalsBorn > 0) {
    alert(`🎉 ${foalsBorn} new foal(s) have been born and added to your stable!`);
    localStorage.setItem("activeUser", JSON.stringify(user));
    renderStables(user);
  }
}

function updateShowTab(horseName, placement) {
  const showEntries = document.getElementById("showEntries");
  const resultDiv = document.createElement("div");
  resultDiv.innerHTML = `<p><strong>${horseName}</strong> placed <strong>${placement}</strong> in the latest show.</p>`;
  showEntries.prepend(resultDiv);
}
