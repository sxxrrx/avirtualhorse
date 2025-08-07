// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase }    from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",        // ← add this if you haven’t yet
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

export { auth, db };
