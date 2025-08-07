// firebase-init.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getAuth }        from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getDatabase }    from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyCkFOc0BwRqmR2LkjHj0vwXSAS1h4BlBCE",
  authDomain: "horse-game-by-sxxrrx.firebaseapp.com",
  databaseURL: "https://horse-game-by-sxxrrx-default-rtdb.firebaseio.com",
  projectId: "horse-game-by-sxxrrx",
  storageBucket: "horse-game-by-sxxrrx.appspot.com",
  messagingSenderId: "87883054918",
  appId: "1:87883054918:web:4771a90eb5c6a3e7c0ef47"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

export { auth, db };
