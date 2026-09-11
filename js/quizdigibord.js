// Gebruik de bestaande db instance, of maak hem aan als hij nog niet bestaat
var db = window.db || firebase.firestore();

let huidigeVragen = [];
let huidigeVraagIndex = 0;

// Lijst van jouw bestanden in de map "vragenlijsten"
const vragenLijsten = [
  { bestand: "vragenlijsten/vragen0.json", naam: "Vragenlijst 0" },
  { bestand: "vragenlijsten/vragen1.json", naam: "Vragenlijst 1" },
  { bestand: "vragenlijsten/vragen2.json", naam: "Vragenlijst 2" },
  { bestand: "vragenlijsten/vragen3.json", naam: "Vragenlijst 3" },
  { bestand: "vragenlijsten/vragen4.json", naam: "Vragenlijst 4" },
  { bestand: "vragenlijsten/vragen5.json", naam: "Vragenlijst 5" },
  { bestand: "vragenlijsten/vragen6.json", naam: "Vragenlijst 6" },
  { bestand: "vragenlijsten/vragen7.json", naam: "Vragenlijst 7" },
  { bestand: "vragenlijsten/vragen8.json", naam: "Vragenlijst 8" },
  { bestand: "vragenlijsten/vragen9.json", naam: "Vragenlijst 9" }
];

document.addEventListener("DOMContentLoaded", () => {
  // 1. Vul de dropdown direct met de bestanden uit de map "vragenlijsten"
  vulDropdown();

  // 2. Koppel de knoppen
  document.getElementById("btn-laad-vragen").addEventListener("click", laadVragenlijst);
  document.getElementById("btn-volgende").addEventListener("click", volgendeVraag);
  document.getElementById("btn-vorige").addEventListener("click", vorigeVraag);
  document.getElementById("btn-reset-score").addEventListener("click", resetScores);

  // 3. Luister naar live scores uit Firestore
  luisterNaarScores();
});

// Vul de dropdown met de opties vragen0.json t/m vragen9.json
function vulDropdown() {
  const dropdown = document.getElementById("vragenlijst-select");
  dropdown.innerHTML = '<option value="">-- Kies een vragenlijst --</option>';

  vragenLijsten.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.bestand;
    option.textContent = item.naam;
    dropdown.appendChild(option);
  });
}

// Lees het geselecteerde JSON bestand in uit de map "vragenlijsten"
function laadVragenlijst() {
  const dropdown = document.getElementById("vragenlijst-select");
  const gekozenBestand = dropdown.value;

  if (!gekozenBestand) {
    alert("Selecteer eerst een vragenlijst!");
    return;
  }

  fetch(gekozenBestand)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Kon bestand niet vinden: " + gekozenBestand);
      }
      return response.json();
    })
    .then((data) => {
      // Zowel array [...] als object { vragen: [...] } ondersteunen
      huidigeVragen = Array.isArray(data) ? data : (data.vragen || []);
      
      if (huidigeVragen.length === 0) {
        alert("Geen vragen gevonden in dit bestand.");
        return;
      }

      huidigeVraagIndex = 0;
      toonVraag(huidigeVraagIndex);
    })
    .catch((error) => {
      console.error("Fout bij laden JSON:", error);
      alert("Kan " + gekozenBestand + " niet laden. Controleer of het bestand in de map 'vragenlijsten' staat.");
    });
}

// Toon de huidige vraag op het Digibord & stuur naar Firestore voor de Chromebooks
function toonVraag(index) {
  if (!huidigeVragen || huidigeVragen.length === 0) return;

  const v = huidigeVragen[index];

  // Update de teksten op server.html
  document.getElementById("vraag-nummer-label").innerText = `Vraag ${index + 1} van ${huidigeVragen.length}`;
  document.getElementById("vraag-tekst").innerText = v.vraag || v.question || "";

  // Ondersteun verschillende JSON formats (opties.A of antwoordA of opties[0])
  const optieA = v.opties?.A || v.antwoordA || (v.opties ? v.opties[0] : "-");
  const optieB = v.opties?.B || v.antwoordB || (v.opties ? v.opties[1] : "-");
  const optieC = v.opties?.C || v.antwoordC || (v.opties ? v.opties[2] : "-");
  const optieD = v.opties?.D || v.antwoordD || (v.opties ? v.opties[3] : "-");

  document.getElementById("tekst-a").innerText = optieA;
  document.getElementById("tekst-b").innerText = optieB;
  document.getElementById("tekst-c").innerText = optieC;
  document.getElementById("tekst-d").innerText = optieD;

  // Stuur de actieve vraag naar Firestore zodat de Chromebooks weten dat er een vraag openstaat
  db.collection("quiz").doc("actieveVraag").set({
    vraag: v.vraag || v.question || "",
    opties: { A: optieA, B: optieB, C: optieC, D: optieD },
    juisteAntwoord: v.juisteAntwoord || v.correct || "",
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

function resetScores() {
  if (confirm("Scores resetten naar 0 voor Team A en Team B?")) {
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
