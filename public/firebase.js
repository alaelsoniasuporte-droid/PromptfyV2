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

// Expõe no window para o index.html acessar
window.fbAuth            = auth;
window.fbDb              = db;
window.fbProvider        = provider;
window.fbSignInWithPopup = signInWithPopup;
window.fbSignOut         = signOut;
window.fbDoc             = doc;
window.fbGetDoc          = getDoc;
window.fbSetDoc          = setDoc;
window.fbUpdateDoc       = updateDoc;

// Conecta o botão Google diretamente aqui, sem depender do onclick do HTML
document.addEventListener("DOMContentLoaded", () => {
  const btnGoogle = document.querySelector(".btn-google");
  if (btnGoogle) {
    btnGoogle.onclick = async () => {
      try {
        const result = await signInWithPopup(auth, provider);
        await handleUsuario(result.user);
      } catch (e) {
        console.error("Erro login Google:", e.message);
        alert("Erro ao fazer login: " + e.message);
      }
    };
  }
});

// Verifica sessão ao carregar (usuário já logado anteriormente)
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await handleUsuario(user);
  } else {
    // Não logado — esconde o overlay e mostra tela de login
    const overlay = document.getElementById("loading-overlay");
    if(overlay){
      overlay.classList.add("hide");
      setTimeout(() => { overlay.style.display = "none"; }, 450);
    }
  }
});

// Função central que autentica e abre o app
async function handleUsuario(user) {
  const name = user.displayName || user.email;
  const firstName = name.split(" ")[0];

  // Salva/atualiza usuário no Firestore
  try {
    const ref = doc(db, "usuarios", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        nome: name,
        email: user.email,
        uid: user.uid,
        ativo: true,
        promptsUsados: 0,
        criado_em: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn("Firestore:", e.message);
  }

  // Atualiza UI
  const av = document.getElementById("av");
  const un = document.getElementById("uname");
  const wn = document.getElementById("welcome-name");
  const wm = document.getElementById("welcome-msg");
  const pl = document.getElementById("page-login");
  const pa = document.getElementById("page-app");

  if (av) av.textContent   = name.slice(0, 2).toUpperCase();
  if (un) un.textContent   = name;
  if (wn) wn.textContent   = firstName;
  if (wm) wm.style.display = "block";
  if (pl) pl.style.display = "none";
  if (pa) pa.style.display = "flex";

  // Renderiza histórico se função existir
  if (typeof renderHist === "function") renderHist();
}

// Logout exposto globalmente
window.doLogout = async () => {
  await signOut(auth);
  const pl = document.getElementById("page-login");
  const pa = document.getElementById("page-app");
  if (pa) pa.style.display = "none";
  if (pl) pl.style.display = "flex";
};
