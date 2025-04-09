// script.js - now an ES module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Save user data to Firebase
export function saveUserToFirebase(userId, userData) {
  const dbRef = ref(db, 'users/' + userId);
  return set(dbRef, userData);
}

// Login function using Firebase Auth
export function loginUser() {
  const loginName = document.getElementById("loginName").value.trim();
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, loginName, password)
    .then(async (userCredential) => {
      const uid = userCredential.user.uid;
      const userRef = ref(db, 'users/' + uid);
      const snapshot = await get(userRef);
      if (snapshot.exists()) {
        localStorage.setItem("activeUser", JSON.stringify(snapshot.val()));
        window.location.href = "game.html";
      } else {
        alert("No user data found.");
      }
    })
    .catch((error) => {
      alert("Login failed: " + error.message);
    });
}

// Sign-up function using Firebase Auth
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
