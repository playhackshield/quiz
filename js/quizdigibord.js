// js/server.js
const db = firebase.firestore();

// Houd de huidige geladen vragen en index bij
let huidigeVragen = [];
let huidigeVraagIndex = 0;

document.addEventListener("DOMContentLoaded", () => {
  // 1. Vul de dropdown met vragenlijsten bij het laden van de pagina
  laadVragenlijstenInDropdown();

  // 2. Event Listeners voor de knoppen
  document.getElementById("btn-laad-vragen").addEventListener("click", laadGeselecteerdeVragenlijst);
  document.getElementById("btn-volgende").addEventListener("click", volgendeVraag);
  document.getElementById("btn-vorige").addEventListener("click", vorigeVraag);
  document.getElementById("btn-reset-score").addEventListener("click", resetScores);

  // 3. Luister live naar scores
  luisterNaarScores();
});

// --- 1. VRAGENLIJSTEN IN DROPDOWN LADEN ---
function laadVragenlijstenInDropdown() {
  const dropdown = document.getElementById("vragenlijst-select");
  dropdown.innerHTML = '<option value="">-- Kies een vragenlijst --</option>';

  // OPTIE A: Haal vragenlijsten op uit Firestore
  db.collection("vragenlijsten").get().then((snapshot) => {
    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        const option = document.createElement("option");
        option.value = doc.id; // Document ID of JSON pad
        option.textContent = doc.data().titel || doc.id;
        dropdown.appendChild(option);
      });
    } else {
      // OPTIE B: Fallback als je vaste JSON-bestanden gebruikt
      laadStandaardJsonOpties(dropdown);
    }
  }).catch((error) => {
    console.log("Firestore verzameling niet gevonden, we proberen JSON-bestanden:", error);
    laadStandaardJsonOpties(dropdown);
  });
}

// Fallback functie voor lokale JSON bestanden (bijv. in een map /vragen/)
function laadStandaardJsonOpties(dropdown) {
  const bekendeLijsten = [
    { id: "vragen/algemeen.json", naam: "Algemene Kennis" },
    { id: "vragen/rekentest.json", naam: "Rekenen" },
    { id: "vragen/taal.json", naam: "Taal & Spelling" }
  ];

  bekendeLijsten.forEach(lijst => {
    const option = document.createElement("option");
    option.value = lijst.id;
    option.textContent = lijst.naam;
    dropdown.appendChild(option);
  });
}

// --- 2. GESELECTEERDE VRAGENLIJST INLADEN ---
function laadGeselecteerdeVragenlijst() {
  const dropdown = document.getElementById("vragenlijst-select");
  const geselecteerdeId = dropdown.value;

  if (!geselecteerdeId) {
    alert("Selecteer eerst een vragenlijst uit de lijst!");
    return;
  }

  // Als het een JSON-bestand is
  if (geselecteerdeId.endsWith(".json")) {
    fetch(geselecteerdeId)
      .then(res => res.json())
      .then(data => {
        huidigeVragen = data.vragen || data;
        huidigeVraagIndex = 0;
        toonVraag(huidigeVraagIndex);
      })
      .catch(err => alert("Fout bij laden van JSON bestand: " + err));
  } else {
    // Als het uit Firestore komt
    db.collection("vragenlijsten").doc(geselecteerdeId).get().then((doc) => {
      if (doc.exists) {
        huidigeVragen = doc.data().vragen || [];
        huidigeVraagIndex = 0;
        toonVraag(huidigeVraagIndex);
      }
    });
  }
}

// --- 3. VRAAG TONEN & SYNCHRONISEREN NAAR FIRESTORE ---
function toonVraag(index) {
  if (!huidigeVragen || huidigeVragen.length === 0) return;

  const vraagData = huidigeVragen[index];

  // Update de Digibord HTML
  document.getElementById("vraag-nummer-label").innerText = `Vraag ${index + 1} van ${huidigeVragen.length}`;
  document.getElementById("vraag-tekst").innerText = vraagData.vraag;
  
  document.getElementById("tekst-a").innerText = vraagData.opties?.A || vraagData.antwoordA || "-";
  document.getElementById("tekst-b").innerText = vraagData.opties?.B || vraagData.antwoordB || "-";
  document.getElementById("tekst-c").innerText = vraagData.opties?.C || vraagData.antwoordC || "-";
  document.getElementById("tekst-d").innerText = vraagData.opties?.D || vraagData.antwoordD || "-";

  // Synchroniseer naar Firestore actieveVraag zodat Chromebooks het direct zien
  db.collection("quiz").doc("actieveVraag").set({
    vraag: vraagData.vraag,
    opties: {
      A: vraagData.opties?.A || vraagData.antwoordA || "",
      B: vraagData.opties?.B || vraagData.antwoordB || "",
      C: vraagData.opties?.C || vraagData.antwoordC || "",
      D: vraagData.opties?.D || vraagData.antwoordD || ""
    },
    juisteAntwoord: vraagData.juisteAntwoord || vraagData.correct || "",
    index: index
  });
}

function volgendeVraag() {
  if (huidigeVraagIndex < huidigeVragen.length - 1) {
    huidigeVraagIndex++;
    toonVraag(huidigeVraagIndex);
  }
}

function vorigeVraag() {
  if (huidigeVraagIndex > 0) {
    huidigeVraagIndex--;
    toonVraag(huidigeVraagIndex);
  }
}

// --- 4. SCORES RESETTEN & LUISTEREN ---
function resetScores() {
  if (confirm("Weet je zeker dat je de scores van beide teams wilt resetten naar 0?")) {
    db.collection("quiz").doc("scores").set({
      teamA: 0,
      teamB: 0
    });
  }
}

function luisterNaarScores() {
  db.collection("quiz").doc("scores").onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      document.getElementById("score-team-a").innerText = data.teamA || 0;
      document.getElementById("score-team-b").innerText = data.teamB || 0;
    }
  });
}
