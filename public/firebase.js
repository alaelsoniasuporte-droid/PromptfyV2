import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8tX4TLqF149IWkBv4iiuigysMDUmyc4E",
  authDomain: "promptfy-6342c.firebaseapp.com",
  projectId: "promptfy-6342c",
  storageBucket: "promptfy-6342c.firebasestorage.app",
  messagingSenderId: "699700457212",
  appId: "1:699700457212:web:6fe921f7754fcc39133179"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

// Expõe tudo no window para o index.html acessar
window.fbAuth             = auth;
window.fbDb               = db;
window.fbProvider         = provider;
window.fbSignInWithPopup  = signInWithPopup;
window.fbSignOut          = signOut;
window.fbDoc              = doc;
window.fbGetDoc           = getDoc;
window.fbSetDoc           = setDoc;
window.fbUpdateDoc        = updateDoc;

// Verifica sessão ao carregar a página
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Usuário já estava logado — chama handleUser do index.html
    if (typeof handleUser === "function") {
      await handleUser(user);
    }
  }
});
