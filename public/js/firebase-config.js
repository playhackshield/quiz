// === FIREBASE CONFIGURATIE ===
// VERVANG DEZE WAARDEN MET JE EIGEN FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCO2ndD-lTBZpRrs-ZxIsBTVjPVza2sFXU",
  authDomain: "schoolquizapp-28abf.firebaseapp.com",
  projectId: "schoolquizapp-28abf",
  storageBucket: "schoolquizapp-28abf.firebasestorage.app",
  messagingSenderId: "921022621334",
  appId: "1:921022621334:web:ef582f1e067a77a41284b7"
};

console.log("Firebase Config geladen:", firebaseConfig.projectId);

// ==================== FIREBASE INITIALISATIE ====================
try {
  // Check of Firebase al bestaat
  if (typeof firebase === 'undefined') {
    throw new Error("Firebase SDK niet geladen. Controleer of de script tags werken.");
  }
  
  // Check of Firebase al is geïnitialiseerd
  if (!firebase.apps.length) {
    console.log("Firebase initialiseren...");
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase succesvol geïnitialiseerd!");
  } else {
    console.log("✅ Firebase was al geïnitialiseerd");
    firebase.app(); // Gebruik bestaande app
  }
} catch (error) {
  console.error("❌ Fout bij Firebase initialisatie:", error);
  alert("Firebase configuratie fout: " + error.message);
}

// ==================== FIREBASE SERVICES ====================
let db, auth;

try {
  db = firebase.firestore();
  auth = firebase.auth();
  console.log("✅ Firebase services geladen");
} catch (error) {
  console.error("❌ Fout bij laden Firebase services:", error);
  alert("Firebase services fout: " + error.message);
}

// ==================== FIRESTORE COLLECTIES ====================
const sessionsCollection = db ? db.collection("sessions") : null;
const studentsCollection = db ? db.collection("students") : null;
const answersCollection = db ? db.collection("answers") : null;

// ==================== HELPER FUNCTIES ====================
async function anonymousLogin() {
  if (!auth) {
    throw new Error("Firebase Auth niet beschikbaar");
  }
  
  try {
    // Check of al ingelogd
    if (auth.currentUser) {
      console.log("Al ingelogd als:", auth.currentUser.uid);
      return auth.currentUser;
    }
    
    // Anonieme login
    console.log("Anonieme login starten...");
    const userCredential = await auth.signInAnonymously();
    console.log("✅ Anoniem ingelogd als:", userCredential.user.uid);
    return userCredential.user;
    
  } catch (error) {
    console.error("❌ Fout bij anonieme login:", error);
    
    // Toon specifieke foutmelding
    let errorMessage = "Login fout: ";
    switch (error.code) {
      case 'auth/configuration-not-found':
        errorMessage += "Firebase configuratie incorrect. Controleer firebase-config.js";
        break;
      case 'auth/invalid-api-key':
        errorMessage += "Ongeldige API key. Haal nieuwe config uit Firebase Console";
        break;
      default:
        errorMessage += error.message;
    }
    
    throw new Error(errorMessage);
  }
}

function generateSessionCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function validateQuestions(questions) {
  if (!Array.isArray(questions)) {
    throw new Error("Vragen moeten een array zijn");
  }
  
  return questions.map((q, index) => ({
    nr: index + 1,
    type: q.type || 'open',
    vraag: q.vraag || `Vraag ${index + 1}`,
    opties: q.opties || [],
    correct: q.correct || 0
  }));
}

// ==================== AUTO LOGIN ====================
// Wacht tot de DOM geladen is, dan login
document.addEventListener('DOMContentLoaded', async function() {
  console.log("DOM geladen, Firebase initialiseren...");
  
  try {
    // Wacht 1 seconde zodat Firebase SDK kan laden
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Probeer in te loggen
    await anonymousLogin();
    console.log("✅ Ready voor gebruik!");
    
  } catch (error) {
    console.error("❌ Kritieke fout bij startup:", error);
    
    // Toon gebruikersvriendelijke fout
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #dc2626;
      color: white;
      padding: 20px;
      text-align: center;
      z-index: 9999;
      font-family: sans-serif;
    `;
    errorDiv.innerHTML = `
      <strong>Firebase Configuratie Fout</strong><br>
      ${error.message}<br>
      <small>Controleer firebase-config.js en vernieuw de pagina</small>
    `;
    document.body.appendChild(errorDiv);
  }
});

// ==================== EXPORT ====================
// Maak beschikbaar voor andere scripts
window.firebase = firebase;
window.db = db;
window.auth = auth;
window.sessionsCollection = sessionsCollection;
window.studentsCollection = studentsCollection;
window.answersCollection = answersCollection;
window.generateSessionCode = generateSessionCode;
window.validateQuestions = validateQuestions;
window.anonymousLogin = anonymousLogin;

console.log("Firebase config module geladen");
