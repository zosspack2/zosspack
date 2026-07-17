import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCiE6-JkJXP-WdKwU4MNKSR32bs969_Kx8",
  authDomain: "zoss-2b081.firebaseapp.com",
  projectId: "zoss-2b081",
  messagingSenderId: "958573670898",
  appId: "1:958573670898:web:ebd11dcb3eb14c12e73b6b",
  measurementId: "G-9L3550J3MQ"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
