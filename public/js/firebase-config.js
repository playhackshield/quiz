// === FIREBASE CONFIGURATIE ===
// VERVANG DEZE WAARDEN MET JE EIGEN FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCOLOtMA64eSOw0y515uma6fxEe6ps90qA",
  authDomain: "quizapp-school.firebaseapp.com",
  projectId: "quizapp-school",
  storageBucket: "quizapp-school.firebasestorage.app",
  messagingSenderId: "236956973",
  appId: "1:236956973:web:7455676e7b091f671ef7a4"
};

// === FIREBASE INITIALISATIE ===
// Controleer of Firebase al is geïnitialiseerd
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase geïnitialiseerd");
} else {
    console.log("Firebase was al geïnitialiseerd");
}

// === FIREBASE SERVICES ===
const db = firebase.firestore();
const auth = firebase.auth();

// === FIRESTORE COLLECTIES ===
const sessionsCollection = db.collection("sessions");
const studentsCollection = db.collection("students");
const answersCollection = db.collection("answers");

// === HELPER FUNCTIES ===
// Anonieme login voor alle gebruikers
function anonymousLogin() {
    return auth.signInAnonymously()
        .then(() => {
            console.log("Anoniem ingelogd als:", auth.currentUser.uid);
            return auth.currentUser;
        })
        .catch(error => {
            console.error("Fout bij aanmelden:", error);
            throw error;
        });
}

// Auto login bij laden van pagina
document.addEventListener('DOMContentLoaded', function() {
    // Alleen inloggen als we niet al ingelogd zijn
    if (auth.currentUser) {
        console.log("Al ingelogd als:", auth.currentUser.uid);
    } else {
        anonymousLogin().catch(console.error);
    }
});

// === FIRESTORE HELPERS ===
// Genereer een 4-cijferige code
function generateSessionCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Valideer vragen array
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

// === EXPORT VOOR BROWSER ===
// Maak variabelen beschikbaar in globale scope
window.firebase = firebase;
window.db = db;
window.auth = auth;
window.sessionsCollection = sessionsCollection;
window.studentsCollection = studentsCollection;
window.answersCollection = answersCollection;
window.generateSessionCode = generateSessionCode;
window.validateQuestions = validateQuestions;
